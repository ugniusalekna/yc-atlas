"""Fetch all public YC records using the directory's own public search configuration.

Usage: python3 scripts/refresh.py
No private credentials or API subscriptions are needed.
"""
import concurrent.futures, json, re, tempfile, subprocess
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec

ROOT = Path(__file__).resolve().parents[1]

def curl(url, body=None, headers=None):
    args=['curl','--fail','--silent','--show-error','--retry','2',url]
    for key,value in (headers or {}).items(): args.extend(['-H',key+': '+value])
    if body is not None: args.extend(['-H','Content-Type: application/json','--data-binary',json.dumps(body)])
    return subprocess.check_output(args,text=True)

def main():
    html=curl('https://www.ycombinator.com/companies')
    match=re.search(r'window\.AlgoliaOpts\s*=\s*(\{.*?\});',html)
    if not match: raise RuntimeError('YC changed its directory configuration; no data was overwritten.')
    public=json.loads(match.group(1))
    headers={'X-Algolia-Application-Id':public['app'],'X-Algolia-API-Key':public['key']}
    endpoint='https://'+public['app'].lower()+'-dsn.algolia.net/1/indexes/YCCompany_production/query'
    def search(extra): return json.loads(curl(endpoint,{'query':'','hitsPerPage':1000,'attributesToHighlight':[],'analytics':False,**extra},headers))
    index=search({'facets':['batch']})
    batches=index['facets']['batch']
    def batch(name):
        result=search({'facetFilters':['batch:'+name]})
        if len(result['hits'])!=result['nbHits'] or result['nbHits']!=batches[name]:
            raise RuntimeError('Incomplete batch: '+name+'; no data was overwritten.')
        return result['hits']
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        rows=[c for group in executor.map(batch,batches) for c in group]
    companies={c['id']:c for c in rows}
    if len(companies)!=index['nbHits']: raise RuntimeError('Total does not match YC; no data was overwritten.')
    spec=spec_from_file_location('prepare',ROOT/'scripts/prepare-data.py');module=module_from_spec(spec);spec.loader.exec_module(module)
    with tempfile.TemporaryDirectory() as temp:
        source=Path(temp)/'snapshot.json';source.write_text(json.dumps(list(companies.values())))
        module.prepare(source)

if __name__=='__main__':main()
