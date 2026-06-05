from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCAN_DIRS = ("app",)
SKIP_PARTS = {"vendor", "__pycache__", ".pytest_cache"}
SKIP_SUFFIXES = (".min.js",)

PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("broken closing tag after mojibake/question mark", re.compile(r"[^\s<>]{0,12}\?/(?:span|div|button|label|option|small|strong|h[1-6])\b")),
    ("known corrupted caret glyph", re.compile(r"(?:鈻|閳)\?")),
    ("known corrupted sidebar flow-group label", re.compile(r"(?:流程组|娴佺▼缁)\?/span")),
    ("missing tag bracket before closing text", re.compile(r">[^<]{0,16}\?/span")),
]


def iter_files() -> list[Path]:
    files: list[Path] = []
    for dirname in SCAN_DIRS:
        root = ROOT / dirname
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            if any(part in SKIP_PARTS for part in path.parts):
                continue
            if path.name.endswith(SKIP_SUFFIXES):
                continue
            if path.suffix.lower() not in {".js", ".html", ".css", ".py"}:
                continue
            files.append(path)
    return sorted(files)


def line_col(text: str, offset: int) -> tuple[int, int]:
    line = text.count("\n", 0, offset) + 1
    line_start = text.rfind("\n", 0, offset) + 1
    return line, offset - line_start + 1


def main() -> int:
    findings: list[str] = []
    for path in iter_files():
        try:
            text = path.read_text("utf-8")
        except UnicodeDecodeError:
            continue
        for label, pattern in PATTERNS:
            for match in pattern.finditer(text):
                line, col = line_col(text, match.start())
                rel = path.relative_to(ROOT)
                snippet = match.group(0).replace("\n", "\\n")
                findings.append(f"{rel}:{line}:{col}: {label}: {snippet}")

    if findings:
        print("Frontend fragment check failed:")
        for finding in findings:
            print(f"  {finding}")
        return 1
    print("Frontend fragment check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
