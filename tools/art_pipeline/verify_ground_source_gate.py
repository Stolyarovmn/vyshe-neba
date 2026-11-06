#!/usr/bin/env python3
"""Require SHA-bound ground-source projection review BEFORE any pixel processing.

A pixel image cannot reveal the historical 3D camera angle. This validates a
human reviewer decision and actual scene evidence; it never predicts PASS.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

from verify_visual_gate import verify_island, verify_png_bytes

PNG_SIG = b"\x89PNG\r\n\x1a\n"
CHECKS = ("identity", "engineering_parts", "era", "projection_match", "base_grounding_visual", "readability")


def file_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_source_review(source: Path, review_path: Path, expected_sha: str,
                         island_sha: str, proxy: dict) -> list[str]:
    errors = []
    if not source.is_file():
        return ["source: original PNG bytes missing"]
    invalid = verify_png_bytes(source)
    if invalid:
        return [f"source: original is not PNG or fails decoding: {invalid}"]
    actual = file_sha(source)
    if actual != expected_sha:
        errors.append("source: original SHA does not match machine provenance")
    if not review_path.is_file():
        return errors + ["source: exact-SHA projection review missing"]
    review = json.loads(review_path.read_text(encoding="utf-8"))
    if review.get("source_gate") != "PASS":
        errors.append("source_gate must be explicit PASS (FAIL/PENDING blocks processing)")
    if review.get("placement_scope") != "TEST_ONLY_NON_AUTHORITATIVE":
        errors.append("source review: preview must be explicitly TEST_ONLY_NON_AUTHORITATIVE; no Map Editor coordinates are required")
    if review.get("source_sha256") != actual:
        errors.append("source review SHA does not match original image bytes")
    if review.get("island_sha256") != island_sha:
        errors.append("source review island SHA differs from exact approved reference")
    if review.get("actual_camera_angle") != "UNKNOWN":
        errors.append("source review must not claim an original 3D camera angle")
    for field, target in (
        ("elevation_proxy_deg", "generation_elevation_proxy_deg"),
        ("tilt_proxy_deg", "generation_tilt_from_top_down_proxy_deg"),
        ("ground_compression_proxy", "ground_plane_compression_target"),
    ):
        if review.get(field) != proxy.get(target):
            errors.append(f"source review {field} does not match calibration")
    checks = review.get("checks") if isinstance(review.get("checks"), dict) else {}
    for field in CHECKS:
        if checks.get(field) != "pass":
            errors.append(f"source review checks.{field} not explicitly pass")
    if not isinstance(review.get("reviewer"), str) or not review["reviewer"].strip():
        errors.append("source review requires reviewer identity")
    if not isinstance(review.get("review_evidence"), str) or not review["review_evidence"].strip():
        errors.append("source review requires exact-source reviewer evidence")

    preview_rel = review.get("scene_preview_png")
    preview_sha = review.get("scene_preview_sha256")
    if not isinstance(preview_rel, str) or not preview_rel or not isinstance(preview_sha, str) or len(preview_sha) != 64:
        errors.append("source review missing SHA-bound scene preview")
    else:
        preview = (review_path.parent / preview_rel).resolve()
        if not preview.is_relative_to(review_path.parent.resolve()):
            errors.append("source preview escapes review evidence folder")
        elif not preview.is_file():
            errors.append("source preview PNG missing")
        elif file_sha(preview) != preview_sha:
            errors.append("source preview PNG SHA mismatch")
        else:
            png_error = verify_png_bytes(preview)
            if png_error:
                errors.append(f"source preview evidence is not a valid PNG: {png_error}")
    return errors


def verify_alpha_transport(source: Path, gate: dict) -> list[str]:
    strategy = gate.get("alpha_strategy", "native_transparent")
    with Image.open(source) as image:
        rgba = image.convert("RGBA")
        alpha = rgba.getchannel("A")
        low, high = alpha.getextrema()
        width, height = rgba.size
        boundary = (
            rgba.crop((0, 0, width, 1)),
            rgba.crop((0, height - 1, width, height)),
            rgba.crop((0, 0, 1, height)),
            rgba.crop((width - 1, 0, width, height)),
        )
        if strategy == "native_transparent":
            if low != 0 or high < 128 or any(edge.getchannel("A").getextrema()[1] >= 128 for edge in boundary):
                return ["native alpha requires transparent background and a visible silhouette clear of the canvas boundary"]
            return []
        if strategy == "opaque_chroma_key":
            color = gate["source_transport"]["key_color_hex"].lstrip("#")
            key = tuple(bytes.fromhex(color)) + (255,)
            if low != 255 or any(edge.getcolors(1) != [(edge.width * edge.height, key)] for edge in boundary):
                return ["chroma key requires a fully opaque PNG with the exact key color around the canvas boundary"]
            if rgba.getcolors(1) == [(width * height, key)]:
                return ["chroma key source contains no visible object"]
            return []
    return [f"unknown source alpha strategy: {strategy}"]


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--source", required=True)
    p.add_argument("--review", required=True)
    p.add_argument("--preflight", type=Path, help="Generation receipt defining raw alpha transport")
    p.add_argument("--expected-source-sha", required=True)
    p.add_argument("--repo-root", default=str(Path(__file__).resolve().parents[2]))
    args = p.parse_args()

    island_sha, proxy = verify_island(Path(args.repo_root).resolve())
    errors = verify_source_review(Path(args.source).resolve(), Path(args.review).resolve(),
                                  args.expected_source_sha, island_sha, proxy)
    if not errors and args.preflight:
        receipt = json.loads(args.preflight.read_text(encoding="utf-8"))
        errors = verify_alpha_transport(Path(args.source), receipt["generation_gate"])
    if errors:
        raise SystemExit("SOURCE_PROJECTION_GATE_BLOCKED: " + "; ".join(errors))
    print(json.dumps({
        "source_gate": "PASS_EVIDENCE_VERIFIED",
        "source_sha256": args.expected_source_sha,
        "approved_island_sha256": island_sha,
        "actual_camera_angle": "UNKNOWN",
        "note": "Human projection review required; this does not measure 3D angle automatically."
    }))


if __name__ == "__main__":
    main()
