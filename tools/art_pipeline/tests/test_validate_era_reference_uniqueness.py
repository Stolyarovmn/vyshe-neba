#!/usr/bin/env python3
"""Regression tests for E2 manual audit coverage and duplicate detection."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "validate_era_reference_uniqueness.py"
spec = importlib.util.spec_from_file_location("uniqueness_guard", SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class AuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.spec_dir = self.root / "art/reference_specs/e2_1998"
        self.spec_dir.mkdir(parents=True)
        self.audit_dir = self.root / "art/references/eras/e2_1998/reviews"
        self.audit_dir.mkdir(parents=True)
        paths = []
        for i, name in enumerate(("red strobe dome", "servo gearbox", "diagnostic CRT"), 1):
            path = f"art/reference_specs/e2_1998/sheet-{i}.json"
            paths.append({"spec": path})
            (self.root / path).write_text(json.dumps({
                "expected_specimen_count": 1, "specimens": [{"id": "01", "name": name}]
            }))
        (self.audit_dir.parent / "reference-set.json").write_text(json.dumps({
            "era": "E2", "planned_sheets": paths
        }))
        self.audit = {
            "kind": "manual_era_reference_uniqueness_audit", "era": "E2",
            "scope": "three sheets", "prior_exact_sha_candidate_policy": "invalidate changed specs",
            "pairs": [
                {"a": a, "b": b, "review": {
                    "severity": "none_identified_at_spec_level",
                    "decision": "retain", "why": "different hardware function"
                }} for a, b in ((1, 2), (1, 3), (2, 3))
            ], "changes": []
        }
        self.write_audit()

    def write_audit(self):
        (self.audit_dir / "inter-sheet-uniqueness-audit.json").write_text(json.dumps(self.audit))

    def test_complete_audit(self):
        self.assertEqual([], mod.validate(self.root))

    def test_missing_pair_fails(self):
        self.audit["pairs"].pop()
        self.write_audit()
        self.assertTrue(any("cover every" in x for x in mod.validate(self.root)))

    def test_unresolved_high_overlap_fails(self):
        self.audit["pairs"][0]["review"]["severity"] = "blocking_before"
        self.write_audit()
        self.assertTrue(any("unresolved" in x for x in mod.validate(self.root)))

    def test_exact_duplicate_name_fails(self):
        path = self.spec_dir / "sheet-2.json"
        obj = json.loads(path.read_text())
        obj["specimens"][0]["name"] = "Red STROBE dome!!"
        path.write_text(json.dumps(obj))
        self.assertTrue(any("duplicate exact" in x for x in mod.validate(self.root)))

    def test_missing_audit_can_be_migration_pending(self):
        (self.audit_dir / "inter-sheet-uniqueness-audit.json").unlink()
        self.assertEqual([], mod.validate(self.root, require_audit=False))
        self.assertTrue(any("missing required" in x for x in mod.validate(self.root)))


if __name__ == "__main__":
    unittest.main()
