#!/usr/bin/env python3
"""Promote an exact visually-approved candidate and checkpoint the publication stage."""
from __future__ import annotations
import argparse, hashlib, json, shutil, subprocess, sys
from pathlib import Path
from task_tracker import Tracker, fingerprint

def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def mark(cfg,state_dir,asset,step,status,fp,reason,outputs=()):
    for era in cfg['eras']:
        t=Tracker(state_dir,asset,era['stem'])
        if status=='success': t.success(step,fp,outputs,reason)
        elif status=='blocked': t.block(step,reason)
        elif status=='failed': t.fail(step,reason)

def assert_pre_promotion_gates(cfg,state_dir,asset):
    required=['generate','edit','archive_original','source_prepare','pixel_snap','normalize','aseprite_index','qa_auto','candidate_manifest']
    failures=[]
    for era in cfg['eras']:
        t=Tracker(state_dir,asset,era['stem'])
        for step in required:
            status=t.state['steps'][step]['status']
            allowed=('success','skipped') if step!='archive_original' else ('success',)
            if status not in allowed: failures.append(f"{era['stem']}/{step}={status}")
    if failures:
        reason='pre-promotion tracker gates not complete: '+', '.join(failures)
        mark(cfg,state_dir,asset,'promote','blocked',fingerprint({'blocked':failures}),reason)
        raise SystemExit(reason)

def main():
    p=argparse.ArgumentParser(); p.add_argument('--repo-root',default='.'); p.add_argument('--config',default='art/placeables/PIPELINE_CONFIG.json'); p.add_argument('--asset',required=True); p.add_argument('--candidate',required=True); p.add_argument('--state-dir'); p.add_argument('--runtime-manifest',default='outputs/rocket/runtime-assets.json'); a=p.parse_args()
    repo=Path(a.repo_root).resolve(); root=json.loads((repo/a.config).read_text(encoding='utf-8')); cfg=root['assets'][a.asset]; candidate=Path(a.candidate).resolve(); state_dir=Path(a.state_dir).resolve() if a.state_dir else candidate/'.tracker'; review=repo/cfg['visual_review']; manifest_path=candidate/'candidate-manifest.json'
    if not manifest_path.is_file(): raise SystemExit('candidate-manifest.json missing')
    manifest=json.loads(manifest_path.read_text(encoding='utf-8')); hashes=[(x['stem'],x['sha256']) for x in manifest['files']]
    assert_pre_promotion_gates(cfg,state_dir,a.asset)
    review_fp=fingerprint({'step':'visual_review','candidate':hashes,'review_sha256':sha(review) if review.is_file() else None})
    if not review.is_file(): mark(cfg,state_dir,a.asset,'visual_review','blocked',review_fp,'visual review file is missing'); raise SystemExit('visual review missing: '+str(review))
    verify=subprocess.run([sys.executable,repo/'tools/art_pipeline/verify_visual_gate.py','--candidate',candidate,'--review',review],capture_output=True,text=True)
    if verify.returncode:
        detail=(verify.stderr or verify.stdout or 'hash-bound visual gate rejected').strip(); mark(cfg,state_dir,a.asset,'visual_review','blocked',review_fp,detail[:1000]); raise SystemExit(detail)
    mark(cfg,state_dir,a.asset,'visual_review','success',review_fp,'hash-bound visual review approved',[review])

    production=repo/cfg['production_dir']; production.mkdir(parents=True,exist_ok=True); review_digest=sha(review); include=[]
    for item in manifest['files']:
        for key in ('png','qa','pipeline'):
            src=candidate/item[key]; dst=production/item[key]
            if key=='pipeline':
                data=json.loads(src.read_text(encoding='utf-8')); data['publication']={'state':'production','runtime_published':True,'visual_review':cfg['visual_review'],'visual_review_sha256':review_digest,'hash_bound':True}; dst.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
            else: shutil.copy2(src,dst)
        include.append(item['png'])
    promotion=dict(manifest); promotion['state']='production'; promotion['visual_review_sha256']=review_digest; promotion['runtime_source']='canonical_art_gen'; promotion_path=production/'promotion-manifest.json'; promotion_path.write_text(json.dumps(promotion,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    runtime_path=repo/a.runtime_manifest; runtime=json.loads(runtime_path.read_text(encoding='utf-8')); entry={'asset_id':a.asset,'source':cfg['production_dir'],'target':cfg['runtime_target'],'include':include}; families=[x for x in runtime.get('canonical_families',[]) if x.get('asset_id')!=a.asset]; families.append(entry); runtime['canonical_families']=sorted(families,key=lambda x:x['asset_id']); runtime_path.write_text(json.dumps(runtime,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    legacy=repo/runtime.get('legacy_root','outputs/rocket/dist/assets')/cfg['runtime_target']
    if legacy.exists(): shutil.rmtree(legacy); print('removed legacy runtime mirror:',legacy.relative_to(repo))
    promote_fp=fingerprint({'step':'promote','candidate':hashes,'review_sha256':review_digest,'runtime_manifest_sha256':sha(runtime_path)}); mark(cfg,state_dir,a.asset,'promote','success',promote_fp,'approved candidate staged; promotion PR is publication boundary',[promotion_path,runtime_path]); print(json.dumps(entry,indent=2,ensure_ascii=False))
if __name__=='__main__': main()
