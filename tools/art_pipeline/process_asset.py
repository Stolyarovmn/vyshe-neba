#!/usr/bin/env python3
"""Deterministic candidate builder for 2D placeable assets.

This command never publishes runtime files and never writes to git. It converts one
configured asset family into a candidate directory plus QA/provenance metadata.
Runtime promotion is a separate, hash-bound operation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def maybe_sha(path: Path) -> str | None:
    return sha256(path) if path.is_file() else None


def run(*args: str, cwd: Path | None = None) -> None:
    print("+", " ".join(map(str, args)), flush=True)
    subprocess.run([str(x) for x in args], cwd=cwd, check=True)


def git_commit(repo: Path) -> str | None:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=repo, text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def load_config(path: Path, asset_id: str) -> tuple[dict, dict]:
    root = json.loads(path.read_text(encoding="utf-8"))
    try:
        return root, root["assets"][asset_id]
    except KeyError as exc:
        raise SystemExit(f"unknown asset id {asset_id!r} in {path}") from exc


def source_for_era(repo: Path, cfg: dict, stem: str, work: Path) -> tuple[Path, dict]:
    src_dir = repo / cfg["source_dir"]
    adapter = cfg["adapter"]
    if adapter == "presnap_png":
        raw = src_dir / f"{stem}_presnap.png"
        meta_path = src_dir / f"{stem}_presnap.json"
        if not raw.is_file() or not meta_path.is_file():
            raise SystemExit(f"missing source pair for {stem}: {raw}, {meta_path}")
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        width, height = map(int, cfg["canvas"])
        px = int(cfg["pixel_size"])
        expanded = work / f"{stem}_presnap_grid.png"
        im = Image.open(raw).convert("RGBA")
        target = (width * px, height * px)
        if im.size != target:
            im = im.resize(target, Image.Resampling.NEAREST)
        im.save(expanded)
        meta["transport_sha256"] = sha256(raw)
        meta["transport_size_actual"] = list(Image.open(raw).size)
        return expanded, meta

    if adapter == "indexed_transport":
        spec_path = src_dir / f"{stem}.json"
        if not spec_path.is_file():
            raise SystemExit(f"missing transport for {stem}: {spec_path}")
        meta = json.loads(spec_path.read_text(encoding="utf-8"))
        decoded = work / f"{stem}_decoded.png"
        run(
            sys.executable,
            str(repo / "tools/art_pipeline/decode_indexed_transport.py"),
            "--input", str(spec_path),
            "--output", str(decoded),
        )
        scale = int(cfg.get("transport_scale", 1))
        presnap = work / f"{stem}_presnap.png"
        im = Image.open(decoded).convert("RGBA")
        if scale != 1:
            im = im.resize((im.width * scale, im.height * scale), Image.Resampling.NEAREST)
        im.save(presnap)
        meta["transport_spec_sha256"] = sha256(spec_path)
        meta["transport_scale"] = scale
        return presnap, meta

    raise SystemExit(f"unsupported adapter: {adapter}")


def qa_args(cfg: dict) -> list[str]:
    q = cfg.get("qa", {})
    args = [
        "--max-colors", str(cfg["colors"]),
        "--min-coverage", str(q.get("min_coverage", 0.01)),
        "--min-bbox-fraction", str(q.get("min_bbox_fraction", 0.25)),
    ]
    for key, flag in [
        ("min_visible_width", "--min-visible-width"),
        ("max_visible_width", "--max-visible-width"),
        ("min_visible_height", "--min-visible-height"),
        ("max_visible_height", "--max-visible-height"),
    ]:
        if q.get(key) is not None:
            args += [flag, str(q[key])]
    return args


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--repo-root", default=".")
    p.add_argument("--config", default="art/placeables/PIPELINE_CONFIG.json")
    p.add_argument("--asset", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--pixel-snapper", required=True)
    p.add_argument("--aseprite", required=True)
    args = p.parse_args()

    repo = Path(args.repo_root).resolve()
    config_path = (repo / args.config).resolve()
    config_root, cfg = load_config(config_path, args.asset)
    out = Path(args.output).resolve()
    work = out / ".work"
    out.mkdir(parents=True, exist_ok=True)
    work.mkdir(parents=True, exist_ok=True)

    width, height = map(int, cfg["canvas"])
    reg_x, reg_y = map(int, cfg["registration"])
    pixel_size = int(cfg["pixel_size"])
    colors = int(cfg["colors"])
    toolchain = config_root["toolchain"]
    pixel_snapper = Path(args.pixel_snapper).resolve()
    aseprite = Path(args.aseprite).resolve()
    if not pixel_snapper.is_file():
        raise SystemExit(f"pixel snapper not found: {pixel_snapper}")
    if not aseprite.is_file():
        raise SystemExit(f"aseprite not found: {aseprite}")

    style = repo / "art/style_bible.txt"
    manifest = repo / "art/placeables/PRODUCTION_MANIFEST.md"
    processor = Path(__file__).resolve()
    prompt = repo / cfg.get("prompt_file", "") if cfg.get("prompt_file") else None
    common_fp = {
        "git_commit": git_commit(repo),
        "style_bible_sha256": maybe_sha(style),
        "production_manifest_sha256": maybe_sha(manifest),
        "pipeline_config_sha256": sha256(config_path),
        "processor_sha256": sha256(processor),
        "prompt_sha256": maybe_sha(prompt) if prompt else None,
    }

    produced: list[dict] = []
    for era in cfg["eras"]:
        stem = era["stem"]
        presnap, source = source_for_era(repo, cfg, stem, work)
        snapped = work / f"{stem}_snapped.png"
        normalized = work / f"{stem}_normalized.png"
        final = out / f"{stem}.png"
        report = out / f"{stem}.qa.json"

        run(str(pixel_snapper), str(presnap), str(snapped), str(colors), "--pixel-size", str(pixel_size))
        run(
            sys.executable, str(repo / "tools/art_pipeline/normalize_sprite.py"),
            "--input", str(snapped), "--output", str(normalized),
            "--width", str(width), "--height", str(height),
            "--anchor-x", str(reg_x), "--anchor-y", str(reg_y),
        )
        run(
            str(aseprite), "-b", str(normalized),
            "--dithering-algorithm", "none", "--color-mode", "indexed",
            "--save-as", str(final), cwd=aseprite.parent,
        )
        run(
            sys.executable, str(repo / "tools/art_pipeline/qa_sprite.py"),
            "--input", str(final), "--width", str(width), "--height", str(height),
            *qa_args(cfg), "--report", str(report),
        )

        provenance = {
            "asset_id": args.asset,
            "asset": cfg["asset"],
            "zone": cfg["zone"],
            "era": era["era"],
            "year": int(era["year"]),
            "adapter": cfg["adapter"],
            "source_gen_id": source.get("source_gen_id"),
            "source_sha256": source.get("source_sha256") or source.get("source_original_sha256"),
            "source_storage": source.get("source_storage"),
            "transport_sha256": source.get("transport_sha256") or source.get("transport_spec_sha256"),
            "transport_pixel_sha256": source.get("pixel_sha256"),
            "spritefusion_pixel_snapper_revision": toolchain["pixel_snapper_revision"],
            "aseprite_version": toolchain["aseprite_version"],
            "aseprite_dithering": "none",
            "pixel_size": pixel_size,
            "colors": colors,
            "target_canvas": [width, height],
            "registration_target": [reg_x, reg_y],
            "mechanism_pivots": "pending_measured_rig_pass",
            "output_sha256": sha256(final),
            "reproducibility": common_fp,
            "publication": {
                "state": "candidate",
                "runtime_published": False,
                "visual_review_required": True
            }
        }
        pipeline_path = out / f"{stem}.pipeline.json"
        pipeline_path.write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        produced.append({
            "stem": stem,
            "era": era["era"],
            "year": int(era["year"]),
            "png": final.name,
            "sha256": provenance["output_sha256"],
            "qa": report.name,
            "pipeline": pipeline_path.name
        })

    candidate = {
        "version": 1,
        "asset_id": args.asset,
        "asset": cfg["asset"],
        "production_dir": cfg["production_dir"],
        "runtime_target": cfg["runtime_target"],
        "state": "awaiting_visual_approval",
        "visual_review": cfg["visual_review"],
        "files": produced,
        "reproducibility": common_fp
    }
    (out / "candidate-manifest.json").write_text(
        json.dumps(candidate, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    shutil.rmtree(work)
    print(json.dumps(candidate, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
