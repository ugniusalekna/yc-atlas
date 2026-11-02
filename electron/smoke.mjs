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
// Electron emits ready only after this ESM entry finishes evaluating, so the steps must not await it at top level.
void (async()=>{try{
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
 // Scroll wheel setting: a real wheel scrolls the website and pauses auto-scroll; a real Down key still changes company.
 const js=code=>window.webContents.executeJavaScript(code),scrollTop=()=>guest.webContents.executeJavaScript('document.scrollingElement.scrollTop'),company=()=>js("document.querySelector('.reel-side h2')?.textContent");
 await js("(()=>{const select=document.getElementById('reel-wheel');select.value='scroll';select.dispatchEvent(new Event('change',{bubbles:true}));})()");await wait(300);
 const reelCompany=await company(),{width,height}=guest.getBounds();guest.webContents.sendInputEvent({type:'mouseWheel',x:Math.round(width/2),y:Math.round(height/2),deltaX:0,deltaY:-240,canScroll:true});
 await until(()=>js("document.querySelector('[data-reel-action=pause]').getAttribute('aria-pressed')==='true'"),'wheel pauses auto-scroll');assert.equal(await company(),reelCompany,'Wheel must not change company in website-scroll mode');
 await wait(700);const held=await scrollTop();await wait(1000);assert.equal(await scrollTop(),held,'Auto-scroll stays paused for the reader once the wheel animation settles');
 guest.webContents.sendInputEvent({type:'mouseWheel',x:Math.round(width/2),y:Math.round(height/2),deltaX:0,deltaY:-240,canScroll:true});await until(async()=>await scrollTop()>held,'native website scrolling');
 guest.webContents.sendInputEvent({type:'keyDown',keyCode:'Down'});guest.webContents.sendInputEvent({type:'keyUp',keyCode:'Down'});await until(async()=>await company()!==reelCompany,'Down changes company while browsing');
 await js("(()=>{const select=document.getElementById('reel-wheel');select.value='navigate';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
 await writeFile('/tmp/yc-atlas-reels.png',(await window.capturePage()).toPNG());
 await window.webContents.executeJavaScript("document.querySelector('[data-reel-action=like]').click()");
 assert.equal(await window.webContents.executeJavaScript("document.getElementById('liked-count').textContent"),'1');
 await window.webContents.executeJavaScript("document.getElementById('liked-nav').click()");
 await until(()=>window.contentView.children.filter(view=>view.webContents&&view.webContents!==window.webContents).length===0,'guest cleanup');
 assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('.company-row').length"),1);
 console.log('PASS: real Electron window, isolated renderer/guest, data protocol, selectable years, live animated website scrolling, the Scroll wheel setting with real input, likes and view cleanup. Screenshots saved in /tmp.');
 server.close();app.exit(0);
}catch(error){console.error(error);server.close();app.exit(1);}})();
