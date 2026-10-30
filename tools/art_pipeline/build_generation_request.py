#!/usr/bin/env python3
"""Build one deterministic production imagegen request.

The canonical asset prompt is followed by art/style_bible.txt byte-for-text
(as decoded UTF-8) without paraphrasing. Ground/placeable requests also bind to
the measured SHA-bound island projection proxy. The proxy is a generation
control, not a claim about the unknown original 3D camera.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VALID_ERAS = {f"E{i}": year for i, year in enumerate((1978, 1986, 1998, 2015, 2035, 2060))}


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


def read_text(rel: str) -> str:
    path = ROOT / rel
    if not path.is_file():
        fail(f"missing file: {rel}")
    return path.read_text(encoding="utf-8")


def read_json(rel: str) -> dict:
    try:
        return json.loads(read_text(rel))
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON {rel}: {exc}")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--receipt", required=True, help="repo-relative generation preflight JSON")
    p.add_argument("--output", help="optional repo-relative or absolute output path; stdout when omitted")
    args = p.parse_args()

    receipt = read_json(args.receipt)
    asset_id = receipt.get("asset_id")
    slug = receipt.get("slug")
    era = receipt.get("era")
    year = receipt.get("year")
    prompt_file = receipt.get("prompt_file")
    style_file = receipt.get("style_bible_file")
    gate = receipt.get("generation_gate", {})

    if not asset_id or not slug:
        fail("receipt must contain asset_id and slug")
    if era not in VALID_ERAS or year != VALID_ERAS[era]:
        fail(f"invalid era/year pair: {era}/{year}")
    if gate.get("one_asset_per_call") is not True:
        fail("one_asset_per_call gate is not true")
    if gate.get("one_era_per_call") is not True:
        fail("one_era_per_call gate is not true")
    if gate.get("style_bible_verbatim") is not True:
        fail("style_bible_verbatim gate is not true")
    if gate.get("can_generate_isolated_candidate") is not True:
        fail("receipt does not allow isolated candidate generation")
    if style_file != "art/style_bible.txt":
        fail("production style bible path must be art/style_bible.txt")

    prompt = read_text(prompt_file)
    style = read_text(style_file)
    if not style.strip():
        fail("style bible is empty")

    camera = receipt.get("camera", {})
    if camera.get("projection_angle") != "UNKNOWN":
        fail("actual source camera projection_angle must remain UNKNOWN unless independently proven")

    calibration_rel = camera.get("projection_calibration_file")
    if not isinstance(calibration_rel, str) or not calibration_rel:
        fail("ground asset projection_calibration_file missing")
    calibration = read_json(calibration_rel)
    proxy = calibration.get("derived_projection_proxy", {})
    generation = calibration.get("generation_contract", {})
    if proxy.get("status") != "PROXY_ONLY_NOT_ACTUAL_CAMERA_ANGLE":
        fail("projection calibration is not marked as proxy-only")
    if generation.get("numeric_proxy_is_secondary_to_reference_match") is not True:
        fail("projection proxy must be secondary to exact reference match")
    if calibration.get("reference_sha256") != camera.get("current_hd_reference_sha256"):
        fail("projection calibration reference SHA does not match receipt HD reference SHA")

    elevation = float(generation.get("generation_elevation_proxy_deg"))
    from_top = float(generation.get("generation_tilt_from_top_down_proxy_deg"))
    compression = float(generation.get("ground_plane_compression_target"))

    scope = (
        "PRODUCTION GENERATION REQUEST\n"
        f"Asset: {asset_id} / {slug}\n"
        f"Era: {era} / {year}\n"
        "Scope: exactly ONE complete isolated asset in this call; no era board, alternatives, detached spare parts, or extra objects.\n"
        f"Camera family: {camera.get('family', 'UNKNOWN')}\n"
        "Actual source camera angle: UNKNOWN. Do not invent or state 47 degrees as fact.\n"
        f"Measured ground-projection generation proxy: {elevation:.2f} degrees elevation above the ground plane "
        f"({from_top:.2f} degrees from straight top-down), ground-circle compression {compression:.6f}.\n"
        "This numeric value is an orthographic-equivalent control derived from the approved island reference, NOT a claim about its original 3D camera. "
        "Match the exact approved island reference visually; if the numeric proxy and the reference appearance differ, the reference wins.\n"
        f"Projection calibration: {calibration_rel}; reference SHA-256: {calibration.get('reference_sha256')}\n"
        f"Projection review: {camera.get('projection_review', 'UNKNOWN')}\n"
        "This call creates source art only. Scene approval, runtime integration, rig/FX and promotion are separate gates.\n"
    )

    request = (
        scope
        + "\n--- CANONICAL ASSET PROMPT ---\n"
        + prompt.rstrip("\n")
        + "\n\n--- CANONICAL STYLE BIBLE (VERBATIM) ---\n"
        + style
    )

    if request.count(style) != 1:
        fail("style bible was not embedded exactly once")

    if args.output:
        out = Path(args.output)
        if not out.is_absolute():
            out = ROOT / out
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(request, encoding="utf-8")
        print(out)
    else:
        sys.stdout.write(request)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
