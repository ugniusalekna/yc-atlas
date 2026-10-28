'use strict';
// All signals are calculated from the directory snapshot; no external popularity score is implied.
globalThis.YCInsights = (() => {
 const unusualApproaches = [
  {id:30923, reason:'Grows biological neural networks as a substrate for training machine-learning models.'},
  {id:33607, reason:'Combines nuclear power delivery ships with floating data-center barges.'},
  {id:29733, reason:'Engineers microbes to extract metals from ores that are difficult to process conventionally.'},
  {id:25262, reason:'Proposes refining asteroid material in space and returning the valuable fraction.'},
  {id:30224, reason:'Designs fusion reactors for marine environments rather than conventional electricity grids.'},
  {id:26675, reason:'Uses engineered enzymes to break plastics into reusable chemical building blocks.'},
  {id:35392, reason:'Develops a wearable brain-computer interface for controlling computers.'},
  {id:31294, reason:'Builds reentry vehicles to bring space-manufactured materials back to Earth.'},
 ];
 const yearOf = c => Number(c.batch?.match(/\b20\d{2}\b/)?.[0]) || null;
 function countTags(rows) {
  const counts = new Map();
  rows.forEach(c=>new Set(c.tags).forEach(tag=>counts.set(tag,(counts.get(tag)||0)+1)));
  return counts;
 }
 function summarize(allCompanies, scopedCompanies, snapshotYear, selection={}) {
  const yearCounts = new Map();
  allCompanies.forEach(c=>{const y=yearOf(c);if(y&&y<=snapshotYear)yearCounts.set(y,(yearCounts.get(y)||0)+1);});
  const years=[...yearCounts.keys()].sort((a,b)=>b-a);
  const defaults=[...yearCounts].filter(([,count])=>count>=50).map(([year])=>year).sort((a,b)=>b-a);
  const currentYear=years.includes(Number(selection.current))?Number(selection.current):defaults[0]??years[0]??null;
  let previousYear=years.includes(Number(selection.previous))?Number(selection.previous):defaults.find(y=>y!==currentYear)??years.find(y=>y!==currentYear)??null;
  if(previousYear===currentYear)previousYear=years.find(y=>y!==currentYear)??null;
  const current=scopedCompanies.filter(c=>yearOf(c)===currentYear);
  const previous=scopedCompanies.filter(c=>yearOf(c)===previousYear);
  const currentTagged=current.filter(c=>c.tags.length),previousTagged=previous.filter(c=>c.tags.length);
  const currentCounts=countTags(current),previousCounts=countTags(previous);
  const comparable=currentTagged.length>0&&previousTagged.length>0;
  const signals=[...new Set([...currentCounts.keys(),...previousCounts.keys()])].map(tag=>{
   const currentCount=currentCounts.get(tag)||0,previousCount=previousCounts.get(tag)||0;
   const currentShare=currentTagged.length?100*currentCount/currentTagged.length:0;
   const previousShare=previousTagged.length?100*previousCount/previousTagged.length:0;
   return {tag,currentCount,previousCount,currentShare,previousShare,change:currentShare-previousShare};
  });
  const minimum=Math.max(3,Math.ceil(currentTagged.length*.005));
  const rising=comparable?signals.filter(s=>s.currentCount>=minimum&&s.change>0).sort((a,b)=>b.change-a.change||b.currentCount-a.currentCount).slice(0,6):[];
  const falling=comparable?signals.filter(s=>s.previousCount>=3&&s.change<0).sort((a,b)=>a.change-b.change).slice(0,3):[];
  const dominant=signals.filter(s=>s.currentCount>0).sort((a,b)=>b.currentCount-a.currentCount||a.tag.localeCompare(b.tag))[0]||null;
  const allTagCounts=countTags(allCompanies);
  const scopeIds=new Set(scopedCompanies.map(c=>c.id));
  const unusual=unusualApproaches.filter(p=>scopeIds.has(p.id)).map(p=>{
   const company=allCompanies.find(c=>c.id===p.id);
   const rareTag=[...company.tags].sort((a,b)=>(allTagCounts.get(a)||0)-(allTagCounts.get(b)||0))[0];
   return {...p,company,rareTag,rareTagCount:rareTag?allTagCounts.get(rareTag):null};
  });
  return {years,currentYear,previousYear,currentTotal:current.length,previousTotal:previous.length,currentTagged:currentTagged.length,previousTagged:previousTagged.length,comparable,smallSample:Math.min(currentTagged.length,previousTagged.length)<30,rising,falling,dominant,unusual,total:scopedCompanies.length};
 }
 return Object.freeze({summarize,yearOf});
})();
