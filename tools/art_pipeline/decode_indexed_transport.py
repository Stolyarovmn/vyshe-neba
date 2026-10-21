#!/usr/bin/env python3
"""Decode a text-only indexed sprite transport into a PNG.

Format: indexed-zlib-b85-v1
- width / height
- palette: list of RGBA tuples
- pixels_zlib_b85: zlib-compressed one-byte palette indexes encoded with Base85
- pixel_sha256: SHA-256 of the decoded index byte stream

This exists so production art can move through text-only repository connectors without
shipping binary PNG bytes as base64 Git blobs. Canonical full-resolution originals
remain on Google Drive; this file only reconstructs a reviewed processing transport.
"""

import argparse
import base64
import hashlib
import json
import zlib
from pathlib import Path

from PIL import Image


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    args = p.parse_args()

    spec = json.loads(Path(args.input).read_text(encoding="utf-8"))
    if spec.get("format") != "indexed-zlib-b85-v1":
        raise SystemExit(f"unsupported transport format: {spec.get('format')!r}")

    width = int(spec["width"])
    height = int(spec["height"])
    palette = [tuple(map(int, rgba)) for rgba in spec["palette"]]
    if not 1 <= len(palette) <= 256:
        raise SystemExit(f"invalid palette length: {len(palette)}")
    if any(len(rgba) != 4 or any(v < 0 or v > 255 for v in rgba) for rgba in palette):
        raise SystemExit("invalid RGBA palette")

    compressed = base64.b85decode(spec["pixels_zlib_b85"].encode("ascii"))
    indexes = zlib.decompress(compressed)
    expected_len = width * height
    if len(indexes) != expected_len:
        raise SystemExit(f"decoded index length {len(indexes)} != {expected_len}")

    digest = hashlib.sha256(indexes).hexdigest()
    expected_digest = spec.get("pixel_sha256")
    if expected_digest and digest != expected_digest:
        raise SystemExit(f"pixel SHA mismatch: {digest} != {expected_digest}")
    if indexes and max(indexes) >= len(palette):
        raise SystemExit("pixel index references outside palette")

    rgba = bytearray(expected_len * 4)
    for i, idx in enumerate(indexes):
        rgba[i * 4 : i * 4 + 4] = bytes(palette[idx])

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.frombytes("RGBA", (width, height), bytes(rgba)).save(out, "PNG", optimize=True)
    print(json.dumps({
        "size": [width, height],
        "palette_entries": len(palette),
        "pixel_sha256": digest,
        "output": str(out),
    }))


if __name__ == "__main__":
    main()
