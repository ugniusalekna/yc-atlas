'use strict';
globalThis.YCSaved=(()=>{
 const key='yc-atlas-library',legacyKey='yc-atlas-saved';
 const sorts=['newest','oldest','name'];
 const validId=id=>Number.isInteger(id)&&id>0;
 class Store{
  constructor({storage,now=()=>Date.now()}={}){
   this.storage=storage;this.now=now;this.items=new Map();this.folders=[];this.sort='newest';this.storageError=!storage;this.nextOrder=0;
   let raw=null;
   try{
    raw=storage?.getItem(key);
    if(raw){
     const value=JSON.parse(raw);if(value.version!==1||!Array.isArray(value.items)||!Array.isArray(value.folders))throw new Error('Invalid library');
     const seen=new Set();
     this.folders=value.folders.filter(f=>f&&typeof f.id==='string'&&!['all','unfiled',''].includes(f.id)&&typeof f.name==='string'&&f.name.trim()&&!seen.has(f.id)&&seen.add(f.id)).map(f=>({id:f.id,name:f.name.trim().slice(0,64),createdAt:Number(f.createdAt)||null}));
     for(const item of value.items)if(item&&validId(item.id))this.items.set(item.id,this.normalize(item));
     if(sorts.includes(value.sort))this.sort=value.sort;
    }else{
     this.migrate();this.persist();
    }
   }catch{this.storageError=true;if(!this.items.size)this.migrate();}
   this.nextOrder=Math.max(0,...[...this.items.values()].map(item=>item.order+1));
  }
  normalize(item){return{id:item.id,addedAt:Number.isFinite(item.addedAt)&&item.addedAt>0&&item.addedAt<=8640000000000000?item.addedAt:null,folderId:this.folders.some(f=>f.id===item.folderId)?item.folderId:null,note:typeof item.note==='string'?item.note.slice(0,5000):'',order:Number.isInteger(item.order)&&item.order>=0?item.order:this.items.size};}
  migrate(){try{const ids=JSON.parse(this.storage?.getItem(legacyKey)||'[]');if(Array.isArray(ids))for(const id of ids)if(validId(id)&&!this.items.has(id))this.items.set(id,{id,addedAt:null,folderId:null,note:'',order:this.items.size});}catch{this.storageError=true;}}
  persist(){
   try{if(!this.storage)throw new Error('Storage unavailable');this.storage.setItem(key,JSON.stringify({version:1,folders:this.folders,items:[...this.items.values()],sort:this.sort}));this.storageError=false;}catch{this.storageError=true;return false;}
   // Keep the earlier app's ID-only format readable, without relying on it for dates or notes.
   try{this.storage.setItem(legacyKey,JSON.stringify([...this.items.keys()]));}catch{}
   return true;
  }
  ids(){return new Set(this.items.keys());}
  folder(id){return this.folders.find(f=>f.id===id);}
  folderName(id){return this.folder(id)?.name||'All saved';}
  has(id){return this.items.has(id);}
  record(id){return this.items.get(id);}
  save(id,folderId=null){if(!validId(id))throw new Error('Invalid company');if(!this.has(id)){this.items.set(id,{id,addedAt:this.now(),folderId:this.folder(folderId)?folderId:null,note:'',order:this.nextOrder++});this.persist();}return this.record(id);}
  folderLabel(name,except){const label=String(name).trim();if(!label||label.length>64)throw new Error('Use a folder name between 1 and 64 characters.');if(this.folders.some(f=>f.id!==except&&f.name.toLocaleLowerCase()===label.toLocaleLowerCase()))throw new Error('A folder with this name already exists.');return label;}
  createFolder(name){const label=this.folderLabel(name);const id=globalThis.crypto?.randomUUID?.()||`folder-${this.now()}-${Math.random().toString(36).slice(2)}`;const folder={id,name:label,createdAt:this.now()};this.folders.push(folder);this.persist();return folder;}
  renameFolder(id,name){const folder=this.folder(id);if(!folder)throw new Error('Folder not found.');folder.name=this.folderLabel(name,id);this.persist();}
  deleteFolder(id){if(!this.folder(id))return;this.folders=this.folders.filter(f=>f.id!==id);for(const record of this.items.values())if(record.folderId===id)record.folderId=null;this.persist();}
  move(ids,folderId){if(folderId!==null&&!this.folder(folderId))throw new Error('Folder not found.');for(const id of ids){const item=this.record(id);if(item)item.folderId=folderId;}this.persist();}
  note(id,note){const item=this.record(id);if(item){item.note=String(note).slice(0,5000);this.persist();}}
  remove(ids){const records=[];for(const id of ids){const item=this.record(id);if(item){records.push({...item});this.items.delete(id);}}this.persist();return records;}
  restore(records){for(const item of records)if(validId(item.id)&&!this.has(item.id))this.items.set(item.id,this.normalize(item));this.nextOrder=Math.max(this.nextOrder,...[...this.items.values()].map(item=>item.order+1));this.persist();}
  setSort(sort){if(sorts.includes(sort)){this.sort=sort;this.persist();}}
  ordered(companies,sort=this.sort){return [...companies].sort((a,b)=>{if(sort==='name')return a.name.localeCompare(b.name)||a.id-b.id;const x=this.record(a.id),y=this.record(b.id),ax=x?.addedAt??-Infinity,ay=y?.addedAt??-Infinity;const order=(ax===ay?0:ax<ay?-1:1)||((x?.order??0)-(y?.order??0));return sort==='oldest'?order:-order;});}
 }
 function csv(rows){const cell=value=>{let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');}
 return Object.freeze({Store,sorts,csv});
})();
