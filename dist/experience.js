'use strict';
// Renderer-only interaction polish. Company data, chats and authentication retain their existing owners.
(() => {
 const $ = id => document.getElementById(id);
 const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
 const animations = new WeakMap();
 function reveal(node, travel = false) {
  if (!node || reduced() || !node.animate) return;
  const previous = animations.get(node);
  const style = previous?.playState === 'running' ? getComputedStyle(node) : null;
  const from = {opacity: style?.opacity || 0, transform: style?.transform || (travel ? 'translateY(5px)' : 'none')};
  previous?.cancel?.();
  const animation = node.animate([
   from,
   {opacity: 1, transform: travel ? 'translateY(0)' : 'none'},
  ], {duration: travel ? 180 : 140, easing: 'cubic-bezier(.22,.68,.2,1)'});
  animations.set(node, animation);
 }
 // Keep list mutations synchronous; animate only the visual change between keyed rows.
 const departures = new WeakMap();
 function play(node, frames, duration = 180) {
  if (!node || reduced() || !node.animate) return null;
  animations.get(node)?.cancel?.();
  const animation = node.animate(frames, {duration, easing:'cubic-bezier(.22,.68,.2,1)'});
  animations.set(node, animation); return animation;
 }
 function listTransition(host, update, keyFor) {
  if (!host || reduced() || !host.animate || host.closest('[hidden],[inert]')) return update();
  const clip = {left:0, top:0, right:innerWidth, bottom:innerHeight};
  for (let parent=host;parent;parent=parent.parentElement) {
   const rect=parent.getBoundingClientRect();if(!rect.width||!rect.height)continue;
   const style=getComputedStyle(parent);
   if (/auto|scroll|hidden|clip/.test(style.overflowY||style.overflow)) {clip.top=Math.max(clip.top,rect.top);clip.bottom=Math.min(clip.bottom,rect.bottom);}
   if (/auto|scroll|hidden|clip/.test(style.overflowX||style.overflow)) {clip.left=Math.max(clip.left,rect.left);clip.right=Math.min(clip.right,rect.right);}
  }
  const before = new Map([...host.children].map(node => [keyFor(node), {node, rect:node.getBoundingClientRect(), text:node.textContent}]).filter(([key]) => key));
  const scroll = host.scrollTop, result = update(); host.scrollTop = scroll;
  if (!before.size) return result;
  let ghosts = departures.get(host); if (!ghosts) {ghosts = new Map(); departures.set(host, ghosts);}
  for (const node of host.children) {
   const key = keyFor(node); if (!key) continue;
   const departure = ghosts.get(key); if (departure) {departure.animation?.cancel?.(); departure.finish();}
   const rect = node.getBoundingClientRect(), prior = before.get(key); before.delete(key);
   if (!rect.width || !rect.height) continue;
   if (!prior) play(node, [{opacity:0, transform:'translateY(4px)'},{opacity:1, transform:'translateY(0)'}]);
   else if (prior.rect.width && prior.rect.height) {
    const dx = prior.rect.left - rect.left, dy = prior.rect.top - rect.top;
    if (Math.abs(dx) > 80 || Math.abs(dy) > 80) play(node, [{opacity:.75,transform:`translateY(${Math.sign(dy)*6}px)`},{opacity:1,transform:'translateY(0)'}], 180);
    else if (Math.abs(dx) > .5 || Math.abs(dy) > .5) play(node, [{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}], 200);
    else if (prior.text !== node.textContent) play(node, [{opacity:.72},{opacity:1}], 140);
   }
  }
  for (const [key, prior] of before) {
   if (!prior.rect.width || !prior.rect.height) continue;
   if(prior.rect.bottom<=clip.top||prior.rect.top>=clip.bottom||prior.rect.right<=clip.left||prior.rect.left>=clip.right)continue;
   const old = ghosts.get(key); if (old) {old.animation?.cancel?.(); old.finish();}
   const ghost = prior.node.cloneNode(true);
   // Departing copies are decorative and must never match live application selectors.
   for (const node of [ghost, ...ghost.querySelectorAll('*')]) {
    for (const attr of [...node.attributes]) if (attr.name === 'id' || attr.name.startsWith('data-')) node.removeAttribute(attr.name);
    if (node.matches('button,a,input,summary,[tabindex]')) node.tabIndex = -1;
    if (node.tagName === 'DETAILS') node.open = false;
   }
   ghost.classList.add('atlas-row-ghost'); ghost.inert = true; ghost.setAttribute('aria-hidden','true');
   Object.assign(ghost.style, {position:'fixed', left:prior.rect.left+'px', top:prior.rect.top+'px', width:prior.rect.width+'px', height:prior.rect.height+'px', margin:'0', pointerEvents:'none', zIndex:'4'});
   ghost.style.clipPath=`inset(${Math.max(0,clip.top-prior.rect.top)}px ${Math.max(0,prior.rect.right-clip.right)}px ${Math.max(0,prior.rect.bottom-clip.bottom)}px ${Math.max(0,clip.left-prior.rect.left)}px)`;
   document.body.append(ghost);
   const record = {node:ghost, animation:null, finish:()=>{clearTimeout(record.timer);ghost.remove();if(ghosts.get(key)===record)ghosts.delete(key);}};
   ghosts.set(key, record); record.timer = setTimeout(record.finish, 220);
   record.animation = play(ghost, [{opacity:.8,transform:'translateX(0)'},{opacity:0,transform:'translateX(-5px)'}], 140);
   record.animation?.finished?.then(record.finish, record.finish);
  }
  return result;
 }
 function feedback(control) {
  if (!control || control.matches(':disabled,[aria-disabled="true"]')) return;
  const icon = control.querySelector('svg') || control;
  const selected = control.getAttribute('aria-pressed') === 'true';
  play(icon, selected ? [{transform:'scale(.9)'},{transform:'scale(1.1)',offset:.6},{transform:'scale(1)'}] : [{transform:'scale(.9)'},{transform:'scale(1)'}], selected ? 220 : 160);
 }
 // Resolve controls again after an action, since Like/Save can replace their DOM nodes.
 document.addEventListener('click', event => {
  const control = event.target.closest('button,summary,a');
  if (!control || control.matches(':disabled,[aria-disabled="true"]') || (!control.querySelector('svg') && !control.matches('.folder-menu-button,.row-menu-button,.toolbar-menu>summary,.chat-actions>summary,.reel-more>summary,.zoom-controls button'))) return;
  const id = control.id, like = control.dataset.like, action = control.dataset.reelAction;
  const scope = control.closest('#reel-content') ? $('reel-content') : control.closest('#inspector-content') ? $('inspector-content') : document;
  queueMicrotask(() => {
   const current = id ? $(id) : like ? scope.querySelector(`[data-like="${like}"]`) : action ? scope.querySelector(`[data-reel-action="${action}"]`) : control.isConnected ? control : null;
   feedback(current);
  });
 }, true);
 window.YCAtlasExperience = Object.freeze({reveal, listTransition, feedback});
 let previousTab = null;
 window.addEventListener('atlas-view', event => {
  const tab = event.detail.tab;
  const workspace = tab === 'explore' && document.querySelector('.workbench').classList.contains('saved-mode') ? 'saved' : tab;
  if (previousTab && workspace !== previousTab) {
   const node = tab === 'reels' ? document.querySelector('.reel-side') : tab === 'chat' ? document.querySelector('.chat-main') : $('stage');
   reveal(node);
  }
  previousTab = workspace;
 });
 // Anchor overflow menus to their trigger, including near the bottom of a sidebar.
 const menuSelector = '.toolbar-menu,.chat-actions,.reel-more,.filter-dropdown,.map-settings';
 document.addEventListener('toggle', event => {
  const menu = event.target;
  if (!menu.matches?.('.toolbar-menu,.chat-actions,.reel-more') || !menu.open) return;
  const panel = menu.querySelector(':scope > div');
  if (panel) {
   panel.style.position = 'fixed'; panel.style.right = 'auto';
   window.YCAtlasDropdowns?.place(panel, menu.querySelector('summary'));
  }
 }, true);
 document.addEventListener('click', event => {
  for (const menu of document.querySelectorAll(menuSelector.split(',').map(s => s + '[open]').join(','))) {
   if (!menu.contains(event.target)) menu.open = false;
  }
  if (event.target.closest('.toolbar-menu .menu-panel button,.chat-actions [data-chat-action]')) event.target.closest('details').open = false;
 });
 window.addEventListener('atlas-view-before-render', () => {
  for (const menu of document.querySelectorAll('.toolbar-menu[open],.chat-actions[open],.reel-more[open]')) menu.open = false;
 });
 // Native dialogs already manage their focus; retain a fallback for programmatically opened sheets.
 const origins = new WeakMap();
 let lastTrigger = null;
 document.addEventListener('click', event => {
  const trigger = event.target.closest('button,summary,a');
  if (trigger) lastTrigger = trigger;
 }, true);
 document.addEventListener('beforetoggle', event => {
  if (event.target.tagName === 'DIALOG' && event.newState === 'open') origins.set(event.target, document.activeElement);
 }, true);
 function restoreDialogFocus(dialog) {
  const origin = origins.get(dialog); origins.delete(dialog);
  const skip = dialog.dataset.skipFocusRestore === 'true'; delete dialog.dataset.skipFocusRestore;
  if (!skip && origin?.isConnected && (document.activeElement === document.body || dialog.contains(document.activeElement))) origin.focus({preventScroll: true});
 }
 document.addEventListener('close', event => {
  if (event.target.tagName === 'DIALOG') { window.YCAtlasDropdowns?.closeAll(); restoreDialogFocus(event.target); }
 }, true);
 new MutationObserver(records => {
  for (const record of records) {
   const dialog = record.target;
   if (dialog.tagName !== 'DIALOG') continue;
   if (dialog.open && !origins.has(dialog)) origins.set(dialog, lastTrigger?.isConnected ? lastTrigger : document.activeElement);
   else if (!dialog.open && origins.has(dialog)) restoreDialogFocus(dialog);
  }
 }).observe(document.body, {subtree: true, attributes: true, attributeFilter: ['open']});
 document.addEventListener('click', event => {
  const dialog = event.target;
  if (dialog.tagName !== 'DIALOG' || !dialog.open || dialog.id === 'codex-request-dialog') return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
 });
 // Search Atlas: one keyboard path to company locations, conversations and application actions.
 const dialog = $('command-palette'), input = $('command-query'), list = $('command-results');
 const mod = window.atlasDesktop?.platform === 'darwin' || /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';
 $('command-launch').querySelector('kbd').textContent = mod + 'K';
 $('command-launch').title = 'Search Atlas (' + mod + 'K)';
 $('assistant-new').title = 'New chat (' + mod + 'N)';
 $('chat-new-inline').title = 'New chat (' + mod + 'N)';
 $('chat-sidebar-toggle').title = 'Toggle conversation sidebar';
 const normal = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
 const navigate = id => $(id)?.click();
 const actions = [
  {label: 'New chat', detail: 'Start a conversation', key: mod + 'N', run: () => window.YCAtlasChat?.newChat()},
  ...[['Explore','explore',1],['Reels','reels',2],['Chat','chat',6],['Summary','summary',3],['Saved companies','saved',4],['Liked companies','liked',5]].map(([label, tab, key]) => ({label, detail: 'Go to ' + label, key: mod + key, run: () => navigate(tab + '-nav')})),
  {label: 'New folder', detail: 'Organize saved companies', run: () => {navigate('saved-nav'); navigate('new-folder');}},
  {label: 'Chat settings', detail: 'Account and capabilities', run: () => navigate('assistant-settings-button')},
  {label: 'API usage', detail: 'Tokens and estimated cost', run: () => navigate('assistant-usage-button')},
  {label: 'Update snapshot', detail: 'Refresh the YC directory', run: () => navigate('refresh-snapshot')},
 ];
 let items = [], active = 0, directory = null, index = [];
 function companyMatches(query) {
  const companies = window.YCAtlasNavigation?.companies() || [];
  if (directory !== companies) {
   directory = companies;
   index = companies.map(company => ({company, name: normal(company.name), text: normal([company.name,company.summary,company.batch,company.location,...company.tags].join(' '))}));
  }
  const words = query.split(/\s+/).filter(Boolean);
  return index.filter(item => words.every(word => item.text.includes(word))).map(item => ({...item, rank: item.name === query ? 100 : item.name.startsWith(query) ? 70 : item.name.includes(query) ? 40 : 0})).sort((a,b) => b.rank-a.rank || a.company.name.localeCompare(b.company.name)).slice(0,8).map(({company}) => ({group:'Companies', label:company.name, detail:[company.batch,company.summary].filter(Boolean).join(' · '), logo:company.logo, run:()=>window.YCAtlasNavigation.locate(company.id)}));
 }
 function highlight() {
  for (const [i,node] of [...list.querySelectorAll('[role="option"]')].entries()) {
   node.classList.toggle('is-active', i === active); node.setAttribute('aria-selected', String(i === active));
  }
  const node = list.querySelector('.is-active');
  if (node) {
   input.setAttribute('aria-activedescendant', node.id);
   if (node.offsetTop < list.scrollTop) list.scrollTop = node.offsetTop;
   else if (node.offsetTop + node.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = node.offsetTop + node.offsetHeight - list.clientHeight;
  } else input.removeAttribute('aria-activedescendant');
 }
 function renderCommands() {
  const query = normal(input.value.trim());
  const chats = (window.YCAtlasChat?.list() || []).sort((a,b) => Number(Boolean(b.pinned))-Number(Boolean(a.pinned)) || b.updatedAt-a.updatedAt).filter(chat => !query || normal(chat.title).includes(query)).slice(0, query ? 5 : 3).map(chat => ({group:query?'Conversations':chat.pinned?'Pinned conversations':'Recent conversations', label:chat.title, detail:chat.pinned?'Pinned conversation':'Open conversation', run:()=>window.YCAtlasChat.open(chat.id)}));
  const matched = actions.filter(action => !query || normal(action.label + ' ' + action.detail).includes(query)).slice(0, query ? 8 : 7).map(action => ({group:'Actions', ...action}));
  const exact = query ? matched.filter(item => normal(item.label) === query) : [];
  items = query ? [...exact, ...companyMatches(query), ...chats, ...matched.filter(item => !exact.includes(item))] : [...chats, ...matched];
  active = 0; list.replaceChildren(); let group = '';
  items.forEach((item,i) => {
   if (group !== item.group) {
    const heading = document.createElement('div'); heading.className = 'command-group'; heading.setAttribute('role','presentation'); heading.textContent = item.group; list.append(heading); group = item.group;
   }
   const button = document.createElement('button'); button.type='button'; button.className='command-result'; button.tabIndex=-1; button.id='command-option-'+i; button.dataset.commandIndex=String(i); button.setAttribute('role','option');
   const icon = document.createElement('span'); icon.className='command-result-icon'; icon.setAttribute('aria-hidden','true'); icon.textContent=item.group==='Companies'?item.label.slice(0,1):item.group==='Actions'?'↗':'↳';
   if (item.logo && /^https?:\/\//.test(item.logo)) { const image=document.createElement('img'); image.src=item.logo; image.alt=''; image.loading='lazy'; image.onerror=()=>{icon.textContent=item.label.slice(0,1);}; icon.replaceChildren(image); }
   const copy=document.createElement('span');copy.className='command-result-copy';const title=document.createElement('strong'),detail=document.createElement('small');title.textContent=item.label;detail.textContent=item.detail;copy.append(title,detail);button.append(icon,copy);
   if(item.key){const key=document.createElement('kbd');key.textContent=item.key;button.append(key);}
   list.append(button);
  });
  $('command-empty').hidden=items.length>0;list.scrollTop=0;highlight();
 }
 function openPalette() {
  const other=document.querySelector('dialog[open]');if(other&&other!==dialog)return;
  if(!dialog.open){input.value='';renderCommands();dialog.showModal();}input.focus();
 }
 function run(index) { const item=items[index];if(!item)return;dialog.dataset.skipFocusRestore='true';dialog.close();item.run(); }
 $('command-launch').onclick=openPalette;$('command-close').onclick=()=>dialog.close();
 input.addEventListener('input',renderCommands);
 input.addEventListener('keydown',event=>{
  if(event.isComposing)return;
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
   event.preventDefault();if(!items.length)return;
   active=event.key==='Home'?0:event.key==='End'?items.length-1:(active+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;highlight();
  }else if(event.key==='Enter'){event.preventDefault();run(active);}
 });
 list.addEventListener('mousedown',event=>event.preventDefault());
 list.addEventListener('mousemove',event=>{const button=event.target.closest('[data-command-index]');if(button){active=Number(button.dataset.commandIndex);highlight();}});
 list.addEventListener('click',event=>{const button=event.target.closest('[data-command-index]');if(button)run(Number(button.dataset.commandIndex));});
 document.addEventListener('keydown',event=>{
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();event.stopImmediatePropagation();openPalette();return;}
  if((event.metaKey||event.ctrlKey)&&event.shiftKey&&event.key.toLowerCase()==='o'&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopImmediatePropagation();window.YCAtlasChat?.newChat();return;}
  if(event.key!=='Escape')return;
  const menus=[...document.querySelectorAll(menuSelector.split(',').map(s=>s+'[open]').join(','))];
  if(menus.length){event.preventDefault();event.stopImmediatePropagation();menus.forEach(menu=>menu.open=false);menus[0].querySelector('summary')?.focus();}
  else if(dialog.open){event.preventDefault();event.stopImmediatePropagation();dialog.close();}
 },true);
 window.atlasDesktop?.onEvent(event=>{if(event.type==='command-palette')openPalette();if(event.type==='new-chat'&&!document.querySelector('dialog[open]'))window.YCAtlasChat?.newChat();});
})();
