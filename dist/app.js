'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => new Intl.NumberFormat('en').format(n);
const pageSize = 72;
const mapSettings={limit:100,logoSize:18};
try{const savedSettings=JSON.parse(localStorage.getItem('yc-atlas-map-settings')||'{}');if([50,100,200,300,'all'].includes(savedSettings.limit))mapSettings.limit=savedSettings.limit;if(Number.isFinite(savedSettings.logoSize))mapSettings.logoSize=Math.max(12,Math.min(30,savedSettings.logoSize));}catch{}
const mapPageSize=()=>mapSettings.limit==='all'?Infinity:mapSettings.limit;
const selectedValues=YCControls.values;
const filterControls={},reelControls={};
let searchTimer,companySearchResults=[],companySearchActive=0,companySearchQuery='';
const emptyReelScope=()=>({topics:[],batch:[],status:[],region:[],q:'',tag:'',year:'',group:null});
let reelScope=emptyReelScope(),reelDraft=emptyReelScope();
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let data, semantic, companies = [], topics = [], filtered = [], zoom, mapSelection, lastFocus, semanticViewport;
const semanticScenes=new Map(),expandedGroups=new Map();
const cameras=new Map();let cameraContext=null;
let overviewFit=null;
let libraryStorage;try{libraryStorage=localStorage;}catch{}
const library=new YCSaved.Store({storage:libraryStorage});
let saved=library.ids();
const discovery=new YCDiscovery.Store(libraryStorage),discoveryEngine=new YCDiscovery.Engine(discovery);
let reelsView=null,returnToRegions=false,mapSelectionMotion=null;
let libraryMenuTarget=null;
let folderEditing=null,folderAssignCompany=null,undoSaved=null,toastTimer;
const state = { topic:'all', q:'', batch:[], status:[], region:[], view:'map', page:0, saved:false, company:null, tab:'explore', tag:'', year:'', missing:false, group:null, folder:'all', savedSort:library.sort, compareA:null, compareB:null };
// Keep each workspace intact when the main navigation changes tabs.
const tabMemories=new Map();
const tabKey=value=>value.saved?'saved':value.tab;
const copyViewState=()=>({...state,batch:[...state.batch],status:[...state.status],region:[...state.region]});
const workspaceScrolls=['company-list','inspector','inspector-content','topics','folder-list','summary-panel'];
function rememberTab(){
 let camera=null;
 if(state.tab==='explore'&&state.view==='map'&&mapSelection&&!$('map').hasAttribute('hidden')){mapSelection.interrupt();const t=d3.zoomTransform(mapSelection.node()),box=($('map').getAttribute('viewBox')||'').split(' ').map(Number);camera={x:t.x,y:t.y,k:t.k,width:box[2]||$('stage').clientWidth,height:box[3]||$('stage').clientHeight};if(cameraContext)cameras.set(cameraContext,t);}
 tabMemories.set(tabKey(state),{state:copyViewState(),camera,cameras:new Map(cameras),scrolls:Object.fromEntries(workspaceScrolls.map(id=>[id,$(id)?.scrollTop||0])),topicScroll:document.querySelector('.topics-panel')?.scrollTop||0});
}
function restoreTabPosition(memory){
 if(!memory)return;
 for(const [id,top]of Object.entries(memory.scrolls))if($(id))$(id).scrollTop=top;
 document.querySelector('.topics-panel').scrollTop=memory.topicScroll;
 const c=memory.camera;
 if(c&&state.view==='map'&&mapSelection&&zoom){if(c.width===$('stage').clientWidth&&c.height===$('stage').clientHeight)mapSelection.interrupt().call(zoom.transform,d3.zoomIdentity.translate(c.x,c.y).scale(c.k));else if(state.company)focusCompanyOnMap(state.company);}
}
function switchWorkspace(key,defaults){
 if(tabKey(state)===key)return;
 const incoming=tabMemories.get(key);rememberTab();
 returnToRegions=false;mapSelectionMotion=null;cameraContext=null;cameras.clear();for(const [id,camera]of incoming?.cameras||[])cameras.set(id,camera);
 Object.assign(state,incoming?incoming.state:{...state,company:null,group:null,page:0,...defaults});
 for(const field of ['batch','status','region'])state[field]=selectedValues(state[field]);
 writeURL();render();restoreTabPosition(incoming);
}
const regionGroups = [
 {name:'Europe', values:['Europe']},
 {name:'North America', values:['America / Canada']},
 {name:'Latin America', values:['Latin America']},
 {name:'Asia', values:['Asia','South Asia','Southeast Asia','East Asia']},
 {name:'Middle East & North Africa', values:['Middle East and North Africa']},
 {name:'Africa', values:['Africa']},
 {name:'Oceania', values:['Oceania']},
];
function matchesRegion(c, region) {
 const group=regionGroups.find(g=>g.name===region);
 return group?group.values.some(value=>c.regions.includes(value)):c.regions.includes(region);
}
function readURL() {
 const p = new URLSearchParams(location.search);
 Object.assign(state, {topic:p.get('topic') || 'all',q:p.get('q') || '',batch:p.get('batch') || '',status:p.get('status') || '',region:p.get('region') || '',view:p.get('view') === 'list' ? 'list' : 'map',page:Math.max(0,Number(p.get('page')) || 0),saved:p.get('saved') === '1',company:Number(p.get('company')) || null});
 Object.assign(state,{tab:['summary','reels','liked','chat'].includes(p.get('tab'))?p.get('tab'):'explore',tag:p.get('tag')||'',year:p.get('year')||''});
 for(const key of ['batch','status','region'])state[key]=selectedValues(p.getAll(key));
 if(state.tab==='reels')readReelURL(p);
 state.compareA=Number(p.get('from'))||null;state.compareB=Number(p.get('to'))||null;
 state.folder=p.get('folder')||'all';state.savedSort=YCSaved.sorts.includes(p.get('sort'))?p.get('sort'):library.sort;
 if(state.folder!=='all'&&!library.folder(state.folder))state.folder='all';
 state.missing=p.get('missing')==='1';
 state.group=p.has('group')&&/^\d+$/.test(p.get('group'))?Number(p.get('group')):null;
 state.region=state.region.map(r=>r==='America / Canada'?'North America':r==='Middle East and North Africa'?'Middle East & North Africa':r);
 if(state.tab==='summary')Object.assign(state,{topic:'all',q:'',batch:[],tag:'',year:'',saved:false,missing:false,group:null});
 if (data && state.topic !== 'all' && !topics.some(t=>t.id === state.topic)) state.topic = 'all';
}
function writeURL(replace = false) {
 const p = new URLSearchParams();
 if(state.topic !== 'all') p.set('topic',state.topic);
 for(const key of ['q','tag','year']) if(state[key]) p.set(key,state[key]);
 for(const key of ['batch','status','region'])for(const value of state[key])p.append(key,value);
 if(state.tab!=='explore')p.set('tab',state.tab);
 if(state.tab==='reels')writeReelURL(p);
 if(state.compareA)p.set('from',state.compareA);if(state.compareB)p.set('to',state.compareB);
 if(state.view !== 'map') p.set('view',state.view);
 if(state.page) p.set('page',state.page);
 if(state.saved){p.set('saved','1');if(state.folder!=='all')p.set('folder',state.folder);if(state.savedSort!=='newest')p.set('sort',state.savedSort);}
 if(state.missing)p.set('missing','1');
 if(state.company) p.set('company',state.company);
 if(state.group!==null)p.set('group',state.group);
 history[replace?'replaceState':'pushState']({},'',location.pathname+(p.size?'?'+p:'') );
}
function update(patch, replace = false) {
 if(tabKey({...state,...patch})!==tabKey(state))rememberTab();
 if(!Object.hasOwn(patch,'group')&&['topic','q','tag','year','saved','tab','missing'].some(key=>Object.hasOwn(patch,key)))state.group=null;
 Object.assign(state,patch);
 for(const key of ['batch','status','region'])state[key]=selectedValues(state[key]);
 if(!Object.hasOwn(patch,'page')) state.page = 0;
 if(!Object.hasOwn(patch,'company')) state.company = null;
 writeURL(replace); render();
}
function activeSemanticLayout(){return semantic?.layouts[state.topic]||semantic?.layouts.all;}
function activeCompanyScope(){const layout=activeSemanticLayout();return state.group===null?filtered:filtered.filter(c=>layout?.points[c.id]?.[2]===state.group);}
function openSemanticGroup(group){if(group===null){clearSemanticGroup();return;}if(state.view==='map')mapSelectionMotion='region';update({group,page:0});if(state.view==='map')$('description-group').focus({preventScroll:true});}
function clearSemanticGroup(){if(state.group!==null){returnToRegions=state.view==='map';update({group:null});}}
function safeURL(value) { try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch {return '';} }
function initial(c) { return c.name.trim().slice(0,2).toUpperCase(); }
function logo(c, cls = '') { const u=safeURL(c.logo); return u ? `<img class="${cls}" src="${esc(u)}" width="48" height="48" alt="" loading="lazy" referrerpolicy="no-referrer" data-fallback="${esc(initial(c))}">` : `<span>${esc(initial(c))}</span>`; }
document.addEventListener('error', e=>{
 const img=e.target;
 if(img instanceof HTMLImageElement && img.dataset.fallback){const span=document.createElement('span');span.className='logo-fallback';span.textContent=img.dataset.fallback;span.setAttribute('aria-hidden','true');img.replaceWith(span);}
},true);

function matches(c, includeTopic = true) {
 if(state.tab==='liked'&&!discovery.likes.has(c.id))return false;
 if(state.saved){if(!saved.has(c.id))return false;const folderId=library.record(c.id)?.folderId;if(state.folder!=='all'&&folderId!==state.folder)return false;}
 if(state.missing&&[c.summary,c.description].join(' ').trim())return false;
 return YCControls.matchesFacets(c,state,{includeTopic,matchesRegion,yearOf:YCInsights.yearOf,searchText:c.search+(state.saved?' '+(library.record(c.id)?.note||''):'')});
}
function symbols(id) {
 const paths = {ai:'M10 2v16M2 10h16M4 4l12 12M4 16 16 4',developers:'m6 5-5 5 5 5m8-10 5 5-5 5M12 2 8 18',finance:'M2 6h16m-4-4 4 4-4 4M18 14H2m4-4-4 4 4 4',health:'M10 3v14M3 10h14',climate:'M4 16C0 3 12 2 17 3c0 10-4 16-13 13Zm0 0 8-8',industrial:'M3 3h14v14H3ZM7 7h6v6H7Z',defense:'M10 2 18 5v5c0 4-4 7-8 9-4-2-8-5-8-9V5Z',consumer:'M3 10a7 7 0 1 0 14 0 7 7 0 1 0-14 0M7 9h0m6 0h0M7 13q3 3 6 0',work:'M3 5h14v12H3ZM7 5V2h6v3M3 10h14',commerce:'M3 6h14l-1 11H4ZM7 6V4a3 3 0 0 1 6 0v2',education:'m1 7 9-5 9 5-9 5ZM4 9v6q6 5 12 0V9',security:'M4 9h12v9H4ZM6 9V6a4 4 0 0 1 8 0v3',places:'m2 9 8-7 8 7M4 8v10h12V8M8 18v-6h4v6',other:'M2 10h16M10 2v16'};
 return `<svg class="topic-symbol" viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="${paths[id] || paths.other}"/></svg>`;
}
function renderTopics() {
 const available=companies.filter(c=>matches(c,false));
 $('topics').innerHTML=topics.map(t=>{
  const count=available.filter(c=>c.topics.includes(t.id)).length;
  return `<button type="button" class="topic ${state.topic===t.id?'active':''}" data-topic="${t.id}" aria-pressed="${state.topic===t.id}">${symbols(t.id)}<span class="topic-name">${esc(t.name)}</span><span class="topic-count">${fmt(count)}</span></button>`;
 }).join('');
 const all=document.querySelector('[data-topic="all"]'); all.classList.toggle('active',state.topic==='all');all.setAttribute('aria-pressed',String(state.topic==='all'));
 $('total-count').textContent=fmt(available.length);
}
function render() {
 if(!data) return;
 window.dispatchEvent(new CustomEvent('atlas-view-before-render'));
 clearTimeout(searchTimer);closeCompanySearch();
 $('tooltip').hidden=true;closeLibraryMenu();
 if(state.folder!=='all'&&!library.folder(state.folder)){state.folder='all';writeURL(true);}
 filtered=companies.filter(c=>matches(c));
 if(state.saved)filtered=library.ordered(filtered,state.savedSort);
 if(state.group!==null&&!filtered.some(c=>activeSemanticLayout()?.points[c.id]?.[2]===state.group)){state.group=null;state.page=0;writeURL(true);}
 const scope=activeCompanyScope();
 const overview=state.view==='map' && state.topic==='all' && !state.q && !state.saved && !state.tag && !state.year && !state.missing && state.group===null;
 const topicCount=topics.filter(t=>filtered.some(c=>c.topics.includes(t.id))).length;
 const perPage=state.view==='list'?pageSize:mapPageSize();
 const pages=overview?1:state.view==='list'||state.group!==null?Math.max(1,Math.ceil(scope.length/perPage)):1;state.page=Math.min(Math.floor(state.page),pages-1);
 const start=Number.isFinite(perPage)?state.page*perPage:0,end=Number.isFinite(perPage)?Math.min(start+perPage,scope.length):scope.length;
 $('search').value=state.tab==='reels'?reelScope.q:state.q;
 for(const key of ['batch','status','region'])filterControls[key]?.set(state[key]);
 const isSummary=state.tab==='summary',isReels=state.tab==='reels',isLiked=state.tab==='liked',isChat=state.tab==='chat';
 $('chat-panel').hidden=!isChat;document.querySelector('.workbench').classList.toggle('chat-mode',isChat);document.querySelector('.page-heading').hidden=isChat;document.querySelector('.page-footer').hidden=false;document.querySelector('.search').hidden=isChat;
 $('reel-feed-controls').hidden=!isReels;$('snapshot').hidden=isReels||isChat;document.querySelector('.page-heading').classList.toggle('reels-heading',isReels);
 $('liked-count').textContent=companies.filter(c=>discovery.likes.has(c.id)).length;
 document.querySelector('.workbench').classList.toggle('reels-mode',isReels);$('reels-panel').hidden=!isReels;
 if(!isReels){reelsView?.leave();closeReelFilterPanel();}
 for(const [id,current] of [['explore-nav',!state.saved&&state.tab==='explore'],['saved-nav',state.saved&&!isSummary],['summary-nav',isSummary],['reels-nav',isReels],['liked-nav',isLiked],['chat-nav',isChat]]){if(current)$(id).setAttribute('aria-current','page');else $(id).removeAttribute('aria-current');}
 $('saved-count').textContent=saved.size;
 document.querySelector('.workbench').classList.toggle('summary-mode',isSummary);
 document.querySelector('.workbench').classList.toggle('saved-mode',state.saved&&!isSummary);
 $('saved-folders').hidden=!state.saved||isSummary;$('saved-tools').hidden=!state.saved||isSummary;
 $('search').setAttribute('role',isCompanySearch()?'combobox':'searchbox');$('search').setAttribute('aria-autocomplete',isCompanySearch()?'list':'none');
 $('search').placeholder=isCompanySearch()?'Find a company…':isReels?'Search within Reels…':state.saved?'Search saved companies or notes…':'Search companies, ideas, or tags…';$('search').setAttribute('aria-label',isCompanySearch()?'Find a company on the map':isReels?'Search within Reels':state.saved?'Search saved companies and notes':'Search companies, ideas, or tags');
 $('summary-panel').hidden=!isSummary;
 document.querySelector('.view-toggle').hidden=isSummary;
 $('batch-filter').hidden=isSummary;
 $('map-settings').hidden=isSummary||state.view!=='map';
 $('map-limit').value=String(mapSettings.limit);$('map-logo-size').value=mapSettings.logoSize;$('map-logo-output').textContent=`${mapSettings.logoSize*2} px`;
 const topic=topics.find(t=>t.id===state.topic);
 document.querySelector('.page-heading h1').textContent=isSummary?'Summary':isReels?'Reels':isLiked?'Liked companies':state.saved?'Saved companies':topic?.name||'Companies';
 $('home-crumb').textContent=isSummary?'Directory summary':state.saved?'Saved companies':'All companies'; $('topic-crumb').textContent=isSummary?'':topic?.name || '';
 $('mobile-topics').innerHTML=`${esc(topic?.name || 'All topics')} <span class="dropdown-chevron" aria-hidden="true"></span>`;
 const groupLabel=state.group===null?'':activeSemanticLayout()?.clusters.find(g=>g.id===state.group)?.label||'';
 $('clear-filters').hidden=!(state.q||state.batch.length||state.status.length||state.region.length||state.tag||state.year||state.missing||groupLabel);
 $('insight-filter').hidden=!(state.tag||state.year||state.missing||groupLabel);
 $('insight-filter').innerHTML=esc([state.tag,state.year,state.missing?'Without descriptions':''].filter(Boolean).join(' / '))+(groupLabel?`<button type="button" class="clear-group-chip" data-clear-group aria-label="Clear description group filter">${esc(groupLabel)} <span aria-hidden="true">×</span></button>`:'');
 $('semantic-notice').hidden=true;
 $('semantic-navigation').hidden=true;
 $('map-view').classList.toggle('selected',state.view==='map');$('map-view').setAttribute('aria-pressed',state.view==='map');
 $('list-view').classList.toggle('selected',state.view==='list');$('list-view').setAttribute('aria-pressed',state.view==='list');
 $('map').toggleAttribute('hidden',isSummary||state.view!=='map'||!filtered.length);
 $('company-list').hidden=isSummary||state.view!=='list'||!filtered.length;
 $('empty').hidden=isSummary||filtered.length>0;
 const folderCount=companies.filter(c=>saved.has(c.id)&&(state.folder==='all'||library.record(c.id)?.folderId===state.folder)).length;
 $('empty-description').textContent=isLiked?'Heart a company in Reels or its details to find it here.':state.saved&&!saved.size?'Save a company from its details to find it here.':state.saved&&!folderCount?'This folder is empty. Move companies here from All saved, or choose this folder when saving a company.':'Try another search or clear your filters.';
 $('reset-empty').textContent=state.saved?(saved.size?(folderCount?'Clear filters':'Show all saved'):'Explore companies'):'Reset exploration';
 $('zoom-controls').hidden=isSummary||state.view!=='map'||!filtered.length;
 $('map-caption').hidden=isSummary||state.view!=='map'||!filtered.length||!overview;
 $('map-hint').hidden=isSummary||state.view!=='map';
 $('map-hint').textContent=overview?'Drag to pan. Scroll to zoom.':state.group===null?'Select a region to show companies.':'Other regions remain collapsed.';
 $('pagination').hidden=isSummary||pages<=1;
 $('prev-page').disabled=state.page===0;$('next-page').disabled=state.page>=pages-1;
 $('page-count').textContent=`${state.page+1} / ${pages}`;
 $('results-count').textContent=isSummary?`${fmt(filtered.length)} directory records`:overview?`${fmt(filtered.length)} companies / ${topicCount} topics` : state.view==='map'&&state.group===null?`${fmt(filtered.length)} ${filtered.length===1?'company':'companies'} / description regions`:`${scope.length?fmt(start+1):'0'}–${fmt(end)} of ${fmt(scope.length)} companies${state.group!==null?' in group':''}`;
 renderTopics();
 renderSavedWorkspace();
 if(isSummary)renderSummary();
 else if(!isReels&&!isChat&&filtered.length){ if(state.view==='map') renderMap(overview); else renderList(); }
 renderInspector();
 if(isReels){renderReelControls();reelsView?.enter();}
 window.dispatchEvent(new CustomEvent('atlas-view',{detail:{tab:state.tab}}));
}
function enterTopic(id, cluster) {
 document.querySelector('.topics-panel').classList.remove('is-open');$('mobile-topics').setAttribute('aria-expanded','false');
 if(state.view==='map')mapSelectionMotion='topic';
 update({topic:id,tab:'explore',tag:'',year:'',missing:false});
}
function tooltip(e, title, summary) {
 const el=$('tooltip');el.innerHTML=`<strong>${esc(title)}</strong>${summary?`<span>${esc(summary)}</span>`:''}`;el.hidden=false;
 const box=el.getBoundingClientRect();
 const node=e.currentTarget.getBoundingClientRect();
 const x=e.clientX || node.left+node.width/2,y=e.clientY || node.bottom;
 el.style.left=`${Math.max(8,Math.min(innerWidth-box.width-8,x+14))}px`;
 el.style.top=`${Math.max(8,Math.min(innerHeight-box.height-8,y+14))}px`;
}
function accessibleActivate(selection,fn) {
 selection.attr('role','button').attr('tabindex',0).on('click',(e,d)=>{e.stopPropagation();fn(d);}).on('keydown',(e,d)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();fn(d);}});
}
function addLogo(bubble,c,r){
 if(bubble.node().__logoLoaded||!safeURL(c.logo))return;
 bubble.node().__logoLoaded=true;
 const clipId=`clip-${c.id}-${Math.round(r*10000)}`;
 bubble.append('clipPath').attr('id',clipId).append('circle').attr('r',r*.7);
 bubble.append('image').attr('class','bubble-image').attr('href',safeURL(c.logo)).attr('x',-r*.7).attr('y',-r*.7).attr('width',r*1.4).attr('height',r*1.4).attr('preserveAspectRatio','xMidYMid meet').attr('clip-path',`url(#${clipId})`).on('load',()=>bubble.select('.bubble-initial').remove()).on('error',function(){d3.select(this).remove();});
}
function addBubble(group, c, x,y,r, preview=false,lazy=false) {
 const bubble=group.append('g').datum(c).attr('class','company-bubble'+(state.company===c.id?' is-selected':'')).attr('transform',`translate(${x},${y})`);
 bubble.style('--bubble-border',Math.min(.75,r*.055)).style('--bubble-outline',r*.1);
 bubble.append('circle').attr('r',r).attr('class','logo-circle');
 bubble.append('text').attr('class','bubble-initial').attr('y',1).text(initial(c));
 bubble.select('.bubble-initial').style('font-size',`${Math.min(17,r*.7)}px`);
 if(!lazy)addLogo(bubble,c,r);
 if(!preview){
  bubble.attr('aria-label',`${c.name}. ${c.summary}. ${c.batch}. Select to inspect.`);
  accessibleActivate(bubble,c=>selectCompany(c.id));
  bubble.on('pointerenter',(e,c)=>tooltip(e,c.name,c.summary)).on('pointermove',(e,c)=>tooltip(e,c.name,c.summary)).on('pointerleave',()=>$('tooltip').hidden=true).on('focus',(e,c)=>{addLogo(bubble,c,r);tooltip(e,c.name,c.summary);}).on('blur',()=>$('tooltip').hidden=true);
 }
 return bubble;
}
function renderMap(overview) {
 if(typeof d3==='undefined'){$('data-error').hidden=false;return;}
 const w=$('stage').clientWidth,h=$('stage').clientHeight;
 if(cameraContext&&mapSelection)cameras.set(cameraContext,d3.zoomTransform(mapSelection.node()));
 const nextContext=`${semantic?.meta.sourceHash||''}/${state.topic}/${overview?'topics':state.group??'regions'}/${w}/${h}`;
 const previousCamera=mapSelection?d3.zoomTransform(mapSelection.node()):null;
 const returning=returnToRegions,motion=mapSelectionMotion;returnToRegions=false;mapSelectionMotion=null;
 const restore=cameras.get(nextContext);cameraContext=nextContext;
 mapSelection=d3.select('#map').attr('viewBox',`0 0 ${w} ${h}`).attr('aria-label',overview?'Topic map. Select a topic to inspect companies.':'Description similarity map. Nearby companies have related descriptions. Drag to pan; scroll to zoom.');
 const content=d3.select('#map-content');content.interrupt('topic-arrival').style('opacity',1);content.selectAll('*').remove();
 semanticViewport=null;
 overviewFit=null;
 zoom=d3.zoom().scaleExtent([.25,30]).on('zoom',e=>{content.attr('transform',e.transform);$('tooltip').hidden=true;cameras.set(cameraContext,e.transform);if(semanticViewport)for(const p of semanticViewport.nodes)p.bubble.attr('transform',`translate(${p.x},${p.y}) scale(${markerScale(e.transform.k)})`);hydrateSemanticLogos(e.transform);content.selectAll('.semantic-region-label').attr('transform',g=>`translate(${g.labelX},${g.labelY}) scale(${1/e.transform.k})`);});
 mapSelection.interrupt().call(zoom).on('dblclick.zoom',null).on('click.background',e=>{if(e.defaultPrevented||e.__dismissedPopup)return;if(!e.target.closest('.semantic-region,.semantic-region-label,.semantic-company,.cluster,.unplaced-descriptions'))clearSemanticGroup();});
 let initial=d3.zoomIdentity;
 if(overview){
  let groups=topics.map(t=>({...t,companies:filtered.filter(c=>c.topics.includes(t.id))})).filter(t=>t.companies.length);
  const worldWidth=Math.max(w,820),worldHeight=Math.max(h,690);
  groups=YCLayout.scatterTopics(groups,worldWidth,worldHeight);
  const fit=Math.min(w/worldWidth,h/worldHeight);
  overviewFit=d3.zoomIdentity.translate((w-worldWidth*fit)/2,(h-worldHeight*fit)/2).scale(fit);
  const initialScale=w<600?Math.max(.65,fit):fit;
  initial=d3.zoomIdentity.translate((w-worldWidth*initialScale)/2,(h-worldHeight*initialScale)/2).scale(initialScale);
  const g=content.selectAll('.cluster').data(groups).join('g').attr('class','cluster').attr('aria-label',t=>`${t.name}, ${fmt(t.companies.length)} companies. Zoom into topic.`);
  g.append('circle').attr('class','cluster-hit-area').attr('cx',t=>t.x).attr('cy',t=>t.y).attr('r',t=>Math.max(t.r,22));
  g.append('circle').attr('class','cluster-boundary').attr('cx',t=>t.x).attr('cy',t=>t.y).attr('r',t=>t.r);
  g.each(function(t){
   const group=d3.select(this),r=t.r;
   const preview=t.companies.slice(0,r<28?3:7).map((c,i)=>({c,r:i===0?23:17+(i%3)*2}));
   d3.packSiblings(preview);const b=d3.packEnclose(preview);const s=r*.69/b.r;
   preview.forEach(p=>addBubble(group,p.c,t.x+(p.x-b.x)*s,t.y+(p.y-b.y)*s,p.r*s,true));
   const text=group.append('text').attr('class','cluster-label').attr('x',t.x).attr('y',t.y+r+20);
   t.labelLines.forEach((line,i)=>text.append('tspan').attr('x',t.x).attr('dy',i?15:0).text(line));
  });
  accessibleActivate(g,t=>enterTopic(t.id,t));
  g.on('pointerenter',(e,t)=>tooltip(e,t.name,`${fmt(t.companies.length)} companies`)).on('pointermove',(e,t)=>tooltip(e,t.name,`${fmt(t.companies.length)} companies`)).on('pointerleave',()=>$('tooltip').hidden=true).on('focus',(e,t)=>tooltip(e,t.name,`${fmt(t.companies.length)} companies`)).on('blur',()=>$('tooltip').hidden=true);
 } else {
  renderSemanticMap(content,w,h);
  if(semanticViewport){overviewFit=semanticViewport.defaultFit;initial=semanticViewport.activeNodes.length?fitTransform(semanticViewport.activeNodes,w,h):overviewFit;}
 }
 if(motion==='topic'&&!reduced)content.style('opacity',.25).transition('topic-arrival').duration(300).style('opacity',1);
 const target=returning?(restore||overviewFit||initial):motion?initial:(restore||initial);
 if(previousCamera&&(returning||motion)){
  mapSelection.call(zoom.transform,previousCamera);
  if(reduced)mapSelection.call(zoom.transform,target);
  else if(motion!=='company')mapSelection.transition().duration(520).ease(d3.easeCubicInOut).call(zoom.transform,target);
 }else mapSelection.call(zoom.transform,target);
}
function markerScale(k){const reference=semanticViewport?.referenceK||1;const growth=Math.max(.8,Math.min(2.5,Math.pow(k/reference,.45)));return growth/k;}
function hydrateSemanticLogos(transform){
 if(!semanticViewport)return;
 for(const p of semanticViewport.nodes){const x=transform.applyX(p.x),y=transform.applyY(p.y);if(x>=-80&&x<=semanticViewport.w+80&&y>=-80&&y<=semanticViewport.h+80)addLogo(p.bubble,p.c,p.r);}
}
function semanticScene(layout,w,h){
 const key=`${semantic.meta.sourceHash}/${state.topic}/${w}/${h}`;
 if(semanticScenes.has(key))return semanticScenes.get(key);
 const strip=layout.unplaced.length?48:0,side=Math.max(1,Math.min(w-52,h-96-strip));
 const byId=new Map(companies.map(c=>[c.id,c]));
 const nodes=Object.entries(layout.points).map(([id,p])=>({c:byId.get(Number(id)),x:w/2+(p[0]-.5)*side,y:30+(h-strip)/2+(p[1]-.5)*side,r:side*layout.radius,cluster:p[2]}));
 const path=d3.geoPath();
 const regions=layout.clusters.filter(g=>g.count).map(g=>{
  const members=nodes.filter(n=>n.cluster===g.id);
  const contours=d3.contourDensity().x(p=>p.x).y(p=>p.y).size([w,h-strip]).bandwidth(Math.max(12,Math.min(24,side*.045))).contours(members);
  const shape=contours(contours.max*.075);
  const x=d3.mean(members,p=>p.x),y=d3.mean(members,p=>p.y);
  return {...g,members,x,y,bounds:path.bounds(shape),path:path(shape),labelLines:YCLayout.linesFor(g.label,22)};
 });
 const scene={key,nodes,regions,side,strip};
 if(semanticScenes.size>12)semanticScenes.delete(semanticScenes.keys().next().value);
 semanticScenes.set(key,scene);return scene;
}
function placeSemanticLabels(regions,w,h){
 regions.forEach(g=>{g.labelWidth=Math.min(158,Math.max(...g.labelLines.map(s=>s.length*6.1))+20);g.labelHeight=g.labelLines.length*15+14;g.labelX=g.x;g.labelY=g.y;});
 for(let iteration=0;iteration<180;iteration++){
  for(let i=0;i<regions.length;i++)for(let j=i+1;j<regions.length;j++){
   const a=regions[i],b=regions[j],dx=b.labelX-a.labelX,dy=b.labelY-a.labelY;
   const overlapX=(a.labelWidth+b.labelWidth)/2+8-Math.abs(dx),overlapY=(a.labelHeight+b.labelHeight)/2+8-Math.abs(dy);
   if(overlapX<=0||overlapY<=0)continue;
   if(overlapX<overlapY){const move=(overlapX+.2)/2*(dx>=0?1:-1);a.labelX-=move;b.labelX+=move;}
   else{const move=(overlapY+.2)/2*(dy>=0?1:-1);a.labelY-=move;b.labelY+=move;}
  }
  regions.forEach(g=>{if(iteration<70){g.labelX+=(g.x-g.labelX)*.015;g.labelY+=(g.y-g.labelY)*.015;}g.labelX=Math.max(g.labelWidth/2+10,Math.min(w-g.labelWidth/2-10,g.labelX));g.labelY=Math.max(g.labelHeight/2+50,Math.min(h-g.labelHeight/2-12,g.labelY));});
 }
}
function fitTransform(nodes,w,h){
 const minX=Math.min(...nodes.map(p=>p.x-p.r)),maxX=Math.max(...nodes.map(p=>p.x+p.r)),minY=Math.min(...nodes.map(p=>p.y-p.r)),maxY=Math.max(...nodes.map(p=>p.y+p.r));
 const k=Math.min(30,(w-80)/Math.max(maxX-minX,1),(h-120)/Math.max(maxY-minY,1));
 return d3.zoomIdentity.translate(w/2-k*(minX+maxX)/2,(h+30)/2-k*(minY+maxY)/2).scale(k);
}
function expandedSemanticGroup(scene,region,w,h){
 const initial=fitTransform(region.members,w,h),radius=Math.max(region.members[0].r,mapSettings.logoSize/initial.k);
 const key=`${scene.key}/${region.id}/${radius.toFixed(6)}`;
 if(expandedGroups.has(key))return expandedGroups.get(key);
 const nodes=region.members.map(p=>({...p,anchorX:p.x,anchorY:p.y,r:radius}));
 const simulation=d3.forceSimulation(nodes).randomSource(d3.randomLcg(region.id+71)).force('x',d3.forceX(p=>p.anchorX).strength(.4)).force('y',d3.forceY(p=>p.anchorY).strength(.4)).force('collide',d3.forceCollide(radius*1.15).iterations(2)).stop();
 for(let i=0;i<100;i++)simulation.tick();
 if(expandedGroups.size>24)expandedGroups.delete(expandedGroups.keys().next().value);
 expandedGroups.set(key,nodes);return nodes;
}
function renderSemanticMap(content,w,h){
 const layout=activeSemanticLayout();
 if(!layout){$('semantic-notice').hidden=false;return;}
 const scene=semanticScene(layout,w,h),matched=new Set(filtered.map(c=>c.id));
 const regions=scene.regions.map(g=>({...g,visibleCount:g.members.filter(p=>matched.has(p.c.id)).length}));
 const active=regions.find(g=>g.id===state.group);
 $('semantic-navigation').hidden=false;
 $('description-group').innerHTML='<option value="">Select a description group</option>'+regions.filter(g=>g.visibleCount).map(g=>`<option value="${g.id}">${esc(g.label)} (${fmt(g.visibleCount)})</option>`).join('');
 $('description-group').value=state.group===null?'':String(state.group);
 $('all-groups').hidden=state.group===null;
 content.attr('data-region-view',active?'expanded':'collapsed');
 const shapeGroups=content.append('g').attr('class','semantic-region-layer').selectAll('.semantic-region').data(regions).join('g').attr('class',g=>`semantic-region${active&&g.id!==active.id?' is-context':''}${g.id===state.group?' is-active':''}${g.visibleCount?'':' is-empty'}`).attr('data-group-id',g=>g.id).attr('aria-label',g=>`${g.label}, ${fmt(g.visibleCount)} matching companies. Show companies.`).style('--region-fill',g=>`var(--color-region-${g.id%6+1})`);
 shapeGroups.append('path').attr('class','semantic-region-boundary').attr('d',g=>g.path);
 accessibleActivate(shapeGroups.filter(g=>g.visibleCount),g=>g.id===state.group?clearSemanticGroup():openSemanticGroup(g.id));
 shapeGroups.attr('tabindex',-1).on('pointerenter',(e,g)=>tooltip(e,g.label,`${fmt(g.visibleCount)} companies. Select to expand.`)).on('pointerleave',()=>$('tooltip').hidden=true);
 semanticViewport={nodes:[],w,h,layout,regions,activeNodes:[],referenceK:1};
 if(active){
  const expanded=expandedSemanticGroup(scene,active,w,h);
  const expandedById=new Map(expanded.map(p=>[p.c.id,p]));
  const limit=mapPageSize(),scope=activeCompanyScope(),start=Number.isFinite(limit)?state.page*limit:0;
  const visible=scope.slice(start,Number.isFinite(limit)?start+limit:undefined).map(c=>({...expandedById.get(c.id)}));
  const layer=content.append('g').attr('class','semantic-company-layer');
  visible.forEach(p=>{p.r=mapSettings.logoSize;p.bubble=addBubble(layer,p.c,p.x,p.y,p.r,false,true).classed('semantic-company',true).attr('data-company-id',p.c.id).attr('data-semantic-x',p.anchorX).attr('data-semantic-y',p.anchorY);});
  semanticViewport.nodes=visible;semanticViewport.activeNodes=expanded;
  semanticViewport.referenceK=fitTransform(expanded,w,h).k;
 }
 const maxLabels=active?(w<480?2:4):(w<480?4:w<720?7:12);
 const labels=regions.filter(g=>g.visibleCount&&g.id!==state.group).sort((a,b)=>b.visibleCount-a.visibleCount||a.id-b.id).slice(0,maxLabels);
 placeSemanticLabels(labels,w,h-scene.strip);
 const labelGroups=content.append('g').attr('class','semantic-label-layer').selectAll('.semantic-region-label').data(labels).join('g').attr('class',g=>`semantic-region-label${active?' is-context':''}`).attr('data-group-id',g=>g.id).attr('transform',g=>`translate(${g.labelX},${g.labelY})`).attr('aria-label',g=>`${g.label}, ${fmt(g.visibleCount)} matching companies. Show companies.`);
 labelGroups.append('rect').attr('x',g=>-g.labelWidth/2).attr('y',g=>-g.labelHeight/2).attr('width',g=>g.labelWidth).attr('height',g=>g.labelHeight).attr('rx',5);
 labelGroups.each(function(g){const label=d3.select(this).append('text').attr('text-anchor','middle').attr('y',5-(g.labelLines.length-1)*7.5);g.labelLines.forEach((line,i)=>label.append('tspan').attr('x',0).attr('dy',i?15:0).text(line));});
 accessibleActivate(labelGroups,g=>openSemanticGroup(g.id));
 labelGroups.on('pointerenter',(e,g)=>tooltip(e,g.label,`${fmt(g.visibleCount)} companies. Select to expand.`)).on('pointerleave',()=>$('tooltip').hidden=true);
 const missing=filtered.filter(c=>!layout.points[c.id]);
 const overviewBounds=regions.map(g=>g.bounds);
 if(missing.length)overviewBounds.push([[18,h-33],[18+`${fmt(missing.length)} companies without descriptions. Show in list.`.length*6.1,h-14]]);
 const fitted=YCLayout.fitRegions(overviewBounds,labels,w,h);
 semanticViewport.defaultFit=d3.zoomIdentity.translate(fitted.x,fitted.y).scale(fitted.k);
 if(missing.length){
  const region=content.append('g').attr('class','unplaced-descriptions');
  region.append('text').attr('x',18).attr('y',h-20).text(`${fmt(missing.length)} companies without descriptions. Show in list.`);
  accessibleActivate(region,()=>update({view:'list',missing:true}));
 }
}
function topicNames(c){return c.topics.map(id=>topics.find(t=>t.id===id)?.name).filter(Boolean);}
function descriptionGroup(c){const layout=activeSemanticLayout()?.points[c.id]?activeSemanticLayout():semantic?.layouts.all;const id=layout?.points[c.id]?.[2];return layout?.clusters.find(g=>g.id===id);}
function companyRegions(c){const names=regionGroups.filter(g=>g.values.some(value=>c.regions.includes(value))).map(g=>g.name);return names.length?names:c.regions.filter(r=>!['Remote','Partly Remote','Fully Remote'].includes(r));}
function savedDateHTML(record){
 if(!record?.addedAt)return '<span class="saved-date" title="This bookmark was saved before dates were recorded">Saved earlier · date unavailable</span>';
 const date=new Date(record.addedAt);return `<time class="saved-date" datetime="${date.toISOString()}" title="${esc(date.toLocaleString())}">Saved ${esc(date.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}))}</time>`;
}
function renderList() {
 const page=activeCompanyScope().slice(state.page*pageSize,(state.page+1)*pageSize);
 $('company-list').classList.toggle('saved-list',state.saved);
 $('company-list').innerHTML=`<div class="list-head"><span>Company${state.saved?' / saved date':''}</span><span>Topic / description group</span><span>Region</span><span>Batch</span><span>Status</span></div>`+page.map(c=>{
  const record=library.record(c.id);
  const row=`<button type="button" class="company-row ${state.company===c.id?'is-selected':''}" data-company="${c.id}"><span class="row-identity">${logo(c)}<span class="row-copy"><strong>${esc(c.name)}</strong><small>${esc(c.summary)}</small>${state.saved?`<small class="saved-row-meta">${savedDateHTML(record)}${record?.folderId?`<span class="saved-row-folder">${esc(library.folderName(record.folderId))}</span>`:''}</small>${record?.note?`<small class="saved-row-note" title="${esc(record.note)}">Note: ${esc(record.note)}</small>`:''}`:''}</span></span><span class="row-assignment">${esc(topicNames(c).join(', '))}<small>${esc(descriptionGroup(c)?.label||'No description group')}</small></span><span class="row-region">${esc(companyRegions(c).join(', ')||'Not listed')}</span><span class="row-batch">${esc(shortBatch(c.batch))}</span><span class="row-status">${esc(c.status)}</span></button>`;
  return state.saved||state.tab==='liked'?`<div class="saved-row">${row}<button type="button" class="row-menu-button" data-company-menu="${c.id}" aria-label="Actions for ${esc(c.name)}" aria-haspopup="menu" aria-expanded="false">⋯</button></div>`:row;
 }).join('');
 $('company-list').scrollTop=0;
}
function renderSummary() {
 const summary=YCInsights.summarize(companies,filtered,new Date(data.meta.fetchedAt).getUTCFullYear(),{previous:state.compareA,current:state.compareB});
 state.compareA=summary.previousYear;state.compareB=summary.currentYear;
 const yearOptions=selected=>summary.years.map(year=>`<option value="${year}" ${year===selected?'selected':''}>${year}</option>`).join('');
 const pct=n=>`${n.toFixed(1)}%`, pp=n=>`${n>0?'+':''}${n.toFixed(1)} pp`;
 const trendRows=rows=>rows.map(s=>`<div class="trend-row"><button type="button" class="trend-name" data-trend="${esc(s.tag)}" data-year="${summary.currentYear}">${esc(s.tag)}<small>${fmt(s.currentCount)} companies in ${summary.currentYear}</small></button><span class="trend-comparison"><span class="trend-bars" aria-hidden="true"><span class="trend-bar previous" style="--share:${s.previousShare}%"></span><span class="trend-bar current" style="--share:${s.currentShare}%"></span></span><span class="trend-year-values"><button type="button" data-trend="${esc(s.tag)}" data-year="${summary.previousYear}" aria-label="Explore ${esc(s.tag)} in ${summary.previousYear}: ${s.previousCount} companies" ${s.previousCount?'':'disabled'}>${fmt(s.previousCount)} / ${pct(s.previousShare)}</button><button type="button" data-trend="${esc(s.tag)}" data-year="${summary.currentYear}" aria-label="Explore ${esc(s.tag)} in ${summary.currentYear}: ${s.currentCount} companies" ${s.currentCount?'':'disabled'}>${fmt(s.currentCount)} / ${pct(s.currentShare)}</button></span></span><strong class="trend-change">${pp(s.change)}</strong></div>`).join('');
 const mainSignal=summary.rising[0];
 const intro=summary.dominant?`${esc(summary.dominant.tag)} is the most common tag in the ${summary.currentYear} cohort at ${pct(summary.dominant.currentShare)} of tagged companies.${mainSignal?` ${esc(mainSignal.tag)} shows the largest increase in share.`:''}`:'There are no tagged companies in the recent cohort for this view.';
 $('summary-panel').innerHTML=`<div class="summary-year-controls"><label>From <select id="compare-from">${yearOptions(summary.previousYear)}</select></label><button type="button" id="swap-years" aria-label="Swap comparison years">⇄</button><label>To <select id="compare-to">${yearOptions(summary.currentYear)}</select></label></div><div class="summary-totals"><span><strong>${fmt(summary.previousTotal)}</strong>${summary.previousYear} companies<small>${fmt(summary.previousTagged)} tagged</small></span><span><strong>${fmt(summary.currentTotal)}</strong>${summary.currentYear} companies<small>${fmt(summary.currentTagged)} tagged</small></span></div><div class="summary-heading"><h2>Cohort comparison</h2><p>${intro}</p><span class="summary-scope">${esc(state.region.length?state.region.join(', '):'All regions')}${state.status.length?' / '+esc(state.status.join(', ')):''} / ${fmt(summary.total)} companies</span></div>
 <section class="summary-section" aria-labelledby="rising-title"><div class="summary-section-heading"><div><h3 id="rising-title">Gaining ground</h3><p>Tags with the biggest increases in cohort share.</p></div><span class="cohort-legend"><span class="legend-previous">${summary.previousYear||'Earlier'}</span><span class="legend-current">${summary.currentYear||'Recent'}</span></span></div>
 ${summary.rising.length?`<div class="trend-head" aria-hidden="true"><span>Idea</span><span>${summary.previousYear} / ${summary.currentYear}</span><span>Change</span></div><div class="trend-table">${trendRows(summary.rising)}</div>`:`<div class="summary-empty">${summary.comparable?'No tag meets the minimum sample for a rising signal in this view.':'Both comparison years need tagged companies to calculate a trend.'}<button type="button" class="text-button" data-reset-summary>Show all regions and statuses</button></div>`}
 <p class="summary-method">Share of tagged companies: ${fmt(summary.previousTagged)} of ${fmt(summary.previousTotal)} records in ${summary.previousYear||'the earlier cohort'}; ${fmt(summary.currentTagged)} of ${fmt(summary.currentTotal)} in ${summary.currentYear||'the recent cohort'}. ${summary.smallSample?'Small sample: fewer than 30 tagged companies in at least one year. ':''}Tags overlap. The latest intake may be incomplete.</p></section>
 ${summary.falling.length?`<section class="summary-section" aria-labelledby="falling-title"><div class="summary-section-heading"><div><h3 id="falling-title">Losing share</h3><p>A smaller share of the recent cohort does not mean fewer customers or weaker companies.</p></div></div><div class="trend-table">${trendRows(summary.falling)}</div></section>`:''}
 <section class="summary-section" aria-labelledby="unusual-title"><div class="summary-section-heading"><div><h3 id="unusual-title">Unusual approaches</h3><p>Selected from company descriptions.</p></div></div>
 <div class="unusual-grid">${summary.unusual.map(p=>`<button type="button" class="unusual-company" data-company="${p.id}"><span class="unusual-company-top">${logo(p.company)}<span><strong>${esc(p.company.name)}</strong><small>${esc(shortBatch(p.company.batch))} / ${esc(p.company.industry)}</small></span></span><span class="unusual-reason">${esc(p.reason)}</span>${p.rareTagCount&&p.rareTagCount<=12?`<span class="unusual-context">${fmt(p.rareTagCount)} directory companies carry the “${esc(p.rareTag)}” tag.</span>`:''}<span class="unusual-action">Inspect company</span></button>`).join('')}</div>
 ${summary.unusual.length?'':'<div class="summary-empty">None of the selected approaches match this region and status.<button type="button" class="text-button" data-reset-summary>Show all regions and statuses</button></div>'}
 <p class="summary-method">These are editorial picks, not a ranking of innovation or a claim that no competitors exist. Descriptions reflect what companies report on YC.</p></section>
 <details class="summary-methodology"><summary>How to read these signals</summary><p>Comparisons use the two selected YC batch years, excluding future years. Small cohorts may have limited tag coverage. Only companies with at least one tag enter the share denominator. A rising tag needs at least three matching companies; larger cohorts use a higher minimum. Changes are percentage points, not growth rates.</p><p>The analysis uses current directory tags on different cohorts. It does not track how individual companies changed over time, and it is not a measure of investment, traction, or market demand. Region and status filters change the sample. Regions follow YC’s location labels; companies with multiple locations can match more than one region.</p><p>Snapshot: ${esc(new Date(data.meta.fetchedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}))}. <a href="https://www.ycombinator.com/companies" target="_blank" rel="noopener noreferrer">Source: YC directory</a>.</p></details>`;
}
function descriptionGroupsHTML(){
 const layout=semantic?.layouts[state.topic];if(!layout)return'';
 const counts=new Map();filtered.forEach(c=>{const p=layout.points[c.id];if(p)counts.set(p[2],(counts.get(p[2])||0)+1);});
 return '<hr class="inspector-rule"><h3>Description groups</h3>'+layout.clusters.filter(g=>counts.get(g.id)).sort((a,b)=>counts.get(b.id)-counts.get(a.id)).map(g=>`<button type="button" class="semantic-group-item" data-semantic-group="${g.id}" aria-pressed="${g.id===state.group}"><span>${esc(g.label)}</span><span>${fmt(counts.get(g.id))}</span></button>`).join('')+'<p class="inspector-note">Groups are inferred from descriptions. Select one to filter this view.</p>';
}
function similarDescriptionsHTML(c){
 const layout=semantic?.layouts[state.topic]||semantic?.layouts.all;
 const neighbors=(layout?.neighbors[c.id]||[]).map(id=>companies.find(other=>other.id===id)).filter(other=>other&&matches(other)).slice(0,4);
 return neighbors.length?'<hr class="inspector-rule"><h3>Similar descriptions</h3>'+neighbors.map(other=>`<button type="button" class="related-company" data-company="${other.id}">${logo(other)}<span>${esc(other.name)}<small>${esc(other.summary)}</small></span></button>`).join(''):'';
}
function shortBatch(b) { return b?.replace('Winter ','W').replace('Summer ','S').replace('Spring ','Sp').replace('Fall ','F') || ''; }
function focusCompanyOnMap(id){
 if(state.view!=='map'||state.tab!=='explore'||!semanticViewport)return;
 const p=semanticViewport.nodes.find(p=>p.c.id===id);if(!p)return;
 const {w,h,referenceK}=semanticViewport,current=d3.zoomTransform(mapSelection.node());
 const k=Math.min(30,Math.max(current.k,referenceK*2.3));
 const target=d3.zoomIdentity.translate(w/2-k*p.x,h/2-k*p.y).scale(k);
 if(reduced)mapSelection.call(zoom.transform,target);else mapSelection.interrupt().transition().duration(460).ease(d3.easeCubicInOut).call(zoom.transform,target);
}
function selectCompany(id) {
 lastFocus=document.activeElement;
 if(state.tab==='explore'&&state.view==='map'){
  const group=activeSemanticLayout()?.points[id]?.[2];
  if(group!==undefined){const members=filtered.filter(c=>activeSemanticLayout().points[c.id]?.[2]===group),limit=mapPageSize(),page=Number.isFinite(limit)?Math.floor(Math.max(0,members.findIndex(c=>c.id===id))/limit):0;if(state.group!==group||state.page!==page){mapSelectionMotion='company';update({group,page,company:id});focusCompanyOnMap(id);return;}}
 }
 state.company=id;writeURL();renderInspector();
 document.querySelectorAll('[data-company]').forEach(n=>n.classList.toggle('is-selected',Number(n.dataset.company)===id));
 d3.selectAll('.company-bubble').classed('is-selected',c=>c?.id===id);
 $('tooltip').hidden=true;focusCompanyOnMap(id);
 if(innerWidth<=1000) requestAnimationFrame(()=>$('close-inspector')?.focus({preventScroll:true}));
}
function closeCompany(){state.company=null;writeURL();renderInspector();if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});}
function renderInspector() {
 const c=companies.find(c=>c.id===state.company),t=topics.find(t=>t.id===state.topic);
 $('inspector').classList.toggle('has-company',Boolean(c));
 if(c){
  $('inspector-content').innerHTML=`<div class="detail-top"><div class="detail-logo">${logo(c)}</div><button type="button" class="close-button" id="close-inspector" aria-label="Close company details">×</button></div><h2>${esc(c.name)}</h2><p class="company-summary">${esc(c.summary || 'Explore this company on YC.')}</p>${YCReels.companyActions({company:c,liked:discovery.likes.has(c.id),saved:library.has(c.id),escape:esc,context:'explore'})}${savedCompanyHTML(c)}<hr class="inspector-rule"><dl class="metadata"><dt>YC batch</dt><dd>${esc(c.batch || 'Not listed')}</dd><dt>Status</dt><dd>${esc(c.status || 'Not listed')}</dd>${c.location?`<dt>Based in</dt><dd>${esc(c.location)}</dd>`:''}${Number.isFinite(c.team)&&c.team>0?`<dt>Team size</dt><dd>${fmt(c.team)}</dd>`:''}<dt>Topics</dt><dd>${esc(topicNames(c).join(', '))}</dd><dt>Description group</dt><dd>${esc(descriptionGroup(c)?.label||'Not assigned')}</dd><dt>Geographic region</dt><dd>${esc(companyRegions(c).join(', ')||'Not listed')}</dd><dt>YC industry</dt><dd>${esc(c.industry)}</dd>${c.hiring?'<dt>Hiring</dt><dd>Yes, per YC</dd>':''}</dl>${similarDescriptionsHTML(c)}${c.tags.length?`<hr class="inspector-rule"><h3>YC tags</h3><div class="tags">${c.tags.map(tag=>`<button type="button" class="tag" data-search="${esc(tag)}">${esc(tag)}</button>`).join('')}</div>`:''}${c.description?`<hr class="inspector-rule"><h3>In their words</h3><p class="long-description">${esc(c.description)}</p>`:''}<a class="detail-source" href="https://www.ycombinator.com/companies/${encodeURIComponent(c.slug)}" target="_blank" rel="noopener noreferrer">View profile on YC <span aria-hidden="true">↗</span></a><p class="inspector-note">Directory snapshot. Details may have changed.</p>`;
  $('close-inspector').onclick=closeCompany;
  $('save-company').onclick=()=>{if(library.has(c.id)){removeSavedCompanies([c.id]);}else{library.save(c.id,library.folder(state.folder)?state.folder:null);refreshSaved();notifySaved('Company saved.');}};
 }else if(state.tab==='summary'){
  $('inspector-content').innerHTML='<h2>Summary</h2><p>Cohort tag shares and selected company descriptions.</p><hr class="inspector-rule"><h3>Company lists</h3><p>Click a trend to inspect the companies behind it. Click an unusual approach to read its profile.</p><hr class="inspector-rule"><h3>Choose a region</h3><p>Use the region filter to explore the same questions in Europe, Asia, or another part of the world.</p><hr class="inspector-rule"><p class="inspector-note">Changes measure cohort mix, not company growth. Counts and descriptions come from the directory snapshot.</p>';
 }else if(t){
  $('inspector-content').innerHTML=`<h2>${esc(t.name)}</h2><div class="topic-stat">${fmt(filtered.length)}<span>companies in this view</span></div>${descriptionGroupsHTML()}<hr class="inspector-rule"><h3>Companies</h3>${filtered.slice(0,4).map(c=>`<button type="button" class="related-company" data-company="${c.id}">${logo(c)}<span>${esc(c.name)}<small>${esc(shortBatch(c.batch))} / ${esc(c.status)}</small></span></button>`).join('')}<button type="button" class="text-button" data-about>Map methodology</button>`;
 }else if(state.saved){
  $('inspector-content').innerHTML='<h2>Saved companies</h2><p>Select a company to read its details, change its folder, or add a private note.</p><hr class="inspector-rule"><h3>Organize your list</h3><p>Right-click a company, or use its ⋯ button, to move it to a folder or remove it from Saved. Right-click a folder, or use its ⋯ button, to rename or delete it. Moving folders keeps the original save date.</p><p class="inspector-note">Folders and notes are stored on this device. Export the current folder or filtered list as CSV to keep a copy.</p>'; 
 }else{
  const available=companies.filter(c=>matches(c,false));
  $('inspector-content').innerHTML=`<h2>Company details</h2><p>Select a company to view its description, batch, location, and website.</p><hr class="inspector-rule"><h3>Topics</h3>${topics.map(t=>`<button type="button" class="suggestion" data-topic="${t.id}"><span>${esc(t.name)}</span><span>${fmt(available.filter(c=>c.topics.includes(t.id)).length)}</span></button>`).join('')}<hr class="inspector-rule"><h3>Description maps</h3><p class="inspector-note">Within a topic, companies are positioned by description similarity. Group labels summarize recurring terms. Select a group to zoom.</p><button type="button" class="text-button" data-about>Map methodology</button>`;
 }
}
document.addEventListener('click',e=>{
 if(e.target.id==='swap-years'){update({compareA:state.compareB,compareB:state.compareA});return;}
 const like=e.target.closest('[data-like]');if(like){discovery.toggle(Number(like.dataset.like));render();return;}
 const companyMenu=e.target.closest('[data-company-menu]');if(companyMenu){openLibraryMenu('company',Number(companyMenu.dataset.companyMenu),companyMenu);return;}
 const folderMenu=e.target.closest('[data-folder-menu]');if(folderMenu){openLibraryMenu('folder',folderMenu.dataset.folderMenu,folderMenu);return;}
 const folder=e.target.closest('[data-saved-folder]');if(folder){update({folder:folder.dataset.savedFolder,topic:'all',group:null});return;}
 if(e.target.closest('[data-clear-group]')){clearSemanticGroup();return;}
 if(e.target.closest('[data-open-list]')){update({view:'list'});return;}
 const semanticGroup=e.target.closest('[data-semantic-group]');if(semanticGroup){openSemanticGroup(Number(semanticGroup.dataset.semanticGroup));return;}
 const trend=e.target.closest('[data-trend]');if(trend){update({tab:'explore',view:'list',topic:'all',q:'',batch:'',tag:trend.dataset.trend,year:trend.dataset.year,saved:false});return;}
 if(e.target.closest('[data-reset-summary]')){update({region:'',status:''});return;}
 const topic=e.target.closest('[data-topic]');if(topic&&data){enterTopic(topic.dataset.topic);return;}
 const company=e.target.closest('[data-company]');if(company&&data){selectCompany(Number(company.dataset.company));return;}
 const tag=e.target.closest('[data-search]');if(tag){update({q:'',tag:tag.dataset.search,year:'',topic:'all',tab:'explore',view:'list'});return;}
 if(e.target.closest('[data-about]')) $('about-dialog').showModal();
});
for(const [key,label] of [['batch','All batches'],['status','Any status'],['region','All regions']])filterControls[key]=new YCControls.MultiFilter(key,label,values=>update({[key]:values}));
function saveMapSettings(){try{localStorage.setItem('yc-atlas-map-settings',JSON.stringify(mapSettings));}catch{}}
$('map-limit').onchange=e=>{const oldLimit=mapPageSize(),start=Number.isFinite(oldLimit)?state.page*oldLimit:0;mapSettings.limit=e.target.value==='all'?'all':Number(e.target.value);saveMapSettings();const limit=mapPageSize();update({page:Number.isFinite(limit)?Math.floor(start/limit):0,company:state.company});};
$('map-logo-size').oninput=e=>{$('map-logo-output').textContent=`${Number(e.target.value)*2} px`;};
$('map-logo-size').onchange=e=>{mapSettings.logoSize=Number(e.target.value);saveMapSettings();render();};
document.addEventListener('click',e=>{if(!$('reel-filter-panel').hidden&&!e.target.closest('#reel-filter-panel,#reel-filter-toggle'))closeReelFilterPanel();const current=e.target.closest('.filter-dropdown,.map-settings');for(const popup of document.querySelectorAll('.filter-dropdown[open],.map-settings[open]'))if(popup!==current){popup.open=false;e.__dismissedPopup=true;}},true);
function isCompanySearch(){return state.tab==='explore'&&!state.saved;}
function closeCompanySearch(){companySearchResults=[];companySearchActive=0;companySearchQuery='';$('company-search-popup').hidden=true;$('search').setAttribute('aria-expanded','false');$('search').removeAttribute('aria-activedescendant');}
function companySearchText(value){return String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().trim();}
function setCompanySearchActive(index){companySearchActive=index;document.querySelectorAll('[data-find-company]').forEach((node,i)=>node.setAttribute('aria-selected',String(i===index)));const active=$('company-search-option-'+index);if(active){$('search').setAttribute('aria-activedescendant',active.id);active.scrollIntoView?.({block:'nearest'});}}
function showCompanySearch(){
 const query=companySearchText($('search').value);if(!isCompanySearch()||!query||!data){closeCompanySearch();return;}
 const words=query.split(/\s+/),ranked=companies.map(company=>{const name=companySearchText(company.name),slug=companySearchText(company.slug),text=companySearchText(company.search);let rank=0;if(name===query||slug===query)rank=1000;else if(name.startsWith(query)||slug.startsWith(query))rank=900;else if(name.includes(query))rank=800;else if(words.every(word=>name.includes(word)))rank=700;else if(words.every(word=>text.includes(word)))rank=100;return{company,rank};}).filter(result=>result.rank).sort((a,b)=>b.rank-a.rank||a.company.name.localeCompare(b.company.name));
 companySearchResults=ranked.slice(0,8).map(result=>result.company);companySearchActive=0;companySearchQuery=query;
 $('company-search-results').innerHTML=companySearchResults.map((company,i)=>`<button type="button" role="option" tabindex="-1" aria-selected="${i===0}" id="company-search-option-${i}" data-find-company="${company.id}"><span class="search-result-logo">${logo(company)}</span><span class="search-result-copy"><strong>${esc(company.name)}</strong><small>${esc([company.batch,company.location].filter(Boolean).join(' / '))}</small><small>${esc(company.summary)}</small></span></button>`).join('');
 $('company-search-status').textContent=ranked.length?`${fmt(ranked.length)} ${ranked.length===1?'company':'companies'}${ranked.length>8?' / showing 8':''}`:'No matching companies';$('company-search-popup').hidden=false;$('search').setAttribute('aria-expanded','true');$('search').removeAttribute('aria-activedescendant');if(companySearchResults.length)$('search').setAttribute('aria-activedescendant','company-search-option-0');
}
function locateSearchCompany(id){
 const company=companies.find(company=>company.id===id);if(!company)return;
 clearTimeout(searchTimer);closeCompanySearch();
 const topic=state.topic!=='all'&&company.topics.includes(state.topic)?state.topic:company.topics.find(id=>semantic?.layouts[id]?.points[company.id])||company.topics[0]||'all';
 const patch={tab:'explore',saved:false,topic,q:'',view:'map',company:id,group:null,page:0},cleared=[];
 for(const key of ['batch','status'])if(state[key].length&&!state[key].includes(company[key])){patch[key]=[];cleared.push(key==='batch'?'batch':'status');}
 if(state.region.length&&!state.region.some(region=>matchesRegion(company,region))){patch.region=[];cleared.push('region');}
 if(state.tag&&!company.tags.includes(state.tag)){patch.tag='';cleared.push('tag');}
 if(state.year&&String(YCInsights.yearOf(company))!==String(state.year)){patch.year='';cleared.push('year');}
 if(state.missing&&[company.summary,company.description].join(' ').trim()){patch.missing=false;cleared.push('description');}
 const facets={...state,...patch},members=companies.filter(other=>YCControls.matchesFacets(other,facets,{matchesRegion,yearOf:YCInsights.yearOf})),layout=semantic?.layouts[topic]||semantic?.layouts.all,group=layout?.points[id]?.[2];
 if(group!==undefined){patch.group=group;const limit=mapPageSize(),groupMembers=members.filter(other=>layout.points[other.id]?.[2]===group);patch.page=Number.isFinite(limit)?Math.floor(Math.max(0,groupMembers.findIndex(other=>other.id===id))/limit):0;mapSelectionMotion='company';}
 else{patch.view='list';patch.page=Math.floor(Math.max(0,members.findIndex(other=>other.id===id))/pageSize);}
 lastFocus=$('search');update(patch);if(group!==undefined)focusCompanyOnMap(id);$('search').blur();
 if(group===undefined)notifySaved('This company has no description map position. Opened it in the list.');else if(cleared.length)notifySaved(`Cleared ${cleared.join(', ')} ${cleared.length===1?'filter':'filters'} to show ${company.name}.`);
}
$('search').addEventListener('input',event=>{const q=event.target.value,tab=state.tab,savedMode=state.saved;clearTimeout(searchTimer);if(isCompanySearch()){if(!q.trim())closeCompanySearch();else searchTimer=setTimeout(showCompanySearch,180);return;}searchTimer=setTimeout(()=>{if(state.tab!==tab||state.saved!==savedMode||$('search').value!==q)return;if(state.tab==='reels')applyReelScope({...reelScope,q},true);else update({q,tab:'explore',tag:'',year:'',...(state.tab==='summary'?{view:'list'}:{})},true);},180);});
$('search').addEventListener('focus',()=>{if(isCompanySearch()&&$('search').value.trim())showCompanySearch();});
$('search').addEventListener('blur',()=>{if(isCompanySearch())clearTimeout(searchTimer);closeCompanySearch();});
$('search').addEventListener('keydown',event=>{if(!isCompanySearch()||event.isComposing)return;if(event.key==='Escape'&&!$('company-search-popup').hidden){event.preventDefault();event.stopPropagation();clearTimeout(searchTimer);closeCompanySearch();return;}if(!['ArrowDown','ArrowUp','Enter'].includes(event.key)||!$('search').value.trim())return;event.preventDefault();event.stopPropagation();clearTimeout(searchTimer);if($('company-search-popup').hidden||companySearchQuery!==companySearchText($('search').value))showCompanySearch();if(!companySearchResults.length)return;if(event.key==='Enter')locateSearchCompany(companySearchResults[companySearchActive].id);else setCompanySearchActive((companySearchActive+(event.key==='ArrowDown'?1:-1)+companySearchResults.length)%companySearchResults.length);});
$('company-search-results').addEventListener('pointerdown',event=>event.preventDefault());
$('company-search-results').addEventListener('click',event=>{const result=event.target.closest('[data-find-company]');if(result)locateSearchCompany(Number(result.dataset.findCompany));});
document.addEventListener('click',event=>{if(!$('company-search-popup').hidden&&!event.target.closest('.search')){closeCompanySearch();event.__dismissedPopup=true;}},true);
$('map-view').onclick=()=>{const id=state.company;update({view:'map',company:id});if(id)selectCompany(id);};$('list-view').onclick=()=>update({view:'list'});
$('description-group').onchange=e=>openSemanticGroup(e.target.value===''?null:Number(e.target.value));
$('all-groups').onclick=()=>openSemanticGroup(null);
$('home-crumb').onclick=()=>update({topic:'all',q:'',missing:false});
$('explore-nav').onclick=()=>switchWorkspace('explore',{saved:false,topic:'all',q:'',tab:'explore',tag:'',year:'',missing:false});
$('saved-nav').onclick=()=>switchWorkspace('saved',{saved:true,view:'list',folder:'all',topic:'all',q:'',batch:[],status:[],region:[],tab:'explore',tag:'',year:'',missing:false});
$('reels-nav').onclick=()=>switchWorkspace('reels',{tab:'reels',saved:false,topic:'all',q:'',batch:[],region:[],status:[],tag:'',year:'',missing:false});
$('liked-nav').onclick=()=>switchWorkspace('liked',{tab:'liked',view:'list',saved:false,topic:'all',q:'',batch:[],region:[],status:[],tag:'',year:'',missing:false});
$('chat-nav').onclick=()=>{const company=window.YCAtlasAssistantContext.selected();if(company)window.YCAtlasAssistantContext.chatCompany=company;switchWorkspace('chat',{tab:'chat',saved:false,q:'',topic:'all',tag:'',year:'',missing:false});};
$('summary-nav').onclick=()=>switchWorkspace('summary',{tab:'summary',saved:false,topic:'all',q:'',batch:[],tag:'',year:'',missing:false});
$('clear-filters').onclick=()=>update({q:'',batch:'',status:'',region:'',tag:'',year:'',missing:false});
$('reset-empty').onclick=()=>{if(state.saved&&saved.size){const folderHasCompanies=companies.some(c=>saved.has(c.id)&&(state.folder==='all'||library.record(c.id)?.folderId===state.folder));update({topic:'all',q:'',batch:[],status:[],region:[],tag:'',year:'',missing:false,...(!folderHasCompanies?{folder:'all'}:{})});}else update({topic:'all',q:'',batch:[],status:[],region:[],saved:false,tag:'',year:'',missing:false});};
$('prev-page').onclick=()=>update({page:Math.max(0,state.page-1)});$('next-page').onclick=()=>update({page:state.page+1});
$('mobile-topics').onclick=()=>{const isOpen=document.querySelector('.topics-panel').classList.toggle('is-open');$('mobile-topics').setAttribute('aria-expanded',isOpen);};
function adjustZoom(scale){if(zoom&&mapSelection){if(reduced)mapSelection.call(zoom.scaleBy,scale);else mapSelection.transition().duration(180).call(zoom.scaleBy,scale);}}
$('zoom-in').onclick=()=>adjustZoom(1.4);$('zoom-out').onclick=()=>adjustZoom(1/1.4);$('zoom-reset').onclick=()=>{if(zoom&&mapSelection){if(semanticViewport?.activeNodes.length)mapSelection.call(zoom.transform,fitTransform(semanticViewport.activeNodes,semanticViewport.w,semanticViewport.h));else mapSelection.call(zoom.transform,overviewFit||d3.zoomIdentity);}};
$('about').onclick=()=>$('about-dialog').showModal();$('close-about').onclick=()=>$('about-dialog').close();
$('about-dialog').addEventListener('click',e=>{if(e.target===$('about-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!document.querySelector('dialog[open]')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();(state.tab==='chat'?$('assistant-prompt'):$('search')).focus();}if(e.key==='Escape'&&!document.querySelector('dialog[open]')){const popups=[...document.querySelectorAll('.filter-dropdown[open],.map-settings[open]')];if(popups.length){popups.forEach(p=>p.open=false);return;}if(state.tab==='reels'&&!$('reel-filter-panel').hidden){closeReelFilterPanel();$('reel-filter-toggle').focus();return;}if(state.group!==null)clearSemanticGroup();else if(state.company)closeCompany();document.querySelector('.topics-panel').classList.remove('is-open');$('mobile-topics').setAttribute('aria-expanded','false');}});
window.addEventListener('popstate',()=>{const previous=tabKey(state);rememberTab();readURL();const incoming=tabMemories.get(tabKey(state)),restore=incoming&&JSON.stringify(incoming.state)===JSON.stringify(copyViewState());if(restore||previous!==tabKey(state)){returnToRegions=false;mapSelectionMotion=null;cameraContext=null;cameras.clear();if(restore)for(const [id,camera]of incoming.cameras)cameras.set(id,camera);}render();if(restore)restoreTabPosition(incoming);else if(state.company)focusCompanyOnMap(state.company);});
let resizeTimer;new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(data&&state.view==='map'&&state.tab==='explore'&&$('map').getAttribute('viewBox')!==`0 0 ${$('stage').clientWidth} ${$('stage').clientHeight}`)render();},120);}).observe($('stage'));
async function load(){
 $('data-error').hidden=true;$('loading').hidden=false;$('stage').setAttribute('aria-busy','true');
 try{
  const [response,semanticData]=await Promise.all([fetch('data/companies.json',{cache:'no-store'}),fetch('data/semantic.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null)]);if(!response.ok)throw new Error(`Directory request returned ${response.status}`);
  data=await response.json();if(!data.companies?.length||!data.topics?.length)throw new Error('Invalid directory data');
  companies=data.companies;topics=data.topics;
  semantic=semanticData?.meta?.sourceHash===data.meta.semanticSourceHash&&semanticData?.meta?.companyCount===companies.length?semanticData:null;
  semanticScenes.clear();expandedGroups.clear();cameras.clear();
  discoveryEngine.setData(companies,semantic);
  if(reelsView?.current){const current=companies.find(c=>c.id===reelsView.current.company.id);reelsView.current=current?{...reelsView.current,company:current}:null;window.atlasDesktop?.hideReel().catch(()=>{});}
  if(!reelsView)reelsView=new YCReels.View({engine:discoveryEngine,store:discovery,library,root:$('reel-content'),escape:esc,logo,changed:()=>refreshSaved()});
  companies.forEach(c=>{c.search=[c.name,c.summary,c.description,c.location,c.industry,...c.tags,...c.topics.map(id=>topics.find(t=>t.id===id)?.name || '')].join(' ').toLowerCase();});
  saved=new Set([...library.ids()].filter(id=>companies.some(c=>c.id===id)));
  const batches=[...new Set(companies.map(c=>c.batch).filter(Boolean))].sort((a,b)=>{const year=s=>(Number(s.match(/\d{4}/)?.[0])||0)*10+({'Winter':1,'Spring':2,'Summer':3,'Fall':4}[s.split(' ')[0]]||0);return year(b)-year(a);});
  filterControls.batch.mount([{label:'YC batches',options:batches}]);
  filterControls.status.mount([{label:'Company status',options:[...new Set(companies.map(c=>c.status).filter(Boolean))].sort()}]);
  const regions=[...new Set(companies.flatMap(c=>c.regions))].sort();
  const groupedValues=new Set(regionGroups.flatMap(g=>g.values));
  const workModes=['Remote','Partly Remote','Fully Remote'];
  const countries=regions.filter(r=>!groupedValues.has(r)&&!workModes.includes(r)&&r!=='Unspecified');
  filterControls.region.mount([{label:'Regions',options:regionGroups.filter(g=>regions.some(r=>g.values.includes(r))).map(g=>g.name)},{label:'Countries',options:countries},{label:'Work location',options:workModes.filter(r=>regions.includes(r))}]);
  mountReelControls(batches,regions,countries,workModes);
  const date=new Date(data.meta.fetchedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  $('snapshot').textContent=`${fmt(companies.length)} directory records`;
  $('data-date').textContent=`Snapshot ${date}`;$('refresh-snapshot').title=`Update snapshot · current snapshot ${date}`;
  $('about-coverage').textContent=`All ${fmt(companies.length)} public directory records were gathered on ${date}. Each batch was checked against its reported count, then records were deduplicated and checked against the directory total.`;
  readURL();$('loading').hidden=true;$('stage').setAttribute('aria-busy','false');render();
 }catch(error){console.error('Unable to open YC Atlas:',error);data=null;$('loading').hidden=true;$('data-error').hidden=false;$('map-caption').hidden=true;$('zoom-controls').hidden=true;$('results-count').textContent='Directory unavailable';$('snapshot').textContent='Directory unavailable';$('stage').setAttribute('aria-busy','false');}
}
function savedCompanyHTML(c){
 const record=library.record(c.id);if(!record)return '';
 return `<section class="company-library" aria-label="Saved company organization"><div class="company-library-heading"><h3>Saved company</h3>${savedDateHTML(record)}</div><div class="company-folder-control"><span>${esc(record.folderId?library.folderName(record.folderId):'Saved without a folder')}</span><button type="button" class="quiet-button" data-company-menu="${c.id}" aria-haspopup="menu" aria-expanded="false">Move to folder…</button></div><label for="company-note">Private note</label><textarea id="company-note" rows="3" maxlength="5000" placeholder="Why this company is interesting, or what to look into…">${esc(record.note)}</textarea><span id="note-status" class="note-status" role="status">${library.storageError?'Session only: browser storage unavailable':'Notes save automatically on this device'}</span></section>`;
}
function renderSavedWorkspace(){
 if(!state.saved)return;
 const rows=companies.filter(c=>saved.has(c.id));
 const folderCount=id=>rows.filter(c=>id==='all'||library.record(c.id)?.folderId===id).length;
 const icon='<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M2 5a1 1 0 0 1 1-1h5l2 2h7a1 1 0 0 1 1 1v9H2Z"/></svg>';
 $('folder-list').innerHTML=[{id:'all',name:'All saved'},...library.folders].map(f=>`<div class="saved-folder-row" data-folder-id="${esc(f.id)}"><button type="button" class="saved-folder ${state.folder===f.id?'is-active':''}" data-saved-folder="${esc(f.id)}" aria-current="${state.folder===f.id?'page':'false'}">${icon}<span>${esc(f.name)}</span><span class="folder-count">${fmt(folderCount(f.id))}</span></button>${f.id!=='all'?`<button type="button" class="folder-menu-button" data-folder-menu="${esc(f.id)}" aria-label="Actions for folder ${esc(f.name)}" aria-haspopup="menu" aria-expanded="false">⋯</button>`:''}</div>`).join('');
 $('saved-folder-title').textContent=state.folder==='all'?'All saved':library.folderName(state.folder);
 $('folder-management').hidden=!library.folder(state.folder);
 $('saved-sort').value=state.savedSort;
 $('saved-storage-error').hidden=!library.storageError;
 $('export-saved').disabled=!activeCompanyScope().length;
}
function refreshSaved(){
 const scroll=$('company-list').scrollTop;
 saved=new Set([...library.ids()].filter(id=>companies.some(c=>c.id===id)));
 render();writeURL(true);$('company-list').scrollTop=scroll;
}
function notifySaved(message,undo=null){
 clearTimeout(toastTimer);undoSaved=undo;$('saved-toast-text').textContent=message;$('undo-saved').hidden=!undo;$('saved-toast').hidden=false;
 toastTimer=setTimeout(()=>{$('saved-toast').hidden=true;undoSaved=null;},10000);
}
function removeSavedCompanies(ids){
 const records=library.remove(ids);refreshSaved();
 if(records.length)notifySaved(`${records.length===1?'Company':fmt(records.length)+' companies'} removed from Saved.`,()=>{library.restore(records);refreshSaved();notifySaved('Restored to Saved.');});
}
function openFolderDialog(id=null,companyId=null){
 folderEditing=id;folderAssignCompany=companyId;
 $('folder-dialog-title').textContent=id?'Rename folder':'New folder';$('folder-name').value=library.folder(id)?.name||'';$('folder-error').hidden=true;
 $('folder-dialog').showModal();$('folder-name').focus();
}
$('new-folder').onclick=()=>openFolderDialog();
$('rename-folder').onclick=()=>openFolderDialog(state.folder);
$('cancel-folder').onclick=()=>$('folder-dialog').close();
$('folder-form').onsubmit=e=>{
 e.preventDefault();
 try{
  const name=$('folder-name').value;
  if(folderEditing){library.renameFolder(folderEditing,name);$('folder-dialog').close();refreshSaved();[...document.querySelectorAll('[data-folder-menu]')].find(button=>button.dataset.folderMenu===folderEditing)?.focus();}
  else{
   const folder=library.createFolder(name);$('folder-dialog').close();
   if(folderAssignCompany){if(library.has(folderAssignCompany))library.move([folderAssignCompany],folder.id);else library.save(folderAssignCompany,folder.id);refreshSaved();notifySaved(`Company saved in ${folder.name}.`);}
   else{update({folder:folder.id,topic:'all',group:null});$('new-folder').focus();}
  }
 }catch(error){$('folder-error').textContent=error.message;$('folder-error').hidden=false;$('folder-name').focus();}
};
$('delete-folder').onclick=()=>deleteSavedFolder(state.folder);
$('saved-sort').onchange=e=>{library.setSort(e.target.value);update({savedSort:e.target.value});};
$('undo-saved').onclick=()=>{const action=undoSaved;undoSaved=null;action?.();};
$('dismiss-saved-toast').onclick=()=>{clearTimeout(toastTimer);$('saved-toast').hidden=true;undoSaved=null;};
$('export-saved').onclick=()=>{
 const scope=activeCompanyScope();
 const rows=[['Company','YC profile','Website','Batch','Status','Topics','Geographic region','Folder','Saved at','Note'],...scope.map(c=>{const record=library.record(c.id);return[c.name,`https://www.ycombinator.com/companies/${c.slug}`,safeURL(c.website),c.batch,c.status,topicNames(c).join('; '),companyRegions(c).join('; '),library.folderName(record?.folderId),record?.addedAt?new Date(record.addedAt).toISOString():'',record?.note||''];})];
 const url=URL.createObjectURL(new Blob([YCSaved.csv(rows)],{type:'text/csv;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download=`yc-saved-${new Date().toISOString().slice(0,10)}.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 notifySaved(`${fmt(scope.length)} ${scope.length===1?'company':'companies'} exported.`);
};
document.addEventListener('input',e=>{
 if(e.target.id!=='company-note'||!state.company)return;
 library.note(state.company,e.target.value);
 $('note-status').textContent=library.storageError?'Session only: browser storage unavailable':'Saved on this device';
 $('saved-storage-error').hidden=!library.storageError;
 const copy=document.querySelector(`.saved-row [data-company="${state.company}"] .row-copy`);if(copy){let note=copy.querySelector('.saved-row-note');if(!note){note=document.createElement('small');note.className='saved-row-note';copy.append(note);}note.textContent=e.target.value?'Note: '+e.target.value:'';note.title=e.target.value;}
});

function closeLibraryMenu(restoreFocus=false){
 const anchor=libraryMenuTarget?.anchor;
 if(anchor?.matches('[aria-haspopup="menu"]'))anchor.setAttribute('aria-expanded','false');
 $('library-menu').hidden=true;libraryMenuTarget=null;
 if(restoreFocus&&anchor?.isConnected)anchor.focus({preventScroll:true});
}
function openLibraryMenu(type,id,anchor,point=null){
 closeLibraryMenu();
 const menu=$('library-menu');$('tooltip').hidden=true;let html='';
 if(type==='folder'){
  const folder=library.folder(id);if(!folder)return;
  html=`<div class="library-menu-title">${esc(folder.name)}</div><button type="button" role="menuitem" data-library-action="rename">Rename folder</button><button type="button" role="menuitem" data-library-action="delete" class="is-destructive">Delete folder</button>`;
  menu.setAttribute('aria-label',`Actions for folder ${folder.name}`);
 }else{
  const company=companies.find(c=>c.id===id);if(!company)return;
  const record=library.record(id);
  html=`<div class="library-menu-title">${esc(company.name)}</div><div class="library-menu-label">${record?'Move to folder':'Save to folder'}</div>`;
  html+=library.folders.map(folder=>`<button type="button" role="menuitem" data-library-action="move" data-destination="${esc(folder.id)}" ${record?.folderId===folder.id?'disabled':''}><span>${esc(folder.name)}</span>${record?.folderId===folder.id?'<small>Current</small>':''}</button>`).join('');
  html+='<button type="button" role="menuitem" data-library-action="new-folder">+ New folder…</button>';
  if(!record)html+='<button type="button" role="menuitem" data-library-action="move" data-destination="">Save without a folder</button>';
  else{
   if(record.folderId)html+='<button type="button" role="menuitem" data-library-action="move" data-destination="">Remove from folder</button>';
   html+='<div class="library-menu-rule" role="separator"></div><button type="button" role="menuitem" data-library-action="remove" class="is-destructive">Remove from Saved</button>';
  }
  menu.setAttribute('aria-label',`Actions for ${company.name}`);
 }
 libraryMenuTarget={type,id,anchor};menu.innerHTML=html;menu.hidden=false;
 if(anchor?.matches('[aria-haspopup="menu"]'))anchor.setAttribute('aria-expanded','true');
 const bounds=anchor.getBoundingClientRect(),x=point?.x??bounds.right,y=point?.y??bounds.bottom;
 menu.style.left='0px';menu.style.top='0px';
 const rect=menu.getBoundingClientRect();
 menu.style.left=`${Math.max(8,Math.min(x,innerWidth-rect.width-8))}px`;
 menu.style.top=`${Math.max(8,Math.min(y,innerHeight-rect.height-8))}px`;
 menu.querySelector('[role="menuitem"]:not(:disabled)')?.focus({preventScroll:true});
}
function deleteSavedFolder(id){
 const folder=library.folder(id);if(!folder)return;
 const name=folder.name;library.deleteFolder(id);
 if(state.folder===id)update({folder:'all'});else refreshSaved();
 [...document.querySelectorAll('[data-saved-folder]')].find(button=>button.dataset.savedFolder===state.folder)?.focus({preventScroll:true});
 notifySaved(`“${name}” deleted. Its companies remain in All saved.`);
}
function focusAfterCompanyAction(id){
 const node=(state.view==='list'?document.querySelector(`.saved-row [data-company-menu="${id}"]`):document.querySelector(`.semantic-company[data-company-id="${id}"]`))||(state.company===id?document.querySelector('#inspector [data-company-menu],#save-company'):null)||(state.view==='list'?$('company-list'):$('list-view'));
 node?.focus({preventScroll:true});
}
function libraryContextTarget(node){
 const folder=node.closest('[data-folder-id]');if(folder&&library.folder(folder.dataset.folderId))return{type:'folder',id:folder.dataset.folderId,anchor:folder.querySelector('[data-saved-folder]')};
 const company=node.closest('[data-company-menu],[data-company],[data-company-id],.company-bubble');
 if(company){const id=Number(company.dataset.companyMenu||company.dataset.company||company.dataset.companyId||company.__data__?.id);if(companies.some(c=>c.id===id))return{type:'company',id,anchor:company};}
 return null;
}
$('library-menu').onclick=e=>{
 const button=e.target.closest('[data-library-action]');if(!button||button.disabled||!libraryMenuTarget)return;
 const target=libraryMenuTarget,action=button.dataset.libraryAction,destination=button.dataset.destination||null;
 closeLibraryMenu();
 if(action==='rename'){openFolderDialog(target.id);return;}
 if(action==='delete'){deleteSavedFolder(target.id);return;}
 if(action==='new-folder'){openFolderDialog(null,target.id);return;}
 if(action==='remove'){removeSavedCompanies([target.id]);focusAfterCompanyAction(target.id);return;}
 if(action==='move'){
  const wasSaved=library.has(target.id);
  if(wasSaved)library.move([target.id],destination);else library.save(target.id,destination);
  refreshSaved();focusAfterCompanyAction(target.id);
  notifySaved(destination?`Company ${wasSaved?'moved to':'saved in'} ${library.folderName(destination)}.`:wasSaved?'Removed from folder. Company remains in All saved.':'Company saved.');
 }
};
document.addEventListener('contextmenu',e=>{
 if(document.querySelector('dialog[open]')||window.getSelection()?.toString().trim())return;
 const target=libraryContextTarget(e.target);if(!target)return;
 e.preventDefault();openLibraryMenu(target.type,target.id,target.anchor,{x:e.clientX,y:e.clientY});
});
document.addEventListener('click',e=>{if(!$('library-menu').hidden&&!e.target.closest('#library-menu')){closeLibraryMenu();e.__dismissedPopup=true;}},true);
document.addEventListener('keydown',e=>{
 if(!$('library-menu').hidden){
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeLibraryMenu(true);return;}
  if(e.key==='Tab'){closeLibraryMenu(true);return;}
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
   e.preventDefault();e.stopImmediatePropagation();const items=[...$('library-menu').querySelectorAll('[role="menuitem"]:not(:disabled)')],index=items.indexOf(document.activeElement);
   const next=e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();return;
  }
 }
 if(e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey){const target=libraryContextTarget(e.target);if(target){e.preventDefault();e.stopImmediatePropagation();openLibraryMenu(target.type,target.id,target.anchor);}}
},true);
document.addEventListener('scroll',e=>{if(!$('library-menu').contains(e.target))closeLibraryMenu();},true);
window.addEventListener('resize',()=>closeLibraryMenu());

document.addEventListener('change',event=>{
 if(event.target.id==='compare-from'){const year=Number(event.target.value);update({compareA:year,...(year===state.compareB?{compareB:state.compareA}:{})});}
 if(event.target.id==='compare-to'){const year=Number(event.target.value);update({compareB:year,...(year===state.compareA?{compareA:state.compareB}:{})});}
});
function snapshotStatus(status){
 const running=status.state==='running';$('snapshot-progress').textContent=status.message;$('snapshot-spinner').hidden=!running;$('start-snapshot').disabled=running||!window.atlasDesktop;
 if(status.state==='complete'){load();notifySaved('Directory snapshot updated.');}
}
$('refresh-snapshot').onclick=async()=>{
 $('snapshot-current').textContent=data?`Current snapshot: ${new Date(data.meta.fetchedAt).toLocaleString()}. ${fmt(companies.length)} companies.`:'No snapshot loaded.';
 if(!window.atlasDesktop){$('snapshot-progress').textContent='Automatic updates are available in the desktop app.';$('snapshot-help').textContent='The browser companion uses the bundled snapshot. Open YC Atlas desktop to fetch new companies and rebuild the description maps.';$('start-snapshot').disabled=true;}
 else snapshotStatus(await window.atlasDesktop.refreshStatus());
 $('snapshot-dialog').showModal();
};
$('close-snapshot').onclick=()=>$('snapshot-dialog').close();
$('start-snapshot').onclick=async()=>{try{snapshotStatus(await window.atlasDesktop.refreshSnapshot());}catch(error){snapshotStatus({state:'failed',message:error.message});}};
function backupLibrary(){return JSON.stringify({version:1,library:{version:1,folders:library.folders,items:[...library.items.values()],sort:library.sort},discovery:{version:1,likes:[...discovery.likes],seen:[...discovery.seen]}},null,2);}
async function exportLibrary(){
 const payload=backupLibrary();
 if(window.atlasDesktop){await window.atlasDesktop.exportLibrary(payload);return;}
 const url=URL.createObjectURL(new Blob([payload],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='yc-atlas-library.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function importLibraryValue(text){
 if(text.length>10_000_000)throw new Error('Library is too large');const backup=JSON.parse(text),source=backup.library||backup;
 if(backup.discovery?.likes&&!Array.isArray(backup.discovery.likes))throw new Error('Invalid liked companies');
 if(source.version!==1||!Array.isArray(source.items)||!Array.isArray(source.folders))throw new Error('Choose a YC Atlas library JSON export.');
 if(!source.items.every(item=>item&&Number.isInteger(item.id)&&item.id>0)||!source.folders.every(folder=>folder&&typeof folder.id==='string'&&typeof folder.name==='string'&&folder.name.trim()&&folder.name.length<=64))throw new Error('Invalid library records');
 const folders=new Map();for(const folder of source.folders){const existing=library.folders.find(f=>f.name.toLocaleLowerCase()===folder.name.trim().toLocaleLowerCase());folders.set(folder.id,(existing||library.createFolder(folder.name)).id);}
 library.restore(source.items.map(item=>({...item,folderId:folders.get(item.folderId)||null})));
 for(const pair of backup.discovery?.likes||[]){if(Array.isArray(pair)&&Number.isInteger(pair[0])&&pair[0]>0&&!discovery.likes.has(pair[0]))discovery.likes.set(pair[0],Number(pair[1])||Date.now());}discovery.revision++;discovery.persist();refreshSaved();notifySaved('Library imported. Existing saved companies were kept.');
}
async function importLibrary(){try{if(window.atlasDesktop){const payload=await window.atlasDesktop.importLibrary();if(payload)importLibraryValue(payload);}else $('library-file').click();}catch(error){notifySaved(error.message);}}
$('export-library').onclick=()=>exportLibrary().catch(error=>notifySaved(error.message));$('import-library').onclick=importLibrary;
$('library-file').onchange=async event=>{try{const file=event.target.files[0];if(file)importLibraryValue(await file.text());}catch(error){notifySaved(error.message);}event.target.value='';};
if(window.atlasDesktop){
 window.atlasDesktop.onEvent(event=>{
  if(event.type==='reel-status')reelsView?.status(event);
  if(event.type==='reel-overlay-preview')void reelsView?.overlayPreview(event);
  if(event.type==='reel-transition')reelsView?.transition(event);
  if(event.type==='reel-navigation'&&state.tab==='reels')reelsView?.navigate(event.direction);
  if(event.type==='reel-ended'&&state.tab==='reels')reelsView?.ended(event);
  if(event.type==='reel-page'&&state.tab==='reels')reelsView?.page(event);
  if(event.type==='reel-playback'&&reelsView)reelsView.setPaused(event.paused,false);
  if(event.type==='snapshot-status')snapshotStatus(event);
  if(event.type==='navigate')$(`${event.tab}-nav`)?.click();
  if(event.type==='search'){if(state.tab==='chat')window.dispatchEvent(new Event('atlas-chat-search'));else $('search').focus();}
  if(event.type==='update-snapshot')$('refresh-snapshot').click();
  if(event.type==='import-library')importLibrary();
  if(event.type==='export-library')exportLibrary().catch(error=>notifySaved(error.message));
 });
 let overlayShown=false;
 new MutationObserver(()=>{const visible=Boolean(document.querySelector('dialog[open],#reel-filter-panel:not([hidden]),#reel-filters .filter-dropdown[open],.reel-more[open],.app-select[data-menu-open],.app-combobox[data-menu-open]'))||!$('library-menu').hidden;if(visible!==overlayShown){overlayShown=visible;window.atlasDesktop.overlay(visible).catch(()=>{});}}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open','hidden','data-menu-open']});
}

function normalizeReelScope(value={}){const scope=emptyReelScope();for(const key of ['topics','batch','status','region'])scope[key]=selectedValues(value[key]);for(const key of ['q','tag','year'])scope[key]=String(value[key]||'');scope.group=Number.isInteger(value.group)&&value.group>=0?value.group:null;return scope;}
function reelScopeActive(scope){return scope.topics.length+scope.batch.length+scope.status.length+scope.region.length+Number(Boolean(scope.q.trim()))+Number(Boolean(scope.tag))+Number(Boolean(scope.year))+Number(scope.group!==null);}
function readReelURL(params){const scope={};for(const [key,name]of [['topics','rtopic'],['batch','rbatch'],['status','rstatus'],['region','rregion']])scope[key]=params.getAll(name);for(const key of ['q','tag','year'])scope[key]=params.get('r'+key)||'';scope.group=params.has('rgroup')&&/^\d+$/.test(params.get('rgroup'))?Number(params.get('rgroup')):null;reelScope=normalizeReelScope(scope);reelDraft=normalizeReelScope(reelScope);}
function writeReelURL(params){for(const [key,name]of [['topics','rtopic'],['batch','rbatch'],['status','rstatus'],['region','rregion']])for(const value of reelScope[key])params.append(name,value);for(const key of ['q','tag','year'])if(reelScope[key])params.set('r'+key,reelScope[key]);if(reelScope.group!==null)params.set('rgroup',reelScope.group);}
function reelLayout(scope){return semantic?.layouts[scope.topics.length===1?scope.topics[0]:'all']||semantic?.layouts.all;}
function matchesReelScope(company,scope,includeGroup=true){return YCControls.matchesFacets(company,scope,{matchesRegion,yearOf:YCInsights.yearOf})&&(!includeGroup||scope.group===null||reelLayout(scope)?.points[company.id]?.[2]===scope.group);}
function closeReelFilterPanel(){window.YCAtlasDropdowns?.closeAll();for(const popup of document.querySelectorAll('#reel-filters details[open]'))popup.open=false;$('reel-filter-panel').hidden=true;$('reel-filter-toggle').setAttribute('aria-expanded','false');}
function applyReelScope(value,replace=false){reelScope=normalizeReelScope(value);reelDraft=normalizeReelScope(reelScope);closeReelFilterPanel();writeURL(replace);render();}
function renderReelDraft(){
 if(!data)return;
 for(const [key,field]of [['topic','topics'],['region','region'],['batch','batch'],['status','status']])reelControls[key]?.set(reelDraft[field]);
 $('reel-tag').value=reelDraft.tag;$('reel-year').value=reelDraft.year;
 const layout=reelLayout(reelDraft),counts=new Map();for(const company of discoveryEngine.companies||[]){if(!matchesReelScope(company,reelDraft,false))continue;const group=layout?.points[company.id]?.[2];if(group!==undefined)counts.set(group,(counts.get(group)||0)+1);}
 $('reel-group').innerHTML='<option value="">Any description group</option>'+(layout?.clusters||[]).map(group=>`<option value="${group.id}" ${counts.get(group.id)||group.id===reelDraft.group?'':'disabled'}>${esc(group.label)} (${fmt(counts.get(group.id)||0)})</option>`).join('');$('reel-group').value=reelDraft.group===null?'':String(reelDraft.group);$('reel-group').disabled=!layout;
 const count=(discoveryEngine.companies||[]).filter(c=>matchesReelScope(c,reelDraft)).length;$('reel-draft-count').textContent=`${fmt(count)} ${count===1?'company':'companies'} with websites`;
}
function renderReelControls(){
 const eligible=(discoveryEngine.companies||[]).filter(c=>matchesReelScope(c,reelScope));
 const canonical={...reelScope};for(const key of ['topics','batch','status','region'])canonical[key]=[...canonical[key]].sort();const key=data.meta.fetchedAt+'/'+JSON.stringify(canonical);
 if(discoveryEngine.setScope(eligible,key)&&reelsView){reelsView.current=null;reelsView.moving=false;}
 const active=reelScopeActive(reelScope),group=reelScope.group===null?'':reelLayout(reelScope)?.clusters.find(g=>g.id===reelScope.group)?.label;
 const labels=[...reelScope.topics.map(id=>topics.find(topic=>topic.id===id)?.name||id),...reelScope.region,...reelScope.batch,...reelScope.status,reelScope.tag,reelScope.year,group,reelScope.q.trim()?`Search: ${reelScope.q}`:''].filter(Boolean);
 $('reel-feed-label').textContent=active?'Filtered':'For you';$('reel-scope-summary').textContent=`${fmt(eligible.length)} companies with websites${active?' / '+labels.slice(0,2).join(' / '):''}`;$('reel-scope-summary').title=labels.join(', ');
 $('reel-filter-toggle').classList.toggle('has-filters',Boolean(active));$('reel-filter-toggle').setAttribute('aria-label',active?`Filters (${active} active)`:'Filters');$('reel-filter-toggle').title=active?`Filters (${active} active)`:'Filters';$('reel-clear-filters').hidden=!active;
 if(reelsView)reelsView.scopeFiltered=Boolean(active);
 if(!$('reel-filter-panel').hidden)renderReelDraft();
}
function mountReelControls(batches,regions,countries,workModes){
 reelControls.topic.mount([{label:'Explore topics',options:topics.map(topic=>({value:topic.id,label:topic.name}))}]);
 reelControls.batch.mount([{label:'YC batches',options:batches}]);reelControls.status.mount([{label:'Company status',options:[...new Set(companies.map(c=>c.status).filter(Boolean))].sort()}]);
 reelControls.region.mount([{label:'Regions',options:regionGroups.filter(group=>regions.some(region=>group.values.includes(region))).map(group=>group.name)},{label:'Countries',options:countries},{label:'Work location',options:workModes.filter(mode=>regions.includes(mode))}]);
 $('reel-tag').innerHTML='<option value="">Any YC tag</option>'+[...new Set(companies.flatMap(company=>company.tags))].sort().map(tag=>`<option>${esc(tag)}</option>`).join('');
 $('reel-year').innerHTML='<option value="">Any year</option>'+[...new Set(companies.map(YCInsights.yearOf).filter(Boolean))].sort((a,b)=>b-a).map(year=>`<option>${year}</option>`).join('');
}
for(const [key,label,field]of [['topic','All topics','topics'],['region','All regions','region'],['batch','All batches','batch'],['status','Any status','status']])reelControls[key]=new YCControls.MultiFilter('reel-'+key,label,values=>{reelDraft=normalizeReelScope({...reelDraft,[field]:values,...(field==='topics'?{group:null}:{})});renderReelDraft();});
$('reel-reset-draft').onclick=()=>{reelDraft=emptyReelScope();renderReelDraft();};
$('reel-filter-toggle').onclick=()=>{if(!$('reel-filter-panel').hidden){closeReelFilterPanel();return;}reelDraft=normalizeReelScope(reelScope);$('reel-filter-panel').hidden=false;$('reel-filter-toggle').setAttribute('aria-expanded','true');renderReelDraft();};
$('reel-cancel-filters').onclick=closeReelFilterPanel;$('reel-apply-filters').onclick=()=>applyReelScope(reelDraft);$('reel-clear-filters').onclick=()=>applyReelScope(emptyReelScope());
for(const [id,field]of [['reel-tag','tag'],['reel-year','year'],['reel-group','group']])$(id).onchange=event=>{reelDraft=normalizeReelScope({...reelDraft,[field]:field==='group'?(event.target.value===''?null:Number(event.target.value)):event.target.value});renderReelDraft();};
document.addEventListener('click',event=>{if(event.target.closest('[data-clear-reel-filters]'))applyReelScope(emptyReelScope());});

window.YCAtlasAssistantContext={
 company:id=>companies.find(c=>c.id===id),selected:()=>state.tab==='chat'?window.YCAtlasAssistantContext.chatCompany:state.tab==='reels'?reelsView?.current?.company:companies.find(c=>c.id===state.company),view:()=>JSON.parse(JSON.stringify({snapshot:data?.meta.fetchedAt,...state,reels:state.tab==='reels'?{feed:reelScopeActive(reelScope)?'filtered':'for-you',filters:reelScope,companyId:reelsView?.current?.company.id,paused:reelsView?.paused,speed:reelsView?.speed,autoNext:reelsView?.autoNext}:undefined})),locate:locateSearchCompany,
 async execute(name,args,cap={}){
  const compact=c=>({id:c.id,name:c.name,summary:c.summary.slice(0,350),batch:c.batch,status:c.status,topics:c.topics,regions:c.regions,reference:`[[company:${c.id}]]`});
  const requireCompany=id=>{if(!Number.isInteger(id))throw new Error('Invalid company ID');const company=companies.find(c=>c.id===id);if(!company)throw new Error('Company not found');return company;};
  if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('Invalid arguments');
  if(['get_catalog','search_companies','get_company','find_similar_companies'].includes(name)&&!cap.search)throw new Error('Search capability disabled');
  if((['get_interests','get_saved_companies'].includes(name)||name==='list_folders'&&!cap.organize)&&!cap.library)throw new Error('Library capability disabled');
  if(['create_folder','save_companies'].includes(name)&&!cap.organize)throw new Error('Organizing capability disabled');
  if(name==='get_catalog')return{topics:topics.map(t=>({id:t.id,name:t.name})),regions:regionGroups.map(g=>g.name),batches:[...new Set(companies.map(c=>c.batch))],statuses:[...new Set(companies.map(c=>c.status))]};
  if(name==='search_companies'){for(const key of ['query','topic','region','batch','status','year'])if(args[key]!==undefined&&(typeof args[key]!=='string'||args[key].length>300))throw new Error('Invalid '+key);const topic=topics.find(t=>t.id===args.topic||t.name.toLowerCase()===args.topic?.toLowerCase())?.id||args.topic||'all',facets={topic,q:args.query||'',batch:args.batch||[],status:args.status||[],region:args.region||[],year:args.year||''};const matched=companies.filter(c=>YCControls.matchesFacets(c,facets,{matchesRegion,yearOf:YCInsights.yearOf})),offset=Math.max(0,Math.min(companies.length,Math.floor(Number(args.offset)||0))),limit=Math.max(1,Math.min(30,Math.floor(Number(args.limit)||15)));return{total:matched.length,offset,next_offset:offset+limit<matched.length?offset+limit:null,companies:matched.slice(offset,offset+limit).map(compact)};}
  if(name==='find_similar_companies'){requireCompany(args.id);const limit=Math.max(1,Math.min(20,Math.floor(Number(args.limit)||8)));return{companies:(semantic?.layouts.all?.neighbors[args.id]||[]).slice(0,limit).map(id=>companies.find(c=>c.id===id)).filter(Boolean).map(compact)};}
  if(name==='get_company'){const c=requireCompany(args.id);return{...compact(c),description:c.description.slice(0,7000),tags:c.tags,location:c.location,website:c.website,yc:`https://www.ycombinator.com/companies/${c.slug}`,similar:(semantic?.layouts.all?.neighbors[c.id]||[]).slice(0,8)};}
  if(name==='get_interests')return{liked_total:discovery.likes.size,saved_total:library.items.size,liked:companies.filter(c=>discovery.likes.has(c.id)).slice(-30).map(compact),saved:[...library.items.values()].filter(r=>companies.some(c=>c.id===r.id)).slice(-25).map(record=>({company:compact(requireCompany(record.id)),folderId:record.folderId,...(cap.notes?{note:record.note.slice(0,700)}:{})})),folders:library.folders};
  if(name==='get_saved_companies'){if(args.folder_id!==undefined&&typeof args.folder_id!=='string')throw new Error('Invalid folder ID');const records=[...library.items.values()].filter(r=>(!args.folder_id||r.folderId===args.folder_id)&&companies.some(c=>c.id===r.id)),offset=Math.max(0,Math.floor(Number(args.offset)||0)),limit=Math.max(1,Math.min(25,Math.floor(Number(args.limit)||15)));return{total:records.length,next_offset:offset+limit<records.length?offset+limit:null,companies:records.slice(offset,offset+limit).map(r=>({...compact(requireCompany(r.id)),folder_id:r.folderId,...(cap.notes?{note:r.note.slice(0,1000)}:{})}))};}
  if(name==='list_folders')return{folders:library.folders.map(f=>({...f,company_ids:[...library.items.values()].filter(r=>r.folderId===f.id).map(r=>r.id)}))};
  if(name==='show_company'){if(!cap.navigate)throw new Error('Navigation capability disabled');const c=requireCompany(args.id);locateSearchCompany(c.id);return{opened:compact(c)};}
  if(name==='create_folder'){if(typeof args.name!=='string')throw new Error('Folder name required');const folder=library.folders.find(f=>f.name.toLowerCase()===args.name.trim().toLowerCase())||library.createFolder(args.name);if(library.storageError)throw new Error('Folder could not be persisted');refreshSaved();return{folder};}
  if(name==='save_companies'){if(!Array.isArray(args.company_ids)||args.company_ids.length>100||!args.company_ids.length)throw new Error('Provide 1–100 company IDs');args.company_ids.forEach(requireCompany);if(!library.folder(args.folder_id))throw new Error('Folder not found');for(const id of new Set(args.company_ids))library.save(id,args.folder_id);if(args.move_existing===true)library.move(args.company_ids,args.folder_id);if(library.storageError)throw new Error('Changes could not be persisted');refreshSaved();return{saved:args.company_ids.map(id=>({id,folder_id:library.record(id).folderId})),folder:library.folder(args.folder_id)};}
  throw new Error('Unknown Atlas tool');
 }
};
$('retry').onclick=load;readURL();load();

