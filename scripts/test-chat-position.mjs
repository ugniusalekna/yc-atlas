import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';

const html=readFileSync('dist/index.html','utf8'),script=readFileSync('dist/assistant.js','utf8'),key='yc-atlas-chats-v1';
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
function fixture(stored){
 const dom=new JSDOM(html,{url:'http://localhost/?tab=chat',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document,el=id=>d.getElementById(id),log=el('chat-scroll');let tab='chat',top=0,extra=0,listener,finish;
 el('chat-panel').hidden=false;w.localStorage.setItem(key,JSON.stringify(stored));
 Object.defineProperties(log,{clientHeight:{get:()=>el('chat-panel').hidden?0:600},scrollHeight:{get:()=>el('chat-panel').hidden?0:5000+extra+el('assistant-messages').textContent.length},scrollTop:{get:()=>el('chat-panel').hidden?0:top,set:value=>{top=Math.max(0,Math.min(value,log.scrollHeight-log.clientHeight));}}});
 const replace=el('assistant-messages').replaceChildren.bind(el('assistant-messages'));el('assistant-messages').replaceChildren=(...args)=>{top=0;return replace(...args);};
 w.YCAtlasAssistantContext={view:()=>({tab}),selected:()=>null,company:()=>null};
 w.atlasDesktop={onEvent:callback=>listener=callback,assistantSettings:async()=>({provider:'openai',profiles:{openai:{model:'fixture',effort:'low',authenticated:true,capabilities:{}}}}),assistantRun:()=>new Promise(resolve=>finish=resolve),assistantTitle:async()=>({title:'Research'}),assistantCancel:async()=>{}};
 w.eval(script);
 return{w,d,dom,el,log,setTab(next){w.dispatchEvent(new w.CustomEvent('atlas-view-before-render'));tab=next;el('chat-panel').hidden=next!=='chat';w.dispatchEvent(new w.CustomEvent('atlas-view',{detail:{tab:next}}));},readAt(value){log.scrollTop=value;log.dispatchEvent(new w.Event('scroll'));},select(id){d.querySelector(`[data-chat-id="${id}"]`).click();},stream(text){return listener({type:'assistant-progress',kind:'delta',text});},finish(text){finish({text});},grow(value){extra+=value;}};
}
const chats=['a','b'].map(id=>({id,title:id,createdAt:1,updatedAt:1,messages:[{role:'user',text:'Question '+id,status:'complete'},{role:'assistant',text:'A long answer '+id,status:'complete'}]})),f=fixture({chats,activeId:'a'});
await tick();assert.equal(f.log.scrollTop,f.log.scrollHeight-f.log.clientHeight,'First opening starts at the latest answer');
f.readAt(730);f.setTab('explore');assert.equal(f.log.scrollTop,0,'Hidden layout has no scroll metrics');f.setTab('chat');assert.equal(f.log.scrollTop,730,'Returning from Explore restores the reading position');
f.select('b');f.readAt(1620);f.select('a');assert.equal(f.log.scrollTop,730);f.select('b');assert.equal(f.log.scrollTop,1620,'Each conversation has its own reading position');
// A transient error is in the sidebar's normal flow, away from the composer.
assert.equal(f.el('assistant-status').closest('#chat-history')?.id,'chat-history');assert.equal(f.el('assistant-status').closest('.chat-compose-area'),null);
await new Promise(resolve=>setTimeout(resolve,210));const saved=JSON.parse(f.w.localStorage.getItem(key));assert.equal(saved.chats.find(c=>c.id==='a').viewport.top,730);assert.equal(saved.chats.find(c=>c.id==='b').viewport.top,1620);
const reload=fixture(saved);await tick();assert.equal(reload.log.scrollTop,1620,'Reading position survives an app reload');reload.dom.window.close();
f.select('a');f.el('assistant-prompt').value='Continue researching';f.el('assistant-form').dispatchEvent(new f.w.Event('submit',{cancelable:true}));await tick();assert.equal(f.log.scrollTop,f.log.scrollHeight-f.log.clientHeight,'Sending a question intentionally reveals the new turn');
await f.stream('First part '.repeat(500));assert.equal(f.log.scrollTop,f.log.scrollHeight-f.log.clientHeight,'Large streamed chunks keep following when at the bottom');f.readAt(1230);await f.stream('More research '.repeat(500));assert.equal(f.log.scrollTop,1230,'Streaming leaves older reading positions alone');
f.setTab('reels');await f.stream('Background progress '.repeat(500));f.finish('Completed research '.repeat(600));await tick();f.setTab('chat');assert.equal(f.log.scrollTop,1230,'Hidden streaming and completion do not overwrite the saved position');
f.readAt(f.log.scrollHeight-f.log.clientHeight);f.setTab('explore');f.grow(1000);f.setTab('chat');assert.equal(f.log.scrollTop,f.log.scrollHeight-f.log.clientHeight,'Returning while following the bottom reveals the latest content');
assert.deepEqual(errors,[]);f.dom.window.close();
console.log('PASS: per-chat reading positions across tabs, conversation switches and reload; large streamed chunks, manual reading, hidden completion, bottom following and sidebar notices.');
