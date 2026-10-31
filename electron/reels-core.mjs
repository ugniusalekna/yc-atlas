import {webURL,previewBounds} from './security.mjs';
export class ReelsPool{
 constructor(window,{send,lookup,createView,prepareView=()=>{},maxViews=3,loadTimeout=20000,captureTimeout=180,transitionDuration=360}){Object.assign(this,{window,send,lookup,createView,prepareView,maxViews,loadTimeout,captureTimeout,transitionDuration});this.slots=[];this.current=null;this.outgoing=null;this.paused=false;this.speed=100;this.visible=false;this.overlay=false;this.sequence=0;this.used=0;this.bounds={x:0,y:0,width:0,height:0};this.transition=null;this.presenting=false;}
 company(id){const company=this.lookup(Number(id));if(!company)throw new Error('Unknown company');const url=webURL(company.website);if(!url)throw new Error('No website listed for this company');return{company,url};}
 makeSlot(){const view=this.createView(),wc=view.webContents;const slot={view,companyId:null,url:null,ready:false,failed:false,generation:0,used:0};this.prepareView(wc);wc.setAudioMuted(true);view.setVisible(false);this.window.contentView.addChildView(view);this.slots.push(slot);
  wc.setWindowOpenHandler(()=>({action:'deny'}));wc.on('will-navigate',event=>event.preventDefault());wc.on('will-redirect',(event,url)=>{if(!webURL(url))event.preventDefault();});wc.on('will-attach-webview',event=>event.preventDefault());
  wc.on('before-input-event',(event,input)=>{if(input.type!=='keyDown'||this.current!==slot)return;const direction=['ArrowDown','PageDown'].includes(input.key)?'next':['ArrowUp','PageUp'].includes(input.key)?'previous':null;if(direction){event.preventDefault();this.send({type:'reel-navigation',direction});}else if((input.key===' '||input.code==='Space')&&!input.control&&!input.meta&&!input.alt){event.preventDefault();if(input.isAutoRepeat)return;this.control({paused:!this.paused});this.send({type:'reel-playback',paused:this.paused});}});
  wc.on('render-process-gone',()=>{slot.ready=false;slot.failed=true;slot.resolve?.(false);if(this.current===slot){this.applyVisibility();this.status(slot,'failed','This website stopped responding. Try the next company or open it in your browser.');}});
  return slot;
 }
 status(slot,state,message){if(this.current===slot)this.send({type:'reel-status',companyId:slot.companyId,state,message});}
 acquire(id){const {company,url}=this.company(id);let slot=this.slots.find(slot=>slot.companyId===company.id&&slot.url===url&&!slot.failed&&!slot.view.webContents.isDestroyed());if(slot){slot.used=++this.used;return slot;}
  slot=this.slots.length<this.maxViews?this.makeSlot():this.slots.filter(slot=>slot!==this.current&&slot!==this.outgoing).sort((a,b)=>a.used-b.used)[0];if(!slot)return null;
  const wc=slot.view.webContents;slot.resolve?.(false);clearTimeout(slot.timeout);if(slot.onReady)wc.removeListener('dom-ready',slot.onReady);wc.stop();slot.generation++;const generation=slot.generation;
  Object.assign(slot,{companyId:company.id,url,ready:false,failed:false,used:++this.used});slot.view.setBounds(this.bounds);slot.view.setVisible(false);slot.promise=new Promise(resolve=>{slot.resolve=resolve;});
  const fail=()=>{if(slot.generation!==generation||slot.ready)return;slot.failed=true;clearTimeout(slot.timeout);slot.resolve(false);this.status(slot,'failed','This website could not load. Open it in your browser or try the next company.');};
  slot.onReady=()=>{if(slot.generation!==generation||slot.failed||wc.isDestroyed()||!webURL(wc.getURL()))return;wc.removeListener('dom-ready',slot.onReady);clearTimeout(slot.timeout);slot.ready=true;wc.send('atlas:scroll-control',{speed:this.speed,paused:true});slot.resolve(true);};wc.on('dom-ready',slot.onReady);
  slot.timeout=setTimeout(fail,this.loadTimeout);slot.timeout.unref?.();wc.loadURL(url).catch(fail);return slot;
 }
 async capture(slot){if(!slot?.ready||slot.view.webContents.isDestroyed())return null;let timeout;try{return await Promise.race([slot.view.webContents.capturePage(undefined,{stayHidden:true}).then(image=>image.isEmpty()?null:'data:image/jpeg;base64,'+image.toJPEG(78).toString('base64')),new Promise(resolve=>{timeout=setTimeout(()=>resolve(null),this.captureTimeout);})]);}catch{return null;}finally{clearTimeout(timeout);}}
 async show({companyId,bounds,animate=false,direction='next'}){
  this.setBounds(bounds);this.visible=true;
  if(this.current?.companyId===Number(companyId)&&!this.current.failed){this.applyVisibility();return;}
  this.cancelTransition();const previous=this.current;const slot=this.acquire(companyId);if(!slot)throw new Error('All website views are busy');const sequence=++this.sequence;this.outgoing=previous;this.current=slot;this.presenting=true;
  if(previous&&previous.companyId!==slot.companyId&&this.paused){this.paused=false;this.send({type:'reel-playback',paused:false});}
  if(previous?.ready)previous.view.webContents.send('atlas:scroll-control',{speed:this.speed,paused:true});
  const from=animate&&previous?this.capture(previous):Promise.resolve(null);this.applyVisibility();if(!slot.ready)this.status(slot,'loading','Opening website…');
  const ready=slot.ready||await slot.promise;if(sequence!==this.sequence||!this.visible)return;if(!ready){this.presenting=false;this.outgoing=null;this.applyVisibility();this.status(slot,'failed','This website could not load. Open it in your browser or try the next company.');return;}
  const [oldFrame,newFrame]=animate&&previous?await Promise.all([from,this.capture(slot)]):[null,null];if(sequence!==this.sequence||!this.visible)return;
  if(oldFrame&&newFrame&&!this.overlay){this.transition={id:sequence,companyId:slot.companyId};this.send({type:'reel-transition',companyId:slot.companyId,transitionId:sequence,from:oldFrame,to:newFrame,direction,duration:this.transitionDuration});this.transitionTimer=setTimeout(()=>this.finish({companyId:slot.companyId,transitionId:sequence}),this.transitionDuration+250);this.transitionTimer.unref?.();}
  else this.activate(slot);
 }
 activate(slot){if(this.current!==slot)return;this.presenting=false;this.outgoing=null;slot.view.webContents.send('atlas:scroll-control',{speed:this.speed,paused:this.paused,activate:true});this.applyVisibility();this.status(slot,'ready','Live website');}
 finish({companyId,transitionId}){if(this.transition?.companyId!==companyId||this.transition.id!==transitionId)return;clearTimeout(this.transitionTimer);this.transition=null;if(this.current)this.activate(this.current);}
 cancelTransition(){clearTimeout(this.transitionTimer);this.transition=null;this.outgoing=null;this.presenting=false;}
 preload(ids){if(!Array.isArray(ids))return;for(const id of ids.slice(0,2)){if(Number(id)===this.current?.companyId)continue;try{this.acquire(id);}catch{}}}
 setBounds(bounds){const [w,h]=this.window.getContentSize();this.bounds=previewBounds(bounds,w,h);for(const slot of this.slots)slot.view.setBounds(this.bounds);this.applyVisibility();}
 applyVisibility(){for(const slot of this.slots)slot.view.setVisible(slot===this.current&&slot.ready&&!slot.failed&&this.visible&&!this.overlay&&!this.transition&&!this.presenting&&this.bounds.width>20&&this.bounds.height>20);}
 async control(options){if(typeof options.paused==='boolean')this.paused=options.paused;if(Number.isFinite(options.speed))this.speed=Math.max(30,Math.min(240,options.speed));if(this.current?.ready&&!this.current.view.webContents.isDestroyed())this.current.view.webContents.send('atlas:scroll-control',{paused:this.paused,speed:this.speed,restart:options.restart===true});}
 manualScroll(contents){if(contents!==this.current?.view.webContents||!this.visible)return false;this.control({paused:true});this.send({type:'reel-playback',paused:true});return true;}
 hide(){this.visible=false;this.destroy();}
 destroy(){this.sequence++;this.cancelTransition();for(const slot of this.slots){clearTimeout(slot.timeout);slot.resolve?.(false);const {view}=slot;if(!this.window.isDestroyed())this.window.contentView.removeChildView(view);if(!view.webContents.isDestroyed())view.webContents.close();}this.slots=[];this.current=null;}
}
