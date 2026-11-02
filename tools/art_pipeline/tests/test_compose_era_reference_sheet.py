#!/usr/bin/env python3
"""Regression suite for guarded 8x single-specimen composition."""
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import compose_era_reference_sheet as c


class SpecimenCompositionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.spec_file = "art/reference_specs/e2_1998/materials-construction-02-joints-repairs.json"
        self.spec, spec_sha = c.read_spec(self.spec_file)
        self.parts = []
        for i in range(1, 9):
            sid = f"{i:02d}"
            file = self.root / f"source-{sid}.png"
            im = Image.new("RGBA", c.INPUT_SIZE, (0, 0, 0, 0))
            ImageDraw.Draw(im).rectangle((200, 200, 780, 760),
                fill=(i * 21, 70, 160, 255))
            im.save(file, "PNG")
            sha = hashlib.sha256(file.read_bytes()).hexdigest()
            self.parts.append({
                "id": sid, "source": file.name, "sha256": sha,
                "generation_id": f"test-gen-{sid}",
                "request_sha256": c.digest(c.build_request(self.spec, sid).encode("utf-8")),
                "drive_file_id": f"test-drive-id-{sid}",
                "drive_url": f"https://drive.google.com/file/d/test-drive-id-{sid}/view",
                "review": {"verdict": "pass", "reviewer": "unit test reviewer",
                           "notes": "physical identity, E2 role and no baked FX pass"}
            })
        self.manifest = {
            "schema_version": 1, "spec_file": self.spec_file,
            "spec_sha256": spec_sha, "parts": self.parts
        }
        self.manifest_file = self.root / "manifest.json"
        self.save_manifest()

    def save_manifest(self):
        self.manifest_file.write_text(json.dumps(self.manifest))

    def make(self, suffix="a"):
        png = self.root / f"sheet-{suffix}.png"
        report = self.root / f"sheet-{suffix}.json"
        return c.compose(self.spec_file, self.manifest_file, self.root,
                         output=png, report=report)

    def test_request_has_single_specimen_and_exact_style(self):
        a = c.build_request(self.spec, "01")
        style = (c.ROOT / "art/style_bible.txt").read_text(encoding="utf-8")
        self.assertEqual(a.count(style), 1)
        self.assertIn(self.spec["specimens"][0]["description"], a)
        self.assertIn("Do NOT draw the other seven", a)
        self.assertEqual(c.build_chat_block(self.spec, "01").count(style), 1)

    def test_invalid_id_fails(self):
        with self.assertRaises(c.Blocked):
            c.build_request(self.spec, "09")

    def test_deterministic_composite_and_verify(self):
        a = self.make("a")
        b = self.make("b")
        self.assertEqual(a["composite"]["sha256"], b["composite"]["sha256"])
        self.assertEqual(a["composite"]["dimensions"], [1536, 1024])
        self.assertEqual(len(a["parts"]), 8)
        c.compose(self.spec_file, self.manifest_file, self.root,
                  verify_image=self.root / "sheet-a.png",
                  verify_report=self.root / "sheet-a.json")

    def test_missing_id_fails(self):
        self.manifest["parts"].pop()
        self.save_manifest()
        with self.assertRaises(c.Blocked):
            self.make()

    def test_duplicate_sha_fails(self):
        # Copies source bytes to another distinct file and updates SHA.
        src = self.root / "source-02.png"
        src.write_bytes((self.root / "source-01.png").read_bytes())
        self.manifest["parts"][1]["sha256"] = self.manifest["parts"][0]["sha256"]
        self.save_manifest()
        with self.assertRaisesRegex(c.Blocked, "duplicate raw"):
            self.make()

    def test_changed_source_fails_sha(self):
        (self.root / "source-03.png").write_bytes(b"modified")
        with self.assertRaisesRegex(c.Blocked, "SHA mismatch"):
            self.make()

    def test_failed_visual_review_blocks(self):
        self.parts[4]["review"]["verdict"] = "pending"
        self.save_manifest()
        with self.assertRaisesRegex(c.Blocked, "PASS visual review"):
            self.make()

    def test_missing_drive_provenance_blocks(self):
        self.parts[2]["drive_file_id"] = ""
        self.save_manifest()
        with self.assertRaises(c.Blocked):
            self.make()

    def test_wrong_request_digest_blocks(self):
        self.parts[1]["request_sha256"] = "0" * 64
        self.save_manifest()
        with self.assertRaisesRegex(c.Blocked, "request SHA"):
            self.make()

    def test_stale_spec_blocks(self):
        self.manifest["spec_sha256"] = "a" * 64
        self.save_manifest()
        with self.assertRaisesRegex(c.Blocked, "stale sheet spec"):
            self.make()

    def test_nontransparent_png_blocks(self):
        x = self.root / "source-02.png"
        Image.new("RGB", c.INPUT_SIZE, "white").save(x)
        self.parts[1]["sha256"] = hashlib.sha256(x.read_bytes()).hexdigest()
        self.save_manifest()
        with self.assertRaisesRegex(c.Blocked, "RGBA transparency"):
            self.make()

    def test_border_touching_png_blocks(self):
        x = self.root / "source-02.png"
        Image.new("RGBA", c.INPUT_SIZE, (255, 1, 1, 255)).save(x)
        self.parts[1]["sha256"] = hashlib.sha256(x.read_bytes()).hexdigest()
        self.save_manifest()
        with self.assertRaisesRegex(c.Blocked, "touches border"):
            self.make()

    def test_escape_path_blocks(self):
        self.parts[3]["source"] = "../outside.png"
        self.save_manifest()
        with self.assertRaisesRegex(c.Blocked, "escaping"):
            self.make()

    def test_refuses_overwrite(self):
        self.make()
        with self.assertRaisesRegex(c.Blocked, "refuse overwrite"):
            self.make()


if __name__ == "__main__":
    unittest.main()
