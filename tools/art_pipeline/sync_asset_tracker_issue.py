#!/usr/bin/env python3
"""Synchronize checkpoint state into one durable GitHub Issue per asset family."""
from __future__ import annotations
import argparse, json, os, urllib.parse, urllib.request
from pathlib import Path
from task_tracker import STEPS
API='https://api.github.com'

def api(method,url,token,body=None):
 data=None if body is None else json.dumps(body).encode()
 r=urllib.request.Request(url,data=data,method=method,headers={'Authorization':f'Bearer {token}','Accept':'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'vyshe-neba-asset-tracker'})
 with urllib.request.urlopen(r) as f: return json.load(f)

def states(root,asset):
 return [json.loads(p.read_text(encoding='utf-8')) for p in sorted((Path(root)/asset).glob('*/current.json'))]
def roll(all_states,step):
 vals=[x.get('steps',{}).get(step,{}).get('status','pending') for x in all_states]
 for s in ('failed','running','blocked'):
  if s in vals:return s
 if vals and all(x in ('success','skipped') for x in vals):return 'success'
 return 'pending'
def overall(all_states):
 for severity in ('failed','running','blocked','pending'):
  for step in STEPS:
   if roll(all_states,step)==severity:return severity,step
 return 'success',None
def icon(s):return {'success':'✅','skipped':'⏭️','running':'🟡','failed':'❌','blocked':'⛔','pending':'⬜'}.get(s,'⬜')
def last_done(st):
 done=[s for s in STEPS if st.get('steps',{}).get(s,{}).get('status') in ('success','skipped')]; return done[-1] if done else '-'
def body(asset,name,all_states,artifact,run_url):
 status,current=overall(all_states); out=['<!-- asset-pipeline-tracker:v1 -->',f'# {asset} / {name}','', 'Автоматический durable tracker asset pipeline. После перезапуска чата/CI сначала читается этот issue, затем восстанавливается checkpoint artifact.','',f'- status: **{icon(status)} {status}**',f'- current step: **`{current or "-"}`**',f'- checkpoint artifact: **`{artifact or "-"}`**']
 if run_url:out.append(f'- last workflow run: {run_url}')
 out+=['','## Pipeline']
 for step in STEPS:
  s=roll(all_states,step); out.append(f'- [{"x" if s=="success" else " "}] {icon(s)} `{step}` — **{s}**')
 out+=['','## Eras','','| era | status | current step | last completed | updated |','|---|---|---|---|---|']
 for st in all_states:out.append(f"| `{st.get('era')}` | {icon(st.get('status','pending'))} {st.get('status','pending')} | `{st.get('current_step') or '-'}` | `{last_done(st)}` | `{st.get('updated_at') or '-'}` |")
 out+=['','## Resume','','Новый запуск восстанавливает последний `asset-checkpoint-*` и вызывает processor с `--resume`. Success-шаг пропускается только при совпадении input fingerprint и SHA-256 всех outputs.','',f'`python3 tools/art_pipeline/process_asset.py --asset {asset} --resume ...`','']
 return '\n'.join(out)
def find(repo,token,title):
 q=urllib.parse.quote(f'repo:{repo} is:issue in:title "{title}"'); result=api('GET',f'{API}/search/issues?q={q}&per_page=20',token)
 return next((x for x in result.get('items',[]) if x.get('title')==title),None)
def main():
 p=argparse.ArgumentParser(); p.add_argument('--repo-root',default='.'); p.add_argument('--config',default='art/placeables/PIPELINE_CONFIG.json'); p.add_argument('--asset',required=True); p.add_argument('--state-dir',required=True); p.add_argument('--artifact-name'); p.add_argument('--run-url'); p.add_argument('--repository',default=os.environ.get('GITHUB_REPOSITORY')); p.add_argument('--token',default=os.environ.get('GITHUB_TOKEN')); p.add_argument('--dry-run',action='store_true'); a=p.parse_args(); cfg=json.loads((Path(a.repo_root)/a.config).read_text(encoding='utf-8'))['assets'][a.asset]; ss=states(a.state_dir,a.asset)
 if not ss:raise SystemExit('no tracker states')
 title=f"[asset-pipeline] {a.asset} {cfg['asset']}"; text=body(a.asset,cfg['asset'],ss,a.artifact_name,a.run_url)
 if a.dry_run or not a.repository or not a.token:print(text);return
 issue=find(a.repository,a.token,title); state='closed' if overall(ss)[0]=='success' else 'open'; payload={'title':title,'body':text,'state':state}
 if issue:r=api('PATCH',f"{API}/repos/{a.repository}/issues/{issue['number']}",a.token,payload)
 else:r=api('POST',f'{API}/repos/{a.repository}/issues',a.token,payload)
 print(json.dumps({'issue':r['number'],'url':r['html_url'],'state':r['state']}))
if __name__=='__main__':main()
