#!/usr/bin/env python3
"""B01 E0 evidence-only scene composite; never claims visual or Map Editor approval."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

ISLAND_SHA = "2b85ea5b4bd17506eb9a3c8abc3594c42c4070b1f21948ac01447b0c67364997"
RUNTIME_SHA = "f49c5e6a80d2301013f8a69b669210f0f4cd752248c915a832f203c45630661c"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def mask_at(mask: dict, x: int, y: int) -> bool:
    cell = mask["cell_px"]
    col, row = x // cell, y // cell
    if not (0 <= col < mask["cols"] and 0 <= row < mask["rows"]):
        return False
    digit = int(mask["land_hex_rows"][row][col // 4], 16)
    return bool(digit & (1 << (3 - col % 4)))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--island", type=Path, required=True)
    p.add_argument("--sprite", type=Path, required=True)
    p.add_argument("--layout", type=Path, required=True)
    p.add_argument("--land-mask", type=Path, required=True)
    p.add_argument("--output-dir", type=Path, required=True)
    args = p.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    island_sha = sha(args.island)
    sprite_sha = sha(args.sprite)
    assert island_sha == ISLAND_SHA, ("Wrong approved island SHA", island_sha)
    assert sprite_sha == RUNTIME_SHA, ("Wrong pinned B01 runtime SHA", sprite_sha)
    island = Image.open(args.island).convert("RGBA")
    sprite = Image.open(args.sprite).convert("RGBA")
    assert island.size == (1916, 821), island.size
    assert sprite.size == (96, 122), sprite.size

    layout = json.loads(args.layout.read_text(encoding="utf-8"))
    mask = json.loads(args.land_mask.read_text(encoding="utf-8"))
    spec = layout["purchases"]["weather"]
    assert spec["anchors"] == [[1000, 350]]
    assert spec["sprite_px"] == [142, 180]
    assert spec["footprint_px"] == [100, 28]
    ax, ay = spec["anchors"][0]
    sw, sh = spec["sprite_px"]
    fw, fd = spec["footprint_px"]
    left, top = ax - sw // 2, ay - sh
    expected_mask_points = []
    for yy in range(ay - fd, ay + 1, 4):
        for xx in range(ax - fw // 2, ax + fw // 2 + 1, 4):
            expected_mask_points.append(mask_at(mask, xx, yy))
    land_ratio = sum(expected_mask_points) / len(expected_mask_points)
    assert land_ratio >= 0.95, ("layout footprint not on land", land_ratio)

    sprite_scaled = sprite.resize((sw, sh), Image.Resampling.NEAREST)
    scene = island.copy()
    scene.alpha_composite(sprite_scaled, (left, top))
    scene.save(args.output_dir / "scene_full_exact_island.png")

    crop = (ax - 330, ay - 310, ax + 330, ay + 180)
    scene.crop(crop).save(args.output_dir / "scene_weather_crop.png")
    scene.resize((958, 410), Image.Resampling.NEAREST).save(args.output_dir / "scene_half_zoom.png")

    guides = scene.copy()
    draw = ImageDraw.Draw(guides)
    draw.rectangle((ax - fw // 2, ay - fd, ax + fw // 2, ay), outline=(255, 230, 40, 255), width=2)
    draw.ellipse((ax - 5, ay - 5, ax + 5, ay + 5), fill=(255, 40, 40, 255))
    draw.rectangle((left, top, left + sw - 1, top + sh - 1), outline=(130, 250, 250, 255), width=1)
    guides.crop(crop).save(args.output_dir / "scene_guides_crop.png")

    evidence = {
        "status": "TECHNICAL_COMPOSITE_ONLY_VISUAL_APPROVAL_PENDING",
        "original_3d_camera_angle": "UNKNOWN",
        "island": {"source": str(args.island), "sha256": island_sha, "size": list(island.size)},
        "runtime": {"source": str(args.sprite), "sha256": sprite_sha, "size": list(sprite.size)},
        "layout": {"anchor": [ax, ay], "sprite_px": [sw, sh], "footprint_px": [fw, fd],
                   "top_left": [left, top], "layout_version": layout["version"],
                   "mask_land_fraction": land_ratio, "footprint_land_samples": len(expected_mask_points)},
        "scope": "provisional BASE_ISLAND_LAYOUT placement, NOT user-approved Map Editor placement",
        "source_original_drive_sha256": "02bf3b102e870f1bebc6c826246d4e658d2f9a38abaa0bca8c8a82db9b2bd542",
        "source_original_projection_review": "PENDING",
        "visual_projection_qa": "PENDING",
        "occlusion_qa": "PENDING",
        "gameplay_zoom_visual_qa": "PENDING",
        "map_editor_placement": "UNKNOWN",
        "produced_files": ["scene_full_exact_island.png", "scene_weather_crop.png",
                           "scene_half_zoom.png", "scene_guides_crop.png"],
    }
    (args.output_dir / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"integrity": "PASS", "land_mask": "PASS", "source_gate": "PENDING",
                      "island_sha": island_sha, "runtime_sha": sprite_sha,
                      "land_ratio": land_ratio}, sort_keys=True))


if __name__ == "__main__":
    main()
