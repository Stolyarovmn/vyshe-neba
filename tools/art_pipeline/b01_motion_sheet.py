#!/usr/bin/env python3
"""Render B01 Weather Complex frame-by-frame rig QA sheets from runtime atlases.

This is a QA renderer, not an art generator. It uses the approved runtime part
atlases + measured pivots and never resamples runtime art except nearest-neighbor
preview enlargement in the diagnostic sheet.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

ORDER = ["e0_1978", "e1_1986", "e2_1998", "e3_2015", "e4_2035", "e5_2060"]
PARTS = ["body", "sensor", "vane", "indicator"]
FRAMES = [
    ("REST", 0.0, 0.0, False),
    ("NOTICE", -1.0, -0.50, True),
    ("WORK 25%", -0.50, -0.25, False),
    ("WORK 50%", 0.0, 0.0, False),
    ("WORK 75%", 0.50, 0.25, False),
    ("WORK 100%", 1.0, 0.50, False),
    ("FINISH", 0.50, 0.35, True),
    ("COOLDOWN", 0.10, 0.10, False),
    ("WIND LEFT", 0.0, -1.0, False),
    ("WIND RIGHT", 0.0, 1.0, False),
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def alpha_bbox(im: Image.Image):
    return im.getchannel("A").getbbox()


def paste_rgba(base: Image.Image, layer: Image.Image) -> None:
    base.alpha_composite(layer)


def rotate_about(layer: Image.Image, pivot, radians: float) -> Image.Image:
    if pivot is None or abs(radians) < 1e-12:
        return layer.copy()
    # Canvas2D has a downward Y axis, so positive JS canvas rotation appears
    # clockwise. Pillow's positive rotation appears counter-clockwise: negate.
    degrees = -math.degrees(radians)
    return layer.rotate(
        degrees,
        resample=Image.Resampling.NEAREST,
        center=(float(pivot[0]), float(pivot[1])),
        expand=False,
    )


def checker(size, block=8):
    w, h = size
    im = Image.new("RGBA", size, (12, 22, 31, 255))
    d = ImageDraw.Draw(im)
    a = (20, 34, 45, 255)
    b = (14, 26, 36, 255)
    for y in range(0, h, block):
        for x in range(0, w, block):
            d.rectangle((x, y, min(w - 1, x + block - 1), min(h - 1, y + block - 1)), fill=a if ((x // block + y // block) & 1) else b)
    return im


def atlas_cell(atlas: Image.Image, index: int, cell_w: int, cell_h: int) -> Image.Image:
    x = (index % 3) * cell_w
    y = (index // 3) * cell_h
    return atlas.crop((x, y, x + cell_w, y + cell_h)).convert("RGBA")


def render_pose(cells, era_meta, sensor_angle, vane_angle, indicator_on):
    out = Image.new("RGBA", cells["body"].size, (0, 0, 0, 0))
    paste_rgba(out, cells["body"])
    if era_meta["sensor"]["present"]:
        paste_rgba(out, rotate_about(cells["sensor"], era_meta["sensor"]["pivot"], sensor_angle))
    if era_meta["vane"]["present"]:
        paste_rgba(out, rotate_about(cells["vane"], era_meta["vane"]["pivot"], vane_angle))
    if era_meta["indicator"]["present"]:
        paste_rgba(out, cells["indicator"])
    if indicator_on and era_meta["indicator"]["present"]:
        p = era_meta["indicator"]["pivot"]
        d = ImageDraw.Draw(out)
        # Same tiny code-owned acknowledgement marker used by the QA harness.
        x, y = int(p[0] + 6), int(p[1])
        d.rectangle((x, y, x + 1, y + 1), fill=(242, 184, 77, 255))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True, help="Runtime B01 parts directory containing *_eras.png + rig.json")
    ap.add_argument("--output-dir", required=True)
    args = ap.parse_args()

    root = Path(args.root)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    rig_path = root / "rig.json"
    rig = json.loads(rig_path.read_text(encoding="utf-8"))
    cell_w, cell_h = rig["atlas_layout"]["cell"]
    if [cell_w, cell_h] != rig["canvas"]:
        raise SystemExit("QA_FAIL: atlas cell and rig canvas disagree")
    if rig["atlas_layout"]["order"] != ORDER:
        raise SystemExit("QA_FAIL: unexpected B01 atlas order")

    atlases = {}
    atlas_sha = {}
    expected_size = (cell_w * 3, cell_h * 2)
    for part in PARTS:
        p = root / f"{part}_eras.png"
        im = Image.open(p).convert("RGBA")
        if im.size != expected_size:
            raise SystemExit(f"QA_FAIL: {part} atlas size {im.size} != {expected_size}")
        atlases[part] = im
        atlas_sha[part] = sha256(p)

    report = {
        "asset_id": "B01",
        "asset": "weather_complex",
        "stage": "motion_sheet_frame_by_frame_qa",
        "canvas": [cell_w, cell_h],
        "registration": rig["registration"],
        "rig_sha256": sha256(rig_path),
        "atlas_sha256": atlas_sha,
        "frames": [f[0] for f in FRAMES],
        "eras": {},
        "result": "pass",
    }

    preview_scale = 3
    tile_w = cell_w * preview_scale + 12
    tile_h = cell_h * preview_scale + 30
    rows = []

    for i, stem in enumerate(ORDER):
        meta = rig["eras"][stem]
        cells = {part: atlas_cell(atlases[part], i, cell_w, cell_h) for part in PARTS}

        rest = render_pose(cells, meta, 0.0, 0.0, False)
        anchor_path = root.parent / f"{stem}.png"
        anchor = Image.open(anchor_path).convert("RGBA")
        if anchor.size != (cell_w, cell_h):
            raise SystemExit(f"QA_FAIL: {stem} anchor size {anchor.size}")
        exact = ImageChops.difference(rest, anchor).getbbox() is None
        if not exact:
            raise SystemExit(f"QA_FAIL: {stem} rest reconstruction differs from approved anchor")

        max_sensor = 0.08 if int(meta["year"]) >= 2035 else 0.16
        max_vane = 0.22
        era_frames = []
        clipped = []
        row = Image.new("RGBA", (tile_w * len(FRAMES), tile_h), (7, 15, 22, 255))
        draw = ImageDraw.Draw(row)

        for j, (label, sensor_f, vane_f, indicator_on) in enumerate(FRAMES):
            sensor_angle = max_sensor * sensor_f
            vane_angle = max_vane * vane_f if meta["vane"]["present"] else 0.0
            pose = render_pose(cells, meta, sensor_angle, vane_angle, indicator_on)
            bbox = alpha_bbox(pose)
            if bbox is None:
                raise SystemExit(f"QA_FAIL: {stem}/{label} rendered empty")
            touches_edge = bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= cell_w or bbox[3] >= cell_h
            if touches_edge:
                clipped.append(label)

            frame_sha = hashlib.sha256(pose.tobytes()).hexdigest()
            era_frames.append({
                "name": label,
                "sensor_angle_rad": round(sensor_angle, 6),
                "vane_angle_rad": round(vane_angle, 6),
                "indicator_on": bool(indicator_on),
                "visible_bbox": list(bbox),
                "touches_canvas_edge": touches_edge,
                "rgba_sha256": frame_sha,
            })

            bg = checker((cell_w * preview_scale, cell_h * preview_scale), 12)
            enlarged = pose.resize(bg.size, Image.Resampling.NEAREST)
            bg.alpha_composite(enlarged)
            x = j * tile_w + 6
            row.alpha_composite(bg, (x, 22))
            draw.text((x, 5), label, fill=(224, 232, 226, 255))

        if clipped:
            raise SystemExit(f"QA_FAIL: {stem} motion clips canvas in: {', '.join(clipped)}")

        era_path = out_dir / f"{stem}_motion.png"
        row.save(era_path, optimize=True)
        rows.append(row)
        report["eras"][stem] = {
            "year": meta["year"],
            "rest_reconstruction_pixel_exact": exact,
            "sensor_pivot": meta["sensor"]["pivot"],
            "vane_pivot": meta["vane"]["pivot"],
            "indicator_pivot": meta["indicator"]["pivot"],
            "vane_present": meta["vane"]["present"],
            "frames": era_frames,
            "motion_sheet": era_path.name,
            "motion_sheet_sha256": sha256(era_path),
        }

    all_sheet = Image.new("RGBA", (max(r.width for r in rows), sum(r.height for r in rows)), (5, 11, 17, 255))
    y = 0
    for stem, row in zip(ORDER, rows):
        all_sheet.alpha_composite(row, (0, y))
        d = ImageDraw.Draw(all_sheet)
        d.text((4, y + tile_h - 14), stem.upper(), fill=(239, 194, 99, 255))
        y += row.height
    all_path = out_dir / "b01_motion_sheet.png"
    all_sheet.save(all_path, optimize=True)
    report["motion_sheet"] = all_path.name
    report["motion_sheet_sha256"] = sha256(all_path)

    report_path = out_dir / "motion_qa.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"B01 motion QA PASS: {len(ORDER)} eras × {len(FRAMES)} frames; rest reconstruction exact; no canvas clipping")
    print(all_path)
    print(report_path)


if __name__ == "__main__":
    main()
