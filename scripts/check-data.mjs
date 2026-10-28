import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {meta,topics,companies}=JSON.parse(readFileSync('dist/data/companies.json'));
assert.equal(companies.length,meta.total);
assert.equal(new Set(companies.map(c=>c.id)).size,companies.length);
const topicIds=new Set(topics.map(t=>t.id));
for(const c of companies){
 assert.ok(c.name&&c.slug,`Missing identity for ${c.id}`);
 assert.ok(c.topics.length,`Company without topics: ${c.name}`);
 assert.ok(c.topics.every(t=>topicIds.has(t)),`Unknown topic: ${c.name}`);
 assert.deepEqual(Object.keys(c.topicEvidence),c.topics,`Missing classification provenance: ${c.name}`);
 for(const id of c.topics){
  const evidence=c.topicEvidence[id],topic=topics.find(t=>t.id===id);
  assert.ok(evidence.tags?.length||evidence.industry,`Unsupported topic: ${c.name}/${id}`);
  for(const tag of evidence.tags||[])assert.ok(c.tags.includes(tag)&&topic.tags.includes(tag),`Topic must cite actual YC tags: ${c.name}/${id}`);
  if(evidence.industry)assert.equal(evidence.industry,c.industry||'Unspecified');
  if(id==='defense')assert.ok(evidence.tags?.length,'Defense requires an explicit matching YC tag');
 }

 assert.ok(Array.isArray(c.tags)&&Array.isArray(c.regions),`Invalid facets: ${c.name}`);
 assert.ok(!c.logo||/^https?:\/\//.test(c.logo),`Invalid logo URL: ${c.name}`);
}
assert.ok(companies.some(c=>c.topics.includes('defense')));
const airbnb=companies.find(c=>c.slug==='airbnb');
assert.deepEqual(airbnb.tags,['Marketplace','Travel']);
assert.deepEqual(airbnb.topics,['consumer','commerce'],'Satellite offices must not assign Airbnb to defense');
console.log(`PASS: ${companies.length.toLocaleString()} unique companies, ${topics.length} valid topic groups, all records classified; ${companies.filter(c=>c.logo).length.toLocaleString()} published logos and ${companies.filter(c=>!c.logo).length} initials fallbacks.`);
