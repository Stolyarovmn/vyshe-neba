#!/usr/bin/env python3
"""Validate a machine-readable asset generation preflight receipt.

This gate answers only whether an isolated source-generation call is allowed.
It deliberately does not claim scene approval, runtime integration, promotion,
Drive byte integrity, or game-regression success.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
YEARS = {f"E{i}": year for i, year in enumerate((1978, 1986, 1998, 2015, 2035, 2060))}


def validate(receipt_rel: str) -> list[str]:
    errors: list[str] = []
    path = ROOT / receipt_rel
    if not path.is_file():
        return [f"missing receipt: {receipt_rel}"]
    try:
        r = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"cannot read receipt: {exc}"]

    if r.get("schema_version") != 1:
        errors.append("unsupported schema_version")
    era = r.get("era")
    if era not in YEARS or r.get("year") != YEARS.get(era):
        errors.append("invalid E0-E5 era/year pair")

    for key in ("brief_file", "prompt_file", "style_bible_file"):
        rel = r.get(key)
        if not isinstance(rel, str) or not rel or not (ROOT / rel).is_file():
            errors.append(f"missing referenced local file: {key}={rel!r}")
    if r.get("style_bible_file") != "art/style_bible.txt":
        errors.append("style_bible_file must be art/style_bible.txt")

    archive = r.get("source_archive", {})
    if archive.get("provider") != "google_drive":
        errors.append("source archive provider must be google_drive")
    if not archive.get("folder_id"):
        errors.append("Drive archive folder_id missing")
    if archive.get("verified_present") is not True:
        errors.append("Drive archive destination not verified present")
    if archive.get("original_must_be_immutable") is not True:
        errors.append("raw original immutability gate missing")
    if archive.get("sha256_required_before_processing") is not True:
        errors.append("SHA-256-before-processing gate missing")

    machine = r.get("machine_pipeline", {})
    if machine.get("configured") is not True:
        errors.append("asset is not machine-configured")
    for key in ("canvas", "registration"):
        value = machine.get(key)
        if not isinstance(value, list) or len(value) != 2 or not all(isinstance(v, int) for v in value):
            errors.append(f"invalid machine_pipeline.{key}")
    if not isinstance(machine.get("pixel_size"), int) or machine.get("pixel_size", 0) <= 0:
        errors.append("pixel_size must be a measured positive integer")

    camera = r.get("camera", {})
    if camera.get("family") != "island_top_3_4":
        errors.append("B/W ground asset camera family must be island_top_3_4")
    if camera.get("projection_angle") != "UNKNOWN":
        errors.append("projection_angle must remain UNKNOWN until measured evidence is approved")

    gate = r.get("generation_gate", {})
    for key in ("one_asset_per_call", "one_era_per_call", "transparent_background", "style_bible_verbatim"):
        if gate.get(key) is not True:
            errors.append(f"generation gate {key} is not true")
    if gate.get("can_generate_isolated_candidate") is not True:
        errors.append("isolated candidate generation is not allowed by receipt")

    runtime = r.get("runtime_contract", {})
    if gate.get("can_promote") is True:
        if gate.get("can_scene_approve") is not True:
            errors.append("promotion cannot be open while scene approval is closed")
        if runtime.get("status") != "verified":
            errors.append("promotion cannot be open without verified runtime contract")
    if gate.get("can_scene_approve") is True:
        if camera.get("current_hd_reference_status") not in ("approved", "approved_by_user"):
            errors.append("scene approval cannot be open without approved current HD island reference")
        if camera.get("current_hd_approved_by_user") is not True:
            errors.append("scene approval cannot be open while HD island approved_by_user is false")

    return errors


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("receipt")
    args = p.parse_args()
    errors = validate(args.receipt)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS: isolated generation preflight is internally consistent")
    print("NOTE: scene/runtime/promotion/game gates may still be BLOCKED by the receipt")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
