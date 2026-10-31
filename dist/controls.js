'use strict';
globalThis.YCControls=(()=>{
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const values=v=>[...new Set((Array.isArray(v)?v:v?[v]:[]).filter(Boolean))];
 class MultiFilter{
  constructor(key,label,onChange){this.key=key;this.label=label;this.root=document.getElementById(key+'-filter');this.summary=this.root.querySelector('summary');this.body=this.root.querySelector('.filter-options');this.onChange=onChange;this.body.addEventListener('change',e=>{if(e.target.matches('input[type="checkbox"]'))onChange([...this.body.querySelectorAll('input:checked')].map(input=>input.value));});this.root.addEventListener('toggle',()=>{if(this.root.open){window.YCAtlasDropdowns?.closeAll();const search=this.body.querySelector('.filter-search');if(search){search.value='';this.filter('');}window.YCAtlasDropdowns?.place(this.body,this.summary);}});this.body.addEventListener('input',e=>{if(e.target.classList.contains('filter-search'))this.filter(e.target.value);});this.root.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.root.open){e.preventDefault();e.stopPropagation();this.root.open=false;this.summary.focus();}});document.addEventListener('scroll',e=>{if(this.root.open&&!this.body.contains(e.target))this.root.open=false;},true);window.addEventListener('resize',()=>{this.root.open=false;});}
  filter(query){for(const label of this.body.querySelectorAll('label'))label.hidden=!label.textContent.toLocaleLowerCase().includes(query.toLocaleLowerCase());for(const group of this.body.querySelectorAll('fieldset'))group.hidden=![...group.querySelectorAll('label')].some(label=>!label.hidden);const empty=this.body.querySelector('.filter-empty');if(empty)empty.hidden=[...this.body.querySelectorAll('label')].some(label=>!label.hidden);}
  mount(groups){this.body.innerHTML=(groups.reduce((n,g)=>n+g.options.length,0)>8?`<input class="filter-search" type="search" placeholder="Search…" aria-label="Search ${escape(this.label)}">`:'')+groups.map(group=>`<fieldset><legend>${escape(group.label)}</legend>${group.options.map(option=>`<label><input type="checkbox" data-filter="${this.key}" value="${escape(option.value??option)}"><span>${escape(option.label??option)}</span></label>`).join('')}</fieldset>`).join('')+'<p class="filter-empty app-options-empty" hidden>No matching options</p>';}
  set(selected){selected=values(selected);const labels=new Map();for(const input of this.body.querySelectorAll('input[type="checkbox"]')){input.checked=selected.includes(input.value);labels.set(input.value,input.closest('label').querySelector('span').textContent);}const display=selected.map(value=>labels.get(value)||value);let caption=this.summary.querySelector('.filter-caption');if(!caption){caption=document.createElement('span');caption.className='filter-caption';this.summary.replaceChildren(caption);}caption.textContent=selected.length===0?this.label:selected.length<=2?display.join(', '):`${selected.length} selected`;this.summary.title=selected.length?display.join(', '):this.label;this.summary.setAttribute('aria-label',`${this.label}: ${selected.length?display.join(', '):'no restriction'}`);}
 }
 function matchesFacets(c,filters,{includeTopic=true,matchesRegion=(company,region)=>company.regions.includes(region),yearOf=company=>Number(company.batch?.match(/20\d{2}/)?.[0]),searchText=c.search}={}){
  const topics=filters.topics||(filters.topic&&filters.topic!=='all'?[filters.topic]:[]);
  if(includeTopic&&topics.length&&!topics.some(topic=>c.topics.includes(topic)))return false;
  for(const key of ['batch','status']){const selected=values(filters[key]);if(selected.length&&!selected.includes(c[key]))return false;}
  const regions=values(filters.region);if(regions.length&&!regions.some(region=>matchesRegion(c,region)))return false;
  if(filters.tag&&!c.tags.includes(filters.tag))return false;
  if(filters.year&&String(yearOf(c))!==String(filters.year))return false;
  if(filters.q){const text=String(searchText||[c.name,c.summary,c.description,c.location,c.industry,...c.tags].join(' ')).toLowerCase();if(!filters.q.toLowerCase().trim().split(/\s+/).every(word=>text.includes(word)))return false;}
  return true;
 }
 return Object.freeze({MultiFilter,values,matchesFacets});
})();
