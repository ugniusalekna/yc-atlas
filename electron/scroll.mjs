export function installAutoScroll(options){
 const {activate=false,restart=false,...settings}=options;
 if(window.__atlasAutoScroll){const state=window.__atlasAutoScroll,wasPaused=state.paused;Object.assign(state,settings);
  if(activate||restart||(wasPaused&&!state.paused)){state.position=state.appliedPosition=state.target.scrollTop;state.last=0;state.bottomAt=0;}
  if(activate||restart)state.started=performance.now();
  if(restart){state.position=0;state.target.scrollTo({top:0,behavior:'instant'});state.appliedPosition=state.target.scrollTop;}return;
 }
 const candidates=[document.scrollingElement,...document.querySelectorAll('main,[data-scroll-container],#root,#app')].filter(Boolean);
 const target=candidates.find(el=>el.scrollHeight>el.clientHeight+100)||document.scrollingElement;
 const state=window.__atlasAutoScroll={...settings,target,position:target.scrollTop,appliedPosition:target.scrollTop,last:0,bottomAt:0,started:performance.now()};
 // Scrollbar drags do not consistently deliver pointer events to the page,
 // particularly with macOS overlay scrollbars. Observe the actual scroll offset
 // before writing the next automated frame so a drag can never be overwritten.
 function observePosition(){if(Math.abs(target.scrollTop-state.appliedPosition)<=1)return;
  state.position=state.appliedPosition=target.scrollTop;state.bottomAt=0;
  if(!state.paused){state.paused=true;window.__atlasOnManualScroll?.();}
 }
 window.addEventListener?.('scroll',observePosition,{capture:true,passive:true});
 function scrollTo(position){state.position=position;target.scrollTo({top:position,behavior:'instant'});state.appliedPosition=target.scrollTop;}
 function frame(time){const dt=state.last?Math.max(0,time-state.last):0;state.last=time;
 observePosition();
 if(!state.paused&&time-state.started>1400){const max=target.scrollHeight-target.clientHeight;if(max>0){
 if(target.scrollTop>=max-2){if(!state.bottomAt)state.bottomAt=time;if(time-state.bottomAt>2400){scrollTo(0);state.bottomAt=0;state.started=time;}}
 else{state.bottomAt=0;scrollTo(Math.min(max,state.position+state.speed*dt/1000));}}}
 requestAnimationFrame(frame);
 }requestAnimationFrame(frame);

}
export function scrollProgram(options){return `(${installAutoScroll.toString()})(${JSON.stringify(options)})`;}
