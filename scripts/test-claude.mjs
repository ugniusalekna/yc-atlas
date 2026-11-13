import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {z} from 'zod';
import {ClaudeRuntime,titleInstructions} from '../electron/claude-runtime.mjs';
import {briefInstructions} from '../electron/briefs.mjs';
// Drives ClaudeRuntime against a scripted fake of the Agent SDK; no Claude Code process, account or network is used.
const directory=await mkdtemp(path.join(tmpdir(),'atlas-claude-test-'));process.env.ANTHROPIC_API_KEY='sk-ant-should-not-leak';
const calls=[],events=[],executed=[],approvals=[],usage=[];let script,controls=0;
const stream=(type,extra)=>({type:'stream_event',parent_tool_use_id:null,event:{type,...extra}});
const result=(extra={})=>({type:'result',subtype:'success',is_error:false,result:'Final answer',uuid:'u-'+calls.length,modelUsage:{'claude-opus-5-5':{inputTokens:100,outputTokens:20,cacheReadInputTokens:300,cacheCreationInputTokens:50,cacheCreationEphemeral1hInputTokens:10,thinkingTokens:5,webSearchRequests:1,canonicalModel:'claude-opus-5-5'}},...extra});
const sdk={z,tool:(name,description,shape,handler)=>({name,description,shape,handler}),createSdkMcpServer:({name,tools})=>({type:'sdk',name,tools}),
 query:({prompt,options})=>{calls.push({prompt,options});if(typeof prompt!=='string'){controls++;return{accountInfo:async()=>({email:'me@example.org',subscriptionType:'Claude Pro',apiProvider:'firstParty'}),supportedModels:async()=>[{value:'default',resolvedModel:'claude-opus-5-5',displayName:'Default',supportedEffortLevels:['low','max']}],close(){}};}return script(options);}};
const runtime=()=>new ClaudeRuntime({directory,getDataset:async()=>({companies:[{id:1,name:'Atlas Co',slug:'atlas-co'}],meta:{},topics:[]}),execute:async(...args)=>{executed.push(args);return{companies:[{id:1}]};},emit:event=>events.push(event),interactive:async(message,signal)=>{approvals.push({message,signal});return{decision:'decline'};},onUsage:async row=>usage.push(row),load:async()=>sdk});
const cfg={provider:'anthropic',model:'claude-opus-5-5',effort:'high',authMode:'claude',accountSession:'session-a',interests:'climate',capabilities:{search:true,web:true,workspace:true,delegate:true,navigate:true}};
try{
 const claude=runtime();
 script=async function*(options){
  yield stream('content_block_start',{content_block:{type:'thinking'}});yield stream('content_block_start',{content_block:{type:'text'}});yield stream('content_block_delta',{delta:{type:'text_delta',text:'Hello'}});
  yield stream('content_block_start',{content_block:{type:'tool_use',name:'mcp__atlas__search_companies'}});
  const tool=options.mcpServers.atlas.tools.find(t=>t.name==='search_companies');assert.ok(z.object(tool.shape).safeParse({query:'climate'}).success);const output=await tool.handler({query:'climate'});assert.deepEqual(JSON.parse(output.content[0].text),{companies:[{id:1}]});assert.equal(output.isError,false);
  assert.deepEqual(await options.canUseTool('Bash',{command:'rm -rf notes'},{signal:new AbortController().signal,title:'Claude wants to run rm -rf notes'}),{behavior:'deny',message:'The user declined this request.'});
  yield stream('content_block_start',{content_block:{type:'text'}});yield stream('content_block_delta',{delta:{type:'text_delta',text:'World'}});
  yield {type:'stream_event',parent_tool_use_id:'sub',event:{type:'content_block_delta',delta:{type:'text_delta',text:'subagent text'}}};
  yield {type:'rate_limit_event',rate_limit_info:{status:'allowed',rateLimitType:'five_hour',utilization:.42,resetsAt:1900000000}};yield result();
 };
 let reply=await claude.run({cfg,chatId:'chat-1',history:[{role:'user',content:'Find climate startups'}],context:{view:{tab:'chat'}}});
 const first=calls.at(-1).options;assert.equal(reply.text,'Final answer');assert.deepEqual(reply.usage,{input:450,output:20});
 assert.equal(first.env.ANTHROPIC_API_KEY,undefined,'An API key in the environment must not replace the Claude account sign-in');assert.deepEqual(first.settingSources,[]);assert.equal(first.permissionMode,'acceptEdits');assert.equal(first.persistSession,true);assert.ok(first.sessionId&&!first.resume);
 assert.deepEqual(first.tools,['Read','Write','Edit','Glob','Grep','Bash','WebSearch','WebFetch','Agent']);assert.equal(first.allowedTools,undefined,'Approval goes through canUseTool');const approve=(name,mcpServer)=>first.canUseTool(name,{query:'x'},{signal:new AbortController().signal,mcpServer});assert.equal((await approve('mcp__atlas__search_companies',{name:'atlas',source:'sdk'})).behavior,'allow');assert.equal((await approve('WebSearch')).behavior,'allow');const asked=approvals.length;assert.equal((await approve('mcp__atlas__search_companies',{name:'atlas',source:'project'})).behavior,'deny','A configured server named atlas is not trusted');assert.equal(approvals.length,asked+1);
 assert.ok(!first.mcpServers.atlas.tools.some(t=>t.name==='save_companies'),'Disabled Atlas capabilities must not be exposed');assert.match(first.systemPrompt.append,/Claude Code runtime/);assert.match(first.systemPrompt.append,/climate/);assert.match(calls.at(-1).prompt,/Find climate startups\n\nCurrent Atlas context/);
 assert.deepEqual(events.filter(e=>e.kind==='delta').map(e=>e.text),['Hello','\n\n','World']);assert.deepEqual(events.filter(e=>e.kind==='status').map(e=>e.text),['Thinking…','Reading Atlas data…']);
 assert.equal(executed[0][0],'search_companies');assert.deepEqual(executed[0][1],{query:'climate'});assert.equal(approvals[0].message.method,'item/commandExecution/requestApproval');assert.equal(approvals[0].message.params.command,'rm -rf notes');
 assert.deepEqual({...usage[0],id:undefined,timestamp:undefined},{id:undefined,timestamp:undefined,provider:'anthropic',model:'claude-opus-5-5',kind:'conversation',billingMode:'claude',complete:true,reported:true,input:450,output:20,cachedInput:300,cacheWriteShort:40,cacheWriteLong:10,reasoning:5,webSearches:1,accountingValid:true,cacheReported:true,serviceTier:'standard'});
 assert.deepEqual(claude.planLimits(),{primary:{usedPercent:42,resetsAt:1900000000},secondary:null});
 // The next turn resumes the same Claude Code session with only the new message; links survive a restart.
 script=async function*(){yield result({result:'Second answer'});};
 reply=await claude.run({cfg,chatId:'chat-1',history:[{role:'user',content:'Find climate startups'},{role:'assistant',content:'Final answer'},{role:'user',content:'Only in Europe'}]});
 assert.equal(calls.at(-1).options.resume,first.sessionId);assert.equal(calls.at(-1).options.sessionId,undefined);assert.match(calls.at(-1).prompt,/^Only in Europe\n/);
 assert.equal(Object.values(JSON.parse(await readFile(path.join(directory,'claude-sessions.json'),'utf8')))[0].sessionId,first.sessionId);
 await runtime().run({cfg,chatId:'chat-1',history:[{role:'user',content:'a'},{role:'assistant',content:'b'},{role:'user',content:'c'},{role:'assistant',content:'d'},{role:'user',content:'e'}]});assert.equal(calls.at(-1).options.resume,first.sessionId);
 // Titles run without tools, persistence or streaming.
 script=async function*(){yield result({result:'Climate startups'});};
 reply=await claude.run({cfg:{...cfg,effort:'low',capabilities:{}},chatId:'title-x',history:[{role:'user',content:'Name this'}],kind:'title'});const title=calls.at(-1).options;
 assert.equal(reply.text,'Climate startups');assert.deepEqual(title.tools,[]);assert.deepEqual(title.mcpServers,{});assert.equal(title.persistSession,false);assert.equal(title.includePartialMessages,false);assert.equal(title.systemPrompt,titleInstructions);assert.equal(title.effort,'low');
 // Company briefs use only web tools, deny everything else and keep no session.
 script=async function*(){yield result({result:'**What they do**'});};
 reply=await claude.run({cfg:{...cfg,effort:'medium',capabilities:{web:true}},chatId:'company-briefs',history:[{role:'user',content:'Brief Acme'}],kind:'brief'});const brief=calls.at(-1).options;
 assert.equal(reply.text,'**What they do**');assert.deepEqual(brief.tools,['WebSearch','WebFetch']);assert.deepEqual(brief.mcpServers,{});assert.equal(brief.persistSession,false);assert.equal(brief.maxTurns,24);assert.equal(brief.systemPrompt,briefInstructions);
 assert.deepEqual(await brief.canUseTool('WebSearch',{query:'Acme'},{signal:new AbortController().signal}),{behavior:'allow',updatedInput:{query:'Acme'}});assert.equal((await brief.canUseTool('Bash',{command:'ls'},{signal:new AbortController().signal})).behavior,'deny');
 // Stop, account and plan-limit failures produce clear errors.
 script=async function*(options){yield stream('content_block_start',{content_block:{type:'text'}});await new Promise((_,reject)=>options.abortController.signal.addEventListener('abort',()=>reject(new Error('aborted'))));};
 const controller=new AbortController(),stopped=claude.run({cfg,chatId:'chat-2',history:[{role:'user',content:'Long task'}],signal:controller.signal});setTimeout(()=>controller.abort(),20);await assert.rejects(stopped,/Reply stopped/);
 script=async function*(){yield {type:'assistant',error:'authentication_failed',message:{content:[]}};yield result({subtype:'error_during_execution',is_error:true,errors:['Invalid API key'],modelUsage:{}});};
 await assert.rejects(claude.run({cfg,chatId:'chat-3',history:[{role:'user',content:'Hi'}]}),/claude auth login/);
 script=async function*(){yield {type:'rate_limit_event',rate_limit_info:{status:'rejected',rateLimitType:'five_hour',utilization:1,resetsAt:1900000000}};yield {type:'assistant',error:'rate_limit',message:{content:[]}};yield result({subtype:'error_during_execution',is_error:true,errors:['limit'],modelUsage:{}});};
 await assert.rejects(claude.run({cfg,chatId:'chat-4',history:[{role:'user',content:'Hi'}]}),/usage limit has been reached; it resets/);
 assert.ok(!Object.keys(JSON.parse(await readFile(path.join(directory,'claude-sessions.json'),'utf8'))).some(k=>/^chat-[234]:/.test(k)),'Failed turns must not be marked as seen');
 // Account and model queries start Claude Code without sending a turn, and the account is cached briefly.
 assert.deepEqual(await claude.auth(),{authenticated:true,mode:'claude',email:'me@example.org',plan:'Claude Pro'});await claude.auth();assert.equal(controls,1);
 assert.deepEqual(await claude.models(),[{id:'default',name:'Default (claude-opus-5-5)',efforts:['low','max'],isDefault:true}]);
 const missing=new ClaudeRuntime({directory,load:()=>Promise.reject(new Error('missing'))});assert.equal(await missing.available(),false);await assert.rejects(missing.auth(),/npm ci/);
}finally{delete process.env.ANTHROPIC_API_KEY;await rm(directory,{recursive:true,force:true});}
console.log('PASS: Claude account engine streaming, Atlas tools, command approvals, isolated settings and env, session resume across restarts, plan usage and limits, titles, stop and account errors.');
