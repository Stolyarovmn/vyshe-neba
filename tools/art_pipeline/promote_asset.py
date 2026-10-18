#!/usr/bin/env python3
"""Promote an exact, visually approved candidate into canonical art/gen.

The command updates the runtime source manifest and removes the old committed runtime
mirror for this family. It never commits or pushes; CI wraps the changes in a PR.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--repo-root", default=".")
    p.add_argument("--config", default="art/placeables/PIPELINE_CONFIG.json")
    p.add_argument("--asset", required=True)
    p.add_argument("--candidate", required=True)
    p.add_argument("--runtime-manifest", default="outputs/rocket/runtime-assets.json")
    args = p.parse_args()

    repo = Path(args.repo_root).resolve()
    config_path = repo / args.config
    root = json.loads(config_path.read_text(encoding="utf-8"))
    cfg = root["assets"][args.asset]
    candidate = Path(args.candidate).resolve()
    review = repo / cfg["visual_review"]

    subprocess.run([
        sys.executable, str(repo / "tools/art_pipeline/verify_visual_gate.py"),
        "--candidate", str(candidate), "--review", str(review)
    ], check=True)

    manifest = json.loads((candidate / "candidate-manifest.json").read_text(encoding="utf-8"))
    production = repo / cfg["production_dir"]
    production.mkdir(parents=True, exist_ok=True)
    review_digest = sha256(review)

    include = []
    for item in manifest["files"]:
        for key in ("png", "qa", "pipeline"):
            src = candidate / item[key]
            dst = production / item[key]
            if key == "pipeline":
                data = json.loads(src.read_text(encoding="utf-8"))
                data["publication"] = {
                    "state": "production",
                    "runtime_published": True,
                    "visual_review": cfg["visual_review"],
                    "visual_review_sha256": review_digest,
                    "hash_bound": True
                }
                dst.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            else:
                shutil.copy2(src, dst)
        include.append(item["png"])

    promotion = dict(manifest)
    promotion["state"] = "production"
    promotion["visual_review_sha256"] = review_digest
    promotion["runtime_source"] = "canonical_art_gen"
    (production / "promotion-manifest.json").write_text(
        json.dumps(promotion, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    runtime_manifest_path = repo / args.runtime_manifest
    runtime = json.loads(runtime_manifest_path.read_text(encoding="utf-8"))
    entry = {
        "asset_id": args.asset,
        "source": cfg["production_dir"],
        "target": cfg["runtime_target"],
        "include": include
    }
    families = [x for x in runtime.get("canonical_families", []) if x.get("asset_id") != args.asset]
    families.append(entry)
    families.sort(key=lambda x: x["asset_id"])
    runtime["canonical_families"] = families
    runtime_manifest_path.write_text(json.dumps(runtime, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    legacy = repo / runtime.get("legacy_root", "outputs/rocket/dist/assets") / cfg["runtime_target"]
    if legacy.exists():
        shutil.rmtree(legacy)
        print(f"removed legacy runtime mirror: {legacy.relative_to(repo)}")
    print(json.dumps(entry, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
