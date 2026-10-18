#!/usr/bin/env python3
"""Restore the newest non-expired asset checkpoint artifact from GitHub Actions."""
from __future__ import annotations
import argparse, io, json, os, urllib.request, zipfile
from pathlib import Path
API='https://api.github.com'

def req(url,token,binary=False):
 r=urllib.request.Request(url,headers={'Authorization':f'Bearer {token}','Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'vyshe-neba-asset-checkpoint'})
 with urllib.request.urlopen(r) as f: return f.read() if binary else json.load(f)

def extract(data,dest):
 dest=Path(dest).resolve(); dest.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(io.BytesIO(data)) as z:
  for m in z.infolist():
   target=(dest/m.filename).resolve()
   if target!=dest and dest not in target.parents: raise RuntimeError('unsafe checkpoint path: '+m.filename)
  z.extractall(dest)

def main():
 p=argparse.ArgumentParser(); p.add_argument('--asset',required=True); p.add_argument('--dest',required=True); p.add_argument('--repository',default=os.environ.get('GITHUB_REPOSITORY')); p.add_argument('--token',default=os.environ.get('GITHUB_TOKEN')); p.add_argument('--pages',type=int,default=5); a=p.parse_args()
 if not a.repository or not a.token:
  print(json.dumps({'restored':False,'reason':'GitHub repository/token unavailable'})); return
 prefix=f'asset-checkpoint-{a.asset}-'; found=[]
 for page in range(1,a.pages+1):
  payload=req(f'{API}/repos/{a.repository}/actions/artifacts?per_page=100&page={page}',a.token); batch=payload.get('artifacts',[])
  found.extend(x for x in batch if not x.get('expired') and str(x.get('name','')).startswith(prefix))
  if len(batch)<100: break
 if not found:
  print(json.dumps({'restored':False,'reason':'no previous checkpoint','prefix':prefix})); return
 found.sort(key=lambda x:x.get('created_at',''),reverse=True); art=found[0]
 extract(req(f"{API}/repos/{a.repository}/actions/artifacts/{art['id']}/zip",a.token,True),a.dest)
 print(json.dumps({'restored':True,'artifact_id':art['id'],'artifact_name':art['name'],'created_at':art.get('created_at'),'dest':str(Path(a.dest))}))
if __name__=='__main__': main()
