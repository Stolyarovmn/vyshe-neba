#!/usr/bin/env python3
"""Verify that a visual review approves the exact candidate PNG bytes."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--candidate", required=True, help="candidate directory")
    p.add_argument("--review", required=True)
    args = p.parse_args()

    candidate_dir = Path(args.candidate)
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
    eras = review.get("eras") or {}
    failures = []
    for item in manifest["files"]:
        stem = item["stem"]
        actual = sha256(candidate_dir / item["png"])
        verdict = eras.get(stem) or {}
        status = verdict.get("status")
        expected = verdict.get("sha256")
        if status != "approved" or expected != actual:
            failures.append({"stem": stem, "status": status, "expected": expected, "actual": actual})
    if failures:
        raise SystemExit("VISUAL_GATE_BLOCKED: " + json.dumps(failures, ensure_ascii=False))
    print(json.dumps({
        "asset_id": manifest["asset_id"],
        "visual_gate": "approved",
        "review_sha256": sha256(review_path),
        "files": [{"stem": x["stem"], "sha256": x["sha256"]} for x in manifest["files"]]
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
