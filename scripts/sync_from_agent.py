#!/usr/bin/env python3
"""
Turn Review Funnel agent markdown into draftTemplates JSON.

Usage:
  python3 scripts/sync_from_agent.py \\
    --markdown path/to/output.md \\
    --client toby \\
    --biz "Signature Tree and Home" \\
    --owner Toby \\
    --link "https://g.page/r/CYNcZC8tnZqhEBM/review"
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def extract_text_blocks(markdown: str) -> dict[str, list[str]]:
    """Pull fenced code blocks under TEXT MESSAGE first/repeat headings."""
    first: list[str] = []
    repeat: list[str] = []
    current = None
    in_fence = False
    buf: list[str] = []

    for line in markdown.splitlines():
        heading = line.strip()
        if heading.startswith("#"):
            upper = heading.upper()
            if "TEXT" in upper and "EMAIL" not in upper:
                if "REPEAT" in upper:
                    current = "repeat"
                elif "FIRST" in upper:
                    current = "first"
                else:
                    current = None
            else:
                current = None
            continue
        if line.strip().startswith("```"):
            if in_fence:
                text = "\n".join(buf).strip()
                if current == "first" and text:
                    first.append(text)
                elif current == "repeat" and text:
                    repeat.append(text)
                buf = []
                in_fence = False
            else:
                in_fence = True
            continue
        if in_fence:
            buf.append(line)

    return {"first": first, "repeat": repeat}


def to_tokens(text: str, biz: str, owner: str, link: str) -> str:
    out = text
    replacements = [
        (re.compile(re.escape(link), re.I), "{link}"),
        (re.compile(r"https?://g\.page/\S+", re.I), "{link}"),
        (re.compile(r"https?://search\.google\.com/\S+", re.I), "{link}"),
        (re.compile(r"\[First Name\]", re.I), "{cust}"),
        (re.compile(r"\[Customer(?:'s)? First Name\]", re.I), "{cust}"),
        (re.compile(re.escape(biz), re.I), "{biz}"),
        (re.compile(rf"\b{re.escape(owner)}\b"), "{owner}"),
    ]
    for pattern, token in replacements:
        out = pattern.sub(token, out)
    out = re.sub(r"\n{3,}", "\n\n", out).strip()
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Map agent REQUEST DRAFTS into client JSON tokens")
    parser.add_argument("--markdown", required=True, help="Path to review_funnel agent output")
    parser.add_argument("--client", required=True, help="Client slug (clients/{slug}.json)")
    parser.add_argument("--biz", required=True)
    parser.add_argument("--owner", required=True)
    parser.add_argument("--link", required=True)
    parser.add_argument("--write", action="store_true", help="Merge into clients/{slug}.json")
    args = parser.parse_args()

    source = Path(args.markdown).read_text()
    blocks = extract_text_blocks(source)
    templates = {
        "first": [to_tokens(t, args.biz, args.owner, args.link) for t in blocks["first"]],
        "repeat": [to_tokens(t, args.biz, args.owner, args.link) for t in blocks["repeat"]],
    }

    print(json.dumps({"draftTemplates": templates}, indent=2))

    if not templates["first"] and not templates["repeat"]:
        raise SystemExit("No TEXT MESSAGE fenced blocks found. Check the markdown headings.")

    if args.write:
        dest = ROOT / "clients" / f"{args.client}.json"
        if not dest.exists():
            raise SystemExit(f"Missing {dest}. Copy clients/_template.json first.")
        data = json.loads(dest.read_text())
        data["draftTemplates"] = templates
        dest.write_text(json.dumps(data, indent=2) + "\n")
        print(f"\nWrote drafts into {dest}")


if __name__ == "__main__":
    main()
