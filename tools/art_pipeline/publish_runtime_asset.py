#!/usr/bin/env python3
"""Copy exact approved production bytes into an existing clean runtime target.

This script enforces Boundary B from RUNTIME_BRANCH_CONTRACT.md:
production (`game-production`) -> runtime (`main`) by replacement in place only.
It never invents target paths and never creates backup/history copies in runtime.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path, PurePosixPath


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def git_head(root: Path) -> str:
    return subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=root, text=True
    ).strip()


def safe_rel(value: str, prefix: str) -> PurePosixPath:
    p = PurePosixPath(value)
    if p.is_absolute() or ".." in p.parts or not value.startswith(prefix):
        raise SystemExit(f"unsafe path {value!r}; required prefix {prefix!r}")
    return p


def approval_sha_values(data) -> set[str]:
    values: set[str] = set()
    if isinstance(data, dict):
        for key, value in data.items():
            if key in {"approved_sha256", "output_sha256", "sha256"} and isinstance(value, str):
                values.add(value)
            elif key in {"approved_sha256s", "sha256s"} and isinstance(value, list):
                values.update(x for x in value if isinstance(x, str))
            elif isinstance(value, (dict, list)):
                values.update(approval_sha_values(value))
    elif isinstance(data, list):
        for value in data:
            values.update(approval_sha_values(value))
    return values


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--repo-root", required=True, help="production checkout root")
    p.add_argument("--runtime-root", required=True, help="clean runtime/main checkout root")
    p.add_argument("--asset", required=True)
    p.add_argument("--exports", default="art/runtime/RUNTIME_EXPORTS.json")
    p.add_argument("--report", help="optional JSON report path")
    args = p.parse_args()

    prod = Path(args.repo_root).resolve()
    runtime = Path(args.runtime_root).resolve()
    cfg_path = prod / args.exports
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    policy = cfg["policy"]

    if cfg.get("production_branch") != "game-production":
        raise SystemExit("production_branch must be game-production")
    if cfg.get("runtime_branch") != "main":
        raise SystemExit("runtime_branch must be main")
    if policy.get("mode") != "replace_in_place" or policy.get("require_existing_target") is not True:
        raise SystemExit("runtime export policy must require replace_in_place on an existing target")
    if policy.get("forbid_runtime_history_copies") is not True:
        raise SystemExit("runtime history-copy prohibition is not enabled")

    blocked = cfg.get("blocked_assets", {})
    if args.asset in blocked:
        raise SystemExit(f"asset {args.asset} is BLOCKED: {blocked[args.asset]}")

    entry = cfg.get("assets", {}).get(args.asset)
    if not entry:
        raise SystemExit(f"asset {args.asset} has no explicit runtime export mapping")
    if entry.get("status") != "ready":
        raise SystemExit(
            f"asset {args.asset} runtime export status must be ready, got {entry.get('status')!r}"
        )
    if entry.get("runtime_contract_status") != "verified_existing_target":
        raise SystemExit(f"asset {args.asset} runtime target contract is not verified")

    approval_file = entry.get("approval_file")
    approval_values: set[str] = set()
    if approval_file:
        approval_path = prod / safe_rel(approval_file, "art/gen/")
        if not approval_path.is_file():
            raise SystemExit(f"approval file missing: {approval_file}")
        approval = json.loads(approval_path.read_text(encoding="utf-8"))
        if approval.get("approved") is not True and approval.get("approved_by_user") is not True:
            raise SystemExit(f"approval file is not approved: {approval_file}")
        approval_values = approval_sha_values(approval)

    source_prefix = policy["allowed_source_prefix"]
    target_prefix = policy["allowed_target_prefix"]
    mappings = entry.get("files") or []
    if not mappings:
        raise SystemExit(f"asset {args.asset} has no runtime files")

    seen_targets: set[str] = set()
    report_files = []
    for item in mappings:
        source_rel = str(safe_rel(item["source"], source_prefix))
        target_rel = str(safe_rel(item["target"], target_prefix))
        expected = item["sha256"]
        if target_rel in seen_targets:
            raise SystemExit(f"duplicate runtime target in mapping: {target_rel}")
        seen_targets.add(target_rel)

        source = prod / source_rel
        target = runtime / target_rel
        if not source.is_file():
            raise SystemExit(f"production source missing: {source_rel}")
        if not target.is_file():
            raise SystemExit(
                f"runtime target does not exist: {target_rel}; create/verify it in a separate runtime integration PR first"
            )

        actual = sha256(source)
        if actual != expected:
            raise SystemExit(f"production SHA mismatch for {source_rel}: expected {expected}, got {actual}")
        if approval_file and expected not in approval_values:
            raise SystemExit(
                f"approved SHA evidence in {approval_file} does not contain {expected} for {source_rel}"
            )

        before = sha256(target)
        shutil.copyfile(source, target)
        after = sha256(target)
        if after != expected:
            raise SystemExit(f"runtime copy verification failed for {target_rel}: {after} != {expected}")

        report_files.append(
            {
                "source": source_rel,
                "target": target_rel,
                "sha256": expected,
                "previous_runtime_sha256": before,
                "changed": before != after,
            }
        )

    report = {
        "asset_id": args.asset,
        "production_branch": cfg["production_branch"],
        "production_commit": git_head(prod),
        "runtime_branch": cfg["runtime_branch"],
        "runtime_base_commit": git_head(runtime),
        "mode": "replace_in_place",
        "files": report_files,
    }
    text = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.report:
        out = Path(args.report)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
    print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
