#!/usr/bin/env python3
"""Validate that a human-reviewed E2 inter-sheet uniqueness audit is complete.

This is not semantic AI classification: collisions of function/construction still
need human visual judgment. The tool validates coverage, provenance of the
planned spec roster, recorded dispositions and exact-name collisions.
"""
from __future__ import annotations
import argparse
import itertools
import json
import re
import unicodedata
from pathlib import Path


def normalized_name(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"[^\w]+", " ", value).strip()


def validate(root: Path, era: str = "e2_1998", require_audit: bool = True) -> list[str]:
    errors: list[str] = []
    ref = root / "art/references/eras" / era / "reference-set.json"
    audit_file = root / "art/references/eras" / era / "reviews/inter-sheet-uniqueness-audit.json"
    if not ref.is_file():
        return [f"missing reference-set: {ref}"]
    reference = json.loads(ref.read_text(encoding="utf-8"))
    plans = reference.get("planned_sheets", [])
    if not plans:
        return ["reference-set has no planned_sheets"]
    n = len(plans)
    seen_names: dict[str, str] = {}
    paths = set()
    for i, plan in enumerate(plans, 1):
        spec_path = plan.get("spec", "")
        if not spec_path or spec_path in paths:
            errors.append(f"missing/duplicate spec path for sheet {i}")
            continue
        paths.add(spec_path)
        path = root / spec_path
        if not path.is_file():
            errors.append(f"missing sheet spec: {spec_path}")
            continue
        spec = json.loads(path.read_text(encoding="utf-8"))
        items = spec.get("specimens", [])
        if len(items) != spec.get("expected_specimen_count"):
            errors.append(f"specimen count mismatch in {spec_path}")
        ids = [x.get("id") for x in items]
        if len(set(ids)) != len(ids):
            errors.append(f"duplicate IDs in {spec_path}")
        for x in items:
            key = normalized_name(x.get("name", ""))
            if not key:
                errors.append(f"unnamed specimen in {spec_path}")
                continue
            location = f"{spec_path}#{x.get('id')}"
            if key in seen_names:
                errors.append(f"duplicate exact normalized specimen name: {seen_names[key]} and {location}")
            else:
                seen_names[key] = location

    if not audit_file.is_file():
        if require_audit:
            errors.append(f"missing required human semantic audit: {audit_file}")
        return errors

    audit = json.loads(audit_file.read_text(encoding="utf-8"))
    if audit.get("kind") != "manual_era_reference_uniqueness_audit":
        errors.append("incorrect audit kind")
    if audit.get("era") != reference.get("era"):
        errors.append("audit era does not match reference-set")
    if not audit.get("scope") or not audit.get("prior_exact_sha_candidate_policy"):
        errors.append("audit must state scope and exact-SHA invalidation policy")
    expected = set(itertools.combinations(range(1, n + 1), 2))
    actual = set()
    for row in audit.get("pairs", []):
        a, b = row.get("a"), row.get("b")
        if not isinstance(a, int) or not isinstance(b, int):
            errors.append(f"invalid pair indices: {a!r}, {b!r}")
            continue
        pair = a, b
        if pair in actual:
            errors.append(f"duplicate audit pair {pair}")
        actual.add(pair)
        detail = row.get("review", {})
        if not isinstance(detail, dict) or not detail.get("severity") or not detail.get("decision") or not detail.get("why"):
            errors.append(f"missing semantic-review rationale/disposition for {pair}")
        elif detail["severity"] == "blocking_before" and detail["decision"] == "retain":
            errors.append(f"unresolved blocking overlap in pair {pair}")
    if actual != expected:
        errors.append(f"audit does not cover every unordered sheet pair: expected {len(expected)}, got {len(actual)}")
    for entry in audit.get("changes", []):
        path = entry.get("spec")
        name = entry.get("replacement")
        if path not in paths or not name:
            errors.append(f"invalid recorded replacement: {path!r}")
            continue
        spec = json.loads((root / path).read_text(encoding="utf-8"))
        if name not in [x.get("name") for x in spec.get("specimens", [])]:
            errors.append(f"recorded replacement {name!r} missing in {path}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--era", default="e2_1998")
    parser.add_argument("--when-present", action="store_true", help="temporary migration mode until audit PR merges")
    args = parser.parse_args()
    errors = validate(args.root, args.era, require_audit=not args.when_present)
    if errors:
        for e in errors:
            print("FAIL:", e)
        return 1
    audit = args.root / "art/references/eras" / args.era / "reviews/inter-sheet-uniqueness-audit.json"
    print("PASS: name uniqueness and manually reviewed pair coverage" if audit.exists()
          else "PENDING: manual audit PR not merged; name uniqueness checked only")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
