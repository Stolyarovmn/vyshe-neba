#!/usr/bin/env python3
"""Build one deterministic production imagegen request.

The canonical asset prompt is followed by art/style_bible.txt byte-for-text
(as decoded UTF-8) without paraphrasing. This tool does not generate art and
does not claim that scene/runtime/promotion gates are open.
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


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--receipt", required=True, help="repo-relative generation preflight JSON")
    p.add_argument("--output", help="optional repo-relative or absolute output path; stdout when omitted")
    args = p.parse_args()

    receipt_path = ROOT / args.receipt
    if not receipt_path.is_file():
        fail(f"missing receipt: {args.receipt}")
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))

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
    projection_angle = camera.get("projection_angle")
    if projection_angle != "UNKNOWN":
        fail("projection_angle must remain UNKNOWN until measured evidence exists")

    scope = (
        "PRODUCTION GENERATION REQUEST\n"
        f"Asset: {asset_id} / {slug}\n"
        f"Era: {era} / {year}\n"
        "Scope: exactly ONE complete isolated asset in this call; no era board, alternatives, detached spare parts, or extra objects.\n"
        f"Camera family: {camera.get('family', 'UNKNOWN')}\n"
        "Projection angle: UNKNOWN. Do not invent or state 47 degrees.\n"
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

    # Strong invariant: the exact style text is present once and unmodified.
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
