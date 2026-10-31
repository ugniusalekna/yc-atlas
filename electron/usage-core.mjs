// Standard USD rates per million tokens, checked against primary pricing pages.
export const pricingDate='2026-10-31';
export const pricingSources=['https://developers.openai.com/api/docs/pricing','https://developers.openai.com/api/docs/guides/prompt-caching','https://platform.claude.com/docs/en/about-claude/pricing'];
const openai={
 'gpt-6-astra':[10,50,1], 'gpt-6.1-sol':[2,10,.1],
 'gpt-6.1-terra':[1,5,.05], 'gpt-6-luna':[.1,.5,.01]
};
const anthropic={
 'claude-fable-5-1':[10,50,.25], 'claude-mythos-5-1':[10,50,.25],
 'claude-opus-5-5':[4,20,.2], 'claude-sonnet-5-5':[2,10,.1],
 'claude-sonnet-5':[2,10,.2], 'claude-haiku-5-5':[.1,.5,.01],
 'claude-opus-5':[5,25,.5], 'claude-opus-4-8':[5,25,.5],
 'claude-opus-4-7':[5,25,.5], 'claude-opus-4-6':[5,25,.5],
 'claude-opus-4-5':[5,25,.5], 'claude-sonnet-4-6':[3,15,.3],
 'claude-sonnet-4-5':[3,15,.3], 'claude-haiku-4-5':[1,5,.1]
};
const count=value=>Number.isFinite(value)&&value>=0?Math.floor(value):0;
export function normalizeUsage(provider,raw,output=[]){
 const reported=raw!=null&&(Number.isFinite(raw.input_tokens)||Number.isFinite(raw.output_tokens));raw??={};
 const cachedInput=count(provider==='openai'?raw.input_tokens_details?.cached_tokens:raw.cache_read_input_tokens);
 const written=count(provider==='openai'?raw.input_tokens_details?.cache_write_tokens:raw.cache_creation_input_tokens);
 const detail=provider==='openai'?raw.input_tokens_details?.cache_write_tokens_details:raw.cache_creation;
 const cacheWriteLong=count(provider==='openai'?detail?.ttl_12h_tokens:detail?.ephemeral_1h_input_tokens);
 // Requests use the providers' default short TTL unless usage explicitly reports a long write.
 const cacheWriteShort=written-cacheWriteLong;
 const input=count(raw.input_tokens)+(provider==='anthropic'?cachedInput+written:0),out=count(raw.output_tokens);
 const webSearches=provider==='openai'?output.filter(o=>o.type==='web_search_call'&&o.status!=='failed'&&(!o.action||o.action.type==='search')).length:count(raw.server_tool_use?.web_search_requests);
 const accountingValid=cacheWriteShort>=0&&input>=cachedInput+written;
 const cacheReported=provider!=='openai'||!reported||(raw.input_tokens_details?.cached_tokens!==undefined&&raw.input_tokens_details?.cache_write_tokens!==undefined);
 return{reported,input,output:out,cachedInput,cacheWriteShort:Math.max(0,cacheWriteShort),cacheWriteLong,reasoning:count(raw.output_tokens_details?.reasoning_tokens),webSearches,accountingValid,cacheReported,serviceTier:raw.service_tier||'standard'};
}
export function estimateCost(record){
 if(record.billingMode==='chatgpt'||!record.reported||!record.accountingValid)return null;
 const table=record.provider==='openai'?openai:anthropic;
 const model=Object.keys(table).sort((a,b)=>b.length-a.length).find(m=>record.model===m||new RegExp('^'+m.replaceAll('.','\\.')+'-\\d{4}-?\\d{2}-?\\d{2}$').test(record.model));
 if(!model||record.provider==='openai'&&!record.cacheReported||!['standard','default','auto'].includes(record.serviceTier))return null;
 let [inputRate,outputRate,cacheRate]=table[model];
 if(record.provider==='openai'&&record.input>272000){inputRate*=2;cacheRate*=2;outputRate*=1.5;}
 if(model==='claude-haiku-5-5'&&record.input>100000){inputRate*=5;outputRate*=5;cacheRate*=5;}
 const regular=record.input-record.cachedInput-record.cacheWriteShort-record.cacheWriteLong;
 const longMultiplier=record.provider==='openai'?2.5:2;
 return(regular*inputRate+record.cachedInput*cacheRate+record.cacheWriteShort*inputRate*1.25+record.cacheWriteLong*inputRate*longMultiplier+record.output*outputRate)/1e6+record.webSearches*.01;
}
