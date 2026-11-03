#!/usr/bin/env python3
"""Build/verify exact B01 E0 chat bridge and integrity of actual PNG input bundles.

This tool checks transport bytes; it cannot prove that conversational imagegen
actually received any particular image, which must remain a separate gate.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import zipfile
from pathlib import Path

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
BEGIN = "<<< BEGIN EXACT CANONICAL GENERATION REQUEST >>>\n"
END = "\n<<< END EXACT CANONICAL GENERATION REQUEST >>>\n"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def reference_manifest(receipt: dict) -> list[dict]:
    refs = receipt["approved_era_reference_set"]["parts"]
    if len(refs) != 10:
        raise ValueError(f"B01 E0 requires exactly ten approved PNG references, got {len(refs)}")
    out, seen = [], set()
    for ref in refs:
        key = (ref["role"], ref["sheet"])
        if key in seen:
            raise ValueError(f"duplicate reference {key}")
        seen.add(key)
        if len(ref["sha256"]) != 64 or ref["dimensions"] != [1536, 1024] or ref["bytes"] <= 0:
            raise ValueError(f"invalid reference metadata {key}")
        out.append({k: ref[k] for k in ("role", "sheet", "sha256", "bytes", "dimensions", "drive_file_id")})
    return out


def chat_block(receipt: dict, request: bytes, expected_sha: str) -> bytes:
    if receipt.get("asset_id") != "B01" or receipt.get("era") != "E0":
        raise ValueError("B01/E0 only")
    if not receipt["generation_gate"].get("can_generate_isolated_candidate"):
        raise ValueError("generation preflight closed")
    if sha256(request) != expected_sha:
        raise ValueError("canonical request SHA mismatch")
    refs = reference_manifest(receipt)
    island = receipt["camera"]["current_hd_reference_sha256"]
    if len(island) != 64:
        raise ValueError("missing approved island SHA")
    header = (
        "B01/E0 EXACT IMAGEGEN CHAT BRIDGE — DO NOT PARAPHRASE\n"
        "Eleven PNG images MUST actually be supplied as image inputs to imagegen with this full request. "
        "The metadata below is NOT proof that imagegen saw them.\n"
        "The approved island is a perspective/scene control image, NOT a component of output.\n"
        "All E0 atomic references transfer fabrication/material/mechanism/control/signal language ONLY.\n"
        f"CANONICAL REQUEST SHA-256: {expected_sha}\n"
        f"APPROVED ISLAND SHA-256: {island}\n"
        "REQUIRED VERIFIED IMAGE INPUTS:\n"
    )
    for item in refs:
        header += (f"- {item['role']}/{item['sheet']}: SHA-256={item['sha256']}, "
                   f"bytes={item['bytes']}, dimensions=1536x1024, "
                   f"Drive={item['drive_file_id']}\n")
    header += f"- island/start_island_hd.png: SHA-256={island}, dimensions=1916x821\n"
    return header.encode("utf-8") + BEGIN.encode("utf-8") + request + END.encode("utf-8")


def png_dimensions(data: bytes) -> list[int]:
    if not data.startswith(PNG_SIGNATURE) or data[12:16] != b"IHDR":
        raise ValueError("invalid PNG header")
    return list(struct.unpack(">II", data[16:24]))


def verify_zip(receipt: dict, archive: Path) -> dict:
    expected = reference_manifest(receipt)
    with zipfile.ZipFile(archive) as z:
        manifest = json.loads(z.read("manifest.json"))
        supplied = manifest["expected_reference_images"]
        if len(supplied) != 10:
            raise ValueError("missing or extra reference in input bundle")
        seen = set()
        for item in supplied:
            key = (item["role"], item["sheet"])
            if key in seen:
                raise ValueError(f"duplicate input {key}")
            seen.add(key)
            match = next((r for r in expected if (r["role"],r["sheet"]) == key), None)
            if match is None:
                raise ValueError(f"unlisted reference {key}")
            for k in ("sha256", "bytes", "dimensions", "drive_file_id"):
                if item[k] != match[k]:
                    raise ValueError(f"reference metadata drift {key} {k}")
            data = z.read(item["pack_path"])
            if sha256(data) != match["sha256"] or len(data) != match["bytes"] or png_dimensions(data) != match["dimensions"]:
                raise ValueError(f"reference image bytes invalid {key}")
        island = manifest["approved_island"]
        if island["sha256"] != receipt["camera"]["current_hd_reference_sha256"]:
            raise ValueError("island SHA does not match canonical projection reference")
        data = z.read(island["pack_path"])
        if sha256(data) != island["sha256"] or png_dimensions(data) != [1916, 821]:
            raise ValueError("incorrect approved island PNG")
    return {"status": "PASS_EXACT_INPUT_BYTES", "reference_count": 10,
            "island_sha256": island["sha256"], "bundle_sha256": sha256(archive.read_bytes()),
            "actual_imagegen_reference_delivery": "UNVERIFIED"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["build", "verify", "verify-pack"])
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--request", type=Path)
    parser.add_argument("--request-sha256")
    parser.add_argument("--block", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--archive", type=Path)
    args = parser.parse_args()
    receipt = json.loads(args.receipt.read_text(encoding="utf-8"))
    if args.command == "verify-pack":
        if not args.archive:
            parser.error("--archive required")
        print(json.dumps(verify_zip(receipt, args.archive), indent=2))
        return
    if not args.request or not args.request_sha256:
        parser.error("--request and --request-sha256 required")
    expected = chat_block(receipt, args.request.read_bytes(), args.request_sha256)
    if args.command == "build":
        if not args.output:
            parser.error("--output required")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(expected)
        print(json.dumps({"chat_block_sha256": sha256(expected), "bytes": len(expected),
                          "actual_imagegen_input_delivery": "UNVERIFIED"}))
    else:
        if not args.block:
            parser.error("--block required")
        if args.block.read_bytes() != expected:
            raise SystemExit("BLOCKED: full chat bridge bytes do not match exact request")
        print(json.dumps({"status": "PASS_EXACT_CHAT_BLOCK_BYTES",
                          "chat_block_sha256": sha256(expected),
                          "actual_imagegen_input_delivery": "UNVERIFIED"}))


if __name__ == "__main__":
    main()
