#!/usr/bin/env python3
"""Small regression test for checkpoint/resume semantics."""
from __future__ import annotations
import tempfile
from pathlib import Path
from task_tracker import Tracker, fingerprint

def yes(value,msg):
    if not value: raise AssertionError(msg)

def main():
    with tempfile.TemporaryDirectory() as td:
        candidate=Path(td)/'candidate'; state=candidate/'.tracker'; output=candidate/'.work/e0/value.bin'; output.parent.mkdir(parents=True); output.write_bytes(b'v1')
        fp1=fingerprint({'input':'v1'}); t=Tracker(state,'T01','e0_1978'); t.begin('normalize',fp1); t.success('normalize',fp1,[output])
        yes(t.reusable('normalize',fp1),'fresh success must be reusable')
        t2=Tracker(state,'T01','e0_1978'); yes(t2.reusable('normalize',fp1),'state must survive process restart')
        output.write_bytes(b'changed'); yes(not t2.reusable('normalize',fp1),'changed output SHA must invalidate reuse')
        output.write_bytes(b'v1'); t2.state['steps']['pixel_snap']['status']='success'; t2.state['steps']['pixel_snap']['fingerprint']='upstream'; t2.state['steps']['qa_auto']['status']='success'; t2.state['steps']['qa_auto']['fingerprint']='downstream'; t2.save(); t2.invalidate_from('normalize','contract changed')
        yes(t2.state['steps']['pixel_snap']['status']=='success','upstream step must survive downstream invalidation')
        yes(t2.state['steps']['normalize']['status']=='pending','reset step must become pending')
        yes(t2.state['steps']['qa_auto']['status']=='pending','downstream step must become pending')
        t3=Tracker(state,'T01','e0_1978'); yes(t3.state['steps']['pixel_snap']['status']=='success','invalidation must persist')
        with t3.lock():
            blocked=False
            try:
                with Tracker(state,'T01','e0_1978').lock(): pass
            except RuntimeError: blocked=True
            yes(blocked,'second writer must be rejected by lock')
    print('asset task tracker QA PASS: durable state, hash-bound resume, downstream invalidation and writer lock')
if __name__=='__main__': main()
