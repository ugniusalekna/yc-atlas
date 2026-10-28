"""Normalize a verified public YC directory snapshot and derive transparent topics."""
import json, sys
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
TOPICS = [
 ('ai', 'Artificial intelligence', 'Models, agents, and applied intelligence', ['AI','Generative AI','Machine Learning','AI Assistant','AIOps','Conversational AI']),
 ('developers', 'Developer tools', 'The tools behind the next generation of software', ['Developer Tools','Open Source','API','Infrastructure','Cloud Computing','Data Engineering','DevOps']),
 ('finance', 'Finance & payments', 'How money moves, grows, and gets managed', ['Fintech','Finance','Payments','Banking','Insurance','Investing','Crypto / Web3']),
 ('health', 'Health & biotech', 'Better care, new treatments, and longer lives', ['Healthcare','Health Tech','Biotech','Digital Health','Medical Devices','Therapeutics']),
 ('climate', 'Climate & energy', 'A more resilient planet, from energy to food', ['Climate','Energy','ClimateTech','Clean Energy','Agriculture','Sustainability','Solar Power']),
 ('industrial', 'Robotics & industry', 'Building things that work in the physical world', ['Robotics','Hardware','Manufacturing','Hard Tech','Industrial','Logistics','Supply Chain','Drones']),
 ('defense', 'Defense & space', 'National security, aerospace, and the space economy', ['Defense','Aerospace','Space','Space Exploration','Military','Satellites','Commercial Space Launch','Rocketry']),
 ('consumer', 'Consumer & culture', 'What we watch, play, share, and do every day', ['Consumer','Social','Gaming','Entertainment','Community','Travel','Video','Music']),
 ('work', 'Work & productivity', 'Helping people and teams do their best work', ['SaaS','B2B','Productivity','Enterprise Software','Enterprise','HR Tech','Recruiting','Workflow Automation','LegalTech']),
 ('commerce', 'Commerce & retail', 'New ways to buy, sell, and reach customers', ['E-commerce','Marketplace','Retail','Sales','Marketing','Delivery']),
 ('education', 'Education', 'New ways to learn, teach, and build skills', ['Education','eLearning','Edtech','EdTech']),
 ('security', 'Security', 'Protecting systems, identities, and information', ['Security','Cybersecurity','Privacy','Compliance','Identity']),
 ('places', 'Real estate & cities', 'The places we live and the systems around them', ['Proptech','Real Estate','Construction','GovTech','Transportation']),
 ('other', 'More frontiers', 'Companies that cross boundaries or define new ones', []),
]

INDUSTRY_TOPICS = {'Fintech':'finance','Healthcare':'health','Consumer':'consumer','Education':'education','Industrials':'industrial','Real Estate and Construction':'places'}

def classify(tags, industry):
    evidence = {}
    for key, _, _, allowed in TOPICS[:-1]:
        matched = sorted(set(tags).intersection(allowed))
        if matched: evidence[key] = {'tags':matched}
    fallback = INDUSTRY_TOPICS.get(industry)
    if fallback: evidence.setdefault(fallback,{})['industry'] = industry
    if not evidence: evidence['other'] = {'industry':industry or 'Unspecified'}
    return list(evidence), evidence

def retag_snapshot():
    out=ROOT/'dist/data/companies.json'
    data=json.loads(out.read_text())
    for c in data['companies']: c['topics'],c['topicEvidence']=classify(c['tags'],c['industry'])
    data['topics']=[{'id':k,'name':n,'description':d,'tags':t} for k,n,d,t in TOPICS]
    data['meta']['classification']='Topics are transparent groupings of YC tags and industry fields. Description keywords do not assign topics. Semantic description groups are separate inferred labels.'
    data['meta'].pop('semanticSourceHash',None)
    out.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
    print({t['name']:sum(t['id'] in c['topics'] for c in data['companies']) for t in data['topics']})

def prepare(source):
    raw = json.loads(Path(source).read_text())
    assert len({c['id'] for c in raw}) == len(raw), 'Duplicate company IDs'
    companies = []
    for c in raw:
        tags = c.get('tags', [])
        industry = c.get('industry','')
        topics,evidence=classify(tags,industry)
        companies.append({
          'id':c['id'], 'name':c['name'], 'slug':c['slug'],
          'logo':urljoin('https://www.ycombinator.com', c['small_logo_thumb_url']) if c.get('small_logo_thumb_url') and 'missing.png' not in c['small_logo_thumb_url'] else '', 'website':c.get('website',''),
          'location':c.get('all_locations') or '', 'description':c.get('long_description') or '',
          'summary':c.get('one_liner') or '', 'team':c.get('team_size'),
          'industry':industry, 'industries':c.get('industries',[]), 'tags':tags,
          'batch':c.get('batch',''), 'status':c.get('status',''),
          'regions':c.get('regions',[]), 'hiring':c.get('isHiring',False),
          'top':c.get('top_company',False), 'launched':c.get('launched_at',0), 'topics':topics,'topicEvidence':evidence,
        })
    companies.sort(key=lambda c: (not c['top'], -(c['launched'] or 0), c['name'].lower()))
    data = {'meta':{'source':'https://www.ycombinator.com/companies','fetchedAt':datetime.now(timezone.utc).isoformat(),'total':len(companies),'classification':'Topics are groupings of YC tags and industry fields. Descriptions only determine semantic similarity within topics.','coverage':'All public records returned by the YC directory, verified against its total and each batch count.'},'topics':[{'id':k,'name':n,'description':d,'tags':t} for k,n,d,t in TOPICS], 'companies':companies}
    out=ROOT/'dist/data/companies.json'
    out.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
    print(f'Wrote {len(companies):,} verified companies; {out.stat().st_size:,} bytes')
    print({t['name']:sum(t['id'] in c['topics'] for c in companies) for t in data['topics']})

if __name__ == '__main__':
    if sys.argv[1]=='--retag': retag_snapshot()
    else: prepare(sys.argv[1])
