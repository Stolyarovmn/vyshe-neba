#!/usr/bin/env python3
"""Resumable deterministic candidate builder for 2D placeable assets.

Every expensive stage is checkpointed. --resume reuses a stage only when both its
input fingerprint and the SHA-256 of every recorded output still match.
This command never publishes runtime files and never commits/pushes git history.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from PIL import Image
from task_tracker import Tracker, sha, fingerprint


def maybe_sha(path: Path): return sha(path) if path.is_file() else None

def run(*args, cwd=None):
    print('+', ' '.join(map(str,args)), flush=True)
    subprocess.run([str(x) for x in args], cwd=cwd, check=True)

def git_commit(repo: Path):
    try: return subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True,stderr=subprocess.DEVNULL).strip()
    except Exception: return None

def load_config(path: Path, asset: str):
    root=json.loads(path.read_text(encoding='utf-8'))
    if asset not in root['assets']: raise SystemExit(f'unknown asset id {asset!r}')
    return root,root['assets'][asset]

def qa_args(cfg):
    q=cfg.get('qa',{}); out=['--max-colors',str(cfg['colors']),'--min-coverage',str(q.get('min_coverage',.01)),'--min-bbox-fraction',str(q.get('min_bbox_fraction',.25))]
    for key,flag in [('min_visible_width','--min-visible-width'),('max_visible_width','--max-visible-width'),('min_visible_height','--min-visible-height'),('max_visible_height','--max-visible-height')]:
        if q.get(key) is not None: out += [flag,str(q[key])]
    return out

def read_source(repo,cfg,stem):
    root=repo/cfg['source_dir']; adapter=cfg['adapter']
    if adapter=='presnap_png':
        source=root/f'{stem}_presnap.png'; meta_path=root/f'{stem}_presnap.json'
        if not source.is_file() or not meta_path.is_file(): raise SystemExit(f'missing source pair for {stem}')
        meta=json.loads(meta_path.read_text(encoding='utf-8')); meta['_meta_path']=str(meta_path); return source,meta
    if adapter=='indexed_transport':
        source=root/f'{stem}.json'
        if not source.is_file(): raise SystemExit(f'missing indexed transport for {stem}: {source}')
        return source,json.loads(source.read_text(encoding='utf-8'))
    raise SystemExit('unsupported adapter: '+adapter)

def prepare_source(repo,cfg,stem,work,source):
    w,h=map(int,cfg['canvas']); px=int(cfg['pixel_size'])
    if cfg['adapter']=='presnap_png':
        out=work/f'{stem}_presnap_grid.png'; im=Image.open(source).convert('RGBA'); target=(w*px,h*px)
        if im.size!=target: im=im.resize(target,Image.Resampling.NEAREST)
        im.save(out); return out
    decoded=work/f'{stem}_decoded.png'
    run(sys.executable,repo/'tools/art_pipeline/decode_indexed_transport.py','--input',source,'--output',decoded)
    scale=int(cfg.get('transport_scale',1)); out=work/f'{stem}_presnap.png'; im=Image.open(decoded).convert('RGBA')
    if scale!=1: im=im.resize((im.width*scale,im.height*scale),Image.Resampling.NEAREST)
    im.save(out); return out

def upstream(tracker,meta,source_fp):
    old=tracker.state['steps']['generate']
    if old['status'] in ('success','skipped') and old.get('fingerprint')!=source_fp: tracker.invalidate_from('generate','source identity changed')
    if tracker.state['steps']['generate']['status']=='pending':
        if meta.get('source_gen_id') or meta.get('source_sha256') or meta.get('source_original_sha256'):
            tracker.success('generate',source_fp,(), 'source identity recovered from provenance')
        else: tracker.skip('generate',source_fp,'imported/non-imagegen source')
    if tracker.state['steps']['edit']['status']=='pending': tracker.skip('edit',source_fp,'no separate edit/repair checkpoint declared')
    if tracker.state['steps']['archive_original']['status']=='pending':
        storage=meta.get('source_storage') or {}
        if storage.get('provider')=='google_drive' and (storage.get('drive_file_id') or storage.get('drive_url')):
            tracker.success('archive_original',source_fp,(), 'Google Drive original provenance present')
        else:
            tracker.block('archive_original','canonical original archive reference missing; processing may continue but promotion must remain blocked')

def execute(tracker,step,fp,outputs,action,resume):
    if resume and tracker.reusable(step,fp):
        print(f'RESUME_SKIP {tracker.asset}/{tracker.era} {step}: fingerprint and output hashes match')
        return
    prev=tracker.state['steps'][step]
    if prev['status']=='success' and prev.get('fingerprint')!=fp: tracker.invalidate_from(step,'input fingerprint changed')
    elif prev['status'] in ('running','failed','blocked'): tracker.invalidate_from(step,'retry after '+prev['status'])
    tracker.begin(step,fp)
    try:
        action()
        missing=[str(x) for x in outputs if not Path(x).is_file()]
        if missing: raise RuntimeError(f'{step} missing outputs: {missing}')
        tracker.success(step,fp,outputs)
    except Exception as exc:
        tracker.fail(step,f'{type(exc).__name__}: {exc}')
        raise

def main():
    p=argparse.ArgumentParser(); p.add_argument('--repo-root',default='.'); p.add_argument('--config',default='art/placeables/PIPELINE_CONFIG.json'); p.add_argument('--asset',required=True); p.add_argument('--era'); p.add_argument('--output',required=True); p.add_argument('--state-dir'); p.add_argument('--pixel-snapper',required=True); p.add_argument('--aseprite',required=True); p.add_argument('--resume',action='store_true'); a=p.parse_args()
    repo=Path(a.repo_root).resolve(); config_path=(repo/a.config).resolve(); config_root,cfg=load_config(config_path,a.asset); out=Path(a.output).resolve(); work_root=out/'.work'; state_dir=Path(a.state_dir).resolve() if a.state_dir else out/'.tracker'; out.mkdir(parents=True,exist_ok=True); work_root.mkdir(parents=True,exist_ok=True); state_dir.mkdir(parents=True,exist_ok=True)
    w,h=map(int,cfg['canvas']); rx,ry=map(int,cfg['registration']); colors=int(cfg['colors']); pixel_size=int(cfg['pixel_size']); pixel_snapper=Path(a.pixel_snapper).resolve(); aseprite=Path(a.aseprite).resolve()
    if not pixel_snapper.is_file(): raise SystemExit('pixel snapper not found: '+str(pixel_snapper))
    if not aseprite.is_file(): raise SystemExit('aseprite not found: '+str(aseprite))
    toolchain=config_root['toolchain']; normalizer=repo/'tools/art_pipeline/normalize_sprite.py'; qa_script=repo/'tools/art_pipeline/qa_sprite.py'; decoder=repo/'tools/art_pipeline/decode_indexed_transport.py'; prompt=repo/cfg.get('prompt_file','') if cfg.get('prompt_file') else None
    common={'git_commit':git_commit(repo),'style_bible_sha256':maybe_sha(repo/'art/style_bible.txt'),'production_manifest_sha256':maybe_sha(repo/'art/placeables/PRODUCTION_MANIFEST.md'),'pipeline_config_sha256':sha(config_path),'processor_sha256':sha(Path(__file__).resolve()),'prompt_sha256':maybe_sha(prompt) if prompt else None}
    eras=[x for x in cfg['eras'] if not a.era or x['stem']==a.era]
    if not eras: raise SystemExit(f'unknown era {a.era!r} for {a.asset}')

    for era in eras:
        stem=era['stem']; tracker=Tracker(state_dir,a.asset,stem); work=work_root/stem; work.mkdir(parents=True,exist_ok=True)
        with tracker.lock():
            source,meta=read_source(repo,cfg,stem); meta_path=Path(meta['_meta_path']) if meta.get('_meta_path') else None
            source_stat={'source_sha256':sha(source),'source_meta_sha256':maybe_sha(meta_path) if meta_path else None,'source_gen_id':meta.get('source_gen_id'),'source_original_sha256':meta.get('source_sha256') or meta.get('source_original_sha256')}
            source_fp=fingerprint({'step':'source_identity','asset':a.asset,'stem':stem,'adapter':cfg['adapter'],'source':source_stat}); upstream(tracker,meta,source_fp)

            presnap=work/(f'{stem}_presnap_grid.png' if cfg['adapter']=='presnap_png' else f'{stem}_presnap.png')
            fp=fingerprint({'step':'source_prepare','source':source_stat,'adapter':cfg['adapter'],'transport_scale':cfg.get('transport_scale',1),'canvas':cfg['canvas'],'pixel_size':pixel_size,'decoder_sha256':maybe_sha(decoder)})
            execute(tracker,'source_prepare',fp,[presnap],lambda:prepare_source(repo,cfg,stem,work,source),a.resume)

            snapped=work/f'{stem}_snapped.png'; fp=fingerprint({'step':'pixel_snap','input_sha256':sha(presnap),'colors':colors,'pixel_size':pixel_size,'tool_revision':toolchain['pixel_snapper_revision'],'tool_binary_sha256':sha(pixel_snapper)})
            execute(tracker,'pixel_snap',fp,[snapped],lambda:run(pixel_snapper,presnap,snapped,colors,'--pixel-size',pixel_size),a.resume)

            normalized=work/f'{stem}_normalized.png'; fp=fingerprint({'step':'normalize','input_sha256':sha(snapped),'normalizer_sha256':sha(normalizer),'canvas':[w,h],'registration':[rx,ry]})
            execute(tracker,'normalize',fp,[normalized],lambda:run(sys.executable,normalizer,'--input',snapped,'--output',normalized,'--width',w,'--height',h,'--anchor-x',rx,'--anchor-y',ry),a.resume)

            final=out/f'{stem}.png'; fp=fingerprint({'step':'aseprite_index','input_sha256':sha(normalized),'aseprite_version':toolchain['aseprite_version'],'tool_binary_sha256':sha(aseprite),'dithering':'none','color_mode':'indexed'})
            execute(tracker,'aseprite_index',fp,[final],lambda:run(aseprite,'-b',normalized,'--dithering-algorithm','none','--color-mode','indexed','--save-as',final,cwd=aseprite.parent),a.resume)

            report=out/f'{stem}.qa.json'; fp=fingerprint({'step':'qa_auto','input_sha256':sha(final),'qa_script_sha256':sha(qa_script),'canvas':[w,h],'qa':cfg.get('qa',{}),'colors':colors})
            execute(tracker,'qa_auto',fp,[report],lambda:run(sys.executable,qa_script,'--input',final,'--width',w,'--height',h,*qa_args(cfg),'--report',report),a.resume)

            provenance={'asset_id':a.asset,'asset':cfg['asset'],'zone':cfg['zone'],'era':era['era'],'year':int(era['year']),'adapter':cfg['adapter'],'source_gen_id':meta.get('source_gen_id'),'source_sha256':meta.get('source_sha256') or meta.get('source_original_sha256'),'source_storage':meta.get('source_storage'),'transport_sha256':source_stat['source_sha256'],'transport_pixel_sha256':meta.get('pixel_sha256'),'spritefusion_pixel_snapper_revision':toolchain['pixel_snapper_revision'],'aseprite_version':toolchain['aseprite_version'],'aseprite_dithering':'none','pixel_size':pixel_size,'colors':colors,'target_canvas':[w,h],'registration_target':[rx,ry],'mechanism_pivots':'pending_measured_rig_pass','output_sha256':sha(final),'reproducibility':common,'publication':{'state':'candidate','runtime_published':False,'visual_review_required':True}}
            (out/f'{stem}.pipeline.json').write_text(json.dumps(provenance,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')

    family=[]
    for era in cfg['eras']:
        stem=era['stem']; png=out/f'{stem}.png'; report=out/f'{stem}.qa.json'; pipe=out/f'{stem}.pipeline.json'
        if not (png.is_file() and report.is_file() and pipe.is_file()):
            print(json.dumps({'asset_id':a.asset,'state':'partial_checkpoint','processed':[x['stem'] for x in eras],'state_dir':str(state_dir)},indent=2)); return
        family.append({'stem':stem,'era':era['era'],'year':int(era['year']),'png':png.name,'sha256':sha(png),'qa':report.name,'pipeline':pipe.name})

    candidate={'version':2,'asset_id':a.asset,'asset':cfg['asset'],'production_dir':cfg['production_dir'],'runtime_target':cfg['runtime_target'],'state':'awaiting_visual_approval','visual_review':cfg['visual_review'],'files':family,'reproducibility':common,'checkpoint':{'state_dir':'.tracker','resume':True,'eras':[x['stem'] for x in cfg['eras']]}}
    candidate_path=out/'candidate-manifest.json'; candidate_path.write_text(json.dumps(candidate,indent=2,ensure_ascii=False)+'\n',encoding='utf-8'); family_fp=fingerprint({'step':'candidate_manifest','files':[(x['stem'],x['sha256']) for x in family],'config_sha256':sha(config_path)})
    for era in cfg['eras']:
        t=Tracker(state_dir,a.asset,era['stem'])
        if not t.reusable('candidate_manifest',family_fp):
            if t.state['steps']['candidate_manifest']['status']=='success': t.invalidate_from('candidate_manifest','family candidate changed')
            t.success('candidate_manifest',family_fp,[candidate_path])

    review=repo/cfg['visual_review']; approved=False
    if review.is_file():
        approved=subprocess.run([sys.executable,repo/'tools/art_pipeline/verify_visual_gate.py','--candidate',out,'--review',review],capture_output=True,text=True).returncode==0
    review_fp=fingerprint({'step':'visual_review','candidate':[(x['stem'],x['sha256']) for x in family],'review_sha256':maybe_sha(review)})
    for era in cfg['eras']:
        t=Tracker(state_dir,a.asset,era['stem'])
        if approved: t.success('visual_review',review_fp,[review],'hash-bound visual review approved')
        elif t.state['steps']['visual_review']['status']!='success': t.block('visual_review','awaiting hash-bound visual approval for this exact candidate')
    print(json.dumps(candidate,indent=2,ensure_ascii=False))

if __name__=='__main__': main()
