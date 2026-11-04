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

from verify_visual_gate import verify_island

PNG_SIG = b"\x89PNG\r\n\x1a\n"
CHECKS = ("identity", "engineering_parts", "era", "projection_match", "land_contact", "readability")


def file_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_source_review(source: Path, review_path: Path, expected_sha: str,
                         island_sha: str, proxy: dict) -> list[str]:
    errors = []
    if not source.is_file() or not source.read_bytes().startswith(PNG_SIG):
        return ["source: original PNG bytes missing or not PNG"]
    actual = file_sha(source)
    if actual != expected_sha:
        errors.append("source: original SHA does not match machine provenance")
    if not review_path.is_file():
        return errors + ["source: exact-SHA projection review missing"]
    review = json.loads(review_path.read_text(encoding="utf-8"))
    if review.get("source_gate") != "PASS":
        errors.append("source_gate must be explicit PASS (FAIL/PENDING blocks processing)")
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
        elif not preview.read_bytes().startswith(PNG_SIG):
            errors.append("source preview evidence is not PNG")
    return errors


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--source", required=True)
    p.add_argument("--review", required=True)
    p.add_argument("--expected-source-sha", required=True)
    p.add_argument("--repo-root", default=str(Path(__file__).resolve().parents[2]))
    args = p.parse_args()

    island_sha, proxy = verify_island(Path(args.repo_root).resolve())
    errors = verify_source_review(Path(args.source).resolve(), Path(args.review).resolve(),
                                  args.expected_source_sha, island_sha, proxy)
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
