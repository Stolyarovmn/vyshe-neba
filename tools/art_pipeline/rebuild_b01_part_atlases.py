#!/usr/bin/env python3
"""Deterministically rebuild B01 cut-out parts/era atlases from approved anchors.

Source of truth is the approved E0-E5 anchor art plus measured extraction
metadata. E0 already has a valid hand-checked part sheet and calibrates the
semantic mask priority. E1-E5 parts are exact pixel cut-outs: no resampling,
painting, quantization, or color changes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ORDER = ["e0_1978", "e1_1986", "e2_1998", "e3_2015", "e4_2035", "e5_2060"]
PARTS = ["body", "sensor", "vane", "indicator"]
CELL = (96, 122)
ART_ROOT = Path("art/gen/placeables/base/weather_complex")
PART_ROOT = ART_ROOT / "parts"
RUNTIME_PART_ROOT = Path("outputs/rocket/dist/assets/placeables/base/weather_complex/parts")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rgba_equal(a: Image.Image, b: Image.Image) -> bool:
    return a.size == b.size and ImageChops.difference(a.convert("RGBA"), b.convert("RGBA")).getbbox() is None


def mask_for_bbox(size, bbox):
    m = Image.new("L", size, 0)
    if bbox is not None:
        x0, y0, x1, y1 = bbox
        ImageDraw.Draw(m).rectangle((x0, y0, x1 - 1, y1 - 1), fill=255)
    return m


def alpha_intersection(a: Image.Image, b: Image.Image) -> Image.Image:
    return ImageChops.multiply(a, b)


def mask_subtract(a: Image.Image, b: Image.Image) -> Image.Image:
    return ImageChops.subtract(a, b)


def mask_union(*masks):
    out = Image.new("L", masks[0].size, 0)
    for m in masks:
        out = ImageChops.lighter(out, m)
    return out


def image_from_mask(anchor: Image.Image, mask: Image.Image) -> Image.Image:
    out = Image.new("RGBA", anchor.size, (0, 0, 0, 0))
    out.paste(anchor, (0, 0), mask)
    return out


def extract_parts(anchor: Image.Image, meta: dict):
    if anchor.size != CELL:
        raise ValueError(f"anchor {anchor.size} != {CELL}")
    alpha = anchor.getchannel("A")

    ind_meta = meta["parts"]["indicator"]
    vane_meta = meta["parts"]["vane"]
    sensor_meta = meta["parts"]["sensor"]

    ind_rect = mask_for_bbox(CELL, ind_meta["bbox"] if ind_meta["present"] else None)
    vane_rect = mask_for_bbox(CELL, vane_meta["bbox"] if vane_meta["present"] else None)
    sensor_rect = mask_for_bbox(CELL, sensor_meta["bbox"] if sensor_meta["present"] else None)

    # Same priority as the approved E0 cut-out: indicator > vane > sensor.
    ind = alpha_intersection(alpha, ind_rect)
    vane = mask_subtract(alpha_intersection(alpha, vane_rect), ind)
    sensor = mask_subtract(alpha_intersection(alpha, sensor_rect), mask_union(ind, vane))
    assigned = mask_union(ind, vane, sensor)
    body = mask_subtract(alpha, assigned)

    return {
        "body": image_from_mask(anchor, body),
        "sensor": image_from_mask(anchor, sensor),
        "vane": image_from_mask(anchor, vane),
        "indicator": image_from_mask(anchor, ind),
    }


def exact_indexed_save(rgba: Image.Image, path: Path):
    """Pack exact RGBA pixels into an indexed PNG without color reduction."""
    rgba = rgba.convert("RGBA")
    palette = [(0, 0, 0)]  # index 0 = transparent
    lookup = {}
    indices = bytearray()
    for r, g, b, a in rgba.getdata():
        if a == 0:
            indices.append(0)
            continue
        if a != 255:
            raise ValueError(f"non-binary alpha {a} while packing {path}")
        rgb = (r, g, b)
        idx = lookup.get(rgb)
        if idx is None:
            idx = len(palette)
            if idx >= 256:
                raise ValueError(f"more than 255 opaque RGB colors while packing {path}")
            lookup[rgb] = idx
            palette.append(rgb)
        indices.append(idx)

    out = Image.frombytes("P", rgba.size, bytes(indices))
    flat = []
    for rgb in palette:
        flat.extend(rgb)
    flat.extend([0] * (768 - len(flat)))
    out.putpalette(flat)
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path, transparency=0, optimize=False)

    with Image.open(path) as check:
        check.load()
        decoded = check.convert("RGBA")
    if not rgba_equal(rgba, decoded):
        raise ValueError(f"indexed pack changed RGBA pixels for {path}")
    return len(palette)


def bbox_list(im: Image.Image):
    b = im.getchannel("A").getbbox()
    return list(b) if b else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-root", default=".")
    args = ap.parse_args()
    repo = Path(args.repo_root)
    part_root = repo / PART_ROOT
    runtime_root = repo / RUNTIME_PART_ROOT
    meta_path = part_root / "part_extraction.json"
    extraction = json.loads(meta_path.read_text(encoding="utf-8"))

    report = {
        "asset_id": "B01",
        "asset": "weather_complex",
        "method": "approved anchor -> measured semantic bbox cut-out -> exact indexed atlas pack",
        "cell": list(CELL),
        "era_order": ORDER,
        "eras": {},
        "atlases": {},
        "result": "pass",
    }
    cells = {part: [] for part in PARTS}

    for stem in ORDER:
        meta = extraction["eras"][stem]
        anchor_path = repo / ART_ROOT / f"{stem}.png"
        with Image.open(anchor_path) as src:
            src.load()
            anchor = src.convert("RGBA")
        if anchor.size != CELL:
            raise SystemExit(f"QA_FAIL: {stem} anchor size {anchor.size}")
        alpha_values = set(anchor.getchannel("A").getdata())
        if not alpha_values.issubset({0, 255}):
            raise SystemExit(f"QA_FAIL: {stem} anchor alpha is not binary")

        generated = extract_parts(anchor, meta)

        if stem == "e0_1978":
            # E0 is the calibration/reference part sheet. Sensor/vane/indicator
            # must match the semantic cut-out algorithm exactly. Body keeps its
            # already approved hidden mast completion.
            for part in ("sensor", "vane", "indicator"):
                existing_path = part_root / stem / f"{part}.png"
                with Image.open(existing_path) as e:
                    e.load(); existing = e.convert("RGBA")
                if not rgba_equal(generated[part], existing):
                    raise SystemExit(f"QA_FAIL: E0 calibration drift for {part}")
                generated[part] = existing
            body_path = part_root / stem / "body.png"
            with Image.open(body_path) as e:
                e.load(); generated["body"] = e.convert("RGBA")
        else:
            # Persist reproducible per-era cut-outs for review and future rig work.
            era_dir = part_root / stem
            era_dir.mkdir(parents=True, exist_ok=True)
            for part in PARTS:
                generated[part].save(era_dir / f"{part}.png", compress_level=9)

        # Metadata bbox is a measured contract. Generated alpha bounds must match.
        era_report = {"year": meta["year"], "parts": {}}
        for part in PARTS:
            got_bbox = bbox_list(generated[part])
            expected_bbox = meta["parts"][part].get("bbox")
            present = meta["parts"][part]["present"]
            if not present:
                if got_bbox is not None:
                    raise SystemExit(f"QA_FAIL: {stem}/{part} should be absent, got bbox {got_bbox}")
            elif part != "body" and got_bbox != expected_bbox:
                raise SystemExit(f"QA_FAIL: {stem}/{part} bbox {got_bbox} != measured {expected_bbox}")
            # E0 body contains approved hidden mast pixels but keeps the same bbox;
            # all other body cut-outs should match their measured bbox exactly.
            if part == "body" and got_bbox != expected_bbox:
                raise SystemExit(f"QA_FAIL: {stem}/body bbox {got_bbox} != measured {expected_bbox}")
            era_report["parts"][part] = {
                "present": present,
                "bbox": got_bbox,
                "pivot": meta["parts"][part].get("pivot"),
            }

        # Rest pose must reconstruct the approved anchor exactly.
        rest = Image.new("RGBA", CELL, (0, 0, 0, 0))
        for part in PARTS:
            rest.alpha_composite(generated[part])
        if not rgba_equal(rest, anchor):
            raise SystemExit(f"QA_FAIL: {stem} rest reconstruction is not pixel-exact")
        era_report["rest_reconstruction_pixel_exact"] = True
        report["eras"][stem] = era_report
        for part in PARTS:
            cells[part].append(generated[part])

    # Pack E0|E1|E2 / E3|E4|E5 with exact colors and no resampling.
    atlas_size = (CELL[0] * 3, CELL[1] * 2)
    for part in PARTS:
        atlas = Image.new("RGBA", atlas_size, (0, 0, 0, 0))
        for i, cell in enumerate(cells[part]):
            atlas.alpha_composite(cell, ((i % 3) * CELL[0], (i // 3) * CELL[1]))

        art_path = part_root / f"{part}_eras.png"
        runtime_path = runtime_root / f"{part}_eras.png"
        palette_entries = exact_indexed_save(atlas, art_path)
        runtime_path.parent.mkdir(parents=True, exist_ok=True)
        runtime_path.write_bytes(art_path.read_bytes())
        if art_path.read_bytes() != runtime_path.read_bytes():
            raise SystemExit(f"QA_FAIL: {part} art/runtime atlas copies differ")
        report["atlases"][part] = {
            "size": list(atlas_size),
            "palette_entries_including_transparent": palette_entries,
            "art_sha256": sha256(art_path),
            "runtime_sha256": sha256(runtime_path),
            "decoded_rgba_pixel_exact": True,
        }

    report_path = part_root / "atlas_rebuild_qa.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("B01 part atlas rebuild PASS: E0 calibration exact; E0-E5 rest reconstructions exact; indexed atlases decode")
    print(report_path)


if __name__ == "__main__":
    main()
