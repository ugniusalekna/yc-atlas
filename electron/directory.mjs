import {createHash} from 'node:crypto';
export function normalizeCompany(c,topics){
 const tags=Array.isArray(c.tags)?c.tags.filter(t=>typeof t==='string'):[],industry=c.industry||'',evidence={};
 for(const topic of topics){const matches=topic.tags.filter(tag=>tags.includes(tag));if(matches.length)evidence[topic.id]={tags:matches.sort()};}
 const fallback={Fintech:'finance',Healthcare:'health',Consumer:'consumer',Education:'education',Industrials:'industrial','Real Estate and Construction':'places'}[industry];if(fallback)(evidence[fallback]??={}).industry=industry;if(!Object.keys(evidence).length)evidence.other={industry:industry||'Unspecified'};
 const logo=c.small_logo_thumb_url&&!c.small_logo_thumb_url.includes('missing.png')?new URL(c.small_logo_thumb_url,'https://www.ycombinator.com').href:'';
 return{id:c.id,name:c.name,slug:c.slug,logo,website:c.website||'',location:c.all_locations||'',description:c.long_description||'',summary:c.one_liner||'',team:c.team_size??null,industry,industries:c.industries||[],tags,batch:c.batch||'',status:c.status||'',regions:c.regions||[],hiring:Boolean(c.isHiring),top:Boolean(c.top_company),launched:c.launched_at||0,topics:Object.keys(evidence),topicEvidence:evidence};
}
export async function fetchDirectory(previous,{fetcher=fetch,progress=()=>{}}={}){
 async function request(url,options){let error;for(let attempt=0;attempt<3;attempt++){try{const response=await fetcher(url,{...options,signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`YC returned ${response.status}`);return response;}catch(e){error=e;}}throw error;}
 progress('Reading YC directory configuration');const html=await(await request('https://www.ycombinator.com/companies')).text();const match=html.match(/window\.AlgoliaOpts\s*=\s*(\{.*?\});/);if(!match)throw new Error('YC changed its directory configuration. Your existing snapshot is unchanged.');
 const config=JSON.parse(match[1]);if(!/^[a-z0-9]+$/i.test(config.app)||typeof config.key!=='string')throw new Error('Unexpected YC search configuration');
 const endpoint=`https://${config.app.toLowerCase()}-dsn.algolia.net/1/indexes/YCCompany_production/query`;
 const search=async extra=>(await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Algolia-Application-Id':config.app,'X-Algolia-API-Key':config.key},body:JSON.stringify({query:'',hitsPerPage:1000,attributesToHighlight:[],analytics:false,...extra})})).json();
 const index=await search({facets:['batch']}),batches=Object.entries(index.facets?.batch||{});if(!batches.length||!Number.isInteger(index.nbHits))throw new Error('Invalid YC coverage totals');
 let next=0,done=0,stopped=false;const records=new Map();
 const workers=await Promise.allSettled(Array.from({length:4},async()=>{try{while(!stopped&&next<batches.length){const [batch,total]=batches[next++];const result=await search({facetFilters:['batch:'+batch]});if(!Array.isArray(result.hits)||result.nbHits!==total||result.hits.length!==total)throw new Error(`Incomplete batch: ${batch}. Your snapshot is unchanged.`);for(const company of result.hits){if(!Number.isInteger(company.id)||!company.name||!company.slug)throw new Error('Invalid company record');records.set(company.id,company);}if(!stopped)progress(`Fetched ${++done} of ${batches.length} batches`);}}catch(error){stopped=true;throw error;}}));
 const failed=workers.find(result=>result.status==='rejected');if(failed)throw failed.reason;
 if(records.size!==index.nbHits)throw new Error('YC totals changed during refresh. Try again; your previous snapshot is unchanged.');
 const companies=[...records.values()].map(c=>normalizeCompany(c,previous.topics)).sort((a,b)=>Number(b.top)-Number(a.top)||b.launched-a.launched||a.name.localeCompare(b.name));
 const old=new Map(previous.companies.map(c=>[c.id,c])),current=new Set(companies.map(c=>c.id));
 const clean=c=>{const {search,...rest}=c;return JSON.stringify(rest);};
 const changes={added:companies.filter(c=>!old.has(c.id)).length,updated:companies.filter(c=>old.has(c.id)&&clean(c)!==clean(old.get(c.id))).length,removed:previous.companies.filter(c=>!current.has(c.id)).length};
 return{snapshot:{meta:{source:'https://www.ycombinator.com/companies',fetchedAt:new Date().toISOString(),total:companies.length,classification:previous.meta.classification,coverage:'All public directory records, verified against the directory total and every batch count.'},topics:previous.topics,companies},changes};
}
export function semanticFingerprint(companies){const text=c=>[c.summary,c.description].filter(Boolean).join('. ').replace(/https?:\/\/\S+/g,' ').replace(/\s+/g,' ').trim().slice(0,2200);return createHash('sha256').update(JSON.stringify([...companies].sort((a,b)=>a.id-b.id).map(c=>[c.id,text(c),c.topics]))).digest('hex');}
