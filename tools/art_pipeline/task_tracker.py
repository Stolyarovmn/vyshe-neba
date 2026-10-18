#!/usr/bin/env python3
"""Persistent, resumable step tracker for 2D asset production.

A completed step is reusable only when its input fingerprint still matches and every
recorded output still exists with the same size and SHA-256. State is written atomically
as JSON plus a human-readable Markdown status file.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import socket
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

SCHEMA_VERSION = 1
VALID_STATUS = {"pending", "running", "success", "failed", "blocked", "skipped"}

DEFAULT_STEPS = [
    "generate",
    "edit",
    "archive_original",
    "source_prepare",
    "pixel_snap",
    "normalize",
    "aseprite_index",
    "qa_auto",
    "candidate_manifest",
    "visual_review",
    "promote",
    "game_tests",
]

# Compatibility names used by the already-shipped processor/workflows.
STEPS = DEFAULT_STEPS


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256(path: Path | str) -> str:
    p = Path(path)
    h = hashlib.sha256()
    with p.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


sha = sha256


def stable_fingerprint(value) -> str:
    payload = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


fingerprint = stable_fingerprint


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + f".tmp-{os.getpid()}")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def _empty_step() -> dict:
    return {
        "status": "pending",
        "attempt": 0,
        "fingerprint": None,
        "started_at": None,
        "finished_at": None,
        "reason": None,
        "error": None,
        "outputs": {},
    }


class Tracker:
    def __init__(
        self,
        state_dir: Path | str,
        asset_id: str,
        era: str,
        steps: list[str] | None = None,
    ):
        self.root = Path(state_dir)
        self.asset_id = asset_id
        self.asset = asset_id  # compatibility with process_asset.py
        self.era = era
        self.steps_order = list(steps or DEFAULT_STEPS)

        self.dir = self.root / asset_id / era
        self.state_path = self.dir / "current.json"
        self.path = self.state_path  # compatibility
        self.md_path = self.dir / "status.md"
        self.md = self.md_path  # compatibility
        self.lock_path = self.dir / ".lock"

        self.dir.mkdir(parents=True, exist_ok=True)
        self.state = self._load()

    def _new_state(self) -> dict:
        now = utcnow()
        return {
            "schema_version": SCHEMA_VERSION,
            "asset_id": self.asset_id,
            "era": self.era,
            "status": "pending",
            "current_step": None,
            "resume_allowed": True,
            "created_at": now,
            "updated_at": now,
            "steps_order": list(self.steps_order),
            "steps": {step: _empty_step() for step in self.steps_order},
        }

    def _load(self) -> dict:
        if not self.state_path.exists():
            return self._new_state()

        data = json.loads(self.state_path.read_text(encoding="utf-8"))
        schema = data.get("schema_version", 1)
        if schema != SCHEMA_VERSION:
            raise RuntimeError(
                f"unsupported tracker schema {schema!r}; expected {SCHEMA_VERSION}"
            )

        # Identity checks stop a copied/mis-restored checkpoint from being reused
        # for a different asset or era.
        if data.get("asset_id") not in (None, self.asset_id):
            raise RuntimeError(
                f"tracker asset mismatch: {data.get('asset_id')!r} != {self.asset_id!r}"
            )
        if data.get("era") not in (None, self.era):
            raise RuntimeError(
                f"tracker era mismatch: {data.get('era')!r} != {self.era!r}"
            )
        data["asset_id"] = self.asset_id
        data["era"] = self.era
        data["schema_version"] = SCHEMA_VERSION
        data.setdefault("resume_allowed", True)
        data.setdefault("created_at", utcnow())
        data.setdefault("steps", {})

        # Forward-compatible step migration: preserve historical steps and add new
        # canonical steps without losing attempts or audit information.
        old_order = list(data.get("steps_order") or [])
        merged_order: list[str] = []
        for step in self.steps_order + old_order:
            if step not in merged_order:
                merged_order.append(step)
        self.steps_order = merged_order
        data["steps_order"] = merged_order

        for step in merged_order:
            existing = data["steps"].get(step)
            if not isinstance(existing, dict):
                data["steps"][step] = _empty_step()
                continue
            template = _empty_step()
            template.update(existing)
            status = template.get("status", "pending")
            if status not in VALID_STATUS:
                raise RuntimeError(f"invalid tracker status {status!r} for step {step!r}")
            data["steps"][step] = template

        self._recompute_overall(data)
        return data

    def _recompute_overall(self, state: dict | None = None) -> None:
        state = state or self.state
        steps = state["steps"]
        order = state.get("steps_order", self.steps_order)

        for status in ("running", "failed", "blocked"):
            current = next(
                (step for step in order if steps.get(step, {}).get("status") == status),
                None,
            )
            if current:
                state["status"] = status
                state["current_step"] = current
                return

        pending = next(
            (step for step in order if steps.get(step, {}).get("status") == "pending"),
            None,
        )
        if pending:
            state["status"] = "pending"
            state["current_step"] = pending
            return

        if all(
            steps.get(step, {}).get("status") in {"success", "skipped"}
            for step in order
        ):
            state["status"] = "success"
            state["current_step"] = None
            return

        # Defensive fallback for malformed-but-loadable state.
        state["status"] = "pending"
        state["current_step"] = pending

    @contextmanager
    def lock(self, stale_after_seconds: int = 6 * 3600):
        self.dir.mkdir(parents=True, exist_ok=True)
        payload = {
            "pid": os.getpid(),
            "host": socket.gethostname(),
            "created_at": utcnow(),
            "epoch": time.time(),
        }

        while True:
            try:
                fd = os.open(
                    self.lock_path,
                    os.O_CREAT | os.O_EXCL | os.O_WRONLY,
                )
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    json.dump(payload, f, separators=(",", ":"))
                break
            except FileExistsError:
                try:
                    existing = json.loads(
                        self.lock_path.read_text(encoding="utf-8")
                    )
                    age = time.time() - float(existing.get("epoch", 0))
                except Exception:
                    age = stale_after_seconds + 1

                if age > stale_after_seconds:
                    self.lock_path.unlink(missing_ok=True)
                    continue

                raise RuntimeError(f"asset pipeline is locked: {self.lock_path}")

        try:
            yield self
        finally:
            self.lock_path.unlink(missing_ok=True)

    def save(self) -> None:
        self._recompute_overall()
        self.state["updated_at"] = utcnow()
        _atomic_write(
            self.state_path,
            json.dumps(self.state, indent=2, ensure_ascii=False) + "\n",
        )
        _atomic_write(self.md_path, self.render_markdown())

    def render_markdown(self) -> str:
        icon = {
            "pending": "⬜",
            "running": "🟡",
            "success": "✅",
            "failed": "❌",
            "blocked": "⛔",
            "skipped": "⏭️",
        }
        lines = [
            f"# Asset pipeline: {self.asset_id} / {self.era}",
            "",
            f"- status: **{self.state.get('status')}**",
            f"- current step: **{self.state.get('current_step') or '-'}**",
            f"- updated: `{self.state.get('updated_at') or '-'}`",
            f"- resume allowed: `{str(bool(self.state.get('resume_allowed'))).lower()}`",
            "",
            "| step | status | attempt | finished | note |",
            "|---|---|---:|---|---|",
        ]

        for step in self.state["steps_order"]:
            s = self.state["steps"][step]
            note = (s.get("reason") or s.get("error") or "")
            note = note.replace("|", "\\|").replace("\n", " ")
            if len(note) > 140:
                note = note[:137] + "..."
            status = s.get("status", "pending")
            lines.append(
                f"| `{step}` | {icon.get(status, '')} {status} | "
                f"{s.get('attempt', 0)} | {s.get('finished_at') or ''} | {note} |"
            )

        lines += [
            "",
            "Resume:",
            "```bash",
            f"python3 tools/art_pipeline/process_asset.py --asset {self.asset_id} --resume ...",
            "```",
            "",
        ]
        return "\n".join(lines)

    def render(self) -> str:
        """Compatibility alias for existing callers."""
        return self.render_markdown()

    def begin(self, step: str, fp: str, reason: str | None = None) -> None:
        s = self.state["steps"][step]
        s.update(
            {
                "status": "running",
                "attempt": int(s.get("attempt", 0)) + 1,
                "fingerprint": fp,
                "started_at": utcnow(),
                "finished_at": None,
                "reason": reason,
                "error": None,
            }
        )
        self.save()

    def success(
        self,
        step: str,
        fp: str,
        outputs: Iterable[Path | str] = (),
        reason: str | None = None,
    ) -> None:
        recorded = {}
        checkpoint_root = self.root.parent.resolve()

        for path in outputs:
            p = Path(path).resolve()
            if not p.is_file():
                continue
            try:
                key = "@/" + p.relative_to(checkpoint_root).as_posix()
            except ValueError:
                key = str(p)
            recorded[key] = {
                "sha256": sha256(p),
                "size": p.stat().st_size,
            }

        self.state["steps"][step].update(
            {
                "status": "success",
                "fingerprint": fp,
                "finished_at": utcnow(),
                "reason": reason,
                "error": None,
                "outputs": recorded,
            }
        )
        self.save()

    def skip(
        self,
        step: str,
        fp: str | None = None,
        reason: str | None = None,
    ) -> None:
        s = self.state["steps"][step]
        s.update(
            {
                "status": "skipped",
                "fingerprint": fp if fp is not None else s.get("fingerprint"),
                "finished_at": utcnow(),
                "reason": reason,
                "error": None,
            }
        )
        self.save()

    def fail(self, step: str, error: str) -> None:
        self.state["steps"][step].update(
            {
                "status": "failed",
                "finished_at": utcnow(),
                "error": error,
            }
        )
        self.save()

    def block(self, step: str, reason: str) -> None:
        self.state["steps"][step].update(
            {
                "status": "blocked",
                "finished_at": utcnow(),
                "reason": reason,
                "error": None,
            }
        )
        self.save()

    def reusable(self, step: str, fp: str) -> bool:
        s = self.state["steps"].get(step) or {}
        if s.get("status") != "success" or s.get("fingerprint") != fp:
            return False

        outputs = s.get("outputs") or {}
        if not outputs:
            return True

        checkpoint_root = self.root.parent.resolve()
        for raw, meta in outputs.items():
            p = checkpoint_root / raw[2:] if raw.startswith("@/") else Path(raw)
            if not p.is_file():
                return False
            if meta.get("size") is not None and p.stat().st_size != meta["size"]:
                return False
            if sha256(p) != meta.get("sha256"):
                return False
        return True

    def invalidate_from(self, step: str, reason: str) -> None:
        try:
            idx = self.state["steps_order"].index(step)
        except ValueError as exc:
            raise KeyError(step) from exc

        for name in self.state["steps_order"][idx:]:
            self.state["steps"][name].update(
                {
                    "status": "pending",
                    "fingerprint": None,
                    "started_at": None,
                    "finished_at": None,
                    "reason": f"invalidated: {reason}",
                    "error": None,
                    "outputs": {},
                }
            )
        self.save()


def cli() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--state-dir", required=True)
    p.add_argument("--asset", required=True)
    p.add_argument("--era", required=True)
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("status")
    sub.add_parser("unlock")

    reset = sub.add_parser("reset")
    reset.add_argument("--from-step", required=True, choices=DEFAULT_STEPS)
    reset.add_argument("--reason", default="manual reset")

    mark = sub.add_parser("mark")
    mark.add_argument("--step", required=True, choices=DEFAULT_STEPS)
    mark.add_argument(
        "--status",
        required=True,
        choices=["running", "success", "failed", "blocked", "skipped"],
    )
    mark.add_argument("--fingerprint")
    mark.add_argument("--reason")
    mark.add_argument("--output", action="append", default=[])

    args = p.parse_args()
    tracker = Tracker(Path(args.state_dir), args.asset, args.era)

    if args.cmd == "status":
        tracker.save()
        print(tracker.render_markdown())
        return
    if args.cmd == "unlock":
        tracker.lock_path.unlink(missing_ok=True)
        print(f"unlocked {tracker.lock_path}")
        return
    if args.cmd == "reset":
        tracker.invalidate_from(args.from_step, args.reason)
        print(tracker.render_markdown())
        return

    fp = args.fingerprint or stable_fingerprint(
        {
            "manual": True,
            "asset": args.asset,
            "era": args.era,
            "step": args.step,
            "reason": args.reason,
        }
    )
    if args.status == "running":
        tracker.begin(args.step, fp, args.reason)
    elif args.status == "success":
        tracker.success(
            args.step,
            fp,
            [Path(x) for x in args.output],
            args.reason,
        )
    elif args.status == "failed":
        tracker.fail(args.step, args.reason or "manual failure")
    elif args.status == "blocked":
        tracker.block(args.step, args.reason or "manual blocker")
    else:
        tracker.skip(args.step, fp, args.reason)

    print(tracker.render_markdown())


if __name__ == "__main__":
    cli()
