'use strict';
globalThis.YCDiscovery=(()=>{
 class Store{
  constructor(storage){this.storage=storage;this.revision=0;this.likes=new Map();this.seen=new Map();try{const value=JSON.parse(storage?.getItem('yc-atlas-discovery')||'{}');for(const [id,date]of value.likes||[])if(Number.isInteger(id)&&id>0)this.likes.set(id,Number(date)||0);for(const [id,date]of value.seen||[])if(Number.isInteger(id))this.seen.set(id,Number(date)||0);}catch{}}
  persist(){try{this.storage?.setItem('yc-atlas-discovery',JSON.stringify({version:1,likes:[...this.likes],seen:[...this.seen].slice(-1000)}));}catch{}}
  toggle(id){this.revision++;if(this.likes.has(id))this.likes.delete(id);else this.likes.set(id,Date.now());this.persist();return this.likes.has(id);}
  viewed(id){this.seen.delete(id);this.seen.set(id,Date.now());this.persist();}
 }
 class Engine{
  constructor(store,random=Math.random){this.store=store;this.random=random;this.history=[];this.index=-1;this.scopeKey=null;this.scopeCompanies=null;}
  setData(companies,semantic){this.pending=null;this.scopeKey=null;this.scopeCompanies=null;this.companies=companies.filter(c=>/^https?:\/\//.test(c.website));this.semantic=semantic;this.byId=new Map(companies.map(c=>[c.id,c]));const current=this.history[this.index]?.company.id;this.history=this.history.filter(item=>this.byId.has(item.company.id)).map(item=>({...item,company:this.byId.get(item.company.id)}));this.index=current?this.history.findIndex(item=>item.company.id===current):-1;this.frequency=new Map();for(const c of this.companies)for(const tag of new Set(c.tags))this.frequency.set(tag,(this.frequency.get(tag)||0)+1);}
  setScope(companies,key){this.scopeCompanies=companies;const changed=key!==this.scopeKey;if(changed){this.scopeKey=key;this.pending=null;this.history=[];this.index=-1;}return changed;}
  next(){let item;if(this.index<this.history.length-1)item=this.history[++this.index];else{item=this.peekNext();this.pending=null;if(item){this.history.push(item);this.index=this.history.length-1;}}if(item)this.store.viewed(item.company.id);return item;}
  peekNext(){if(this.index<this.history.length-1)return this.history[this.index+1];if(!this.pending||this.pending.revision!==this.store.revision)this.pending={revision:this.store.revision,item:this.recommend()};return this.pending.item;}
  recommend(){
   const source=this.scopeCompanies||this.companies,exclude=new Set(this.history.map(item=>item.company.id));let candidates=source.filter(c=>!exclude.has(c.id)&&!this.store.likes.has(c.id)&&Date.now()-(this.store.seen.get(c.id)||0)>7*86400000);
   if(!candidates.length)candidates=source.filter(c=>!exclude.has(c.id)&&!this.store.likes.has(c.id));if(!candidates.length)candidates=source.filter(c=>c.id!==this.history.at(-1)?.company.id);if(!candidates.length)return null;
   let reason='Random discovery',pool=candidates;
   if(this.store.likes.size&&this.random()<.7){const weights=new Map(),near=new Set(),groups=new Map();const points=this.semantic?.layouts.all?.points||{};
    for(const id of [...this.store.likes.keys()].slice(-100)){const c=this.byId.get(id);if(!c)continue;for(const tag of c.tags)weights.set(tag,(weights.get(tag)||0)+Math.log(1+this.companies.length/(this.frequency.get(tag)||1)));for(const neighbor of this.semantic?.layouts.all?.neighbors[id]||[])near.add(neighbor);const group=points[id]?.[2];if(group!==undefined)groups.set(group,(groups.get(group)||0)+1);}
    const previous=this.history.at(-1)?.company;
    const scored=candidates.map(c=>{let score=c.tags.reduce((n,tag)=>n+(weights.get(tag)||0),0)/Math.sqrt(Math.max(1,c.tags.length));if(near.has(c.id))score+=12;score+=Math.min(3,groups.get(points[c.id]?.[2])||0);if(previous&&c.topics.some(t=>previous.topics.includes(t)))score*=.75;return{c,score};}).filter(p=>p.score>0).sort((a,b)=>b.score-a.score);
    if(scored.length){pool=scored.slice(0,Math.min(60,scored.length)).map(p=>p.c);reason='Related to companies you liked';}
   }
   const company=pool[Math.min(pool.length-1,Math.floor(this.random()*pool.length))],item={company,reason};return item;
  }
  previous(){return this.index>0?this.history[--this.index]:this.history[this.index]||null;}
 }
 return Object.freeze({Store,Engine});
})();
