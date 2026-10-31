import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {ReelsPool} from '../electron/reels-core.mjs';
class Contents extends EventEmitter{
 constructor(){super();this.url='';this.loads=[];this.controls=[];this.destroyed=false;this.captureFails=false;}
 setAudioMuted(){}setWindowOpenHandler(handler){this.open=handler;}stop(){}
 loadURL(url){this.url=url;this.loads.push(url);return new Promise(()=>{});}
 getURL(){return this.url;}isDestroyed(){return this.destroyed;}
 send(channel,message){this.controls.push({channel,message});}
 async capturePage(){if(this.captureFails)throw new Error('Capture unavailable');return{isEmpty:()=>false,toJPEG:()=>Buffer.from(this.url)};}
 close(){this.destroyed=true;this.emit('destroyed');}
}
let created=0;const children=[],events=[];
const window={getContentSize:()=>[1200,800],isDestroyed:()=>false,contentView:{addChildView:view=>children.push(view),removeChildView:view=>children.splice(children.indexOf(view),1)}};
const companies=Array.from({length:8},(_,i)=>({id:i+1,website:`https://company${i+1}.example/`}));
const pool=new ReelsPool(window,{send:event=>events.push(event),lookup:id=>companies.find(c=>c.id===id),createView:()=>{created++;return{webContents:new Contents(),setVisible(value){this.visible=value;},setBounds(bounds){this.bounds=bounds;}};}});
const bounds={x:20,y:100,width:850,height:600};
let shown=pool.show({companyId:1,bounds});const first=pool.current;assert.equal(first.view.visible,false);first.view.webContents.emit('dom-ready');await shown;
assert.equal(first.view.visible,true,'DOM-ready must show the page without waiting for the unresolved full-load promise');
assert.equal(first.view.webContents.controls.at(-1).message.paused,false);
// Space requests from the sandbox preload use the same playback state as the shell.
let prevented=0;const inputEvent={preventDefault(){prevented++;}};
assert.equal(pool.togglePlayback(first.view.webContents),true);assert.equal(pool.paused,true);assert.equal(events.at(-1).type,'reel-playback');
assert.equal(pool.togglePlayback(first.view.webContents),true);assert.equal(pool.paused,false);
// Website history is available only while browsing and never navigates between companies.
let wentBack=0,wentForward=0,clearedHistory=0,canBack=true,canForward=false;first.view.webContents.navigationHistory={canGoBack:()=>canBack,canGoForward:()=>canForward,goBack:()=>wentBack++,goForward:()=>wentForward++,clear:()=>clearedHistory++};
await pool.control({history:'back'});assert.equal(wentBack,0);await pool.control({paused:true,history:'back'});assert.equal(wentBack,1);await pool.control({history:'forward'});assert.equal(wentForward,0);canBack=false;canForward=true;await pool.control({history:'forward'});assert.equal(wentForward,1);first.view.webContents.emit('did-navigate');assert.equal(events.at(-1).canGoBack,false);assert.equal(events.at(-1).canGoForward,true);await pool.control({paused:false});
// Browsing gives keyboard and safe web navigation to the live page; Esc resumes.
await pool.control({paused:true,autoNext:true});let navigations=events.filter(e=>e.type==='reel-navigation').length;
first.view.webContents.emit('before-input-event',inputEvent,{type:'keyDown',key:'ArrowDown'});assert.equal(events.filter(e=>e.type==='reel-navigation').length,navigations);
let blocked=false;first.view.webContents.emit('will-navigate',{preventDefault(){blocked=true;}},'https://company1.example/product');assert.equal(blocked,false);
first.view.webContents.emit('will-navigate',{preventDefault(){blocked=true;}},'file:///private/data');assert.equal(blocked,true);
let epoch=pool.playbackEpoch;assert.equal(pool.ended(first.view.webContents,epoch),false,'Paused pages cannot auto-advance');
first.view.webContents.emit('before-input-event',inputEvent,{type:'keyDown',key:'Escape'});assert.equal(pool.paused,false);epoch=pool.playbackEpoch;blocked=false;first.view.webContents.emit('will-navigate',{preventDefault(){blocked=true;}},'https://company1.example/product');assert.equal(blocked,true);
assert.equal(pool.ended(first.view.webContents,epoch-1),false);assert.equal(pool.ended(first.view.webContents,epoch),true);assert.equal(events.at(-1).type,'reel-ended');pool.overlay=true;pool.applyVisibility();assert.equal(first.view.webContents.controls.at(-1).message.paused,true);assert.equal(pool.ended(first.view.webContents,epoch),false);pool.overlay=false;pool.applyVisibility();assert.equal(first.view.webContents.controls.at(-1).message.paused,false);await pool.control({autoNext:false});
pool.preload([2]);const second=pool.slots.find(slot=>slot.companyId===2);second.view.webContents.navigationHistory={clear:()=>clearedHistory++};second.view.webContents.emit('dom-ready');assert.equal(clearedHistory,1);assert.equal(second.view.visible,false);assert.equal(pool.current,first);assert.equal(created,2);
await pool.control({paused:true});
await pool.show({companyId:2,bounds,animate:true,direction:'next'});
assert.equal(pool.paused,false,'Moving to a different reel must resume playback');
assert.equal(created,2);assert.equal(second.view.webContents.loads.length,1,'Activating the preloaded next company must not reload it');
const transition=events.findLast(event=>event.type==='reel-transition');assert.ok(transition);assert.equal(second.view.visible,false,'Live native view stays hidden until its slide animation finishes');
pool.finish({companyId:2,transitionId:-1});assert.equal(second.view.visible,false);pool.finish(transition);assert.equal(second.view.visible,true);assert.equal(first.view.visible,false);
assert.equal(pool.manualScroll(first.view.webContents),false,'A background website cannot pause the current reel');assert.equal(pool.paused,false);
assert.equal(pool.manualScroll(second.view.webContents),true);assert.equal(pool.paused,true);assert.equal(events.at(-1).paused,true);assert.equal(second.view.webContents.controls.at(-1).message.paused,true);
await pool.show({companyId:2,bounds});assert.equal(pool.paused,true,'Rerendering the same reel must keep its paused state');
await pool.show({companyId:1,bounds});assert.equal(pool.paused,false,'Previous also resumes the newly selected reel');assert.equal(created,2);assert.equal(first.view.webContents.loads.length,1,'Previous company should reuse its loaded page');
pool.preload([3]);const third=pool.slots.find(slot=>slot.companyId===3);third.view.webContents.emit('dom-ready');pool.preload([4]);const fourth=pool.slots.find(slot=>slot.companyId===4);assert.equal(created,3,'Page pool must stay bounded at three reusable views');assert.equal(fourth,second,'Old background view is navigated and reused');assert.equal(fourth.view.webContents.loads.length,2);
const oldRequest=pool.show({companyId:4,bounds});await pool.show({companyId:3,bounds});fourth.view.webContents.emit('dom-ready');await oldRequest;assert.equal(pool.current.companyId,3,'A late preload cannot replace a newer selection');assert.equal(third.view.visible,true);
third.view.webContents.captureFails=true;await pool.show({companyId:1,bounds,animate:true});assert.equal(first.view.visible,true,'Screenshot failure must fall back to showing the live page');
pool.preload([5]);const waiting=pool.show({companyId:5,bounds});pool.hide();await waiting;assert.equal(children.length,0);assert.equal(pool.slots.length,0);assert.equal(pool.current,null,'Leaving Reels must release all page views');
assert.equal(created,3);
await assert.rejects(pool.show({companyId:999,bounds}),/Unknown/);pool.destroy();
// Execute the generated sandbox preload: scrolling starts at DOM readiness,
// rather than depending on executeJavaScript waiting for the full page load.
const guestWindow=new EventEmitter(),ipc=new EventEmitter(),gestures=[];ipc.send=(...args)=>gestures.push(args);guestWindow.addEventListener=(event,callback)=>guestWindow.on(event,callback);
let frame;const scrolling={scrollTop:0,scrollHeight:2000,clientHeight:300,scrollTo({top}){this.scrollTop=top;}};
const document={readyState:'loading',scrollingElement:scrolling,querySelectorAll:()=>[]};
const context={window:guestWindow,document,innerHeight:600,performance:{now:()=>0},requestAnimationFrame:callback=>{frame=callback;},require:name=>{assert.equal(name,'electron');return{ipcRenderer:ipc};}};vm.createContext(context);vm.runInContext(readFileSync('electron/guest-preload.cjs','utf8'),context);
ipc.emit('atlas:scroll-control',{}, {speed:100,paused:false});assert.equal(frame,undefined);document.readyState='interactive';guestWindow.emit('DOMContentLoaded');frame(1500);frame(1600);assert.equal(scrolling.scrollTop,10);
guestWindow.emit('wheel',{isTrusted:false,deltaY:80});assert.equal(gestures.length,0);
guestWindow.emit('wheel',{isTrusted:true,ctrlKey:false,deltaX:0,deltaY:80,deltaMode:0,preventDefault(){},stopImmediatePropagation(){}});assert.deepEqual(gestures,[['reel:gesture','next']]);

// The sandbox preload forwards manual takeover to the trusted main process.
scrolling.scrollTop=420;frame(1700);assert.equal(scrolling.scrollTop,420);assert.deepEqual(gestures.at(-1),['reel:manual-scroll']);assert.equal(context.window.__atlasAutoScroll.paused,true);
scrolling.scrollTop=650;guestWindow.emit('scroll');ipc.emit('atlas:scroll-control',{}, {speed:100,paused:false});frame(2000);assert.equal(scrolling.scrollTop,650);frame(2100);assert.equal(scrolling.scrollTop,660);

console.log('PASS: DOM-ready display, next-page preload without reload, three-view reuse limit, transition handoff, cached back navigation, stale-load cancellation, capture fallback and cleanup.');

// Paused browsing releases wheel events, while Auto-next sends one end signal per pass.
ipc.emit('atlas:scroll-control',{}, {speed:100,paused:true,autoNext:true,epoch:7});let wheelPrevented=false;const beforeGestures=gestures.length;
guestWindow.emit('wheel',{isTrusted:true,ctrlKey:false,deltaX:0,deltaY:90,deltaMode:0,preventDefault(){wheelPrevented=true;},stopImmediatePropagation(){}});assert.equal(wheelPrevented,false);assert.equal(gestures.length,beforeGestures);
scrolling.scrollTop=1700;guestWindow.emit('scroll');ipc.emit('atlas:scroll-control',{}, {speed:100,paused:false,autoNext:true,epoch:7});frame(5000);frame(7501);assert.deepEqual(gestures.at(-1),['reel:end',7]);const endCount=gestures.filter(g=>g[0]==='reel:end').length;frame(7900);assert.equal(gestures.filter(g=>g[0]==='reel:end').length,endCount);
ipc.emit('atlas:scroll-control',{}, {speed:100,paused:true,autoNext:true,epoch:7});frame(13000);assert.equal(gestures.filter(g=>g[0]==='reel:end').length,endCount);
ipc.emit('atlas:scroll-control',{}, {speed:100,paused:false,autoNext:false,epoch:7});frame(14000);frame(16501);assert.equal(scrolling.scrollTop,0,'Repeat remains the default alternative to Auto-next');
scrolling.scrollHeight=300;scrolling.scrollTop=0;ipc.emit('atlas:scroll-control',{}, {speed:100,paused:false,autoNext:true,epoch:8,activate:true});frame(19000);frame(21501);assert.deepEqual(gestures.at(-1),['reel:end',8],'A short page already at its bottom can advance too');
console.log('PASS: Pause-to-browse wheel/keyboard routing, safe in-place navigation, Esc resume, overlay suspension, end epochs, one-shot Auto-next, repeat and short-page endings.');

const beforeKeys=gestures.length;let keyPrevented=0;const key=extra=>({isTrusted:true,code:'Space',key:' ',target:{closest:()=>null},preventDefault(){keyPrevented++;},stopImmediatePropagation(){},...extra});
guestWindow.emit('keydown',key());assert.deepEqual(gestures.at(-1),['reel:toggle-playback']);assert.equal(keyPrevented,1);
for(const extra of [{repeat:true},{ctrlKey:true},{metaKey:true},{isComposing:true},{isTrusted:false},{target:{closest:()=>({})}},{target:{isContentEditable:true}}])guestWindow.emit('keydown',key(extra));assert.equal(gestures.length,beforeKeys+1);assert.equal(keyPrevented,2);
console.log('PASS: website Space resumes/pauses through the trusted host and ignores repeats, modifiers, composing and editable targets.');
