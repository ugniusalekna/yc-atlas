'use strict';
globalThis.YCControls=(()=>{
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const values=v=>[...new Set((Array.isArray(v)?v:v?[v]:[]).filter(Boolean))];
 class MultiFilter{
  constructor(key,label,onChange){this.key=key;this.label=label;this.root=document.getElementById(key+'-filter');this.summary=this.root.querySelector('summary');this.body=this.root.querySelector('.filter-options');this.onChange=onChange;this.body.addEventListener('change',e=>{if(e.target.matches('input[type="checkbox"]'))onChange([...this.body.querySelectorAll('input:checked')].map(input=>input.value));});}
  mount(groups){this.body.innerHTML=groups.map(group=>`<fieldset><legend>${escape(group.label)}</legend>${group.options.map(option=>`<label><input type="checkbox" data-filter="${this.key}" value="${escape(option.value??option)}"><span>${escape(option.label??option)}</span></label>`).join('')}</fieldset>`).join('');}
  set(selected){selected=values(selected);const labels=new Map();for(const input of this.body.querySelectorAll('input')){input.checked=selected.includes(input.value);labels.set(input.value,input.closest('label').querySelector('span').textContent);}const display=selected.map(value=>labels.get(value)||value);this.summary.textContent=selected.length===0?this.label:selected.length<=2?display.join(', '):`${selected.length} selected`;this.summary.title=selected.length?display.join(', '):this.label;this.summary.setAttribute('aria-label',`${this.label}: ${selected.length?display.join(', '):'no restriction'}`);}
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
