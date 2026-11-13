const {ipcRenderer}=require('electron');
window.__atlasOnReelEnd=()=>ipcRenderer.send('reel:end',scrollOptions.epoch);
window.__atlasOnManualScroll=()=>ipcRenderer.send('reel:manual-scroll');
let scrollOptions={speed:100,paused:true},wheelMode='navigate';
function updateScroll(){if(document.readyState!=='loading')installAutoScroll(scrollOptions);}
ipcRenderer.on('atlas:scroll-control',(_event,{wheel,...options})=>{if(wheel)wheelMode=wheel;scrollOptions=options;updateScroll();});
window.addEventListener('DOMContentLoaded',updateScroll,{once:true});
let delta=0,last=0;
window.addEventListener('wheel',event=>{
 if(scrollOptions.paused||window.__atlasAutoScroll?.paused){delta=0;return;}
 if(!event.isTrusted||event.ctrlKey||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
 // "Scroll the website": the page scrolls natively and the first gesture pauses into Browse.
 if(wheelMode==='scroll'){const state=window.__atlasAutoScroll;if(state&&!state.paused){state.paused=true;window.__atlasOnManualScroll();}return;}
 event.preventDefault();event.stopImmediatePropagation();
 if(Date.now()-last<800)return;
 delta+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1);
 if(Math.abs(delta)>65){ipcRenderer.send('reel:gesture',delta>0?'next':'previous');last=Date.now();delta=0;}
},{capture:true,passive:false});

// Handle Space after DOM targeting, so website text entry remains normal in Browse.
window.addEventListener('keydown',event=>{
 if(!event.isTrusted||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||!(event.code==='Space'||event.key===' '))return;
 const target=event.target;
 if(target?.isContentEditable||target?.closest?.('input,textarea,select,button,a[href],[contenteditable]:not([contenteditable="false"]),[role="textbox"]'))return;
 event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)ipcRenderer.send('reel:toggle-playback');
},{capture:true});

// Up/Down keep changing companies while browsing, in either Wheel mode.
// While playing, the host already routes them; website text entry and widgets keep their arrows.
window.addEventListener('keydown',event=>{
 if(!event.isTrusted||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
 const direction=['ArrowDown','PageDown'].includes(event.key)?'next':['ArrowUp','PageUp'].includes(event.key)?'previous':null,target=event.target;
 if(!direction||target?.isContentEditable||target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="listbox"],[role="menu"],[role="slider"],[role="spinbutton"]'))return;
 event.preventDefault();event.stopImmediatePropagation();ipcRenderer.send('reel:gesture',direction);
},{capture:true});

// Clicking a playing website means "let me use this page": switch to Browse so links open and build Back/Forward history.
window.addEventListener('pointerdown',event=>{
 if(!event.isTrusted||event.button!==0||scrollOptions.paused)return;
 const state=window.__atlasAutoScroll;if(state)state.paused=true;scrollOptions={...scrollOptions,paused:true};window.__atlasOnManualScroll();
},{capture:true,passive:true});
