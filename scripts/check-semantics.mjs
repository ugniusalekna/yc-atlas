import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const data=JSON.parse(readFileSync('dist/data/companies.json'));
const semantic=JSON.parse(readFileSync('dist/data/semantic.json'));
const companies=[...data.companies].sort((a,b)=>a.id-b.id);
const textOf=c=>[c.summary,c.description].filter(Boolean).join('. ').replace(/https?:\/\/\S+/g,' ').replace(/\s+/g,' ').trim().slice(0,2200);
const hash=createHash('sha256').update(JSON.stringify(companies.map(c=>[c.id,textOf(c),c.topics]))).digest('hex');
assert.equal(semantic.meta.sourceHash,hash,'Semantic maps must match the current descriptions and memberships');
assert.equal(data.meta.semanticSourceHash,hash);
assert.equal(semantic.meta.companyCount,companies.length);
assert.equal(Object.keys(semantic.layouts.all.points).length,companies.filter(c=>textOf(c)).length);
assert.equal(semantic.layouts.all.unplaced.length,companies.filter(c=>!textOf(c)).length);
for(const topic of [{id:'all'},...data.topics]){
 const layout=semantic.layouts[topic.id],members=companies.filter(c=>topic.id==='all'||c.topics.includes(topic.id));
 const expected=new Set(members.map(c=>c.id)),placed=new Set(Object.keys(layout.points).map(Number));
 assert.equal(new Set([...placed,...layout.unplaced]).size,members.length);
 assert.ok(Number.isFinite(layout.radius)&&layout.radius>0);
 const counts=new Map();
 for(const [id,p]of Object.entries(layout.points)){
  assert.ok(expected.has(Number(id)));
  assert.ok(p.length===3&&p.every(Number.isFinite));
  assert.ok(p[0]>=0&&p[0]<=1&&p[1]>=0&&p[1]<=1);
  assert.ok(layout.clusters.some(g=>g.id===p[2]));counts.set(p[2],(counts.get(p[2])||0)+1);
  for(const neighbor of layout.neighbors[id])assert.ok(placed.has(neighbor)&&neighbor!==Number(id));
 }
 for(const g of layout.clusters)assert.equal(g.count,counts.get(g.id)||0);
 for(const id of layout.unplaced){assert.ok(expected.has(id)&&!placed.has(id));assert.equal(textOf(members.find(c=>c.id===id)),'');}
}

// Verify projected neighborhoods against the original embeddings when the build cache exists.
if(existsSync('.cache/semantics/embeddings.f32')){
 const raw=readFileSync('.cache/semantics/embeddings.f32');const vectors=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
 const indices=new Map(companies.map((c,i)=>[c.id,i]));
 function similarity(a,b){let dot=0,ai=indices.get(a)*384,bi=indices.get(b)*384;for(let d=0;d<384;d++)dot+=vectors[ai+d]*vectors[bi+d];return dot;}
 for(const key of ['all','ai','defense','health','developers']){
  const points=Object.entries(semantic.layouts[key].points).map(([id,p])=>({id:Number(id),x:p[0],y:p[1]}));
  let local=0,baseline=0,count=0;
  for(let sample=0;sample<48;sample++){
   const i=Math.floor(sample*points.length/48),p=points[i];
   const nearest=points.map((q,j)=>({j,d:(q.x-p.x)**2+(q.y-p.y)**2})).filter(q=>q.j!==i).sort((a,b)=>a.d-b.d).slice(0,5);
   nearest.forEach((q,t)=>{local+=similarity(p.id,points[q.j].id);baseline+=similarity(p.id,points[(i+17+t*31)%points.length].id);count++;});
  }
  assert.ok((local-baseline)/count>.05,`${key}: nearby projected companies must be more similar than baseline pairs`);
  console.log(`PASS: ${key} projected neighbor cosine ${(local/count).toFixed(3)} vs baseline ${(baseline/count).toFixed(3)}`);
 }
}
const context={};vm.createContext(context);vm.runInContext(readFileSync('dist/layouts.js','utf8'),context);
for(const [w,h,n]of [[900,690,14],[820,690,14],[900,600,8],[792,500,8],[560,400,6],[343,320,4],[343,300,4]]){
 const groups=data.topics.slice(0,n).map(t=>({...t,companies:companies.filter(c=>c.topics.includes(t.id))}));
 const positions=context.YCLayout.scatterTopics(groups,w,h);
 assert.equal(positions.length,n);
 assert.equal(new Set(positions.map(p=>p.y.toFixed(2))).size,n,'No shared grid rows');
 for(const p of positions){assert.ok(p.bounds.left>=18&&p.bounds.right<=w-18&&p.bounds.top>=16&&p.bounds.bottom<=h-78);}
 for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){
  const a=positions[i].bounds,b=positions[j].bounds;
  assert.ok(a.right+12<b.left||a.left-12>b.right||a.bottom+12<b.top||a.top-12>b.bottom,'Scattered labels and bubbles must not overlap');
 }
}
console.log('PASS: complete, current semantic coverage; valid groups and neighbors; description-less records kept separate; readable scattered layouts on desktop, tablet, and phone.');
