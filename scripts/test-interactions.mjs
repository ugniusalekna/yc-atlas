// DOM integration checks exercise app events and SVG geometry, not browser rendering.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM, VirtualConsole} from 'jsdom';
const dataset=JSON.parse(readFileSync('dist/data/companies.json'));
const semanticData=JSON.parse(readFileSync('dist/data/semantic.json'));
const errors=[],vc=new VirtualConsole();
vc.on('jsdomError',e=>errors.push(e.message));vc.on('error',(...args)=>errors.push(args.join(' ')));
const dom=new JSDOM(readFileSync('dist/index.html','utf8'),{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window,d=w.document;
w.matchMedia=()=>({matches:true,addListener(){},removeListener(){}});
const resizeObservers=[];w.ResizeObserver=class{constructor(callback){resizeObservers.push(callback);}observe(){} disconnect(){}};
w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
w.fetch=async url=>({ok:true,json:async()=>structuredClone(url.includes('semantic.json')?semanticData:dataset)});
let stageWidth=900,stageHeight=600;
Object.defineProperties(d.getElementById('stage'),{clientWidth:{get:()=>stageWidth},clientHeight:{get:()=>stageHeight}});
Object.defineProperty(w.SVGSVGElement.prototype,'viewBox',{get(){const [x,y,width,height]=(this.getAttribute('viewBox')||'0 0 900 600').split(' ').map(Number);return{baseVal:{x,y,width,height}};}});
for(const script of ['d3.min','insights','layouts','controls','saved','discovery','reels-view','app'])w.eval(readFileSync(`dist/${script}.js`,'utf8'));
const tick=(ms=20)=>new Promise(r=>setTimeout(r,ms));
const el=s=>{const node=d.querySelector(s);assert.ok(node,`Missing element ${s}`);return node;};
const click=s=>{const node=typeof s==='string'?el(s):s;if(typeof node.click==='function')node.click();else node.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));};
const change=(s,value)=>{const node=el(s);node.value=value;node.dispatchEvent(new w.Event('change',{bubbles:true}));};
const navigate=url=>{w.history.pushState({},'',url);w.dispatchEvent(new w.PopStateEvent('popstate'));};
const params=()=>new URLSearchParams(w.location.search);
const escape=()=>d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
const camera=()=>{const t=w.d3.zoomTransform(el('#map'));return {x:t.x,y:t.y,k:t.k};};
const filter=(key,value)=>click([...d.querySelectorAll(`input[data-filter="${key}"]`)].find(n=>n.value===value)??`missing-${key}-${value}`);
const count=()=>Number(el('#results-count').textContent.match(/of ([\d,]+)/)?.[1].replaceAll(',',''));
const effectiveRadius=node=>{const r=Number(node.querySelector('.logo-circle').getAttribute('r')),scale=Number(node.getAttribute('transform').match(/scale\(([^)]+)\)/)[1]);return r*scale*camera().k;};
function centered(id){const node=el(`.semantic-company[data-company-id="${id}"]`),[x,y]=node.getAttribute('transform').match(/translate\(([^,]+),([^)]+)\)/).slice(1).map(Number),t=camera();assert.ok(Math.abs(x*t.k+t.x-stageWidth/2)<1e-6,'Selected company must be centered horizontally');assert.ok(Math.abs(y*t.k+t.y-stageHeight/2)<1e-6,'Selected company must be centered vertically');}
await tick();
assert.equal(el('#stage').getAttribute('aria-busy'),'false');
assert.equal(el('#map').hasAttribute('hidden'),false);
assert.equal(d.querySelectorAll('.cluster').length,14,'All topics appear together without overview pages');
assert.equal(el('#pagination').hidden,true);
const clusters=[...d.querySelectorAll('.cluster')];
const areas=clusters.map(g=>Math.PI*Number(g.querySelector('.cluster-boundary').getAttribute('r'))**2/g.__data__.companies.length);
for(const area of areas)assert.ok(Math.abs(area/areas[0]-1)<1e-10);
assert.equal(new Set(clusters.map(g=>g.__data__.x.toFixed(2))).size,14);
assert.equal(new Set(clusters.map(g=>g.__data__.y.toFixed(2))).size,14);
for(const g of clusters){const p=g.__data__;assert.ok(Number(g.querySelector('.cluster-label').getAttribute('y'))>p.y+p.r);}
for(let i=0;i<clusters.length;i++)for(let j=i+1;j<clusters.length;j++){const a=clusters[i].__data__,b=clusters[j].__data__;assert.ok(Math.hypot(a.x-b.x,a.y-b.y)-a.r-b.r>=12);}
clusters[0].dispatchEvent(new w.MouseEvent('pointerenter',{clientX:120,clientY:100}));
assert.equal(el('#tooltip').hidden,false);assert.match(el('#tooltip').textContent,/companies/);
clusters[0].dispatchEvent(new w.MouseEvent('pointerleave'));assert.equal(el('#tooltip').hidden,true);
assert.equal(d.querySelectorAll('.cluster-count').length,0);

// Multiple selections are OR within a dropdown and AND across dropdowns.
click('#list-view');filter('batch','Fall 2026');filter('batch','Spring 2026');
assert.equal(count(),dataset.companies.filter(c=>['Fall 2026','Spring 2026'].includes(c.batch)).length);
assert.deepEqual(params().getAll('batch'),['Fall 2026','Spring 2026']);
filter('region','Europe');filter('region','Asia');filter('status','Active');filter('status','Public');
const scope=dataset.companies.filter(c=>['Fall 2026','Spring 2026'].includes(c.batch)&&['Active','Public'].includes(c.status)&&c.regions.some(r=>['Europe','Asia','South Asia','Southeast Asia','East Asia'].includes(r)));
assert.equal(count(),scope.length);assert.equal(params().getAll('region').length,2);assert.equal(params().getAll('status').length,2);
const multiURL=w.location.search;navigate('/');navigate(multiURL);
assert.equal(el('#company-list').hidden,false);assert.equal(count(),scope.length);
for(const key of ['batch','region','status'])assert.equal(d.querySelectorAll(`input[data-filter="${key}"]:checked`).length,2);

// Group selection respects the current view; Escape/background only clear group scope.
navigate('/?topic=defense&view=list');
const defenseLayout=semanticData.layouts.defense,firstGroup=defenseLayout.clusters[0];
click(`[data-semantic-group="${firstGroup.id}"]`);
assert.equal(params().get('view'),'list');assert.equal(el('#company-list').hidden,false);
assert.equal(count(),firstGroup.count);
for(const row of d.querySelectorAll('.company-row'))assert.equal(defenseLayout.points[row.dataset.company][2],firstGroup.id);
assert.ok(el('.row-assignment').textContent.includes('Defense'));assert.ok(el('.row-region').textContent);
click('.company-row');assert.ok(el('.metadata').textContent.includes('Description group'));assert.ok(el('.metadata').textContent.includes('Geographic region'));assert.ok(el('.metadata').textContent.includes('Topics'));
assert.equal(el('#company-list').hidden,false,'Inspecting a list company keeps the list');
click('#map-view');centered(Number(params().get('company')));

navigate('/?topic=defense&batch=Fall+2026');
assert.equal(d.querySelectorAll('.semantic-company').length,0);
const availableGroup=el('[data-semantic-group]').dataset.semanticGroup;
click(`[data-semantic-group="${availableGroup}"]`);assert.ok(params().has('group'));
escape();assert.equal(params().has('group'),false);assert.equal(params().get('topic'),'defense');assert.equal(params().get('batch'),'Fall 2026');
click(`[data-semantic-group="${availableGroup}"]`);click('#map');
assert.equal(params().has('group'),false);assert.equal(params().get('topic'),'defense');assert.equal(params().get('batch'),'Fall 2026');
click(`[data-semantic-group="${availableGroup}"]`);
click('#batch-filter summary');assert.equal(el('#batch-filter').open,true);
escape();assert.equal(el('#batch-filter').open,false);assert.ok(params().has('group'),'Closing a popup leaves the selected group intact');
click('#batch-filter summary');click('#map');assert.ok(params().has('group'),'Dismissing a popup by clicking the map leaves the group intact');
escape();assert.equal(params().has('group'),false);

// Dense maps start collapsed. Larger pages and render-all preserve the exact camera.
navigate('/?topic=ai');
assert.equal(d.querySelectorAll('.semantic-company').length,0);
assert.ok(d.querySelectorAll('#map *').length<200);
const largeGroup=[...semanticData.layouts.ai.clusters].sort((a,b)=>b.count-a.count)[0];
click(`[data-semantic-group="${largeGroup.id}"]`);
assert.equal(el('#map-limit').value,'100');assert.equal(d.querySelectorAll('.semantic-company').length,100);
assert.ok(d.querySelector('.semantic-region-label.is-context'));
const firstPage=new Set([...d.querySelectorAll('.semantic-company')].map(g=>g.dataset.companyId));
const bubble=el('.semantic-company'),r=Number(bubble.querySelector('.logo-circle').getAttribute('r'));
assert.ok(Number(bubble.style.getPropertyValue('--bubble-outline'))/r<=.15);
const radiusBefore=effectiveRadius(bubble);click('#zoom-in');assert.ok(effectiveRadius(bubble)>radiusBefore,'Logos grow when zooming in');
let before=camera();click('#next-page');assert.deepEqual(camera(),before,'Paging must retain pan and zoom');
for(const g of d.querySelectorAll('.semantic-company'))assert.ok(!firstPage.has(g.dataset.companyId));
change('#map-limit','200');assert.deepEqual(camera(),before,'Changing page size retains pan and zoom');
assert.equal(d.querySelectorAll('.semantic-company').length,Math.min(200,largeGroup.count));
change('#map-limit','all');assert.deepEqual(camera(),before);assert.equal(d.querySelectorAll('.semantic-company').length,largeGroup.count);assert.equal(el('#pagination').hidden,true);
for(const g of d.querySelectorAll('.semantic-company'))assert.equal(semanticData.layouts.ai.points[g.dataset.companyId][2],largeGroup.id);
change('#map-logo-size','24');assert.deepEqual(camera(),before);assert.equal(Number(el('.semantic-company .logo-circle').getAttribute('r')),24);
assert.deepEqual(JSON.parse(w.localStorage.getItem('yc-atlas-map-settings')),{limit:'all',logoSize:24});
change('#map-limit','50');const reached=new Set();
do{d.querySelectorAll('.semantic-company').forEach(g=>reached.add(Number(g.dataset.companyId)));if(el('#next-page').disabled)break;before=camera();click('#next-page');assert.deepEqual(camera(),before);}while(true);
assert.equal(reached.size,largeGroup.count);

// A company and its similar descriptions share the same centering behavior.
click(el('.semantic-company'));let id=Number(params().get('company'));centered(id);
const related=el('#inspector [data-company]');id=Number(related.dataset.company);click(related);assert.equal(Number(params().get('company')),id);centered(id);
assert.ok(el('.semantic-company.is-selected'));
click('#save-company');assert.equal(el('#save-company').getAttribute('aria-pressed'),'true');
click('#saved-nav');click('#list-view');assert.equal(d.querySelectorAll('.company-row').length,1);
click('.company-row');click('#save-company');assert.equal(el('#empty').hidden,false);

// Explore search locates companies without applying a text filter to the map/list.
navigate('/?view=list');click('#next-page');assert.match(el('#results-count').textContent,/73–144 of 6,344/);
const search=el('#search'),airbnb=dataset.companies.find(c=>c.slug==='airbnb');
const typeSearch=async value=>{search.value=value;search.dispatchEvent(new w.Event('input',{bubbles:true}));await tick(220);};
const searchKey=key=>search.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
await typeSearch('Airbnb');assert.equal(count(),dataset.companies.length,'Typing must not filter the directory');assert.equal(params().has('company'),false);assert.equal(params().has('q'),false);assert.equal(el('[data-find-company]').dataset.findCompany,String(airbnb.id));
searchKey('Enter');assert.equal(params().get('view'),null);assert.equal(Number(params().get('company')),airbnb.id);assert.equal(el('#map').hasAttribute('hidden'),false);centered(airbnb.id);assert.ok(el(`.semantic-company[data-company-id="${airbnb.id}"]`).classList.contains('is-selected'));assert.ok(d.querySelectorAll('.semantic-company').length>1,'The selected company keeps its surrounding companies');assert.ok(d.querySelector('.semantic-region.is-context'));assert.equal(el('#company-search-popup').hidden,true);assert.equal(search.value,'');
assert.deepEqual(airbnb.tags,['Marketplace','Travel']);assert.ok(!airbnb.topics.includes('defense'));assert.ok(el('.metadata').textContent.includes('North America'));
const locatedURL=w.location.search;let searchCamera=camera();
await typeSearch('zzzz-no-such-company-unique-3987');assert.equal(el('#company-search-status').textContent,'No matching companies');assert.equal(el('#empty').hidden,true);assert.deepEqual(camera(),searchCamera);assert.equal(w.location.search,locatedURL);searchKey('Escape');assert.equal(el('#company-search-popup').hidden,true);assert.equal(w.location.search,locatedURL,'Escape dismisses search before touching map selection');
await typeSearch('air');const options=[...d.querySelectorAll('[data-find-company]')];assert.ok(options.length>1);const second=Number(options[1].dataset.findCompany);searchKey('ArrowDown');assert.equal(search.getAttribute('aria-activedescendant'),'company-search-option-1');searchKey('Enter');assert.equal(Number(params().get('company')),second);centered(second);
// A clicked result works too, and clearing a query leaves the map untouched.
await typeSearch('Airbnb');click(`[data-find-company="${airbnb.id}"]`);centered(airbnb.id);searchCamera=camera();await typeSearch('Air');await typeSearch('');assert.equal(el('#company-search-popup').hidden,true);assert.deepEqual(camera(),searchCamera);
// Enter before debounce uses the latest text, and blur cancels a pending popup.
await typeSearch('Airbnb');const stripe=dataset.companies.find(c=>c.slug==='stripe');assert.ok(stripe);search.value=stripe.name;search.dispatchEvent(new w.Event('input',{bubbles:true}));searchKey('Enter');assert.equal(Number(params().get('company')),stripe.id);centered(stripe.id);
search.focus();search.value='Airbnb';search.dispatchEvent(new w.Event('input',{bubbles:true}));search.blur();await tick(220);assert.equal(el('#company-search-popup').hidden,true,'Search results must not reopen after focus leaves the field');
navigate('/');navigate(locatedURL);centered(airbnb.id);
// Keep compatible facets, clearing only facets that hide the selected company.
const compatibleStatus=airbnb.status,compatibleTag=airbnb.tags[0];navigate(`/?topic=defense&batch=Fall+2026&region=Europe&status=${encodeURIComponent(compatibleStatus)}&tag=${encodeURIComponent(compatibleTag)}&year=2026`);
await typeSearch('Airbnb');searchKey('Enter');centered(airbnb.id);assert.equal(params().get('status'),compatibleStatus);assert.equal(params().get('tag'),compatibleTag);assert.equal(params().has('batch'),false);assert.equal(params().has('region'),false);assert.equal(params().has('year'),false);assert.ok(airbnb.topics.includes(params().get('topic')));
navigate(`/?topic=consumer&batch=${encodeURIComponent(airbnb.batch)}&region=North+America&status=${encodeURIComponent(compatibleStatus)}`);await typeSearch('Airbnb');searchKey('Enter');centered(airbnb.id);assert.equal(params().get('batch'),airbnb.batch);assert.equal(params().get('region'),'North America');assert.equal(params().get('status'),compatibleStatus);
// Search opens the page containing a company beyond the first map page.
navigate('/?topic=ai');change('#map-limit','50');const allGroupMembers=dataset.companies.filter(c=>semanticData.layouts.ai.points[c.id]?.[2]===largeGroup.id&&c.topics.includes('ai'));const offPage=allGroupMembers.slice(60).find(c=>dataset.companies.filter(other=>other.name.toLowerCase()===c.name.toLowerCase()).length===1);assert.ok(offPage);
await typeSearch(offPage.name);searchKey('Enter');assert.equal(params().get('topic'),'ai');assert.equal(Number(params().get('page')),Math.floor(allGroupMembers.findIndex(c=>c.id===offPage.id)/50));assert.equal(Number(params().get('company')),offPage.id);centered(offPage.id);assert.equal(count(),allGroupMembers.length);
// Companies without description coordinates stay accessible through the list.
const unplaced=dataset.companies.find(c=>semanticData.layouts.all.unplaced.includes(c.id)&&dataset.companies.filter(other=>other.name.toLowerCase()===c.name.toLowerCase()).length===1);assert.ok(unplaced);await typeSearch(unplaced.name);searchKey('Enter');assert.equal(params().get('view'),'list');assert.equal(Number(params().get('company')),unplaced.id);assert.ok(el(`.company-row[data-company="${unplaced.id}"]`).classList.contains('is-selected'));
navigate('/?view=list');filter('batch','Summer 2005');assert.equal(d.querySelectorAll('.company-row').length,8);
navigate('/?region=Europe&region=Asia&tab=summary');assert.match(el('.summary-scope').textContent,/Europe, Asia/);assert.equal(el('#batch-filter').hidden,true);
const trend=el('[data-trend]'),tag=trend.dataset.trend,year=trend.dataset.year;click(trend);
assert.equal(params().get('view'),'list');assert.deepEqual(params().getAll('region'),['Europe','Asia']);
assert.equal(count(),dataset.companies.filter(c=>c.regions.some(r=>['Europe','Asia','South Asia','Southeast Asia','East Asia'].includes(r))&&c.batch.includes(year)&&c.tags.includes(tag)).length);
const insights=w.YCInsights.summarize(dataset.companies,dataset.companies,2026);
assert.equal(insights.currentTotal,801);assert.equal(insights.previousTotal,620);assert.equal(insights.currentTagged,525);assert.equal(insights.previousTagged,480);
const robotics=insights.rising.find(s=>s.tag==='Robotics');assert.ok(Math.abs(robotics.change-(100*58/525-100*27/480))<1e-10);
navigate('/?tab=summary');assert.equal(d.querySelectorAll('.unusual-company').length,8);click('.unusual-company');assert.equal(el('#summary-panel').hidden,false);
click('#about');assert.equal(el('#about-dialog').open,true);click('#close-about');assert.equal(el('#about-dialog').open,false);
navigate('/?missing=1&view=list');assert.equal(d.querySelectorAll('.company-row').length,55);assert.equal(el('#company-list').getAttribute('tabindex'),'0');
for(const row of d.querySelectorAll('.company-row'))assert.ok(semanticData.layouts.all.unplaced.includes(Number(row.dataset.company)));
Object.defineProperty(w,'innerWidth',{value:390,configurable:true});stageWidth=343;stageHeight=340;navigate('/');
assert.equal(d.querySelectorAll('.cluster').length,14);assert.equal(el('#pagination').hidden,true);click('#zoom-reset');
click('#mobile-topics');assert.equal(el('#mobile-topics').getAttribute('aria-expanded'),'true');click('#topics [data-topic="defense"]');assert.equal(el('#mobile-topics').getAttribute('aria-expanded'),'false');
// Arbitrary comparison years, animated-map return state, and separate Reels likes.
Object.defineProperty(w,'innerWidth',{value:1440,configurable:true});stageWidth=900;stageHeight=600;
navigate('/?tab=summary&from=2014&to=2023&region=Europe');
assert.equal(el('#compare-from').value,'2014');assert.equal(el('#compare-to').value,'2023');
const selectedSummary=w.YCInsights.summarize(dataset.companies,dataset.companies.filter(c=>c.regions.includes('Europe')),2026,{previous:2014,current:2023});
assert.ok(el('.summary-totals').textContent.includes(selectedSummary.currentTotal.toLocaleString('en')));
click('#swap-years');assert.equal(el('#compare-from').value,'2023');assert.equal(el('#compare-to').value,'2014');assert.equal(params().get('region'),'Europe');
change('#compare-to','2020');assert.equal(params().get('to'),'2020');
navigate('/?tab=reels');assert.equal(el('#reels-panel').hidden,false);assert.ok(el('.workbench').classList.contains('reels-mode'));
assert.ok(el('#reel-status').textContent.includes('desktop app'));
const reelName=el('.reel-side h2').textContent;
const savedBefore=JSON.parse(w.localStorage.getItem('yc-atlas-saved')||'[]').length;
click('[data-reel-action="like"]');assert.equal(el('#liked-count').textContent,'1');assert.equal(JSON.parse(w.localStorage.getItem('yc-atlas-saved')||'[]').length,savedBefore,'Likes must stay separate from saved');
click('[data-reel-action="save"]');assert.equal(Number(el('#saved-count').textContent),savedBefore+1);
click('[data-reel-action="next"]');assert.notEqual(el('.reel-side h2').textContent,reelName);
click('[data-reel-action="previous"]');assert.equal(el('.reel-side h2').textContent,reelName);assert.equal(el('[data-reel-action="like"]').getAttribute('aria-pressed'),'true');
click('#liked-nav');assert.equal(d.querySelectorAll('.company-row').length,1);assert.ok(el('.company-row').textContent.includes(reelName));
click('.company-row');click('[data-like]');assert.equal(el('#liked-count').textContent,'0');assert.equal(el('#empty').hidden,false);assert.equal(Number(el('#saved-count').textContent),savedBefore+1);
click('#refresh-snapshot');assert.equal(el('#snapshot-dialog').open,true);assert.equal(el('#start-snapshot').disabled,true);click('#close-snapshot');
function assertRegionsFit(){
 const transform=w.d3.zoomTransform(el('#map'));
 for(const region of d.querySelectorAll('.semantic-region')){const [[left,top],[right,bottom]]=region.__data__.bounds;assert.ok(transform.applyX(left)>=23.9&&transform.applyX(right)<=stageWidth-23.9,'Every region must fit horizontally');assert.ok(transform.applyY(top)>=55.9&&transform.applyY(bottom)<=stageHeight-23.9,'Every region must fit below the map controls');}
 for(const label of d.querySelectorAll('.semantic-region-label')){const g=label.__data__,x=transform.applyX(g.labelX),y=transform.applyY(g.labelY);assert.ok(x-g.labelWidth/2>=23.9&&x+g.labelWidth/2<=stageWidth-23.9,'Fixed-size group labels must fit horizontally');assert.ok(y-g.labelHeight/2>=55.9&&y+g.labelHeight/2<=stageHeight-23.9,'Fixed-size group labels must fit vertically');}
}
for(const [width,height] of [[900,600],[650,420],[360,320]]){
 stageWidth=width;stageHeight=height;
 navigate('/?topic=defense&batch=Fall+2026');assertRegionsFit();const defaultCamera=camera();
 click('#zoom-in');click('#zoom-in');const entryCamera=camera();click('[data-semantic-group]');click('.semantic-company');click('#zoom-in');click('#map');
 assert.equal(params().has('group'),false);assert.equal(params().get('topic'),'defense');assert.equal(params().get('batch'),'Fall 2026');assert.deepEqual(camera(),entryCamera,'Deselecting restores the exact camera before the region was opened');
 click('[data-semantic-group]');click('#zoom-in');escape();assert.deepEqual(camera(),entryCamera,'Escape restores the pre-region camera');
 click('[data-semantic-group]');click('#zoom-in');click('#all-groups');assert.deepEqual(camera(),entryCamera,'All groups restores the pre-region camera');click('#zoom-reset');assert.deepEqual(camera(),defaultCamera);assertRegionsFit();
}

// A delayed observer notification for the size already rendered must not replace the map
// and interrupt the zoom-out transition. Actual viewport changes still redraw and fit.
const regionBeforeResizeNotification=el('.semantic-region');resizeObservers[0]();await tick(150);
assert.equal(el('.semantic-region'),regionBeforeResizeNotification,'Redundant resize notifications must not redraw or interrupt the map');
stageHeight+=30;resizeObservers[0]();await tick(150);assert.equal(el('#map').getAttribute('viewBox'),`0 0 ${stageWidth} ${stageHeight}`);assertRegionsFit();
// A direct group URL with no parent camera falls back to the fitted topic overview.
navigate('/?group=0');click('.semantic-company');click('#map');assert.equal(d.querySelectorAll('.cluster').length,14);
const topicsCamera=w.d3.zoomTransform(el('#map'));
for(const topic of d.querySelectorAll('.cluster')){const b=topic.__data__.bounds;assert.ok(topicsCamera.applyX(b.left)>=0&&topicsCamera.applyX(b.right)<=stageWidth);assert.ok(topicsCamera.applyY(b.top)>=0&&topicsCamera.applyY(b.bottom)<=stageHeight);}
navigate('/?topic=defense');
w.fetch=async url=>({ok:true,json:async()=>structuredClone(url.includes('semantic.json')?{...semanticData,meta:{...semanticData.meta,sourceHash:'stale'}}:dataset)});
click('#retry');await tick();assert.equal(el('#semantic-notice').hidden,false);click('[data-open-list]');assert.equal(el('#company-list').hidden,false);
assert.deepEqual(errors,[]);dom.window.close();
console.log('PASS: all-topic overview, multi-select filters and URLs, list group navigation, scoped dismissal, adjustable map limits and logos, camera preservation, company and neighbor centering, metadata, YC-tag taxonomy, saved companies, search, summary, mobile and stale-data fallback.');
