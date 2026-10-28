import {app,BrowserWindow,session} from 'electron';
import {createServer} from 'node:http';
import {writeFile} from 'node:fs/promises';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import './main.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const testData=path.join(root,'.desktop-test','smoke-'+process.pid);mkdirSync(testData,{recursive:true});app.setPath('userData',testData);
const server=createServer((_request,response)=>{response.setHeader('Content-Type','text/html');response.end('<!doctype html><html><style>body{margin:0;font:32px system-ui;background:#f3e9d9}header{height:400px;background:#dd5e35;color:white;padding:40px}main{height:4000px;padding:40px}span{display:block;animation:move 2s infinite alternate}@keyframes move{to{transform:translateX(250px)}}</style><header>Live website fixture<span>Animated content</span></header><main>Scrolling content</main></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const fixture=`http://127.0.0.1:${server.address().port}/`;
app.whenReady().then(()=>session.fromPartition('persist:atlas-company-sites').webRequest.onBeforeRequest((details,callback)=>callback(details.resourceType==='mainFrame'&&!details.url.startsWith(fixture)?{redirectURL:fixture}:{})));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,description){for(let i=0;i<120;i++){const result=await fn();if(result)return result;await wait(100);}throw new Error('Timed out: '+description);}
try{
 await app.whenReady();const window=await until(()=>BrowserWindow.getAllWindows()[0],'main window');
 await until(()=>window.webContents.executeJavaScript("document.getElementById('stage')?.getAttribute('aria-busy')==='false'").catch(()=>false),'directory load');
 assert.equal(await window.webContents.executeJavaScript("typeof require"),'undefined');
 assert.equal(await window.webContents.executeJavaScript("window.atlasDesktop.platform"),process.platform);
 await writeFile('/tmp/yc-atlas-desktop.png',(await window.capturePage()).toPNG());
 await window.webContents.executeJavaScript("document.getElementById('summary-nav').click();document.getElementById('compare-from').value='2014';document.getElementById('compare-from').dispatchEvent(new Event('change',{bubbles:true}));");
 assert.equal(await window.webContents.executeJavaScript("document.getElementById('compare-from').value"),'2014');
 await window.webContents.executeJavaScript("document.getElementById('reels-nav').click()");
 const guest=await until(()=>window.contentView.children.find(view=>view.webContents&&view.webContents!==window.webContents),'company browser view');
 await until(()=>guest.webContents.getURL().startsWith(fixture),'fixture navigation');
 assert.equal(await guest.webContents.executeJavaScript('typeof require'),'undefined');assert.equal(await guest.webContents.executeJavaScript('typeof window.atlasDesktop'),'undefined');
 await window.webContents.executeJavaScript('window.atlasDesktop.controlReel({paused:false,speed:150})');await wait(2500);
 assert.ok(await guest.webContents.executeJavaScript('document.scrollingElement.scrollTop>30'),'Live browser must scroll the actual page');
 await writeFile('/tmp/yc-atlas-reel-website.png',(await guest.webContents.capturePage()).toPNG());
 await writeFile('/tmp/yc-atlas-reels.png',(await window.capturePage()).toPNG());
 await window.webContents.executeJavaScript("document.querySelector('[data-reel-action=like]').click()");
 assert.equal(await window.webContents.executeJavaScript("document.getElementById('liked-count').textContent"),'1');
 await window.webContents.executeJavaScript("document.getElementById('liked-nav').click()");
 await until(()=>window.contentView.children.filter(view=>view.webContents&&view.webContents!==window.webContents).length===0,'guest cleanup');
 assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('.company-row').length"),1);
 console.log('PASS: real Electron window, isolated renderer/guest, data protocol, selectable years, live animated website scrolling, likes and view cleanup. Screenshots saved in /tmp.');
 server.close();app.exit(0);
}catch(error){console.error(error);server.close();app.exit(1);}
