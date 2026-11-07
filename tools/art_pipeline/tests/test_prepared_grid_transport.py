import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from process_asset import prepare_source


class PreparedGridTransportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "original.png"
        image = Image.new("RGBA", (9, 7))
        image.putpixel((4, 3), (30, 70, 100, 255))
        image.save(self.source)
        self.original_sha = hashlib.sha256(self.source.read_bytes()).hexdigest()
        self.cfg = {"canvas": [20, 20], "pixel_size": 1, "adapter": "prepared_grid_png"}

    def test_default_preserves_exact_bytes(self):
        output = prepare_source(self.root, self.cfg, "e0", self.root, self.source)
        self.assertEqual(output.read_bytes(), self.source.read_bytes())

    def test_scale_preserves_aspect_pixels_and_original(self):
        self.cfg["transport_scale"] = 4
        output = prepare_source(self.root, self.cfg, "e0", self.root, self.source)
        with Image.open(output) as result:
            self.assertEqual(result.size, (36, 28))
            self.assertEqual(result.getpixel((16, 12)), (30, 70, 100, 255))
            self.assertEqual(result.getpixel((19, 15)), (30, 70, 100, 255))
            self.assertEqual(result.getpixel((20, 15))[3], 0)
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), self.original_sha)

    def test_nonpositive_scale_fails(self):
        self.cfg["transport_scale"] = 0
        with self.assertRaises(ValueError):
            prepare_source(self.root, self.cfg, "e0", self.root, self.source)


if __name__ == "__main__":
    unittest.main()
