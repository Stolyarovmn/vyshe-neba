#!/usr/bin/env python3
"""Deterministically rebuild B01 cut-out parts and era atlases from approved anchors.

Source of truth is the approved E0-E5 anchor art plus measured extraction
metadata. Every output is regenerated from those sources, round-tripped through
Pillow, and compared in RGBA space. No previously generated part PNG is trusted
as an input, so a truncated/corrupt derived PNG cannot poison the rebuild.
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
    return (
        a.size == b.size
        and ImageChops.difference(a.convert("RGBA"), b.convert("RGBA")).getbbox() is None
    )


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

    # Measured semantic priority: indicator > vane > sensor > body.
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
    """Pack exact RGBA pixels into a valid indexed PNG without color reduction."""
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

    # This is also the corruption gate: the just-written PNG must fully decode.
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
    extraction = json.loads((part_root / "part_extraction.json").read_text(encoding="utf-8"))

    report = {
        "asset_id": "B01",
        "asset": "weather_complex",
        "method": "approved anchor -> measured semantic bbox cut-out -> exact indexed PNGs/atlases",
        "derived_input_policy": "never trust existing generated PNGs as rebuild inputs",
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
        era_report = {"year": meta["year"], "parts": {}}

        for part in PARTS:
            got_bbox = bbox_list(generated[part])
            expected_bbox = meta["parts"][part].get("bbox")
            present = meta["parts"][part]["present"]
            if not present:
                if got_bbox is not None:
                    raise SystemExit(f"QA_FAIL: {stem}/{part} should be absent, got bbox {got_bbox}")
            elif got_bbox != expected_bbox:
                raise SystemExit(f"QA_FAIL: {stem}/{part} bbox {got_bbox} != measured {expected_bbox}")

            art_part = part_root / stem / f"{part}.png"
            runtime_part = runtime_root / stem / f"{part}.png"
            palette_entries = exact_indexed_save(generated[part], art_part)
            runtime_part.parent.mkdir(parents=True, exist_ok=True)
            runtime_part.write_bytes(art_part.read_bytes())

            # Decode both copies so transport corruption cannot pass silently.
            for check_path in (art_part, runtime_part):
                with Image.open(check_path) as check:
                    check.load()
                    decoded = check.convert("RGBA")
                if not rgba_equal(decoded, generated[part]):
                    raise SystemExit(f"QA_FAIL: decoded part differs: {check_path}")

            era_report["parts"][part] = {
                "present": present,
                "bbox": got_bbox,
                "pivot": meta["parts"][part].get("pivot"),
                "palette_entries_including_transparent": palette_entries,
                "art_sha256": sha256(art_part),
                "runtime_sha256": sha256(runtime_part),
            }

        # The four rest layers must reproduce the approved anchor exactly.
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

        for check_path in (art_path, runtime_path):
            with Image.open(check_path) as check:
                check.load()
                decoded = check.convert("RGBA")
            if not rgba_equal(decoded, atlas):
                raise SystemExit(f"QA_FAIL: decoded atlas differs: {check_path}")

        report["atlases"][part] = {
            "size": list(atlas_size),
            "palette_entries_including_transparent": palette_entries,
            "art_sha256": sha256(art_path),
            "runtime_sha256": sha256(runtime_path),
            "decoded_rgba_pixel_exact": True,
        }

    report_path = part_root / "atlas_rebuild_qa.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        "B01 part rebuild PASS: all E0-E5 parts regenerated from approved anchors; "
        "rest reconstructions exact; every PNG round-trips; atlases exact"
    )
    print(report_path)


if __name__ == "__main__":
    main()
