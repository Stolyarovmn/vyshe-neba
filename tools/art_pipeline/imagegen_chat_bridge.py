#!/usr/bin/env python3
"""Explicit context bridge for conversational image generation.

The production guard can build a deterministic canonical request, but some
image-generation surfaces infer instructions from the surrounding
conversation instead of accepting that request as a literal tool argument.
This bridge serializes the canonical request into an exact chat block that
must be placed immediately before the image-generation tool call.
"""
from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

from production_guard import GuardError, build_request, read_json

BEGIN = "=== BEGIN VYSHE-NEBA EXPLICIT IMAGEGEN BLOCK ==="
END = "=== END VYSHE-NEBA EXPLICIT IMAGEGEN BLOCK ==="
NEXT_ACTION = "NEXT ACTION: invoke the image-generation tool immediately after this block, with no intervening natural-language instruction."


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_chat_block(spec: dict) -> str:
    request = build_request(spec)
    request_sha = sha256_text(request)
    return (
        f"{BEGIN}\n"
        f"canonical_request_sha256: {request_sha}\n"
        f"{NEXT_ACTION}\n\n"
        "Use the complete canonical request below as the production instruction for the next image-generation call. "
        "Do not summarize, shorten, paraphrase, reorder, substitute or omit any specimen, exclusion, era rule or style-bible text. "
        "Do not replace this block with shorthand such as “do the next set”, “same as above”, “use the spec” or an equivalent phrase.\n\n"
        "--- BEGIN CANONICAL REQUEST ---\n"
        f"{request.rstrip()}\n"
        "--- END CANONICAL REQUEST ---\n"
        f"{END}\n"
    )


def verify_chat_block(spec: dict, block: str) -> list[str]:
    expected = build_chat_block(spec)
    errors: list[str] = []
    if block != expected:
        errors.append("chat block differs from the deterministic production-guard block")
    request = build_request(spec)
    request_sha = sha256_text(request)
    if block.count(request) != 1:
        errors.append("canonical request must appear exactly once in the chat block")
    if f"canonical_request_sha256: {request_sha}" not in block:
        errors.append("canonical request SHA-256 is missing or incorrect")
    if not block.startswith(BEGIN + "\n") or not block.endswith(END + "\n"):
        errors.append("chat block boundary markers are missing or malformed")
    if NEXT_ACTION not in block:
        errors.append("immediate image-generation next-action rule is missing")
    return errors


def write_output(path: str | None, text: str) -> None:
    if path:
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
        print(target)
    else:
        sys.stdout.write(text)


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build-chat-block")
    build.add_argument("spec")
    build.add_argument("--output")

    verify = sub.add_parser("verify-chat-block")
    verify.add_argument("spec")
    verify.add_argument("block")

    digest = sub.add_parser("request-sha256")
    digest.add_argument("spec")

    args = parser.parse_args()
    try:
        spec = read_json(args.spec)
        if args.command == "build-chat-block":
            write_output(args.output, build_chat_block(spec))
            return 0
        if args.command == "verify-chat-block":
            block = Path(args.block).read_text(encoding="utf-8")
            errors = verify_chat_block(spec, block)
            if errors:
                for error in errors:
                    print("ERROR:", error, file=sys.stderr)
                return 1
            print("PASS: explicit imagegen chat block exactly matches the canonical request")
            return 0
        print(sha256_text(build_request(spec)))
        return 0
    except (GuardError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
