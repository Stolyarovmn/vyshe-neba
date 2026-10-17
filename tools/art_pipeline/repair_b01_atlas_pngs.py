#!/usr/bin/env python3
"""One-time structural recovery for malformed B01 indexed PNG atlases.

Recovery is deliberately conservative:
- recover the real PLTE boundary;
- repair stale chunk CRCs / terminal IEND metadata;
- recover exactly the raster-sized prefix of the old zlib scanline stream only
  when every PNG filter byte is valid;
- recompress those same filtered scanline bytes into a fresh IDAT.

No image resampling, palette remapping, quantization, drawing, or generated
pixel content is allowed. Downstream motion QA must reconstruct every approved
era anchor pixel-exactly before repaired atlases may be committed.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import struct
import zlib
from pathlib import Path

from PIL import Image

PARTS = ("body", "sensor", "vane", "indicator")
ROOTS = (
    Path("art/gen/placeables/base/weather_complex/parts"),
    Path("outputs/rocket/dist/assets/placeables/base/weather_complex/parts"),
)
PNG_SIG = b"\x89PNG\r\n\x1a\n"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def u32(data: bytes) -> int:
    return struct.unpack(">I", data)[0]


def p32(value: int) -> bytes:
    return struct.pack(">I", value)


def make_chunk(typ: bytes, payload: bytes) -> bytes:
    return p32(len(payload)) + typ + payload + p32(zlib.crc32(typ + payload) & 0xFFFFFFFF)


def canonical_iend() -> bytes:
    return make_chunk(b"IEND", b"")


def validate_chunks(data: bytes):
    if not data.startswith(PNG_SIG):
        raise ValueError("not PNG")
    pos = 8
    chunks = []
    saw_iend = False
    while pos + 12 <= len(data):
        n = u32(data[pos : pos + 4])
        typ = data[pos + 4 : pos + 8]
        end = pos + 12 + n
        if end > len(data):
            raise ValueError(f"broken chunk {typ!r} at {pos}: len={n}, remaining={len(data)-pos}")
        payload = data[pos + 8 : pos + 8 + n]
        got_crc = u32(data[pos + 8 + n : pos + 12 + n])
        want_crc = zlib.crc32(typ + payload) & 0xFFFFFFFF
        if got_crc != want_crc:
            raise ValueError(f"bad CRC {typ!r} at {pos}: got={got_crc:08x} want={want_crc:08x}")
        chunks.append((typ.decode("ascii", "replace"), n, pos))
        pos = end
        if typ == b"IEND":
            saw_iend = True
            break
    if not saw_iend:
        raise ValueError("missing IEND")
    if pos != len(data):
        raise ValueError(f"trailing bytes after IEND: {len(data)-pos}")
    return chunks


def parsed_payloads(data: bytes):
    validate_chunks(data)
    pos = 8
    out = []
    while pos + 12 <= len(data):
        n = u32(data[pos : pos + 4])
        typ = data[pos + 4 : pos + 8]
        payload = data[pos + 8 : pos + 8 + n]
        out.append((typ, payload))
        pos += 12 + n
        if typ == b"IEND":
            break
    return out


def normalize_chunk_crcs(data: bytes):
    """Repair stale CRCs and malformed terminal IEND; preserve all payloads."""
    if not data.startswith(PNG_SIG):
        raise ValueError("not PNG")
    buf = bytearray(data)
    pos = 8
    repairs = []
    saw_iend = False
    while pos + 12 <= len(buf):
        n = u32(buf[pos : pos + 4])
        typ = bytes(buf[pos + 4 : pos + 8])
        end = pos + 12 + n
        if end > len(buf):
            if len(buf) - pos == 12:
                before = bytes(buf[pos : pos + 12])
                buf[pos : pos + 12] = canonical_iend()
                repairs.append({
                    "type": "IEND",
                    "offset": pos,
                    "action": "replace_malformed_terminal_chunk",
                    "bytes_before": before.hex(),
                    "bytes_after": bytes(buf[pos : pos + 12]).hex(),
                })
                pos += 12
                saw_iend = True
                break
            raise ValueError(f"broken chunk {typ!r} at {pos}: len={n}, remaining={len(buf)-pos}")
        payload = bytes(buf[pos + 8 : pos + 8 + n])
        crc_off = pos + 8 + n
        got = u32(buf[crc_off : crc_off + 4])
        want = zlib.crc32(typ + payload) & 0xFFFFFFFF
        if got != want:
            buf[crc_off : crc_off + 4] = p32(want)
            repairs.append({
                "type": typ.decode("ascii", "replace"),
                "offset": pos,
                "action": "replace_crc",
                "crc_before": f"{got:08x}",
                "crc_after": f"{want:08x}",
            })
        pos = end
        if typ == b"IEND":
            saw_iend = True
            break
    if not saw_iend:
        raise ValueError("missing IEND")
    if pos != len(buf):
        raise ValueError(f"trailing bytes after IEND: {len(buf)-pos}")
    return bytes(buf), repairs


def find_next_chunk_start(data: bytes, plte_type_offset: int) -> int:
    candidates = []
    for typ in (b"tRNS", b"IDAT"):
        start = plte_type_offset + 4
        while True:
            off = data.find(typ, start)
            if off < 0:
                break
            if off >= 4:
                n = u32(data[off - 4 : off])
                chunk_start = off - 4
                chunk_end = chunk_start + 12 + n
                if 0 <= n <= len(data) and chunk_end <= len(data):
                    candidates.append(chunk_start)
                    break
            start = off + 1
    if not candidates:
        raise ValueError("cannot locate tRNS/IDAT after PLTE")
    return min(candidates)


def recover_raster_scanlines(data: bytes):
    """Recover only a complete, filter-valid raster prefix from old IDAT."""
    chunks = parsed_payloads(data)
    ihdr = next(payload for typ, payload in chunks if typ == b"IHDR")
    width, height, bit_depth, color_type, compression, filter_method, interlace = struct.unpack(
        ">IIBBBBB", ihdr
    )
    if (bit_depth, color_type, compression, filter_method, interlace) != (8, 3, 0, 0, 0):
        raise ValueError(
            f"unsupported recovery layout: bit_depth={bit_depth} color_type={color_type} "
            f"compression={compression} filter={filter_method} interlace={interlace}"
        )
    row_stride = width + 1
    expected = row_stride * height
    old_idat = b"".join(payload for typ, payload in chunks if typ == b"IDAT")
    if not old_idat:
        raise ValueError("missing IDAT payload")

    d = zlib.decompressobj()
    raw = bytearray()
    zerr = None
    error_offset = None
    for i, value in enumerate(old_idat):
        try:
            raw.extend(d.decompress(bytes((value,))))
        except zlib.error as exc:
            zerr = str(exc)
            error_offset = i
            break
    if zerr is None:
        try:
            raw.extend(d.flush())
        except zlib.error as exc:
            zerr = str(exc)
            error_offset = len(old_idat)

    if len(raw) < expected:
        raise ValueError(
            f"IDAT recovery rejected: recovered only {len(raw)} raw bytes, expected at least {expected}; "
            f"zlib_error={zerr!r} at compressed offset {error_offset}"
        )

    raster = bytes(raw[:expected])
    bad_filters = [(row, raster[row * row_stride]) for row in range(height) if raster[row * row_stride] > 4]
    if bad_filters:
        raise ValueError(f"IDAT recovery rejected: invalid PNG filter bytes, first={bad_filters[:8]}")

    new_idat = zlib.compress(raster, level=9)
    rebuilt = bytearray(PNG_SIG)
    wrote_idat = False
    for typ, payload in chunks:
        if typ == b"IDAT":
            if not wrote_idat:
                rebuilt += make_chunk(b"IDAT", new_idat)
                wrote_idat = True
            continue
        rebuilt += make_chunk(typ, payload)

    return bytes(rebuilt), {
        "performed": True,
        "expected_scanline_bytes": expected,
        "decompressed_stream_bytes": len(raw),
        "recovered_scanline_bytes": len(raster),
        "extra_stream_bytes_discarded": len(raw) - expected,
        "all_filter_bytes_valid": True,
        "old_idat_bytes": len(old_idat),
        "new_idat_bytes": len(new_idat),
        "zlib_error": zerr,
        "zlib_error_offset": error_offset,
        "zlib_eof": bool(d.eof),
        "raw_scanline_sha256": sha256_bytes(raster),
    }


def repair_png(data: bytes):
    if not data.startswith(PNG_SIG):
        raise ValueError("not PNG")
    try:
        validate_chunks(data)
        with Image.open(io.BytesIO(data)) as im:
            im.load()
            size = list(im.size)
            mode = im.mode
        return data, {
            "changed": False,
            "reason": "already_valid",
            "decoded_mode": mode,
            "decoded_size": size,
            "crc_repairs": [],
            "idat_recovery": {"performed": False},
        }
    except (ValueError, OSError) as initial_error:
        pass

    plte_type = data.find(b"PLTE", 8)
    if plte_type < 4:
        raise ValueError("PLTE not found")
    plte_start = plte_type - 4
    declared_len = u32(data[plte_start:plte_type])
    next_start = find_next_chunk_start(data, plte_type)
    actual_len = next_start - plte_start - 12
    if actual_len <= 0 or actual_len > 768 or actual_len % 3:
        raise ValueError(f"implausible recovered PLTE length {actual_len}")

    payload_start = plte_type + 4
    payload_end = payload_start + actual_len
    crc_offset = payload_end
    if crc_offset + 4 != next_start:
        raise ValueError("recovered PLTE boundary is inconsistent")
    payload = data[payload_start:payload_end]
    expected_plte_crc = zlib.crc32(b"PLTE" + payload) & 0xFFFFFFFF
    stored_plte_crc = u32(data[crc_offset:crc_offset + 4])

    repaired = bytearray(data)
    repaired[plte_start:plte_type] = p32(actual_len)
    repaired[crc_offset:crc_offset + 4] = p32(expected_plte_crc)
    repaired, crc_repairs = normalize_chunk_crcs(bytes(repaired))
    validate_chunks(repaired)

    idat_recovery = {"performed": False}
    try:
        with Image.open(io.BytesIO(repaired)) as im:
            im.load()
            size = list(im.size)
            mode = im.mode
    except OSError as decode_error:
        repaired, idat_recovery = recover_raster_scanlines(repaired)
        validate_chunks(repaired)
        with Image.open(io.BytesIO(repaired)) as im:
            im.load()
            size = list(im.size)
            mode = im.mode
        idat_recovery["decoder_error_before_recovery"] = str(decode_error)

    if size != [288, 244]:
        raise ValueError(f"decoded size {size} != [288,244]")
    chunks = validate_chunks(repaired)
    return repaired, {
        "changed": True,
        "declared_plte_len_before": declared_len,
        "plte_len_after": actual_len,
        "palette_entries": actual_len // 3,
        "plte_crc_before": f"{stored_plte_crc:08x}",
        "plte_crc_after": f"{expected_plte_crc:08x}",
        "crc_repairs": crc_repairs,
        "idat_recovery": idat_recovery,
        "decoded_mode": mode,
        "decoded_size": size,
        "chunks": chunks,
        "initial_error": str(initial_error),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-root", default=".")
    ap.add_argument("--report", default="")
    args = ap.parse_args()
    repo = Path(args.repo_root)
    report = {"asset_id": "B01", "asset": "weather_complex", "files": {}, "result": "pass"}

    for rel_root in ROOTS:
        for part in PARTS:
            rel = rel_root / f"{part}_eras.png"
            path = repo / rel
            before = path.read_bytes()
            after, info = repair_png(before)
            info["sha256_before"] = sha256_bytes(before)
            info["sha256_after"] = sha256_bytes(after)
            info["bytes_before"] = len(before)
            info["bytes_after"] = len(after)
            report["files"][str(rel)] = info
            if after != before:
                path.write_bytes(after)
                idat = info["idat_recovery"]
                print(
                    f"RECOVERED {rel}: PLTE {info['declared_plte_len_before']} -> "
                    f"{info['plte_len_after']} bytes, {info['palette_entries']} colors; "
                    f"structural repairs={len(info['crc_repairs'])}; "
                    f"IDAT raster recovery={idat.get('performed', False)}; "
                    f"extra_stream={idat.get('extra_stream_bytes_discarded', 0)}"
                )
            else:
                print(f"VALID {rel}")

    for part in PARTS:
        a = (repo / ROOTS[0] / f"{part}_eras.png").read_bytes()
        b = (repo / ROOTS[1] / f"{part}_eras.png").read_bytes()
        if a != b:
            raise SystemExit(f"QA_FAIL: art/gen and runtime {part} atlases differ after recovery")

    if args.report:
        rp = Path(args.report)
        rp.parent.mkdir(parents=True, exist_ok=True)
        rp.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("B01 atlas recovery PASS: all atlases fully decode; art/gen == runtime")


if __name__ == "__main__":
    main()
