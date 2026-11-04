#!/usr/bin/env python3
"""Negative and positive evidence tests; NEVER infer a camera angle from PNG."""
from __future__ import annotations

import hashlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import verify_visual_gate as gate


class GroundProjectionGateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.candidate = Path(self.tmp.name)
        (self.candidate / "evidence").mkdir()
        raw = io.BytesIO()
        Image.new("RGBA", (8, 8), (220, 200, 170, 255)).save(raw, format="PNG")
        self.png = raw.getvalue()
        (self.candidate / "evidence/scene.png").write_bytes(self.png)
        self.editor = b'{"weather":{"anchor":[1000,350]}}'
        (self.candidate / "evidence/editor.json").write_bytes(self.editor)
        self.source_sha = "a" * 64
        self.processed_sha = "b" * 64
        self.island_sha = "c" * 64
        self.proxy = {
            "generation_elevation_proxy_deg": 73.44,
            "generation_tilt_from_top_down_proxy_deg": 16.56,
            "ground_plane_compression_target": 0.958515,
        }
        self.item = {"pipeline": "e0_1978.pipeline.json"}
        (self.candidate / self.item["pipeline"]).write_text(
            json.dumps({"source_sha256": self.source_sha}) + "\n", encoding="utf-8"
        )
        self.review = {
            "scene_projection": {
                "status": "pass",
                "candidate_sha256": self.processed_sha,
                "source_sha256": self.source_sha,
                "island_sha256": self.island_sha,
                "actual_camera_angle": "UNKNOWN",
                "elevation_proxy_deg": 73.44,
                "tilt_proxy_deg": 16.56,
                "ground_compression_proxy": 0.958515,
                "scene_png": "evidence/scene.png",
                "scene_png_sha256": hashlib.sha256(self.png).hexdigest(),
                "placement_scope": "TEST_ONLY_NON_AUTHORITATIVE",
                "reviewer": "user with exact image SHA approval",
                "approval_evidence": "https://example.invalid/review-record",
                "checks": dict.fromkeys(gate.SCENE_CHECKS, "pass"),
            }
        }

    def errors(self):
        return gate.verify_ground_scene(
            self.candidate, self.item, self.review,
            self.processed_sha, self.island_sha, self.proxy,
        )

    def test_valid_review_data_passes_integrity_gate_only(self):
        self.assertEqual([], self.errors())

    def test_ground_family_is_required(self):
        self.assertTrue(gate.requires_ground_scene({"production_dir": "art/gen/placeables/base/weather_complex"}))
        self.assertTrue(gate.requires_ground_scene({"production_dir": "art/gen/placeables/base/landing_guidance"}))
        self.assertFalse(gate.requires_ground_scene({"production_dir": "art/gen/placeables/workshop/flight_simulator"}))

    def test_missing_scene_evidence_fails_closed(self):
        self.review.pop("scene_projection")
        self.assertIn("missing", " ".join(self.errors()))

    def test_source_fail_record_cannot_be_promoted(self):
        self.review["scene_projection"]["status"] = "fail"
        self.assertTrue(self.errors())

    def test_candidate_sha_cannot_be_reused(self):
        self.review["scene_projection"]["candidate_sha256"] = "0" * 64
        self.assertIn("candidate", " ".join(self.errors()))

    def test_original_sha_must_match_source_provenance(self):
        self.review["scene_projection"]["source_sha256"] = "f" * 64
        self.assertIn("original source", " ".join(self.errors()))

    def test_island_wrong_sha_fails(self):
        self.review["scene_projection"]["island_sha256"] = "0" * 64
        self.assertIn("approved island", " ".join(self.errors()))

    def test_camera_47_claim_is_rejected(self):
        self.review["scene_projection"]["actual_camera_angle"] = 47
        self.assertIn("original camera", " ".join(self.errors()))

    def test_changed_proxy_is_rejected(self):
        self.review["scene_projection"]["elevation_proxy_deg"] = 45
        self.assertIn("elevation_proxy_deg", " ".join(self.errors()))

    def test_each_visual_axis_is_required(self):
        for name in gate.SCENE_CHECKS:
            with self.subTest(name=name):
                self.review["scene_projection"]["checks"][name] = "pending"
                self.assertIn(name, " ".join(self.errors()))
                self.review["scene_projection"]["checks"][name] = "pass"

    def test_scene_png_signature_only_with_correct_sha_is_rejected(self):
        invalid = b"\x89PNG\r\n\x1a\nnot-a-decodable-image"
        (self.candidate / "evidence/scene.png").write_bytes(invalid)
        self.review["scene_projection"]["scene_png_sha256"] = hashlib.sha256(invalid).hexdigest()
        self.assertIn("undecodable", " ".join(self.errors()))

    def test_map_editor_data_is_not_part_of_art_visual_gate(self):
        self.assertEqual([], self.errors())
        (self.candidate / "evidence/editor.json").unlink()
        self.assertEqual([], self.errors())

    def test_scene_png_sha_mismatch_is_rejected(self):
        (self.candidate / "evidence/scene.png").write_bytes(b"changed")
        self.assertIn("wrong evidence SHA", " ".join(self.errors()))

    def test_test_only_marker_is_mandatory(self):
        self.review["scene_projection"]["placement_scope"] = "PENDING"
        self.assertIn("TEST_ONLY_NON_AUTHORITATIVE", " ".join(self.errors()))

    def test_final_placement_claim_is_rejected_in_visual_gate(self):
        self.review["scene_projection"]["placement_scope"] = "MAP_EDITOR_APPROVED"
        self.assertIn("TEST_ONLY_NON_AUTHORITATIVE", " ".join(self.errors()))

    def test_scene_path_traversal_is_rejected(self):
        self.review["scene_projection"]["scene_png"] = "../external.png"
        self.assertIn("escapes candidate", " ".join(self.errors()))

    def test_review_must_identify_reviewer_and_evidence(self):
        self.review["scene_projection"]["reviewer"] = ""
        self.review["scene_projection"]["approval_evidence"] = ""
        output = " ".join(self.errors())
        self.assertIn("reviewer", output)
        self.assertIn("approval evidence", output)


if __name__ == "__main__":
    unittest.main()
