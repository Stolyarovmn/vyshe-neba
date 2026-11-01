#!/usr/bin/env python3
"""Deterministic guard for Vyshe Neba production image generation.

The guard does not pretend to understand pixels semantically. It makes the
machine-checkable parts deterministic and requires an explicit structured
visual review for the parts that still need vision/human judgement.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
YEARS = {f"E{i}": year for i, year in enumerate((1978, 1986, 1998, 2015, 2035, 2060))}
ROLES = {"materials-construction", "mechanics-infrastructure", "controls-displays", "lighting-signals"}
STYLE_BIBLE = "art/style_bible.txt"
MAX_SPECIMENS = 8
PASS, FAIL, PENDING = "pass", "fail", "pending"
VERDICTS = {PASS, FAIL, PENDING}


class GuardError(ValueError):
    pass


def repo_path(value: str | Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else ROOT / path


def read_json(value: str | Path) -> dict[str, Any]:
    path = repo_path(value)
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise GuardError(f"missing JSON file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise GuardError(f"invalid JSON {path}: {exc}") from exc
    if not isinstance(result, dict):
        raise GuardError(f"JSON root must be an object: {path}")
    return result


def nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def string_list(value: Any, nonempty_required: bool = True) -> bool:
    return isinstance(value, list) and (bool(value) or not nonempty_required) and all(nonempty(x) for x in value)


def validate_spec(spec: dict[str, Any], source: str = "<spec>") -> list[str]:
    e: list[str] = []
    p = f"{source}: "
    if spec.get("schema_version") != 1: e.append(p + "schema_version must be 1")
    if spec.get("kind") != "era_reference_sheet": e.append(p + "kind must be era_reference_sheet")
    era, year = spec.get("era"), spec.get("year")
    if era not in YEARS or year != YEARS.get(era): e.append(p + f"invalid era/year pair: {era!r}/{year!r}")
    if spec.get("role") not in ROLES: e.append(p + f"invalid role: {spec.get('role')!r}")
    for key in ("sheet", "title", "prompt_file"):
        if not nonempty(spec.get(key)): e.append(p + f"{key} must be a non-empty string")
    if spec.get("style_bible_file") != STYLE_BIBLE: e.append(p + f"style_bible_file must be {STYLE_BIBLE}")

    generation = spec.get("generation") if isinstance(spec.get("generation"), dict) else {}
    size, layout = generation.get("size"), generation.get("layout")
    if not (isinstance(size, list) and len(size) == 2 and all(isinstance(v, int) and v > 0 for v in size)):
        e.append(p + "generation.size must be [positive_int, positive_int]")
    if not (isinstance(layout, list) and len(layout) == 2 and all(isinstance(v, int) and v > 0 for v in layout)):
        e.append(p + "generation.layout must be [positive_int, positive_int]")
    for gate in ("one_role_per_call", "one_era_per_call"):
        if generation.get(gate) is not True: e.append(p + f"generation.{gate} must be true")

    specimens = spec.get("specimens") if isinstance(spec.get("specimens"), list) else []
    if not specimens: e.append(p + "specimens must be a non-empty list")
    if len(specimens) > MAX_SPECIMENS: e.append(p + f"specimens exceed canonical maximum {MAX_SPECIMENS}")
    if spec.get("expected_specimen_count") != len(specimens): e.append(p + "expected_specimen_count does not equal actual specimen count")
    if isinstance(layout, list) and len(layout) == 2 and all(isinstance(v, int) for v in layout):
        if layout[0] * layout[1] < len(specimens): e.append(p + "layout has fewer cells than specimens")
        if len(specimens) == 8 and size == [1536, 1024] and layout != [4, 2]: e.append(p + "8 specimens at 1536x1024 must use canonical 4x2 plan")

    ids, names = set(), set()
    for i, item in enumerate(specimens, 1):
        if not isinstance(item, dict):
            e.append(p + f"specimen {i} must be an object"); continue
        sid, name, description = item.get("id"), item.get("name"), item.get("description")
        if not nonempty(sid): e.append(p + f"specimen {i} id missing")
        elif sid in ids: e.append(p + f"duplicate specimen id: {sid}")
        else: ids.add(sid)
        if not nonempty(name): e.append(p + f"specimen {i} name missing")
        elif name in names: e.append(p + f"duplicate specimen name: {name}")
        else: names.add(name)
        if not nonempty(description): e.append(p + f"specimen {i} description missing")

    if not string_list(spec.get("global_forbidden")): e.append(p + "global_forbidden must be a non-empty list of strings")
    contract = spec.get("era_contract") if isinstance(spec.get("era_contract"), dict) else {}
    if not nonempty(contract.get("character")): e.append(p + "era_contract.character missing")
    if not string_list(contract.get("required_signals")): e.append(p + "era_contract.required_signals must be non-empty")
    if era != "E0":
        if not string_list(contract.get("replaced_previous_language")): e.append(p + "E1-E5 require replaced_previous_language")
        if not string_list(contract.get("forbidden_regressions")): e.append(p + "E1-E5 require forbidden_regressions")

    presentation = spec.get("presentation") if isinstance(spec.get("presentation"), dict) else {}
    for gate in ("isolated_specimens", "non_overlapping", "neutral_background", "no_labels_or_text", "no_scenery", "no_cast_shadow", "no_baked_fx"):
        if presentation.get(gate) is not True: e.append(p + f"presentation.{gate} must be true")
    archive = spec.get("archive") if isinstance(spec.get("archive"), dict) else {}
    if archive.get("provider") != "google_drive": e.append(p + "archive.provider must be google_drive")
    if not nonempty(archive.get("folder_id")): e.append(p + "archive.folder_id missing")
    return e


def render_prompt(spec: dict[str, Any]) -> str:
    errors = validate_spec(spec)
    if errors: raise GuardError("cannot render invalid spec:\n" + "\n".join(errors))
    era, year, role, sheet, title = spec["era"], spec["year"], spec["role"], spec["sheet"], spec["title"]
    width, height = spec["generation"]["size"]
    columns, rows = spec["generation"]["layout"]
    count = len(spec["specimens"])
    lines = [
        f"{era} / {year} — {role} — {sheet} / {title}", "",
        f"Generate ONE {era}-only atomic specimen field containing EXACTLY the {count} specimens listed below and NOTHING ELSE.", "",
        f"LAYOUT: {width}×{height} landscape, {columns}×{rows} grid, {count} large isolated specimens, one specimen per cell, generous empty spacing, neutral background, no labels or captions.", "",
        f"ALLOWED SPECIMENS — exactly these {count}:"
    ]
    for i, item in enumerate(spec["specimens"], 1): lines.append(f"{i}. {item['name']} — {item['description']}")
    lines += ["", "DO NOT GENERATE ANYTHING NOT LISTED ABOVE. " + "; ".join(spec["global_forbidden"]) + ".", "",
              f"{era} visual character: {spec['era_contract']['character']}",
              "REQUIRED ERA SIGNALS: " + "; ".join(spec["era_contract"]["required_signals"]) + "."]
    if era != "E0":
        lines += ["REPLACED PREVIOUS-ERA LANGUAGE: " + "; ".join(spec["era_contract"]["replaced_previous_language"]) + ".",
                  "FORBIDDEN REGRESSION: " + "; ".join(spec["era_contract"]["forbidden_regressions"]) + "."]
    lines += ["", "PRESENTATION: isolated physical specimens only; examples must not overlap; one neutral background; no title bar, era/year text, captions, numbered labels, legend, UI/dashboard frame or scenery; no baked cast shadow, glow, bloom, rays or other temporary FX.", "",
              "The generation request MUST append `art/style_bible.txt` verbatim exactly once. Do not paraphrase it.", ""]
    return "\n".join(lines)


def build_request(spec: dict[str, Any]) -> str:
    prompt = render_prompt(spec)
    style = repo_path(STYLE_BIBLE).read_text(encoding="utf-8")
    if not style.strip(): raise GuardError("style bible is empty")
    request = "PRODUCTION GUARD REQUEST\nScope: exactly one atomic era-reference sheet-part in this call.\nVisual approval, archive provenance, cross-era review and production promotion remain separate gates.\n\n--- CANONICAL SHEET PROMPT ---\n" + prompt.rstrip("\n") + "\n\n--- CANONICAL STYLE BIBLE (VERBATIM) ---\n" + style
    if request.count(style) != 1: raise GuardError("style bible was not embedded exactly once")
    return request


def png_info(path: Path) -> tuple[int, int, int, str]:
    data = path.read_bytes()
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR": raise GuardError(f"invalid PNG: {path}")
    width, height = struct.unpack(">II", data[16:24])
    return width, height, len(data), hashlib.sha256(data).hexdigest()


def verify_source(spec: dict[str, Any], image_path: Path) -> dict[str, Any]:
    errors = validate_spec(spec)
    if errors: raise GuardError("cannot verify source against invalid spec:\n" + "\n".join(errors))
    width, height, byte_count, sha256 = png_info(image_path)
    expected = spec["generation"]["size"]
    technical_errors = [] if [width, height] == expected else [f"source dimensions {width}x{height} do not match planned {expected[0]}x{expected[1]}"]
    return {"image": str(image_path), "sha256": sha256, "bytes": byte_count, "dimensions": [width, height], "planned_dimensions": expected, "technical_verdict": PASS if not technical_errors else FAIL, "technical_errors": technical_errors}


def review_template(spec: dict[str, Any], report: dict[str, Any], spec_path: str, generation_id: str, drive_file_id: str, drive_url: str) -> dict[str, Any]:
    return {"schema_version": 1, "spec_file": spec_path, "generation_id": generation_id,
            "source": {"sha256": report["sha256"], "bytes": report["bytes"], "dimensions": report["dimensions"], "technical_verdict": report["technical_verdict"], "technical_errors": report["technical_errors"], "drive_file_id": drive_file_id, "drive_url": drive_url},
            "global_gates": {k: PENDING for k in ("scope_atomic_only","exact_specimen_count","no_unlisted_specimen_class","style_family","era_language","sheet_readability","no_text_or_pseudotext","no_baked_cast_shadow_or_fx","no_previous_era_regression")},
            "specimens": [{"id": x["id"], "name": x["name"], "verdict": PENDING, "notes": ""} for x in spec["specimens"]],
            "reviewer": "UNKNOWN", "review_method": "UNKNOWN", "final_verdict": PENDING, "rejection_reasons": []}


def validate_review(spec: dict[str, Any], review: dict[str, Any], image_path: Path | None = None) -> list[str]:
    e = validate_spec(spec)
    source = review.get("source") if isinstance(review.get("source"), dict) else {}
    sha = source.get("sha256")
    if not isinstance(sha, str) or len(sha) != 64 or any(c not in "0123456789abcdef" for c in sha.lower()): e.append("review source.sha256 must be 64 hex characters")
    if source.get("dimensions") != spec.get("generation", {}).get("size"): e.append("review source dimensions do not match spec generation size")
    if not isinstance(source.get("bytes"), int) or source.get("bytes", 0) <= 0: e.append("review source.bytes must be positive")
    if not nonempty(source.get("drive_file_id")) or not nonempty(source.get("drive_url")): e.append("Drive provenance is incomplete")
    if source.get("technical_verdict") != PASS or source.get("technical_errors") not in ([], None): e.append("technical source verification is not pass")
    if image_path is not None:
        current = verify_source(spec, image_path)
        for key in ("sha256", "bytes", "dimensions"):
            if current[key] != source.get(key): e.append(f"exact source {key} does not match review metadata")
    gates = review.get("global_gates") if isinstance(review.get("global_gates"), dict) else {}
    for key in ("scope_atomic_only","exact_specimen_count","no_unlisted_specimen_class","style_family","era_language","sheet_readability","no_text_or_pseudotext","no_baked_cast_shadow_or_fx","no_previous_era_regression"):
        if gates.get(key) != PASS: e.append(f"global gate {key} is {gates.get(key)!r}, not pass")
    expected = {x["id"] for x in spec.get("specimens", [])}
    items = review.get("specimens") if isinstance(review.get("specimens"), list) else []
    actual = {x.get("id"): x for x in items if isinstance(x, dict) and nonempty(x.get("id"))}
    if set(actual) != expected: e.append("review specimen IDs do not exactly match the spec")
    for sid in sorted(expected & set(actual)):
        if actual[sid].get("verdict") != PASS: e.append(f"specimen {sid} is {actual[sid].get('verdict')!r}, not pass")
    if not nonempty(review.get("reviewer")) or review.get("reviewer") == "UNKNOWN": e.append("reviewer must be explicit")
    if not nonempty(review.get("review_method")) or review.get("review_method") == "UNKNOWN": e.append("review_method must be explicit")
    if review.get("final_verdict") != PASS: e.append("final_verdict must be pass")
    if review.get("rejection_reasons") not in ([], None): e.append("rejection_reasons must be empty for pass")
    return e


def validate_tree(root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    spec_paths = sorted((root / "art/reference_specs").rglob("*.json")) if (root / "art/reference_specs").is_dir() else []
    if not spec_paths: return ["no production-guard reference specs found"]
    for path in spec_paths:
        if path.name == "README.md": continue
        try: spec = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc: errors.append(f"{path.relative_to(root)}: {exc}"); continue
        if not isinstance(spec, dict): errors.append(f"{path.relative_to(root)}: root must be object"); continue
        errors.extend(validate_spec(spec, path.relative_to(root).as_posix()))
        prompt = root / str(spec.get("prompt_file", ""))
        if not prompt.is_file(): errors.append(f"{path.relative_to(root)}: prompt_file missing")
        else:
            try:
                if prompt.read_text(encoding="utf-8") != render_prompt(spec): errors.append(f"{path.relative_to(root)}: prompt drift; regenerate {spec.get('prompt_file')}")
            except GuardError as exc: errors.append(str(exc))
    return errors


def write_output(path: str | None, text: str) -> None:
    if path:
        target = repo_path(path); target.parent.mkdir(parents=True, exist_ok=True); target.write_text(text, encoding="utf-8"); print(target)
    else: sys.stdout.write(text)


def main() -> int:
    parser = argparse.ArgumentParser(); sub = parser.add_subparsers(dest="command", required=True)
    for name in ("validate-spec", "render-prompt", "build-request"): p=sub.add_parser(name); p.add_argument("spec"); p.add_argument("--output") if name != "validate-spec" else None
    p=sub.add_parser("verify-source"); p.add_argument("spec"); p.add_argument("image"); p.add_argument("--output")
    p=sub.add_parser("init-review"); p.add_argument("spec"); p.add_argument("image"); p.add_argument("--generation-id", required=True); p.add_argument("--drive-file-id", required=True); p.add_argument("--drive-url", required=True); p.add_argument("--output", required=True)
    p=sub.add_parser("validate-review"); p.add_argument("spec"); p.add_argument("review"); p.add_argument("--image")
    sub.add_parser("validate-tree")
    args=parser.parse_args()
    try:
        if args.command == "validate-spec":
            errors=validate_spec(read_json(args.spec), args.spec)
            if errors:
                for x in errors: print("ERROR:", x, file=sys.stderr)
                return 1
            print("PASS: production-guard spec is valid"); return 0
        if args.command == "render-prompt": write_output(args.output, render_prompt(read_json(args.spec))); return 0
        if args.command == "build-request": write_output(args.output, build_request(read_json(args.spec))); return 0
        if args.command == "verify-source":
            report=verify_source(read_json(args.spec), repo_path(args.image)); write_output(args.output, json.dumps(report, ensure_ascii=False, indent=2)+"\n"); return 0 if report["technical_verdict"] == PASS else 1
        if args.command == "init-review":
            spec=read_json(args.spec); report=verify_source(spec, repo_path(args.image)); review=review_template(spec, report, args.spec, args.generation_id, args.drive_file_id, args.drive_url); write_output(args.output, json.dumps(review, ensure_ascii=False, indent=2)+"\n"); return 0 if report["technical_verdict"] == PASS else 1
        if args.command == "validate-review":
            errors=validate_review(read_json(args.spec), read_json(args.review), repo_path(args.image) if args.image else None)
            if errors:
                for x in errors: print("ERROR:", x, file=sys.stderr)
                return 1
            print("PASS: exact source and structured visual review are approved"); return 0
        errors=validate_tree()
        if errors:
            for x in errors: print("ERROR:", x, file=sys.stderr)
            return 1
        print("PASS: production-guard specs and generated prompts are consistent"); return 0
    except (GuardError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr); return 1


if __name__ == "__main__": raise SystemExit(main())
