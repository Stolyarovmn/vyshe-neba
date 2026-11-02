#!/usr/bin/env python3
"""Fail-closed one-specimen generation and exact-SHA era sheet assembly.

Only creates a DERIVED candidate. It never invents visual approval, an
imagegen generation ID, a Drive upload, or an approved canonical sheet.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import platform
import sys
from pathlib import Path

try:
    from PIL import Image, __version__ as pillow_version
except ImportError as exc:
    raise SystemExit("BLOCKED: install Pillow==12.0.0 in an isolated environment") from exc

import production_guard as guard

ROOT = Path(__file__).resolve().parents[2]
PINNED_PILLOW = "12.0.0"
INPUT_SIZE = (1024, 1024)
SHEET_SIZE = (1536, 1024)
GRID = (4, 2)
PAD = 32
BACKGROUND = (242, 240, 242, 255)  # #F2F0F2
TARGET_SHEETS = {
    ("E2", "materials-construction", "02-joints-repairs"),
    ("E2", "mechanics-infrastructure", "01-servo-drives"),
    ("E2", "controls-displays", "02-instruments-displays"),
    ("E2", "lighting-signals", "02-signal-hardware"),
}
BEGIN = "=== BEGIN VYSHE-NEBA EXPLICIT IMAGEGEN BLOCK ==="
END = "=== END VYSHE-NEBA EXPLICIT IMAGEGEN BLOCK ==="
NEXT_ACTION = (
    "NEXT ACTION: invoke the image-generation tool immediately after this block, "
    "with no intervening natural-language instruction."
)


class Blocked(ValueError):
    pass


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def nonempty(x: object) -> bool:
    return isinstance(x, str) and bool(x.strip())


def require(condition: bool, message: str) -> None:
    if not condition:
        raise Blocked(message)


def spec_path(path: str | Path) -> Path:
    result = Path(path)
    return result if result.is_absolute() else ROOT / result


def read_spec(path: str | Path) -> tuple[dict, str]:
    raw = spec_path(path).read_bytes()
    spec = json.loads(raw)
    errs = guard.validate_spec(spec, str(path))
    require(not errs, "invalid canonical sheet spec: " + "; ".join(errs))
    key = (spec["era"], spec["role"], spec["sheet"])
    require(key in TARGET_SHEETS, "specimen composition is not authorized for this sheet")
    require(tuple(spec["generation"]["size"]) == SHEET_SIZE, "sheet must be 1536x1024")
    require(tuple(spec["generation"]["layout"]) == GRID, "sheet layout must be 4x2")
    require(len(spec["specimens"]) == 8, "expected exactly eight specimen IDs")
    require([x["id"] for x in spec["specimens"]] == [f"{n:02d}" for n in range(1, 9)],
            "expected ordered IDs 01..08")
    return spec, digest(raw)


def find_specimen(spec: dict, specimen_id: str) -> dict:
    for item in spec["specimens"]:
        if item["id"] == specimen_id:
            return item
    raise Blocked("invalid specimen ID: " + specimen_id)


def build_request(spec: dict, specimen_id: str, style: str | None = None) -> str:
    item = find_specimen(spec, specimen_id)
    if style is None:
        style = (ROOT / "art/style_bible.txt").read_text(encoding="utf-8")
    require(bool(style.strip()), "style bible empty")
    other_names = [x["name"] for x in spec["specimens"] if x["id"] != specimen_id]
    lines = [
        "PRODUCTION GUARD SINGLE ATOMIC SPECIMEN REQUEST",
        f"{spec['era']} / {spec['year']} — {spec['role']} — {spec['sheet']}",
        f"ONE isolated specimen, ID {specimen_id}, of the unchanged canonical 8-item sheet.",
        f"Generate EXACTLY ONE physical specimen: {item['name']}.",
        f"REQUIRED CONSTRUCTION: {item['description']}",
        "SOURCE CANVAS: 1024x1024 true RGBA transparent background, a complete uncropped object",
        "centered with nonzero clear margin on all four sides. No ground, scene, caption,",
        "grid, title, helper parts, extra objects, shadow, FX, glowing state or mockup.",
        "Do NOT draw the other seven specimens from this sheet:",
        "; ".join(other_names) + ".",
        "DO NOT GENERATE ANYTHING NOT LISTED ABOVE.",
        "GLOBAL EXCLUSIONS: " + "; ".join(spec["global_forbidden"]) + ".",
        f"ERA LANGUAGE: {spec['era_contract']['character']}.",
        "REQUIRED ERA SIGNALS: " + "; ".join(spec["era_contract"]["required_signals"]) + ".",
        "REPLACED PREVIOUS ERA: " + "; ".join(spec["era_contract"]["replaced_previous_language"]) + ".",
        "FORBIDDEN REGRESSION: " + "; ".join(spec["era_contract"]["forbidden_regressions"]) + ".",
        "This call is for this one physical item only. Code will assemble the finished",
        "1536x1024 sheet from eight separately generated and independently reviewed PNGs.",
    ]
    request = "\n".join(lines) + "\n\n--- CANONICAL STYLE BIBLE (VERBATIM) ---\n" + style
    require(request.count(style) == 1, "style bible not present exactly once")
    return request


def build_chat_block(spec: dict, specimen_id: str, style: str | None = None) -> str:
    request = build_request(spec, specimen_id, style)
    return (
        f"{BEGIN}\ncanonical_request_sha256: {digest(request.encode('utf-8'))}\n"
        f"{NEXT_ACTION}\n\n"
        "Use the complete canonical single-specimen request below, without summarizing, "
        "paraphrasing, substituting or omitting its construction, exclusions, era rules "
        "or verbatim style bible.\n\n"
        "--- BEGIN CANONICAL REQUEST ---\n"
        + request.rstrip() + "\n"
        "--- END CANONICAL REQUEST ---\n"
        f"{END}\n"
    )


def write_text(text: str, output: str | None) -> None:
    if output:
        dst = Path(output)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(text, encoding="utf-8")
    else:
        print(text, end="" if text.endswith("\n") else "\n")


def verify_source(file: Path) -> tuple[tuple[int, int, int, int], Image.Image]:
    require(file.is_file(), f"missing source file: {file}")
    with Image.open(file) as opened:
        require(opened.format == "PNG", f"source must be PNG: {file}")
        require(opened.mode == "RGBA", f"RGBA transparency is required: {file}")
        require(opened.size == INPUT_SIZE, f"source size must be 1024x1024: {file}")
        image = opened.copy()
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    require(bbox is not None, f"empty transparent source: {file}")
    x0, y0, x1, y1 = bbox
    require(x0 > 0 and y0 > 0 and x1 < INPUT_SIZE[0] and y1 < INPUT_SIZE[1],
            f"source item touches border / is cropped: {file}")
    require(any(alpha.getpixel(point) == 0 for point in ((0, 0), (0, 1023), (1023, 0), (1023, 1023))),
            f"source has no transparent margin: {file}")
    return bbox, image


def read_manifest(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    require(isinstance(data, dict) and data.get("schema_version") == 1, "invalid manifest schema")
    return data


def checked_parts(spec: dict, spec_sha: str, logical_spec_path: str,
                  manifest: dict, inputs_root: Path) -> list[dict]:
    require(manifest.get("spec_file") == logical_spec_path, "manifest spec path mismatch")
    require(manifest.get("spec_sha256") == spec_sha, "stale sheet spec SHA-256")
    parts = manifest.get("parts")
    require(isinstance(parts, list) and len(parts) == 8, "eight reviewed raw parts required")
    expected = [x["id"] for x in spec["specimens"]]
    ids = [part.get("id") if isinstance(part, dict) else None for part in parts]
    require(ids == expected, "part IDs must be exactly 01..08, in canonical order")
    root = inputs_root.resolve(strict=True)
    used_paths: set[Path] = set()
    used_shas: set[str] = set()
    good: list[dict] = []
    for part in parts:
        sid = part["id"]
        for key in ("source", "sha256", "generation_id", "request_sha256",
                    "drive_file_id", "drive_url"):
            require(nonempty(part.get(key)), f"{sid}: missing required {key}")
        rel = Path(part["source"])
        require(not rel.is_absolute() and ".." not in rel.parts,
                f"{sid}: absolute or parent-escaping source path")
        source = (root / rel).resolve(strict=True)
        require(source.is_relative_to(root), f"{sid}: symlink escape blocked")
        require(source not in used_paths, f"{sid}: duplicated original file path")
        used_paths.add(source)
        raw = source.read_bytes()
        sha = digest(raw)
        require(part["sha256"] == sha, f"{sid}: raw source SHA mismatch")
        require(sha not in used_shas, f"{sid}: duplicate raw image bytes")
        used_shas.add(sha)
        require(part["request_sha256"] ==
                digest(build_request(spec, sid).encode("utf-8")),
                f"{sid}: wrong deterministic request SHA")
        require(part["drive_file_id"] in part["drive_url"] and
                part["drive_url"].startswith("https://drive.google.com/"),
                f"{sid}: missing/mismatched Drive provenance")
        review = part.get("review")
        require(isinstance(review, dict) and review.get("verdict") == "pass" and
                nonempty(review.get("reviewer")) and
                nonempty(review.get("notes")),
                f"{sid}: no explicit PASS visual review")
        bbox, image = verify_source(source)
        good.append({"id": sid, "source": source, "sha": sha, "part": part,
                     "bbox": bbox, "image": image})
    return good


def compose_pixels(checked: list[dict]) -> tuple[bytes, list[dict]]:
    image = Image.new("RGBA", SHEET_SIZE, BACKGROUND)
    cell_w = SHEET_SIZE[0] // GRID[0]
    cell_h = SHEET_SIZE[1] // GRID[1]
    available_w, available_h = cell_w - 2 * PAD, cell_h - 2 * PAD
    placements: list[dict] = []
    for idx, src in enumerate(checked):
        x0, y0, x1, y1 = src["bbox"]
        width, height = x1 - x0, y1 - y0
        if available_w * height <= available_h * width:
            out_w = available_w
            out_h = max(1, height * available_w // width)
        else:
            out_h = available_h
            out_w = max(1, width * available_h // height)
        cut = src["image"].crop(src["bbox"])
        resized = cut.resize((out_w, out_h), resample=Image.Resampling.NEAREST)
        cell_x, cell_y = (idx % GRID[0]) * cell_w, (idx // GRID[0]) * cell_h
        dst_x = cell_x + (cell_w - out_w) // 2
        dst_y = cell_y + (cell_h - out_h) // 2
        require(dst_x >= cell_x + PAD and dst_y >= cell_y + PAD and
                dst_x + out_w <= cell_x + cell_w - PAD and
                dst_y + out_h <= cell_y + cell_h - PAD,
                f"out-of-cell placement for {src['id']}")
        image.alpha_composite(resized, (dst_x, dst_y))
        placements.append({"id": src["id"], "raw_sha256": src["sha"],
                           "alpha_bbox": list(src["bbox"]),
                           "resized": [out_w, out_h],
                           "top_left": [dst_x, dst_y]})
    b = io.BytesIO()
    image.save(b, format="PNG", compress_level=9, optimize=False)
    return b.getvalue(), placements


def compose(spec_file: str, manifest_file: Path, root: Path,
            output: Path | None = None, report: Path | None = None,
            verify_image: Path | None = None,
            verify_report: Path | None = None) -> dict:
    require(pillow_version == PINNED_PILLOW,
            f"requires pinned Pillow=={PINNED_PILLOW}; got {pillow_version}")
    spec, spec_sha = read_spec(spec_file)
    manifest = read_manifest(manifest_file)
    checked = checked_parts(spec, spec_sha, spec_file, manifest, root)
    png, placements = compose_pixels(checked)
    sha = digest(png)
    detail = {
        "schema_version": 1,
        "kind": "derived_era_reference_sheet_candidate",
        "spec_file": spec_file,
        "spec_sha256": spec_sha,
        "composite": {
            "sha256": sha, "bytes": len(png), "dimensions": list(SHEET_SIZE),
            "layout": list(GRID), "background": "#F2F0F2", "cell_padding": PAD,
            "resample": "nearest", "pillow_version": pillow_version,
            "python_version": platform.python_version(),
            "composer_sha256": digest(Path(__file__).read_bytes())
        },
        "parts": placements,
        "status": "pending_exact_sheet_visual_review",
        "warning": "This is derived candidate art, NOT an original generator image or visual approval."
    }
    if verify_image is not None:
        require(verify_image.read_bytes() == png,
                "recomposition differs from supplied exact candidate PNG")
        require(verify_report is not None and verify_report.is_file(),
                "missing original derived provenance report")
        prior = json.loads(verify_report.read_text(encoding="utf-8"))
        require(prior == detail, "derived provenance changed")
        return detail
    require(output is not None and report is not None, "output and provenance report required")
    require(output.resolve() != report.resolve(), "output and report collide")
    require(not output.exists() and not report.exists(),
            "candidate/report exist: refuse overwrite")
    output.parent.mkdir(parents=True, exist_ok=True)
    report.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(png)
    report.write_text(json.dumps(detail, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return detail


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for cmd in ("build-request", "build-chat-block", "verify-chat-block"):
        p = sub.add_parser(cmd)
        p.add_argument("spec")
        p.add_argument("id")
        if cmd == "verify-chat-block":
            p.add_argument("block")
        else:
            p.add_argument("--output")
    for cmd in ("compose", "verify-composite"):
        p = sub.add_parser(cmd)
        p.add_argument("spec")
        p.add_argument("manifest")
        p.add_argument("--inputs-root", required=True)
        if cmd == "compose":
            p.add_argument("--output", required=True)
            p.add_argument("--report", required=True)
        else:
            p.add_argument("--image", required=True)
            p.add_argument("--report", required=True)
    args = ap.parse_args()
    try:
        if args.cmd in ("build-request", "build-chat-block", "verify-chat-block"):
            spec, _ = read_spec(args.spec)
            if args.cmd == "build-request":
                write_text(build_request(spec, args.id), args.output)
            elif args.cmd == "build-chat-block":
                write_text(build_chat_block(spec, args.id), args.output)
            else:
                require(Path(args.block).read_text(encoding="utf-8") ==
                        build_chat_block(spec, args.id),
                        "explicit chat bridge differs from deterministic request")
                print("PASS: exact single-specimen chat bridge")
            return 0
        if args.cmd == "compose":
            result = compose(args.spec, Path(args.manifest), Path(args.inputs_root),
                             output=Path(args.output), report=Path(args.report))
        else:
            result = compose(args.spec, Path(args.manifest), Path(args.inputs_root),
                             verify_image=Path(args.image), verify_report=Path(args.report))
        print("PASS:", result["composite"]["sha256"], result["status"])
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print("BLOCKED:", exc, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
