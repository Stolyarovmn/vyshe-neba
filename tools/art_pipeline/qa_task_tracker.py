#!/usr/bin/env python3
"""Regression tests for checkpoint/resume tracker semantics."""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

from task_tracker import DEFAULT_STEPS, Tracker, fingerprint


def yes(value, message):
    if not value:
        raise AssertionError(message)


def main():
    with tempfile.TemporaryDirectory() as td:
        candidate = Path(td) / "candidate"
        state = candidate / ".tracker"
        output = candidate / ".work/e0/value.bin"
        output.parent.mkdir(parents=True)
        output.write_bytes(b"v1")

        fp1 = fingerprint({"input": "v1"})
        tracker = Tracker(state, "T01", "e0_1978")
        tracker.begin("normalize", fp1)
        tracker.success("normalize", fp1, [output])

        yes(tracker.reusable("normalize", fp1), "fresh success must be reusable")

        restarted = Tracker(state, "T01", "e0_1978")
        yes(
            restarted.reusable("normalize", fp1),
            "state must survive process restart",
        )

        output.write_bytes(b"changed")
        yes(
            not restarted.reusable("normalize", fp1),
            "changed output SHA/size must invalidate reuse",
        )

        output.write_bytes(b"v1")
        restarted.state["steps"]["pixel_snap"]["status"] = "success"
        restarted.state["steps"]["pixel_snap"]["fingerprint"] = "upstream"
        restarted.state["steps"]["qa_auto"]["status"] = "success"
        restarted.state["steps"]["qa_auto"]["fingerprint"] = "downstream"
        restarted.save()
        restarted.invalidate_from("normalize", "contract changed")

        yes(
            restarted.state["steps"]["pixel_snap"]["status"] == "success",
            "upstream step must survive downstream invalidation",
        )
        yes(
            restarted.state["steps"]["normalize"]["status"] == "pending",
            "reset step must become pending",
        )
        yes(
            restarted.state["steps"]["qa_auto"]["status"] == "pending",
            "downstream step must become pending",
        )

        persisted = Tracker(state, "T01", "e0_1978")
        yes(
            persisted.state["steps"]["pixel_snap"]["status"] == "success",
            "invalidation must persist",
        )

        with persisted.lock():
            blocked = False
            try:
                with Tracker(state, "T01", "e0_1978").lock():
                    pass
            except RuntimeError:
                blocked = True
            yes(blocked, "second writer must be rejected by lock")

        # Checkpoint identity is part of the safety boundary. Simulate a
        # checkpoint restored into the wrong asset directory.
        wrong_dir = state / "OTHER" / "e0_1978"
        wrong_dir.mkdir(parents=True)
        (wrong_dir / "current.json").write_text(
            json.dumps(persisted.state),
            encoding="utf-8",
        )
        identity_blocked = False
        try:
            Tracker(state, "OTHER", "e0_1978")
        except RuntimeError:
            identity_blocked = True
        yes(identity_blocked, "asset identity mismatch must be rejected")

        # Historical states must gain newly introduced canonical steps without
        # losing prior status/attempt data.
        old_dir = state / "T02" / "e0_1978"
        old_dir.mkdir(parents=True)
        historical = {
            "schema_version": 1,
            "asset_id": "T02",
            "era": "e0_1978",
            "steps_order": ["generate", "legacy_review"],
            "steps": {
                "generate": {
                    "status": "success",
                    "attempt": 3,
                    "fingerprint": "old",
                    "outputs": {},
                },
                "legacy_review": {
                    "status": "success",
                    "attempt": 1,
                    "fingerprint": "legacy",
                    "outputs": {},
                },
            },
        }
        (old_dir / "current.json").write_text(
            json.dumps(historical),
            encoding="utf-8",
        )
        migrated = Tracker(state, "T02", "e0_1978")
        yes(
            all(step in migrated.state["steps"] for step in DEFAULT_STEPS),
            "canonical steps must be added during migration",
        )
        yes(
            "legacy_review" in migrated.state["steps"],
            "historical unknown step must be preserved",
        )
        yes(
            migrated.state["steps"]["generate"]["attempt"] == 3,
            "historical audit data must survive migration",
        )

        # Unsupported schemas are never silently interpreted.
        schema_dir = state / "T03" / "e0_1978"
        schema_dir.mkdir(parents=True)
        (schema_dir / "current.json").write_text(
            json.dumps(
                {
                    "schema_version": 999,
                    "asset_id": "T03",
                    "era": "e0_1978",
                    "steps": {},
                }
            ),
            encoding="utf-8",
        )
        schema_blocked = False
        try:
            Tracker(state, "T03", "e0_1978")
        except RuntimeError:
            schema_blocked = True
        yes(schema_blocked, "unsupported schema must be rejected")

    print(
        "asset task tracker QA PASS: durable state, identity/schema guards, "
        "forward step migration, hash-bound resume, downstream invalidation "
        "and writer lock"
    )


if __name__ == "__main__":
    main()
