#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import struct
import tempfile
import unittest
import zlib
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "production_guard.py"
spec = importlib.util.spec_from_file_location("production_guard", MODULE_PATH)
pg = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(pg)
ROOT = MODULE_PATH.resolve().parents[2]
VALID_SPEC_PATH = ROOT / "art/reference_specs/e1_1986/materials-construction-01-surfaces-stock.json"


def make_png(path: Path, width: int, height: int) -> None:
    def chunk(kind: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    raw = b"".join(b"\x00" + b"\x00" * (width * 3) for _ in range(height))
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 1)) + chunk(b"IEND", b""))


class ProductionGuardTests(unittest.TestCase):
    def load_spec(self):
        return json.loads(VALID_SPEC_PATH.read_text(encoding="utf-8"))

    def test_valid_spec(self):
        self.assertEqual([], pg.validate_spec(self.load_spec()))

    def test_more_than_eight_is_blocked(self):
        value = self.load_spec()
        value["specimens"].append({"id":"09","name":"extra","description":"forbidden ninth item"})
        value["expected_specimen_count"] = 9
        errors = pg.validate_spec(value)
        self.assertTrue(any("maximum 8" in e for e in errors))

    def test_prompt_contains_allowlist_and_previous_era_guard(self):
        prompt = pg.render_prompt(self.load_spec())
        self.assertIn("EXACTLY the 8 specimens", prompt)
        self.assertIn("DO NOT GENERATE ANYTHING NOT LISTED ABOVE", prompt)
        self.assertIn("FORBIDDEN REGRESSION", prompt)
        self.assertIn("no baked cast shadow", prompt)

    def test_surfaces_stock_disambiguates_folded_sheet_from_angle_and_forbids_rust(self):
        value = self.load_spec()
        specimens = {item["id"]: item for item in value["specimens"]}
        self.assertIn("broad flat face must dominate", specimens["03"]["description"])
        self.assertIn("NOT an angle profile", specimens["03"]["description"])
        self.assertIn("absolutely no yellow paint", specimens["04"]["description"])
        self.assertTrue(any("visible rust" in item and "orange oxidation" in item for item in value["global_forbidden"]))
        prompt = pg.render_prompt(value)
        self.assertIn("cream or beige flat plate replacing the safety-yellow folded sample", prompt)
        self.assertIn("yellow-painted angle replacing the unpainted galvanized L-profile", prompt)

    def test_request_embeds_style_once(self):
        value = self.load_spec()
        request = pg.build_request(value)
        style = (ROOT / "art/style_bible.txt").read_text(encoding="utf-8")
        self.assertEqual(1, request.count(style))

    def test_source_dimension_mismatch_fails(self):
        value = self.load_spec()
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "wrong.png"
            make_png(path, 16, 16)
            report = pg.verify_source(value, path)
            self.assertEqual("fail", report["technical_verdict"])
            self.assertTrue(report["technical_errors"])

    def test_review_fail_closed(self):
        value = self.load_spec()
        source = {"sha256":"a"*64,"bytes":123,"dimensions":[1536,1024],"technical_verdict":"pass","technical_errors":[],"drive_file_id":"drive","drive_url":"https://drive.google.com/file/d/drive/view"}
        review = {
            "schema_version":1,"source":source,
            "global_gates": {k:"pass" for k in (
                "scope_atomic_only","exact_specimen_count","no_unlisted_specimen_class","style_family","era_language","sheet_readability","no_text_or_pseudotext","no_baked_cast_shadow_or_fx","no_previous_era_regression")},
            "specimens":[{"id":s["id"],"name":s["name"],"verdict":"pass","notes":""} for s in value["specimens"]],
            "reviewer":"assistant_self_review","review_method":"exact-image visual review","final_verdict":"pass","rejection_reasons":[]
        }
        self.assertEqual([], pg.validate_review(value, review))
        review["specimens"][1]["verdict"] = "fail"
        self.assertTrue(any("specimen 02" in e for e in pg.validate_review(value, review)))

    def test_tree_has_no_prompt_drift(self):
        self.assertEqual([], pg.validate_tree(ROOT))


if __name__ == "__main__":
    unittest.main()
