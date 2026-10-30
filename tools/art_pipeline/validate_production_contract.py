#!/usr/bin/env python3
"""Docs/config smoke gate for production contract v2.

Deliberately checks only local production-tree invariants. It does NOT claim
to validate runtime assets, Drive originals, hash-bound approvals, or game CI.
Those require a fully assembled workspace and their existing gates.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REQUIRED = [
    "AGENTS.md",
    "art/docs/ASSET_PRODUCTION_PIPELINE.md",
    "art/docs/PRODUCTION_CONTRACT_V2.md",
    "art/docs/ASSET_BRIEF_TEMPLATE.md",
    "art/docs/GAMES_PROJECT_INSTRUCTIONS.md",
    "art/docs/ASSET_TASK_TRACKER.md",
    "art/docs/EXECUTION_TIMEOUT_POLICY.md",
    "art/style_bible.txt",
    "art/placeables/PRODUCTION_MANIFEST.md",
    "art/placeables/PIPELINE_CONFIG.json",
    "art/placeables/BASE_ISLAND_LAYOUT.json",
]
EXPECTED_YEARS = [1978, 1986, 1998, 2015, 2035, 2060]
EXPECTED_STEPS = [
    "generate", "edit", "archive_original", "source_prepare", "pixel_snap",
    "normalize", "aseprite_index", "qa_auto", "candidate_manifest",
    "visual_review", "promote", "publish_runtime", "game_tests",
]


def validate() -> list[str]:
    errors: list[str] = []
    for path in REQUIRED:
        if not (ROOT / path).is_file():
            errors.append(f"missing required production file: {path}")
    if errors:
        return errors

    cfg = json.loads((ROOT / "art/placeables/PIPELINE_CONFIG.json").read_text(encoding="utf-8"))
    layout = json.loads((ROOT / "art/placeables/BASE_ISLAND_LAYOUT.json").read_text(encoding="utf-8"))
    if cfg.get("version") != 3:
        errors.append("PIPELINE_CONFIG version must be 3 after production/runtime publication split")
    if cfg.get("tracker", {}).get("steps") != EXPECTED_STEPS:
        errors.append("tracker steps must keep promote and publish_runtime as separate boundaries")
    if not isinstance(layout.get("world", {}).get("launch_origin_px"), list):
        errors.append("island launch_origin_px missing")
    if not isinstance(layout.get("purchases"), dict):
        errors.append("island purchases missing")
    targets: set[str] = set()
    for asset_id, item in cfg.get("assets", {}).items():
        eras = item.get("eras", [])
        if [(era.get("era"), era.get("year")) for era in eras] != [
            (f"E{i}", year) for i, year in enumerate(EXPECTED_YEARS)
        ]:
            errors.append(f"{asset_id}: E0..E5/year contract changed")
        canvas = item.get("canvas")
        anchor = item.get("registration")
        if (
            not isinstance(canvas, list) or len(canvas) != 2
            or not all(isinstance(v, int) and v > 0 for v in canvas)
            or not isinstance(anchor, list) or len(anchor) != 2
            or not all(isinstance(v, int) for v in anchor)
            or not (0 <= anchor[0] < canvas[0] and 0 <= anchor[1] < canvas[1])
        ):
            errors.append(f"{asset_id}: invalid canvas/registration")
        target = item.get("runtime_target")
        if not isinstance(target, str) or not target:
            errors.append(f"{asset_id}: runtime_target missing")
        elif target in targets:
            errors.append(f"{asset_id}: duplicate runtime_target {target}")
        else:
            targets.add(target)

    docs = {
        path: (ROOT / path).read_text(encoding="utf-8")
        for path in [
            "AGENTS.md", "art/docs/ASSET_PRODUCTION_PIPELINE.md",
            "art/docs/PRODUCTION_CONTRACT_V2.md", "art/docs/GAMES_PROJECT_INSTRUCTIONS.md"
        ]
    }
    if "PRODUCTION_CONTRACT_V2.md" not in docs["art/docs/ASSET_PRODUCTION_PIPELINE.md"]:
        errors.append("pipeline does not reference contract v2")
    for name in ("ASSET_PRODUCTION_PIPELINE.md", "PRODUCTION_CONTRACT_V2.md", "ref2game"):
        if name not in docs["AGENTS.md"]:
            errors.append(f"AGENTS.md missing pointer: {name}")
    for name in ("game-production", "main", "UNKNOWN", "ref2game"):
        if name not in docs["art/docs/GAMES_PROJECT_INSTRUCTIONS.md"]:
            errors.append(f"project instructions missing: {name}")
    for gate in ("G0", "G1", "G6", "G7"):
        if gate not in docs["art/docs/PRODUCTION_CONTRACT_V2.md"]:
            errors.append(f"contract v2 missing gate: {gate}")
    return errors


if __name__ == "__main__":
    problems = validate()
    if problems:
        for problem in problems:
            print(f"ERROR: {problem}", file=sys.stderr)
        raise SystemExit(1)
    print("PASS: production docs/config smoke gate")
    print("NOTE: runtime/Drive/candidate/visual/rig/game gates NOT checked in this production-only tree")
