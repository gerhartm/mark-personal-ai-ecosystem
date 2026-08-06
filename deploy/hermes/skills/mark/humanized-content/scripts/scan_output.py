#!/usr/bin/env python3
"""Advisory scanner for mechanical writing tells and citation damage.

Usage:
  python3 scan_output.py draft.txt
  python3 scan_output.py draft.txt --source source.txt --strict

When a source file is supplied, every canonical citation token present in the
source must still be present in the final draft. The scanner does not rewrite
content and does not make authorship or detection claims.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path


CITATION = re.compile(r"\[(?:\d{4}-\d{2}-\d{2}-\d{4}|sha256:[a-f0-9]{64})\]", re.I)
RULES = {
    "em_dash": re.compile("\N{EM DASH}"),
    "formulaic_contrast": re.compile(
        r"\b(?:not just|not only)\b.{0,80}\b(?:but|it(?:'|’)s)\b",
        re.I,
    ),
    "hype": re.compile(
        r"\b(?:world-class|game-?changer|cutting-edge|revolutionary|"
        r"unlock (?:your|the) potential|take .{0,30} to the next level)\b",
        re.I,
    ),
    "assistant_framing": re.compile(
        r"\b(?:great question|I hope this helps|let me know if you(?:'|’)d like)\b",
        re.I,
    ),
    "generic_closer": re.compile(
        r"\b(?:in conclusion|the future looks bright|exciting times lie ahead)\b",
        re.I,
    ),
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("draft")
    parser.add_argument("--source")
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    draft = Path(args.draft).read_text(encoding="utf-8")
    findings: list[str] = []
    for name, pattern in RULES.items():
        count = len(pattern.findall(draft))
        if count:
            findings.append(f"{name}: {count}")

    if args.source:
        source = Path(args.source).read_text(encoding="utf-8")
        expected = {token.lower() for token in CITATION.findall(source)}
        actual = {token.lower() for token in CITATION.findall(draft)}
        missing = sorted(expected - actual)
        if missing:
            findings.append(f"missing_citations: {len(missing)}")

    if findings:
        print("review needed")
        for finding in findings:
            print(f"- {finding}")
        return 1 if args.strict else 0

    print("clean: no mechanical tells or citation loss found")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
