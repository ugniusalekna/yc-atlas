import {app,BrowserWindow,Menu,ipcMain,protocol,shell,dialog,net,utilityProcess,nativeImage} from 'electron';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {webURL,trustedFrame,assetPath} from './security.mjs';
import {installAssistant} from './assistant.mjs';
import {ReelsController} from './reels.mjs';
import {SnapshotUpdater} from './refresh.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..'),dist=path.join(root,'dist');
protocol.registerSchemesAsPrivileged([{scheme:'atlas',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
app.setName('YC Atlas');
let window,reels,updater,assistant;let dataset;
const send=message=>{if(window&&!window.isDestroyed()){if(['navigate','search'].includes(message.type))window.webContents.focus();window.webContents.send('atlas:event',message);}};
const contentTypes={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
async function buildSemantics(directory,progress){
 await new Promise((resolve,reject)=>{const child=utilityProcess.fork(path.join(root,'scripts/build-semantics.mjs'),[],{cwd:app.getPath('userData'),env:{...process.env,YC_DATA_DIR:directory,YC_CACHE_DIR:path.join(app.getPath('userData'),'semantic-cache'),YC_MODEL_DIR:app.isPackaged?path.join(process.resourcesPath,'models'):path.join(root,'.cache/models')},stdio:'pipe',serviceName:'YC description maps'});let last='';child.stdout?.on('data',chunk=>{last=String(chunk).trim().split('\n').at(-1);progress(last);});child.stderr?.on('data',chunk=>{last=String(chunk).trim().slice(-500);});child.on('exit',code=>code===0?resolve():reject(new Error(last||'Could not rebuild maps')));});
}
async function reloadDataset(){dataset=JSON.parse(await readFile(path.join(updater.activeData,'companies.json'),'utf8'));}
function handle(channel,fn){ipcMain.handle(channel,(event,...args)=>{if(!trustedFrame(event,window))throw new Error('Untrusted request');return fn(...args);});}
async function createWindow(){
 window=new BrowserWindow({width:1460,height:960,minWidth:960,minHeight:680,title:'YC Atlas',backgroundColor:'#f5f5f3',...(process.platform==='darwin'?{titleBarStyle:'hiddenInset',trafficLightPosition:{x:16,y:19}}:{}),webPreferences:{preload:path.join(here,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 if(process.platform==='darwin'){const icon=nativeImage.createFromPath(path.join(root,'assets/icon.png'));if(!icon.isEmpty())app.dock.setIcon(icon);}
 reels=new ReelsController(window,{prepareView:(contents)=>assistant.selectionMenu(contents,()=>reels.slots.find(s=>s.view.webContents===contents)?.companyId),send,openExternal:url=>shell.openExternal(url),lookup:id=>dataset.companies.find(c=>c.id===id)});
 window.webContents.setWindowOpenHandler(({url})=>{if(webURL(url))shell.openExternal(url);return{action:'deny'};});
 window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('atlas://app/')){event.preventDefault();if(webURL(url))shell.openExternal(url);}});
 assistant.selectionMenu(window.webContents);
 window.on('closed',()=>{assistant.cancel();reels?.destroy();window=null;});
 await window.loadURL('atlas://app/');
}
app.whenReady().then(async()=>{
 await mkdir(app.getPath('userData'),{recursive:true});updater=new SnapshotUpdater({userData:app.getPath('userData'),bundledData:path.join(dist,'data'),buildSemantics,fetcher:(url,options)=>net.fetch(url,options),send:message=>{if(message.type==='snapshot-status'&&message.state==='complete')reloadDataset().then(()=>send(message));else send(message);}});await updater.initialize();await reloadDataset();
 protocol.handle('atlas',async request=>{try{let file=assetPath(request.url,dist);if(!file)return new Response('Not found',{status:404});const name=path.basename(file);if(file===path.join(dist,'data',name)&&['companies.json','semantic.json'].includes(name))file=path.join(updater.activeData,name);const body=await readFile(file);return new Response(body,{headers:{'Content-Type':contentTypes[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://api.fontshare.com; font-src 'self' https: data:; img-src 'self' https: http: data: blob:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'"}});}catch{return new Response('Not found',{status:404});}});
 handle('reel:show',options=>reels.show(options));handle('reel:preload',ids=>reels.preload(ids));handle('reel:transition-end',options=>reels.finish(options));handle('reel:hide',()=>reels.hide());handle('reel:bounds',bounds=>reels.setBounds(bounds));handle('reel:overlay',active=>{reels.overlay=active===true;reels.applyVisibility();});handle('reel:control',options=>reels.control(options));
 handle('snapshot:status',()=>updater.status);handle('snapshot:refresh',()=>{if(updater.status.state!=='running')updater.refresh();return updater.status;});
 handle('library:export',async payload=>{if(typeof payload!=='string'||payload.length>10_000_000)throw new Error('Invalid library');const {canceled,filePath}=await dialog.showSaveDialog(window,{defaultPath:'yc-atlas-library.json',filters:[{name:'YC Atlas library',extensions:['json']}]});if(canceled)return false;await writeFile(filePath,payload);return true;});
 handle('library:import',async()=>{const {canceled,filePaths}=await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'YC Atlas library',extensions:['json']}]});if(canceled)return null;const value=await readFile(filePaths[0],'utf8');if(value.length>10_000_000)throw new Error('Library is too large');return value;});
 ipcMain.on('reel:gesture',(event,direction)=>{if(event.sender===reels.current?.view.webContents&&['next','previous'].includes(direction))send({type:'reel-navigation',direction});});
 ipcMain.on('reel:manual-scroll',event=>{if(event.senderFrame===event.sender.mainFrame)reels.manualScroll(event.sender);});
 const navigate=tab=>send({type:'navigate',tab});
 Menu.setApplicationMenu(Menu.buildFromTemplate([...(process.platform==='darwin'?[{label:'YC Atlas',submenu:[{role:'about'},{type:'separator'},{role:'services'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{type:'separator'},{role:'quit'}]}]:[]),{label:'File',submenu:[{label:'Update snapshot',click:()=>send({type:'update-snapshot'})},{label:'Import library…',click:()=>send({type:'import-library'})},{label:'Export library…',click:()=>send({type:'export-library'})},{type:'separator'},process.platform==='darwin'?{role:'close'}:{role:'quit'}]},{role:'editMenu'},{label:'View',submenu:[{label:'Explore',accelerator:'CmdOrCtrl+1',click:()=>navigate('explore')},{label:'Reels',accelerator:'CmdOrCtrl+2',click:()=>navigate('reels')},{label:'Summary',accelerator:'CmdOrCtrl+3',click:()=>navigate('summary')},{label:'Saved',accelerator:'CmdOrCtrl+4',click:()=>navigate('saved')},{label:'Liked',accelerator:'CmdOrCtrl+5',click:()=>navigate('liked')},{label:'Chat',accelerator:'CmdOrCtrl+6',click:()=>navigate('chat')},{type:'separator'},{label:'Search',accelerator:'CmdOrCtrl+F',click:()=>send({type:'search'})},{role:'togglefullscreen'},...(!app.isPackaged?[{role:'toggleDevTools'}]:[])]},{role:'windowMenu'}]));
 assistant=installAssistant({handle,ipcMain,app,getWindow:()=>window,trustedFrame,send,getDataset:()=>dataset});
 await createWindow();app.on('activate',()=>{if(!window)createWindow();});
}).catch(error=>{dialog.showErrorBox('YC Atlas could not start',error.stack||error.message);app.quit();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
