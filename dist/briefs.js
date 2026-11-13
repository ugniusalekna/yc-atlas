'use strict';
// Company research briefs: a button beside company details and a one-screen dialog.
// Research runs in the main process with the Chat engine; Reels asks it to preload the next two companies.
globalThis.YCBriefs=(()=>{
 const states=new Map(),asked=new Set(),preferenceKey='yc-atlas-brief-preload';
 let lookup=()=>null,openId=null,preloading=true;
 try{preloading=localStorage.getItem(preferenceKey)!=='off';}catch{}
 const desktop=()=>window.atlasDesktop?.requestBrief?window.atlasDesktop:null;
 const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const safeURL=value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}};
 const sparkle='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>';
 const stateText={ready:'Ready',loading:'Researching…',queued:'Queued',error:'Retry',idle:'On demand'};
 const dialog=()=>document.getElementById('brief-dialog');

 function button(company){
  if(!desktop()||!company)return'';
  if(!states.has(company.id)&&!asked.has(company.id)){asked.add(company.id);queueMicrotask(()=>desktop().companyBrief(company.id).then(apply).catch(()=>{}));}
  const state=states.get(company.id)?.state||'idle';
  return `<button type="button" class="brief-button" data-brief="${escape(company.id)}" data-state="${state}" aria-haspopup="dialog">${sparkle}<span class="brief-button-label">Research brief</span><span class="brief-button-state">${stateText[state]}</span></button>`;
 }
 function refreshButtons(id){const state=states.get(id)?.state||'idle';for(const node of document.querySelectorAll('[data-brief]')){if(Number(node.dataset.brief)!==id)continue;node.dataset.state=state;const label=node.querySelector('.brief-button-state');if(label)label.textContent=stateText[state];}}
 function apply(status){if(!status?.companyId)return;states.set(status.companyId,status);refreshButtons(status.companyId);if(openId===status.companyId)render();}

 function markdown(source){
  if(!window.marked||!window.DOMPurify)return`<p>${escape(source)}</p>`;
  const html=window.DOMPurify.sanitize(window.marked.parse(source,{breaks:true}),{FORBID_TAGS:['img','video','audio','iframe','style','form','input','button','script'],FORBID_ATTR:['style']});
  const template=document.createElement('template');template.innerHTML=html;
  for(const link of template.content.querySelectorAll('a')){const href=safeURL(link.getAttribute('href'));if(!href){link.replaceWith(...link.childNodes);continue;}link.href=href;link.target='_blank';link.rel='noopener noreferrer';link.title=href;}
  // The model tags inferred claims with [inferred]; show it as a label. Linked claims are sourced.
  const walker=document.createTreeWalker(template.content,NodeFilter.SHOW_TEXT),texts=[];while(walker.nextNode())if(/\[inferred\]/i.test(walker.currentNode.nodeValue))texts.push(walker.currentNode);
  for(const node of texts){const parts=node.nodeValue.split(/\[inferred\]/i),fragment=document.createDocumentFragment();parts.forEach((part,index)=>{if(index){const tag=document.createElement('span');tag.className='brief-tag';tag.textContent='inferred';fragment.append(tag);}if(part)fragment.append(part);});node.replaceWith(fragment);}
  // Bold section labels on their own line become headings.
  for(const p of template.content.querySelectorAll('p')){const strong=p.firstElementChild;if(strong?.tagName==='STRONG'&&p.textContent.trim()===strong.textContent.trim()){const heading=document.createElement('h3');heading.textContent=strong.textContent.replace(/:\s*$/,'');p.replaceWith(heading);}}
  for(const p of template.content.querySelectorAll('p')){if(/^\s*Sources:/i.test(p.textContent))p.className='brief-sources';}
  return template.innerHTML;
 }
 function render(){
  const node=dialog(),company=lookup(openId);if(!node||!company)return;const status=states.get(openId)||{state:'idle'},brief=status.brief;
  const website=safeURL(company.website);
  node.querySelector('#brief-title').textContent=company.name;
  node.querySelector('#brief-subtitle').innerHTML=[escape(company.batch),website?`<a href="${escape(website)}" target="_blank" rel="noopener noreferrer">${escape(new URL(website).hostname.replace(/^www\./,''))}</a>`:'',`<a href="https://www.ycombinator.com/companies/${encodeURIComponent(company.slug)}" target="_blank" rel="noopener noreferrer">YC profile</a>`].filter(Boolean).join(' · ');
  const body=node.querySelector('#brief-body'),footer=node.querySelector('#brief-meta'),regenerate=node.querySelector('#brief-regenerate');
  body.setAttribute('aria-busy',String(['loading','queued'].includes(status.state)));
  if(status.state==='ready'&&brief){body.innerHTML=markdown(brief.markdown);footer.textContent=`Researched ${new Date(brief.createdAt).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}${brief.model?' with '+brief.model:''}. Linked claims are sourced; “inferred” marks the model’s own reading. Check before relying on it.`;regenerate.hidden=false;regenerate.disabled=false;}
  else if(status.state==='loading'||status.state==='queued'){body.innerHTML=`<div class="brief-progress" role="status"><span class="brief-spinner" aria-hidden="true"></span><div><strong>${status.state==='queued'?'Waiting for another brief to finish…':'Researching on the web…'}</strong><p>This usually takes one to three minutes. You can close this window; research continues and the brief is saved.</p></div></div>`;footer.textContent='';regenerate.hidden=true;}
  else if(status.state==='error'){body.innerHTML=`<div class="brief-problem" role="alert"><p>${escape(status.error)}</p><button type="button" class="quiet-button" data-brief-generate>Try again</button></div>`;footer.textContent='';regenerate.hidden=true;}
  else{body.innerHTML=`<div class="brief-empty"><p>A one-screen, plain-language brief: what ${escape(company.name)} does and how, the founders, money, how they get customers, and anything notable. Researched on the web with your Chat account, so it uses model credits.</p><button type="button" class="primary-button" data-brief-generate>Research ${escape(company.name)}</button></div>`;footer.textContent='';regenerate.hidden=true;}
 }
 async function generate(id,refresh=false){if(!desktop())return;states.set(id,{companyId:id,state:'loading'});refreshButtons(id);if(openId===id)render();try{apply(await desktop().requestBrief({companyId:id,refresh}));}catch(error){apply({companyId:id,state:'error',error:error.message});}}
 async function open(id){
  const node=dialog(),company=lookup(id);if(!node||!company)return;openId=id;render();if(!node.open)node.showModal();
  try{const status=await desktop().companyBrief(id);apply(status);if(status.state==='idle')generate(id);}catch(error){apply({companyId:id,state:'error',error:error.message});}
 }
 function preload(ids){if(!preloading||!desktop())return;desktop().preloadBriefs(ids.filter(Boolean).slice(0,2)).then(list=>list.forEach(apply)).catch(()=>{});}
 function setPreloading(value){preloading=Boolean(value);try{localStorage.setItem(preferenceKey,preloading?'on':'off');}catch{}if(!preloading&&desktop())desktop().preloadBriefs([]).then(list=>list.forEach(apply)).catch(()=>{});}
 let initialized=false;
 function init(options){
  lookup=options.lookup;const node=dialog();if(initialized||!node||!desktop())return;initialized=true;
  document.addEventListener('click',event=>{const trigger=event.target.closest('[data-brief]');if(trigger){event.preventDefault();open(Number(trigger.dataset.brief));}});
  node.addEventListener('click',event=>{if(event.target===node||event.target.closest('#brief-close'))node.close();if(event.target.closest('[data-brief-generate]')&&openId)generate(openId);if(event.target.closest('#brief-regenerate')&&openId)generate(openId,true);});
  node.addEventListener('close',()=>{openId=null;});
  window.atlasDesktop.onEvent(event=>{if(event.type==='brief-status')apply(event);});
 }
 return Object.freeze({button,open,preload,init,setPreloading,get preloading(){return preloading;}});
})();
