import {readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {pricingDate,pricingSources,estimateCost} from './usage-core.mjs';
export class UsageLedger{
 constructor(directory){this.file=path.join(directory,'assistant-usage.json');this.records=new Map();this.startedAt=Date.now();this.storageError='';this.queue=Promise.resolve();this.ready=this.load();}
 async load(){try{const stored=JSON.parse(await readFile(this.file,'utf8'));if(stored.version!==1||!Array.isArray(stored.records))throw new Error('Invalid usage file');this.startedAt=stored.startedAt;for(const row of stored.records)if(row&&typeof row.id==='string')this.records.set(row.id,row);}catch(error){if(error.code!=='ENOENT'){this.storageError='Stored usage could not be read. Tracking is kept in memory until the file can be recovered.';this.readFailed=true;}}}
 async record(value){await this.ready;const row={id:value.id,timestamp:value.timestamp,provider:value.provider,model:value.model,kind:value.kind==='title'?'title':'conversation',billingMode:value.billingMode||'apiKey',complete:!!value.complete,reported:!!value.reported,input:value.input||0,output:value.output||0,cachedInput:value.cachedInput||0,cacheWriteShort:value.cacheWriteShort||0,cacheWriteLong:value.cacheWriteLong||0,reasoning:value.reasoning||0,webSearches:value.webSearches||0,accountingValid:!!value.accountingValid,cacheReported:!!value.cacheReported,serviceTier:value.serviceTier||'standard',pricingDate};row.costUSD=estimateCost(row);this.records.set(row.id,row);
  this.queue=this.queue.then(async()=>{if(this.readFailed)return;try{await writeFile(this.file+'.tmp',JSON.stringify({version:1,startedAt:this.startedAt,records:[...this.records.values()]}),{mode:0o600});await rename(this.file+'.tmp',this.file);this.storageError='';}catch{this.storageError='Usage is available in this session but could not be saved on this computer.';}});await this.queue;
 }
 async snapshot(){await this.ready;await this.queue;return{version:1,startedAt:this.startedAt,records:[...this.records.values()],pricingDate,pricingSources,storageError:this.storageError};}
}
