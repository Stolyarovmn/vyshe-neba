#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, os, socket, time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

STEPS=['generate','edit','archive_original','source_prepare','pixel_snap','normalize','aseprite_index','qa_auto','candidate_manifest','visual_review','promote','game_tests']

def now(): return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
def sha(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
 return h.hexdigest()
def fingerprint(value): return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def atomic(path,text):
 path=Path(path); path.parent.mkdir(parents=True,exist_ok=True); tmp=path.with_name(path.name+f'.tmp-{os.getpid()}'); tmp.write_text(text,encoding='utf-8'); os.replace(tmp,path)

class Tracker:
 def __init__(self,state_dir,asset,era):
  self.root=Path(state_dir); self.asset=asset; self.era=era; self.dir=self.root/asset/era; self.path=self.dir/'current.json'; self.md=self.dir/'status.md'; self.lock_path=self.dir/'.lock'; self.dir.mkdir(parents=True,exist_ok=True); self.state=self._load()
 def _load(self):
  if self.path.exists():
   d=json.loads(self.path.read_text(encoding='utf-8')); d.setdefault('steps',{})
  else: d={'schema_version':1,'asset_id':self.asset,'era':self.era,'created_at':now(),'steps':{}}
  for s in STEPS: d['steps'].setdefault(s,{'status':'pending','attempt':0,'fingerprint':None,'started_at':None,'finished_at':None,'reason':None,'error':None,'outputs':{}})
  d['steps_order']=STEPS; d.setdefault('resume_allowed',True); self._overall(d); return d
 def _overall(self,d=None):
  d=d or self.state
  for status in ('running','failed','blocked'):
   for s in STEPS:
    if d['steps'][s]['status']==status: d['status']=status; d['current_step']=s; return
  pending=next((s for s in STEPS if d['steps'][s]['status']=='pending'),None)
  d['status']='pending' if pending else 'success'; d['current_step']=pending
 def save(self):
  self._overall(); self.state['updated_at']=now(); atomic(self.path,json.dumps(self.state,indent=2,ensure_ascii=False)+'\n'); atomic(self.md,self.render())
 def render(self):
  icons={'pending':'⬜','running':'🟡','success':'✅','failed':'❌','blocked':'⛔','skipped':'⏭️'}
  rows=['# Asset pipeline: '+self.asset+' / '+self.era,'',f"- status: **{self.state.get('status')}**",f"- current step: **{self.state.get('current_step') or '-'}**",f"- updated: `{self.state.get('updated_at','-')}`",'','| step | status | attempt | note |','|---|---|---:|---|']
  for s in STEPS:
   x=self.state['steps'][s]; note=(x.get('reason') or x.get('error') or '').replace('|','\\|').replace('\n',' ')[:140]; rows.append(f"| `{s}` | {icons.get(x['status'],'')} {x['status']} | {x.get('attempt',0)} | {note} |")
  return '\n'.join(rows)+'\n'
 @contextmanager
 def lock(self,stale=21600):
  payload=json.dumps({'pid':os.getpid(),'host':socket.gethostname(),'epoch':time.time(),'at':now()})
  while True:
   try:
    fd=os.open(self.lock_path,os.O_CREAT|os.O_EXCL|os.O_WRONLY); os.write(fd,payload.encode()); os.close(fd); break
   except FileExistsError:
    try: age=time.time()-json.loads(self.lock_path.read_text())['epoch']
    except Exception: age=stale+1
    if age>stale: self.lock_path.unlink(missing_ok=True); continue
    raise RuntimeError(f'asset pipeline locked: {self.lock_path}')
  try: yield self
  finally: self.lock_path.unlink(missing_ok=True)
 def begin(self,step,fp,reason=None):
  x=self.state['steps'][step]; x.update(status='running',attempt=x.get('attempt',0)+1,fingerprint=fp,started_at=now(),finished_at=None,reason=reason,error=None); self.save()
 def success(self,step,fp,outputs=(),reason=None):
  base=self.root.parent.resolve(); out={}
  for p in map(Path,outputs):
   p=p.resolve()
   if p.is_file():
    try: key='@/'+p.relative_to(base).as_posix()
    except ValueError: key=str(p)
    out[key]={'sha256':sha(p),'size':p.stat().st_size}
  self.state['steps'][step].update(status='success',fingerprint=fp,finished_at=now(),reason=reason,error=None,outputs=out); self.save()
 def skip(self,step,fp=None,reason=None): self.state['steps'][step].update(status='skipped',fingerprint=fp,finished_at=now(),reason=reason,error=None); self.save()
 def fail(self,step,error): self.state['steps'][step].update(status='failed',finished_at=now(),error=error); self.save()
 def block(self,step,reason): self.state['steps'][step].update(status='blocked',finished_at=now(),reason=reason,error=None); self.save()
 def reusable(self,step,fp):
  x=self.state['steps'][step]
  if x['status']!='success' or x.get('fingerprint')!=fp: return False
  base=self.root.parent.resolve()
  for raw,m in (x.get('outputs') or {}).items():
   p=base/raw[2:] if raw.startswith('@/') else Path(raw)
   if not p.is_file() or sha(p)!=m.get('sha256'): return False
  return True
 def invalidate_from(self,step,reason):
  for s in STEPS[STEPS.index(step):]: self.state['steps'][s].update(status='pending',fingerprint=None,started_at=None,finished_at=None,reason='invalidated: '+reason,error=None,outputs={})
  self.save()

def main():
 p=argparse.ArgumentParser(); p.add_argument('--state-dir',required=True); p.add_argument('--asset',required=True); p.add_argument('--era',required=True); sub=p.add_subparsers(dest='cmd',required=True); sub.add_parser('status'); sub.add_parser('unlock'); r=sub.add_parser('reset'); r.add_argument('--from-step',required=True,choices=STEPS); r.add_argument('--reason',default='manual reset'); m=sub.add_parser('mark'); m.add_argument('--step',required=True,choices=STEPS); m.add_argument('--status',required=True,choices=['running','success','failed','blocked','skipped']); m.add_argument('--fingerprint'); m.add_argument('--reason'); m.add_argument('--output',action='append',default=[]); a=p.parse_args(); t=Tracker(a.state_dir,a.asset,a.era)
 if a.cmd=='status': t.save(); print(t.render())
 elif a.cmd=='unlock': t.lock_path.unlink(missing_ok=True)
 elif a.cmd=='reset': t.invalidate_from(a.from_step,a.reason)
 else:
  fp=a.fingerprint or fingerprint({'asset':a.asset,'era':a.era,'step':a.step,'reason':a.reason})
  if a.status=='running': t.begin(a.step,fp,a.reason)
  elif a.status=='success': t.success(a.step,fp,a.output,a.reason)
  elif a.status=='failed': t.fail(a.step,a.reason or 'manual failure')
  elif a.status=='blocked': t.block(a.step,a.reason or 'manual blocker')
  else: t.skip(a.step,fp,a.reason)
if __name__=='__main__': main()
