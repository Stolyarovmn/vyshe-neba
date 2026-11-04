#!/usr/bin/env python3
"""Ground-source pre-processing evidence checks, including negative cases."""
from __future__ import annotations

import hashlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from PIL import Image

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
import verify_ground_source_gate as gate


class GroundSourceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        p = Path(self.tmp.name)
        self.source = p / "original.png"
        raw = io.BytesIO()
        Image.new("RGBA", (8, 8), (140, 130, 120, 255)).save(raw, format="PNG")
        self.source.write_bytes(raw.getvalue())
        self.review_file = p / "review.json"
        self.preview = p / "preview.png"
        raw = io.BytesIO()
        Image.new("RGBA", (10, 10), (80, 90, 100, 255)).save(raw, format="PNG")
        self.preview.write_bytes(raw.getvalue())
        self.source_sha = gate.file_sha(self.source)
        self.island_sha = "e" * 64
        self.proxy = {
            "generation_elevation_proxy_deg": 73.44,
            "generation_tilt_from_top_down_proxy_deg": 16.56,
            "ground_plane_compression_target": 0.958515,
        }
        self.review = {
            "source_gate": "PASS",
            "placement_scope": "TEST_ONLY_NON_AUTHORITATIVE",
            "source_sha256": self.source_sha,
            "island_sha256": self.island_sha,
            "actual_camera_angle": "UNKNOWN",
            "elevation_proxy_deg": 73.44,
            "tilt_proxy_deg": 16.56,
            "ground_compression_proxy": 0.958515,
            "reviewer": "recorded projection reviewer",
            "review_evidence": "evidence://exact-source-review",
            "scene_preview_png": "preview.png",
            "scene_preview_sha256": gate.file_sha(self.preview),
            "checks": dict.fromkeys(gate.CHECKS, "pass"),
        }

    def errors(self, digest=None):
        self.review_file.write_text(json.dumps(self.review), encoding="utf-8")
        return gate.verify_source_review(
            self.source, self.review_file, digest or self.source_sha,
            self.island_sha, self.proxy,
        )

    def test_verifiable_review_can_pass_integrity_gate(self):
        self.assertEqual([], self.errors())

    def test_wrong_raw_original_sha_fails(self):
        self.assertIn("machine provenance", " ".join(self.errors("a" * 64)))

    def test_missing_test_only_marker_fails_closed(self):
        self.review.pop("placement_scope")
        self.assertIn("TEST_ONLY_NON_AUTHORITATIVE", " ".join(self.errors()))

    def test_source_preview_cannot_claim_final_map_placement(self):
        self.review["placement_scope"] = "MAP_EDITOR_APPROVED"
        self.assertIn("TEST_ONLY_NON_AUTHORITATIVE", " ".join(self.errors()))

    def test_source_fail_cannot_enter_pixel_snapper(self):
        self.review["source_gate"] = "FAIL"
        self.assertIn("source_gate", " ".join(self.errors()))

    def test_unreviewed_source_cannot_enter_pixel_snapper(self):
        self.review_file.unlink(missing_ok=True)
        self.assertIn("missing", " ".join(gate.verify_source_review(
            self.source, self.review_file, self.source_sha,
            self.island_sha, self.proxy
        )))

    def test_review_wrong_source_sha_fails(self):
        self.review["source_sha256"] = "a" * 64
        self.assertIn("source review SHA", " ".join(self.errors()))

    def test_wrong_island_sha_fails(self):
        self.review["island_sha256"] = "b" * 64
        self.assertIn("island SHA", " ".join(self.errors()))

    def test_camera_47_claim_fails(self):
        self.review["actual_camera_angle"] = 47
        self.assertIn("camera angle", " ".join(self.errors()))

    def test_camera_proxy_drift_fails(self):
        self.review["tilt_proxy_deg"] = 45
        self.assertIn("tilt_proxy_deg", " ".join(self.errors()))

    def test_missing_visual_projection_pass_fails(self):
        self.review["checks"]["projection_match"] = "pending"
        self.assertIn("projection_match", " ".join(self.errors()))

    def test_source_fake_png_magic_with_matching_sha_blocks(self):
        invalid = gate.PNG_SIG + b"invalid source payload"
        self.source.write_bytes(invalid)
        self.review["source_sha256"] = gate.file_sha(self.source)
        self.assertIn("fails decoding", " ".join(self.errors(gate.file_sha(self.source))))

    def test_preview_fake_png_magic_with_matching_sha_blocks(self):
        invalid = gate.PNG_SIG + b"invalid preview payload"
        self.preview.write_bytes(invalid)
        self.review["scene_preview_sha256"] = gate.file_sha(self.preview)
        self.assertIn("not a valid PNG", " ".join(self.errors()))

    def test_evidence_sha_changed_fails(self):
        self.preview.write_bytes(gate.PNG_SIG + b"corrupted")
        self.assertIn("SHA mismatch", " ".join(self.errors()))

    def test_evidence_path_traversal_fails(self):
        self.review["scene_preview_png"] = "../other.png"
        self.assertIn("escapes review", " ".join(self.errors()))

    def test_missing_reviewer_fails(self):
        self.review["reviewer"] = ""
        self.assertIn("reviewer", " ".join(self.errors()))

    def test_cannot_use_json_as_raw_original(self):
        self.source.write_text('{"not":"a png"}', encoding="utf-8")
        self.assertIn("not PNG", " ".join(self.errors()))

    def test_processor_checks_before_source_prepare(self):
        processor = (TOOLS / "process_asset.py").read_text(encoding="utf-8")
        self.assertLess(processor.index("verify_ground_source_gate.py"),
                        processor.index("execute(tracker,'source_prepare'"))


if __name__ == "__main__":
    unittest.main()
