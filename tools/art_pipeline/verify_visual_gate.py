#!/usr/bin/env python3
"""Fail-closed exact-SHA candidate approval and ground-projection scene evidence gate.

This tool checks *evidence integrity*, not camera perception. It cannot determine
an original 3D camera angle from a raster image. A human must compare the candidate
with the approved HD island and explicitly approve the exact bytes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCENE_CHECKS = ("projection_match", "contact_points", "land_mask", "occlusion", "gameplay_scale")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _evidence_file(candidate_dir: Path, relative: str, digest: str, kind: str) -> str | None:
    if not isinstance(relative, str) or not relative or not isinstance(digest, str) or len(digest) != 64:
        return f"{kind}: missing file path or SHA-256"
    path = (candidate_dir / relative).resolve()
    if not path.is_relative_to(candidate_dir.resolve()):
        return f"{kind}: path escapes candidate directory"
    if not path.is_file():
        return f"{kind}: missing evidence file {relative}"
    if sha256(path) != digest:
        return f"{kind}: wrong evidence SHA-256 {relative}"
    if kind == "scene_png" and not path.read_bytes().startswith(b"\x89PNG\r\n\x1a\n"):
        return f"{kind}: evidence is not PNG"
    return None


def verify_ground_scene(
    candidate_dir: Path, item: dict, verdict: dict, actual_sha: str,
    island_sha: str, proxy: dict,
) -> list[str]:
    """Ground scene proof must bind the exact candidate, original and approved island.

    Expected review.eras[stem].scene_projection schema:
    {
      "status":"pass", "candidate_sha256":"...", "source_sha256":"...",
      "island_sha256":"...", "actual_camera_angle":"UNKNOWN",
      "elevation_proxy_deg":73.44, "tilt_proxy_deg":16.56,
      "ground_compression_proxy":0.958515,
      "scene_png":"evidence/e0_scene.png", "scene_png_sha256":"...",
      "map_editor_json":"evidence/editor.json", "map_editor_sha256":"...",
      "map_editor_approved_by_user":true, "reviewer":"...", "approval_evidence":"...",
      "checks":{"projection_match":"pass","contact_points":"pass",
                "land_mask":"pass","occlusion":"pass","gameplay_scale":"pass"}
    }
    A machine cannot interpret visual correctness, only verify these declarations
    and their exact-SHA-bound raster/file inputs. Never auto-fill them.
    """
    x = verdict.get("scene_projection")
    if not isinstance(x, dict):
        return ["scene_projection: missing exact-SHA scene review"]
    problems = []
    if x.get("status") != "pass":
        problems.append("scene_projection.status must be pass")
    if x.get("candidate_sha256") != actual_sha:
        problems.append("scene_projection.candidate_sha256 differs from candidate bytes")
    if x.get("island_sha256") != island_sha:
        problems.append("scene_projection.island_sha256 differs from exact approved island")
    if x.get("actual_camera_angle") != "UNKNOWN":
        problems.append("scene_projection must not claim an unproven original camera angle")
    for got, target in (
        ("elevation_proxy_deg", "generation_elevation_proxy_deg"),
        ("tilt_proxy_deg", "generation_tilt_from_top_down_proxy_deg"),
        ("ground_compression_proxy", "ground_plane_compression_target"),
    ):
        if x.get(got) != proxy.get(target):
            problems.append(f"scene_projection.{got} differs from approved proxy")
    checks = x.get("checks") if isinstance(x.get("checks"), dict) else {}
    for name in SCENE_CHECKS:
        if checks.get(name) != "pass":
            problems.append(f"scene_projection.checks.{name} must be explicitly pass")
    if x.get("map_editor_approved_by_user") is not True:
        problems.append("scene_projection: exact Map Editor user approval required")
    if not isinstance(x.get("reviewer"), str) or not x["reviewer"].strip():
        problems.append("scene_projection: reviewer identity missing")
    if not isinstance(x.get("approval_evidence"), str) or not x["approval_evidence"].strip():
        problems.append("scene_projection: exact candidate approval evidence missing")

    pipeline_rel = item.get("pipeline")
    if not pipeline_rel:
        problems.append("scene_projection: candidate pipeline provenance path missing")
    else:
        path = (candidate_dir / pipeline_rel).resolve()
        if not path.is_relative_to(candidate_dir.resolve()) or not path.is_file():
            problems.append("scene_projection: candidate pipeline provenance missing")
        else:
            provenance = json.loads(path.read_text(encoding="utf-8"))
            if not provenance.get("source_sha256") or x.get("source_sha256") != provenance["source_sha256"]:
                problems.append("scene_projection: original source SHA-256 does not match pipeline")

    for kind, path_key, digest_key in (
        ("scene_png", "scene_png", "scene_png_sha256"),
        ("map_editor_json", "map_editor_json", "map_editor_sha256"),
    ):
        err = _evidence_file(candidate_dir, x.get(path_key), x.get(digest_key), "scene_png" if kind == "scene_png" else kind)
        if err:
            problems.append(err)
    return problems


def verify_island(root: Path) -> tuple[str, dict]:
    png = root / "art/gen/environment/start_island_hd.png"
    approval = root / "art/gen/environment/start_island_hd.approval.json"
    calibration = root / "art/gen/environment/start_island_hd.projection.json"
    if not png.is_file() or not approval.is_file() or not calibration.is_file():
        raise SystemExit("SCENE_GATE_BLOCKED: exact approved island PNG/approval/projection missing")
    record = json.loads(approval.read_text(encoding="utf-8"))
    calib = json.loads(calibration.read_text(encoding="utf-8"))
    actual = sha256(png)
    if record.get("approved") is not True or actual != record.get("approved_sha256"):
        raise SystemExit("SCENE_GATE_BLOCKED: island bytes do not match exact approved SHA")
    if calib.get("reference_sha256") != actual:
        raise SystemExit("SCENE_GATE_BLOCKED: island projection calibration SHA mismatch")
    if calib.get("derived_projection_proxy", {}).get("status") != "PROXY_ONLY_NOT_ACTUAL_CAMERA_ANGLE":
        raise SystemExit("SCENE_GATE_BLOCKED: projection proxy cannot be claimed as actual camera")
    if calib.get("actual_camera", {}).get("projection_angle_deg") != "UNKNOWN":
        raise SystemExit("SCENE_GATE_BLOCKED: claimed unknown original camera angle")
    return actual, calib["generation_contract"]


def requires_ground_scene(manifest: dict) -> bool:
    path = str(manifest.get("production_dir", "")).replace("\\", "/")
    return "/base/" in f"/{path.strip('/')}/"


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--candidate", required=True, help="candidate directory")
    p.add_argument("--review", required=True)
    p.add_argument("--repo-root", default=str(ROOT))
    args = p.parse_args()

    candidate_dir = Path(args.candidate).resolve()
    manifest = json.loads((candidate_dir / "candidate-manifest.json").read_text(encoding="utf-8"))
    review_path = Path(args.review)
    if not review_path.is_file():
        raise SystemExit(f"VISUAL_GATE_BLOCKED: missing review {review_path}")
    review = json.loads(review_path.read_text(encoding="utf-8"))
    if review.get("overall_status") != "approved":
        raise SystemExit(
            f"VISUAL_GATE_BLOCKED: overall_status={review.get('overall_status')!r}; "
            "a hash-bound approved review is required"
        )
    ground = requires_ground_scene(manifest)
    island_sha, proxy = verify_island(Path(args.repo_root).resolve()) if ground else (None, None)
    eras = review.get("eras") or {}
    failures = []
    for item in manifest["files"]:
        stem = item["stem"]
        actual = sha256(candidate_dir / item["png"])
        verdict = eras.get(stem) or {}
        status = verdict.get("status")
        expected = verdict.get("sha256")
        if status != "approved" or expected != actual or item.get("sha256") != actual:
            failures.append({"stem": stem, "status": status, "expected": expected, "actual": actual,
                             "manifest_sha256": item.get("sha256")})
            continue
        if ground:
            errors = verify_ground_scene(candidate_dir, item, verdict, actual, island_sha, proxy)
            if errors:
                failures.append({"stem": stem, "scene_gate": "blocked", "errors": errors})
    if failures:
        raise SystemExit("VISUAL_GATE_BLOCKED: " + json.dumps(failures, ensure_ascii=False))
    print(json.dumps({
        "asset_id": manifest["asset_id"],
        "visual_gate": "approved",
        "ground_projection_scene_gate": "evidence_verified" if ground else "not_applicable",
        "camera_angle": "UNKNOWN" if ground else "not_applicable",
        "review_sha256": sha256(review_path),
        "files": [{"stem": x["stem"], "sha256": x["sha256"]} for x in manifest["files"]]
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
