import {WebContentsView,session} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ReelsPool} from './reels-core.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
export class ReelsController extends ReelsPool{
 constructor(window,options){
  const guestSession=session.fromPartition('persist:atlas-company-sites',{cache:true});guestSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));guestSession.setPermissionCheckHandler(()=>false);
  super(window,{...options,createView:()=>{
   const view=new WebContentsView({webPreferences:{session:guestSession,preload:path.join(here,'guest-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:true}});
   const cancelDownload=(event,_item,contents)=>{if(contents===view.webContents)event.preventDefault();};guestSession.on('will-download',cancelDownload);view.webContents.once('destroyed',()=>guestSession.removeListener('will-download',cancelDownload));return view;
  }});
 }
}
