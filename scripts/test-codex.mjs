import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {CodexClient} from '../electron/codex-client.mjs';
import {CodexRuntime,codexLocation} from '../electron/codex-runtime.mjs';

const temp=await mkdtemp(path.join(os.tmpdir(),'atlas-codex-test-'));
const root=path.resolve('.');
try{
 // Exercise the actual transport boundary, including fragmented messages and server requests.
 let child,spawnOptions,spawnArgs;
 const transport=new CodexClient({binary:'fixture',cwd:temp,home:temp,key:'private-fixture',platformPath:'/bundled/rg',spawnImpl:(_binary,args,options)=>{
  spawnOptions=options;spawnArgs=args;child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
  child.stdin=new Writable({write(chunk,_encoding,done){const m=JSON.parse(String(chunk));if(m.method==='initialize')queueMicrotask(()=>{const s=JSON.stringify({id:m.id,result:{serverInfo:{version:'test'}}})+'\n';child.stdout.write(s.slice(0,7));child.stdout.write(s.slice(7));});else if(m.method==='fixture')queueMicrotask(()=>child.stdout.write(JSON.stringify({id:m.id,result:m.params})+'\n'));done();}});child.kill=()=>child.emit('exit',0);return child;
 }});
 await transport.start();assert.equal(spawnOptions.env.ATLAS_CODEX_API_KEY,'private-fixture');assert.equal(spawnOptions.env.CODEX_HOME,temp);assert.ok(!('OPENAI_API_KEY' in spawnOptions.env));assert.ok(!spawnArgs.join(' ').includes('private-fixture'));assert.ok(spawnArgs.includes('shell_environment_policy.inherit="none"'));assert.ok(spawnArgs.includes('cli_auth_credentials_store="keyring"'));assert.deepEqual(await transport.request('fixture',{value:1}),{value:1});
 let request;transport.once('request',m=>request=m);child.stdout.write('{"id":"server","method":"item/tool/call","params":{}}\n');assert.equal(request.id,'server');
 await assert.rejects(transport.call('no-response',{},5),/timed out/);await transport.close();

 class FakeClient extends EventEmitter{
  static clients=[];
  constructor(options){super();this.options=options;this.calls=[];this.responses=[];this.serial=0;FakeClient.clients.push(this);}
  async start(){} close(){}
  async request(method,params){this.calls.push({method,params});if(method==='thread/start')return{thread:{id:'thread-'+(++this.serial)}};if(method==='thread/resume')return{thread:{id:params.threadId}};if(method==='turn/start'){this.lastTurn={threadId:params.threadId,turnId:'turn-'+this.calls.length};return{turn:{id:this.lastTurn.turnId}};}if(method==='account/read')return{account:{type:'chatgpt',email:'test@example.org',planType:'plus'}};if(method==='model/list')return{data:[{model:'test-model',displayName:'Test model',supportedReasoningEfforts:[{reasoningEffort:'low'}]}],nextCursor:null};return{};}
  respond(id,result){this.responses.push({id,result});}write(m){this.responses.push(m);}
 }
 const events=[],usage=[],executed=[],approvals=[];
 const cfg={authMode:'apiKey',model:'test-model',effort:'low',interests:'Europe',capabilities:{search:true,web:true,workspace:true,delegate:true,navigate:true}};
 const runtime=new CodexRuntime({root,directory:temp,Client:FakeClient,getDataset:()=>({meta:{fetched:'test'},topics:[],companies:[{id:271,name:'Airbnb',slug:'airbnb',description:'Travel',tags:['Travel']}]}),emit:e=>events.push(e),execute:async(...args)=>{executed.push(args);return{id:271};},interactive:async(m)=>{approvals.push(m);return{decision:'decline'};},onUsage:async row=>usage.push(row)});
 const spin=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,2));}assert.fail('Fixture did not reach its expected state');};
 const first=runtime.run({cfg,key:'fixture',chatId:'chat',history:[{role:'user',content:'Find travel companies'}],context:{}});await spin(()=>runtime.jobs.size>0&&FakeClient.clients.at(-1).lastTurn);const client=FakeClient.clients.at(-1),thread=client.lastTurn.threadId;
 const start=client.calls.find(c=>c.method==='thread/start').params;assert.equal(start.permissions,'atlas');assert.equal(start.approvalPolicy,'on-request');assert.ok(start.dynamicTools.some(t=>t.name==='get_company'));assert.ok(!start.dynamicTools.some(t=>t.name==='create_folder'));assert.equal(start.config.web_search,'live');assert.ok((await readFile(path.join(start.cwd,'companies.jsonl'),'utf8')).includes('Airbnb'));
 await runtime.serverRequest({id:21,method:'item/tool/call',params:{threadId:thread,tool:'get_company',arguments:{id:271}}});assert.equal(executed[0][0],'get_company');assert.equal(client.responses.at(-1).result.success,true);
 await runtime.serverRequest({id:22,method:'item/tool/call',params:{threadId:thread,tool:'create_folder',arguments:{name:'denied'}}});assert.equal(client.responses.at(-1).result.success,false);assert.equal(executed.length,1);
 await runtime.serverRequest({id:23,method:'item/commandExecution/requestApproval',params:{threadId:thread,command:'read outside workspace'}});assert.equal(approvals.length,1);assert.equal(client.responses.at(-1).result.decision,'decline');
 const notify=(method,params)=>runtime.notification({method,params:{threadId:thread,turnId:client.lastTurn.turnId,...params}});
 const tokens=total=>notify('thread/tokenUsage/updated',{tokenUsage:{total,last:total}});
 await notify('item/agentMessage/delta',{itemId:'commentary',delta:'Checking…'});await notify('item/completed',{item:{type:'agentMessage',id:'commentary',text:'Checking…',phase:'commentary'}});
 await tokens({inputTokens:100,outputTokens:20,cachedInputTokens:10});await tokens({inputTokens:100,outputTokens:20,cachedInputTokens:10});assert.equal(usage.length,1,'duplicate native usage must not double count');
 await notify('item/completed',{item:{type:'agentMessage',id:'final',text:'Found [[company:271]]',phase:'final_answer'}});await notify('turn/completed',{turn:{id:client.lastTurn.turnId,status:'completed'}});assert.equal((await first).text,'Found [[company:271]]');assert.equal(runtime.jobs.size,0);
 // Native thread resume sends the new question, without reinjecting the transcript.
 const history=[{role:'user',content:'Find travel companies'},{role:'assistant',content:'Found [[company:271]]'},{role:'user',content:'Compare them'}];const next=runtime.run({cfg,key:'fixture',chatId:'chat',history,context:{}});await spin(()=>runtime.jobs.size>0&&client.calls.filter(c=>c.method==='turn/start').length===2);assert.equal(client.calls.filter(c=>c.method==='thread/start').length,1);assert.equal(client.calls.find(c=>c.method==='thread/resume').params.threadId,thread);assert.match(client.calls.at(-1).params.input[0].text,/^Compare them/);assert.ok(!client.calls.at(-1).params.input[0].text.includes('Find travel companies'));
 await tokens({inputTokens:140,outputTokens:30,cachedInputTokens:15});await notify('item/completed',{item:{type:'agentMessage',id:'final2',text:'Comparison',phase:'final_answer'}});await notify('turn/completed',{turn:{status:'completed'}});await next;assert.equal(usage.at(-1).input,40);assert.equal(usage.at(-1).output,10);
 const abort=new AbortController(),stopped=runtime.run({cfg,key:'fixture',chatId:'chat',history:[...history,{role:'assistant',content:'Comparison'},{role:'user',content:'Research further'}],signal:abort.signal});await spin(()=>runtime.jobs.size>0&&client.calls.filter(c=>c.method==='turn/start').length===3);abort.abort();await spin(()=>client.calls.some(c=>c.method==='turn/interrupt'));await notify('turn/completed',{turn:{status:'interrupted'}});await assert.rejects(stopped,/stopped/i);
 const title=runtime.run({cfg:{...cfg,authMode:'chatgpt',capabilities:{}},chatId:'title',history:[{role:'user',content:'Name this'}],kind:'title'});await spin(()=>FakeClient.clients.length===2&&FakeClient.clients[1].lastTurn);const accountClient=FakeClient.clients[1],titleStart=accountClient.calls.find(c=>c.method==='thread/start').params;assert.equal(titleStart.dynamicTools.length,0);assert.equal(titleStart.ephemeral,true);assert.equal(titleStart.config.web_search,'disabled');assert.equal(titleStart.config['features.shell_tool'],false);assert.notEqual(client.options.home,accountClient.options.home);assert.equal(accountClient.options.key,null);
 await runtime.notification({method:'thread/tokenUsage/updated',params:{...accountClient.lastTurn,tokenUsage:{total:{inputTokens:10,outputTokens:5,cachedInputTokens:0}}}});await runtime.notification({method:'item/completed',params:{...accountClient.lastTurn,item:{type:'agentMessage',id:'title-message',phase:'final_answer',text:'{"title":"Travel market research"}'}}});await runtime.notification({method:'turn/completed',params:{...accountClient.lastTurn,turn:{status:'completed'}}});await title;assert.equal(usage.at(-1).kind,'title');assert.equal(usage.at(-1).billingMode,'chatgpt');assert.equal((await runtime.auth({...cfg,authMode:'chatgpt'},null)).authenticated,true);assert.equal((await runtime.models({...cfg,authMode:'chatgpt'},null))[0].id,'test-model');await runtime.close();
 console.log('PASS: Codex transport, secret isolation, dynamic tools, permissions, approvals, native thread continuity, cumulative usage deduplication, interruption, account isolation and background titles.');

 // Real bundled binary: no user profile, credentials or model inference involved.
 const nativeHome=path.join(temp,'native-home');await mkdir(nativeHome);const native=new CodexClient({...codexLocation(root),home:nativeHome,cwd:temp});
 try{await native.start();assert.equal((await native.request('account/read',{refreshToken:false})).account,null);const models=await native.request('model/list',{limit:20});assert.ok(models.data.length);const thread=(await native.request('thread/start',{cwd:temp,permissions:'atlas',approvalPolicy:'on-request',dynamicTools:[{type:'function',name:'fixture',description:'Test Atlas integration',inputSchema:{type:'object',properties:{}}}],allowProviderModelFallback:false})).thread;assert.ok(thread.id);await assert.rejects(native.request('thread/resume',{threadId:thread.id,cwd:temp,permissions:'atlas',excludeTurns:true}),/no rollout/);console.log('PASS: bundled Codex starts, reads isolated auth, lists models, and starts a protected thread with an Atlas tool (unstarted threads have no rollout yet).');}finally{await native.close();}
}finally{await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
