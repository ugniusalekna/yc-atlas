const {contextBridge,ipcRenderer}=require('electron');
const invoke=(channel,...args)=>ipcRenderer.invoke(channel,...args);
contextBridge.exposeInMainWorld('atlasDesktop',Object.freeze({
 platform:process.platform,
 assistantLogin:()=>invoke('assistant:login'),assistantLoginCancel:()=>invoke('assistant:login-cancel'),assistantLogout:()=>invoke('assistant:logout'),assistantRespond:(id,result)=>invoke('assistant:respond',id,result),assistantUsage:()=>invoke('assistant:usage'),assistantSettings:()=>invoke('assistant:settings'),assistantConfigure:options=>invoke('assistant:configure',options),assistantModels:provider=>invoke('assistant:models',provider),assistantRun:request=>invoke('assistant:run',request),assistantTitle:request=>invoke('assistant:title',request),assistantCancel:()=>invoke('assistant:cancel'),assistantToolResult:(id,result)=>invoke('assistant:tool-result',id,result),
 finishReelOverlay:options=>invoke('reel:overlay-ready',options),showReel:options=>invoke('reel:show',options),preloadReels:ids=>invoke('reel:preload',ids),finishReelTransition:options=>invoke('reel:transition-end',options),hideReel:()=>invoke('reel:hide'),controlReel:options=>invoke('reel:control',options),resizeReel:bounds=>invoke('reel:bounds',bounds),overlay:active=>invoke('reel:overlay',Boolean(active)),
 refreshSnapshot:()=>invoke('snapshot:refresh'),refreshStatus:()=>invoke('snapshot:status'),
 exportLibrary:payload=>invoke('library:export',payload),importLibrary:()=>invoke('library:import'),
 onEvent:callback=>{const listener=(_event,message)=>callback(message);ipcRenderer.on('atlas:event',listener);return()=>ipcRenderer.removeListener('atlas:event',listener);}
}));
