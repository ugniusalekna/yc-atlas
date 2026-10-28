import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {assetPath,previewBounds,webURL,trustedFrame} from '../electron/security.mjs';
import {normalizeCompany,fetchDirectory,semanticFingerprint} from '../electron/directory.mjs';
import {scrollProgram} from '../electron/scroll.mjs';
import {SnapshotUpdater} from '../electron/refresh.mjs';
const snapshot=JSON.parse(await readFile('dist/data/companies.json')),semantic=JSON.parse(await readFile('dist/data/semantic.json'));
assert.equal(semanticFingerprint(snapshot.companies),semantic.meta.sourceHash);
assert.equal(webURL('file:///etc/passwd'),null);assert.equal(webURL('javascript:alert(1)'),null);assert.equal(webURL('https://user:pass@example.com'),null);
assert.equal(assetPath('atlas://evil/app.js','/app/dist'),null);assert.equal(assetPath('atlas://app/%2e%2e%2fsecret','/app/dist'),null);assert.equal(assetPath('atlas://app/app.js','/app/dist'),'/app/dist/app.js');
assert.deepEqual(previewBounds({x:-10,y:20,width:3000,height:3000},1000,700),{x:0,y:20,width:1000,height:680});assert.throws(()=>previewBounds({x:NaN},1000,700));
const frame={url:'atlas://app/'},wc={mainFrame:frame};assert.ok(trustedFrame({sender:wc,senderFrame:frame},{webContents:wc}));assert.equal(trustedFrame({sender:{},senderFrame:frame},{webContents:wc}),false);
const raw=snapshot.companies.slice(0,4).map(c=>({id:c.id,name:c.name,slug:c.slug,small_logo_thumb_url:c.logo,website:c.website,all_locations:c.location,long_description:c.description,one_liner:c.summary,team_size:c.team,industry:c.industry,industries:c.industries,tags:c.tags,batch:c.batch,status:c.status,regions:c.regions,isHiring:c.hiring,top_company:c.top,launched_at:c.launched}));
const airbnb=normalizeCompany({id:271,name:'Airbnb',slug:'airbnb',industry:'Consumer',tags:['Marketplace','Travel'],long_description:'Satellite offices'},snapshot.topics);assert.deepEqual(airbnb.topics,['consumer','commerce']);
const small={...snapshot,companies:raw.map(c=>normalizeCompany(c,snapshot.topics)),meta:{...snapshot.meta,total:4}};
function mockedFetch({incomplete=false}={}){return async(url,options)=>{if(url.includes('ycombinator.com/companies'))return new Response('window.AlgoliaOpts = {"app":"YC123","key":"public"};');const query=JSON.parse(options.body);if(query.facets)return Response.json({nbHits:4,facets:{batch:{[raw[0].batch]:4}}});return Response.json({nbHits:4,hits:incomplete?raw.slice(0,3):raw});};}
const result=await fetchDirectory(small,{fetcher:mockedFetch()});assert.equal(result.snapshot.companies.length,4);assert.equal(result.changes.added,0);assert.equal(result.changes.updated,0);await assert.rejects(fetchDirectory(small,{fetcher:mockedFetch({incomplete:true})}),/Incomplete/);
const dir=await mkdtemp(path.join(os.tmpdir(),'yc-desktop-'));
try{const bundled=path.join(dir,'bundled'),userData=path.join(dir,'user');await mkdir(bundled);await mkdir(userData);const hash=semanticFingerprint(small.companies);small.meta.semanticSourceHash=hash;await writeFile(path.join(bundled,'companies.json'),JSON.stringify(small));await writeFile(path.join(bundled,'semantic.json'),JSON.stringify({meta:{sourceHash:hash,companyCount:4},layouts:{}}));let builds=0;
const updater=new SnapshotUpdater({userData,bundledData:bundled,fetcher:mockedFetch(),buildSemantics:async()=>{builds++;}});await updater.refresh();assert.equal(updater.status.state,'complete');assert.equal(builds,0,'Unchanged descriptions reuse matching maps');assert.notEqual(updater.activeData,bundled);
const loaded=new SnapshotUpdater({userData,bundledData:bundled});await loaded.initialize();assert.equal(loaded.activeData,updater.activeData);
const pointer=await readFile(path.join(userData,'current-snapshot'),'utf8');updater.fetcher=mockedFetch({incomplete:true});await updater.refresh();assert.equal(updater.status.state,'failed');assert.equal(await readFile(path.join(userData,'current-snapshot'),'utf8'),pointer,'Failed refresh must keep the active snapshot');
const changedFetch=mockedFetch();updater.fetcher=async(url,options)=>{const response=await changedFetch(url,options);if(!url.includes('ycombinator.com')&&JSON.parse(options.body).facetFilters){const value=await response.json();value.hits[0].one_liner+=' changed';return Response.json(value);}return response;};updater.buildSemantics=async()=>{throw new Error('Synthetic map build failure');};await updater.refresh();assert.equal(updater.status.state,'failed');assert.equal(await readFile(path.join(userData,'current-snapshot'),'utf8'),pointer);
}finally{await rm(dir,{recursive:true,force:true});}
const ctx={};vm.createContext(ctx);for(const script of ['discovery','insights'])vm.runInContext(await readFile(`dist/${script}.js`,'utf8'),ctx);
const store=new ctx.YCDiscovery.Store();const engine=new ctx.YCDiscovery.Engine(store,()=>.1);engine.setData(snapshot.companies,semantic);const first=engine.next();assert.ok(first.company.website);store.toggle(first.company.id);assert.ok(store.likes.has(first.company.id));const next=engine.next();assert.notEqual(next.company.id,first.company.id);assert.equal(next.reason,'Related to companies you liked');assert.equal(engine.previous().company.id,first.company.id);assert.equal(engine.next().company.id,next.company.id);
const viewedBeforePeek=store.seen.size,historyBeforePeek=engine.history.length,indexBeforePeek=engine.index;const pending=engine.peekNext();assert.equal(store.seen.size,viewedBeforePeek);assert.equal(engine.history.length,historyBeforePeek);assert.equal(engine.index,indexBeforePeek);assert.equal(engine.next().company.id,pending.company.id,'The watched next company must match the warmed recommendation');
const comparison=ctx.YCInsights.summarize(snapshot.companies,snapshot.companies,2026,{previous:2014,current:2023});assert.equal(comparison.previousYear,2014);assert.equal(comparison.currentYear,2023);assert.equal(comparison.currentTotal,snapshot.companies.filter(c=>c.batch.endsWith('2023')).length);assert.equal(comparison.previousTotal,snapshot.companies.filter(c=>c.batch.endsWith('2014')).length);
const reverse=ctx.YCInsights.summarize(snapshot.companies,snapshot.companies,2026,{previous:2023,current:2014});assert.equal(reverse.previousYear,2023);assert.equal(reverse.currentYear,2014);

// Fractional scroll positions must follow elapsed time rather than accumulated pixel rounding.
let scrollFrame;const target={scrollTop:0,scrollHeight:2000,clientHeight:300,scrollTo({top}){this.scrollTop=Math.round(top);}};
const scrollContext={window:{},document:{scrollingElement:target,querySelectorAll:()=>[]},performance:{now:()=>0},requestAnimationFrame:callback=>{scrollFrame=callback;}};vm.createContext(scrollContext);vm.runInContext(scrollProgram({speed:100,paused:false}),scrollContext);
scrollFrame(1500);for(let time=1516.7;time<2516.7;time+=16.7)scrollFrame(time);assert.ok(Math.abs(target.scrollTop-100)<3,'Scroll speed must stay near 100 px/s despite integer scrollTop rounding');
let manualPauses=0;scrollContext.window.__atlasOnManualScroll=()=>{manualPauses++;};
// A drag must win over the next auto-scroll frame and pause immediately.
target.scrollTop=450;scrollFrame(2700);assert.equal(target.scrollTop,450);assert.equal(scrollContext.window.__atlasAutoScroll.paused,true);assert.equal(manualPauses,1);
target.scrollTop=700;scrollFrame(3500);assert.equal(target.scrollTop,700);assert.equal(manualPauses,1,'Dragging while paused must not emit repeated pause notifications');
vm.runInContext(scrollProgram({speed:100,paused:false}),scrollContext);scrollFrame(9000);assert.equal(target.scrollTop,700,'Resume must use the current offset without paused-time catch-up');scrollFrame(9100);assert.equal(target.scrollTop,710);
vm.runInContext(scrollProgram({speed:100,paused:true}),scrollContext);target.scrollTop=1000;
vm.runInContext(scrollProgram({speed:100,paused:false}),scrollContext);scrollFrame(12000);assert.equal(target.scrollTop,1000,'Resume before a paused animation frame must still read the current offset');scrollFrame(12100);assert.equal(target.scrollTop,1010);
// Activation of a cached page also starts from its actual scroll position.
vm.runInContext(scrollProgram({speed:100,paused:true}),scrollContext);target.scrollTop=250;vm.runInContext(scrollProgram({speed:100,paused:false,activate:true}),scrollContext);scrollFrame(13000);assert.equal(target.scrollTop,250);scrollFrame(13100);assert.equal(target.scrollTop,260);
vm.runInContext(scrollProgram({speed:100,paused:true}),scrollContext);const pausedAt=target.scrollTop;scrollFrame(14000);assert.equal(target.scrollTop,pausedAt);vm.runInContext(scrollProgram({speed:100,paused:false,restart:true}),scrollContext);assert.equal(target.scrollTop,0);


console.log('PASS: desktop IPC origin guards, protocol paths, URL restrictions, viewport bounds, full-directory coverage, atomic refresh/reuse/rollback, preference recommendations and arbitrary-year comparisons.');
