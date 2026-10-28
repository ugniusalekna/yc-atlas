const {contextBridge,ipcRenderer}=require('electron');
const invoke=(channel,...args)=>ipcRenderer.invoke(channel,...args);
contextBridge.exposeInMainWorld('atlasDesktop',Object.freeze({
 platform:process.platform,
 showReel:options=>invoke('reel:show',options),preloadReels:ids=>invoke('reel:preload',ids),finishReelTransition:options=>invoke('reel:transition-end',options),hideReel:()=>invoke('reel:hide'),controlReel:options=>invoke('reel:control',options),resizeReel:bounds=>invoke('reel:bounds',bounds),overlay:active=>invoke('reel:overlay',Boolean(active)),
 refreshSnapshot:()=>invoke('snapshot:refresh'),refreshStatus:()=>invoke('snapshot:status'),
 exportLibrary:payload=>invoke('library:export',payload),importLibrary:()=>invoke('library:import'),
 onEvent:callback=>{const listener=(_event,message)=>callback(message);ipcRenderer.on('atlas:event',listener);return()=>ipcRenderer.removeListener('atlas:event',listener);}
}));
