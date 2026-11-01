#!/usr/bin/env python3
from __future__ import annotations

import json
import struct
import sys
import tempfile
import unittest
import zlib
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parents[1]
ROOT = TOOLS_DIR.resolve().parents[1]
sys.path.insert(0, str(TOOLS_DIR))

import production_guard as pg
import imagegen_chat_bridge as bridge

SPEC_PATH = ROOT / "art/reference_specs/e1_1986/materials-construction-01-surfaces-stock.json"


def make_png(path: Path, width: int, height: int) -> None:
    def chunk(kind: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    raw = b"".join(b"\x00" + b"\x00" * (width * 3) for _ in range(height))
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 1)) + chunk(b"IEND", b""))


class ProductionGuardTests(unittest.TestCase):
    def load_spec(self):
        return json.loads(SPEC_PATH.read_text(encoding="utf-8"))

    def test_eight_item_spec_is_valid(self):
        value = self.load_spec()
        self.assertEqual([], pg.validate_spec(value))
        self.assertEqual(8, value["expected_specimen_count"])
        self.assertEqual([4, 2], value["generation"]["layout"])

    def test_more_than_eight_is_blocked(self):
        value = self.load_spec()
        value["specimens"].append({"id":"09","name":"extra-9","description":"forbidden extra item"})
        value["expected_specimen_count"] = 9
        errors = pg.validate_spec(value)
        self.assertTrue(any("maximum 8" in e for e in errors))

    def test_prompt_contains_allowlist_and_previous_era_guard(self):
        prompt = pg.render_prompt(self.load_spec())
        self.assertIn("EXACTLY the 8 specimens", prompt)
        self.assertIn("4×2 grid", prompt)
        self.assertIn("DO NOT GENERATE ANYTHING NOT LISTED ABOVE", prompt)
        self.assertIn("FORBIDDEN REGRESSION", prompt)
        self.assertIn("no baked cast shadow", prompt)

    def test_surfaces_stock_keeps_all_eight_disambiguated(self):
        value = self.load_spec()
        items = {item["name"]: item["description"] for item in value["specimens"]}
        self.assertEqual(8, len(items))
        self.assertIn("Safety-yellow folded sheet-metal sample", items)
        self.assertIn("Short galvanized steel angle profile", items)
        self.assertIn("NOT an angle profile", items["Safety-yellow folded sheet-metal sample"])
        self.assertIn("absolutely no yellow paint", items["Short galvanized steel angle profile"])
        self.assertIn("TOP ROW CELL 3 ONLY", items["Safety-yellow folded sheet-metal sample"])
        self.assertIn("TOP ROW CELL 4 ONLY", items["Short galvanized steel angle profile"])
        self.assertTrue(any("ninth or extra specimen" in item for item in value["global_forbidden"]))
        self.assertTrue(any("photorealistic PBR" in item for item in value["global_forbidden"]))
        self.assertTrue(any("visible rust" in item and "orange oxidation" in item for item in value["global_forbidden"]))

    def test_request_embeds_style_once(self):
        style = (ROOT / "art/style_bible.txt").read_text(encoding="utf-8")
        request = pg.build_request(self.load_spec())
        self.assertEqual(1, request.count(style))

    def test_chat_bridge_embeds_exact_request_once(self):
        value = self.load_spec()
        request = pg.build_request(value)
        block = bridge.build_chat_block(value)
        self.assertEqual(1, block.count(request))
        self.assertIn(f"canonical_request_sha256: {bridge.sha256_text(request)}", block)
        self.assertTrue(block.startswith(bridge.BEGIN + "\n"))
        self.assertTrue(block.endswith(bridge.END + "\n"))
        self.assertIn(bridge.NEXT_ACTION, block)
        for specimen in value["specimens"]:
            self.assertIn(specimen["name"], block)
            self.assertIn(specimen["description"], block)
        self.assertEqual([], bridge.verify_chat_block(value, block))

    def test_chat_bridge_rejects_paraphrase_or_truncation(self):
        value = self.load_spec()
        block = bridge.build_chat_block(value)
        shortened = block.replace(value["specimens"][7]["description"], "same as above")
        errors = bridge.verify_chat_block(value, shortened)
        self.assertTrue(errors)
        self.assertTrue(any("differs" in error for error in errors))

    def test_chat_bridge_skill_requires_immediate_delivery(self):
        skill = (ROOT / "skills/vyshe-neba-production-guard/SKILL.md").read_text(encoding="utf-8")
        self.assertIn("build-chat-block", skill)
        self.assertIn("verify-chat-block", skill)
        self.assertIn("immediately before", skill)
        self.assertIn("делай следующий набор", skill)

    def test_every_e1_role_plan_sheet_has_machine_spec(self):
        reference_set = json.loads((ROOT / "art/references/eras/e1_1986/reference-set.json").read_text(encoding="utf-8"))
        planned = reference_set["role_plan"]
        self.assertEqual(10, len(planned))
        expected_paths = []
        for item in planned:
            spec_path = ROOT / "art/reference_specs/e1_1986" / f'{item["role"]}-{item["sheet"]}.json'
            expected_paths.append(spec_path)
            self.assertTrue(spec_path.is_file(), f"missing machine spec for {item['role']}/{item['sheet']}")
            spec_value = json.loads(spec_path.read_text(encoding="utf-8"))
            self.assertEqual(item["role"], spec_value["role"])
            self.assertEqual(item["sheet"], spec_value["sheet"])
            self.assertEqual(item["specimens"], spec_value["expected_specimen_count"])
            self.assertEqual([], pg.validate_spec(spec_value))
        self.assertEqual(10, len(set(expected_paths)))

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
