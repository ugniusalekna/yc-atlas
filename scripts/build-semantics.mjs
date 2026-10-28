import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataDirectory=process.env.YC_DATA_DIR||path.join(projectRoot,'dist/data');
import { pipeline, env } from '@huggingface/transformers';
import umapPackage from 'umap-js';
import { kmeans } from 'ml-kmeans';
import vm from 'node:vm';
const {UMAP}=umapPackage;
const cosine=(a,b)=>{let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return 1-dot/Math.sqrt(aa*bb||1);};
const context={setTimeout,clearTimeout,setInterval,clearInterval,performance};vm.createContext(context);vm.runInContext(readFileSync(path.join(projectRoot,'dist/d3.min.js'),'utf8'),context);const d3=context.d3;

const snapshot=JSON.parse(readFileSync(path.join(dataDirectory,'companies.json')));
const companies=[...snapshot.companies].sort((a,b)=>a.id-b.id);
const textOf=c=>[c.summary,c.description].filter(Boolean).join('. ').replace(/https?:\/\/\S+/g,' ').replace(/\s+/g,' ').trim().slice(0,2200);
const hash=createHash('sha256').update(JSON.stringify(companies.map(c=>[c.id,textOf(c),c.topics]))).digest('hex');
const cache=process.env.YC_CACHE_DIR||path.join(projectRoot,'.cache/semantics');mkdirSync(cache,{recursive:true});
const dimensions=384;
let vectors=new Float32Array(companies.length*dimensions), completed=0;
const metaPath=path.join(cache,'embeddings.json'),vectorPath=path.join(cache,'embeddings.f32');
if(existsSync(metaPath)&&existsSync(vectorPath)){
 const meta=JSON.parse(readFileSync(metaPath));
 if(meta.sourceHash===hash){const raw=readFileSync(vectorPath);vectors=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));completed=meta.completed;}
}
function saveCache(){writeFileSync(vectorPath,Buffer.from(vectors.buffer));writeFileSync(metaPath,JSON.stringify({sourceHash:hash,completed,dimensions}));}
if(completed<companies.length){
 env.localModelPath=(process.env.YC_MODEL_DIR||path.join(projectRoot,'.cache/models'))+path.sep;
 env.cacheDir=path.join(cache,'model-downloads');
 env.allowRemoteModels=!existsSync(path.join(env.localModelPath,'Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx'));
 const embed=await pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2',{dtype:'q8',device:'cpu',session_options:{intraOpNumThreads:4}});
 const started=Date.now();
 for(let offset=completed;offset<companies.length;offset+=16){
  const batch=companies.slice(offset,offset+16).map((c,j)=>({text:textOf(c),index:offset+j})).filter(c=>c.text);
  if(batch.length){const result=await embed(batch.map(c=>c.text),{pooling:'mean',normalize:true});batch.forEach((c,j)=>vectors.set(result.data.subarray(j*dimensions,(j+1)*dimensions),c.index*dimensions));}
  completed=Math.min(offset+16,companies.length);
  if(completed%256===0||completed===companies.length){saveCache();console.log(`Embedded ${completed}/${companies.length} descriptions (${Math.round((Date.now()-started)/1000)}s)`);}
 }
 await embed.dispose();
}
const described=companies.map((c,index)=>({...c,index,text:textOf(c)})).filter(c=>c.text);
const vectorOf=c=>Array.from(vectors.subarray(c.index*dimensions,(c.index+1)*dimensions));
const allVectors=new Map(described.map(c=>[c.id,vectorOf(c)]));
const stop=new Set(('a an and are as at be been being but by can company companies customers customer co com could data do does for from has have help helps how i in into is it its ll more most new of on one online or our out over platform product provide provides s service services so software some such t team teams than that the their them there these they this those through to together two up us use used users using was we were what when where which who will with work works world you your ai artificial intelligence business businesses based built build building make making technology technologies solution solutions enables enabling powered tools tool also get all first www ycombinator yc inc best next large create creating helping way every across time lets let people different within access give giving turning just part full entire well need needs needed able instead improve improving power powering simple simply easy quickly easily faster better high quality global leading modern transforming').split(' '));
const termsById=new Map();
for(const c of described){
 const nameTokens=new Set(c.name.toLowerCase().match(/[a-z]{3,}/g)||[]);
 const tokens=c.text.toLowerCase().match(/[a-z][a-z-]{2,}/g)||[];
 const terms=new Set();
 for(let i=0;i<tokens.length;i++){
  const token=tokens[i];if(stop.has(token)||nameTokens.has(token))continue;
  terms.add(token);
  const next=tokens[i+1];if(next&&!stop.has(next)&&!nameTokens.has(next))terms.add(token+' '+next);
 }
 termsById.set(c.id,terms);
}
function seeded(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function labelClusters(rows,assignments,k){
 const total=new Map();rows.forEach(c=>termsById.get(c.id).forEach(t=>total.set(t,(total.get(t)||0)+1)));
 return Array.from({length:k},(_,id)=>{
  const members=rows.filter((_,i)=>assignments[i]===id),counts=new Map();
  members.forEach(c=>termsById.get(c.id).forEach(t=>counts.set(t,(counts.get(t)||0)+1)));
  const minimum=members.length>=8?2:1;
  const ranked=[...counts].filter(([t,count])=>count>=minimum&&t.length<32).map(([term,count])=>({term,score:count/members.length*Math.log1p(count)*Math.log1p(rows.length/(total.get(term)||1))*(term.includes(' ')?1.25:1)})).sort((a,b)=>b.score-a.score||a.term.localeCompare(b.term));
  const terms=[];for(const {term}of ranked){if(!terms.some(t=>t.includes(term)||term.includes(t)))terms.push(term);if(terms.length===3)break;}
  return {id,label:terms.slice(0,2).join(' / ')||'Other descriptions',terms,count:members.length};
 });
}
const layouts={};
for(const topic of [{id:'all'},...snapshot.topics]){
 const rows=described.filter(c=>topic.id==='all'||c.topics.includes(topic.id));
 if(!rows.length){layouts[topic.id]={points:{},clusters:[],unplaced:companies.filter(c=>topic.id==='all'||c.topics.includes(topic.id)).map(c=>c.id)};continue;}
 const started=Date.now(),features=rows.map(c=>allVectors.get(c.id));
 const seed=[...topic.id].reduce((a,c)=>Math.imul(a,31)+c.charCodeAt(0)|0,20261027)>>>0;
 const k=Math.min(rows.length,Math.max(2,Math.min(topic.id==='all'?20:12,Math.round(Math.sqrt(rows.length/12)))));
 const assignments=kmeans(features,k,{seed,maxIterations:35}).clusters;
 const clusters=labelClusters(rows,assignments,k);
 console.log(`Projecting ${topic.id}: ${rows.length} companies, ${k} description groups`);
 const umap=new UMAP({nComponents:2,nNeighbors:Math.min(15,rows.length-1),nEpochs:200,minDist:.22,spread:1,distanceFn:cosine,random:seeded(seed)});
 const coordinates=rows.length>3?umap.fit(features):rows.map((_,i)=>[i,0]);
 const xs=coordinates.map(p=>p[0]),ys=coordinates.map(p=>p[1]);
 const minX=Math.min(...xs),minY=Math.min(...ys),span=Math.max(Math.max(...xs)-minX,Math.max(...ys)-minY,1e-9);
 const radius=.28/Math.sqrt(rows.length);
 const relaxed=rows.map((c,i)=>({id:c.id,x:(coordinates[i][0]-minX)/span,y:(coordinates[i][1]-minY)/span,anchorX:(coordinates[i][0]-minX)/span,anchorY:(coordinates[i][1]-minY)/span}));
 const simulation=d3.forceSimulation(relaxed).randomSource(seeded(seed)).force('x',d3.forceX(p=>p.anchorX).strength(.35)).force('y',d3.forceY(p=>p.anchorY).strength(.35)).force('collide',d3.forceCollide(radius*1.2).iterations(2)).stop();
 for(let tick=0;tick<100;tick++)simulation.tick();
 const lowX=Math.min(...relaxed.map(p=>p.x)),highX=Math.max(...relaxed.map(p=>p.x)),lowY=Math.min(...relaxed.map(p=>p.y)),highY=Math.max(...relaxed.map(p=>p.y));
 const finalSpan=Math.max(highX-lowX,highY-lowY,1e-9),centerX=(lowX+highX)/2,centerY=(lowY+highY)/2;
 const points={},neighbors={};
 rows.forEach((c,i)=>{
  points[c.id]=[Number(((relaxed[i].x-centerX)/finalSpan+.5).toFixed(6)),Number(((relaxed[i].y-centerY)/finalSpan+.5).toFixed(6)),assignments[i]];
  const candidates=umap.knnIndices?.[i]||[];
  neighbors[c.id]=candidates.filter(j=>j>=0&&j!==i).slice(0,5).map(j=>rows[j].id);
 });
 for(const cluster of clusters){const members=rows.filter((_,i)=>assignments[i]===cluster.id);cluster.x=members.reduce((s,c)=>s+points[c.id][0],0)/members.length;cluster.y=members.reduce((s,c)=>s+points[c.id][1],0)/members.length;}
 const present=new Set(rows.map(c=>c.id));
 const unplaced=companies.filter(c=>(topic.id==='all'||c.topics.includes(topic.id))&&!present.has(c.id)).map(c=>c.id);
 layouts[topic.id]={points,neighbors,clusters,unplaced,radius:radius/finalSpan};
 console.log(`Finished ${topic.id} (${Math.round((Date.now()-started)/1000)}s)`);
 // Keep completed projections between interrupted builds.
 writeFileSync(path.join(cache,`layout-${topic.id}.json`),JSON.stringify({sourceHash:hash,layout:layouts[topic.id]}));
}
const output={meta:{sourceHash:hash,companyCount:companies.length,describedCount:described.length,generatedAt:new Date().toISOString(),model:'Xenova/all-MiniLM-L6-v2',dimensions,pooling:'mean, L2 normalized',maxTokens:512,maxCharacters:2200,projection:'UMAP, cosine distance, 15 neighbors, minDist 0.22, 200 epochs; gentle collision separation anchored to projected coordinates',clustering:'k-means on sentence embeddings',labels:'Distinctive terms extracted from cluster descriptions',note:'Local similarity is meaningful; axes have no units and 2D distances are approximate. Positions are fixed across filters. Records without descriptions are shown separately.'},layouts};
writeFileSync(path.join(dataDirectory,'semantic.json.tmp'),JSON.stringify(output));renameSync(path.join(dataDirectory,'semantic.json.tmp'),path.join(dataDirectory,'semantic.json'));
snapshot.meta.semanticSourceHash=hash;writeFileSync(path.join(dataDirectory,'companies.json'),JSON.stringify(snapshot));
console.log(`Saved ${described.length} embedded companies across ${Object.keys(layouts).length} semantic maps.`);
