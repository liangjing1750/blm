#!/usr/bin/env bash
set -euo pipefail

VENDOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
PYTHON_VERSION="${PYTHON_VERSION:-py312}"
WHEEL_DIR="${WHEEL_DIR:-$VENDOR_DIR/linux-$PYTHON_VERSION}"

cd "$VENDOR_DIR"

echo "== BLM offline dependency install =="
"$PYTHON_BIN" --version

echo
echo "[1/2] Installing runtime wheels from $WHEEL_DIR"
"$PYTHON_BIN" -m pip install --no-index --find-links "$WHEEL_DIR" -r "$VENDOR_DIR/requirements-runtime.txt"

echo
echo "[2/2] Verifying imports"
"$PYTHON_BIN" - <<'PY'
import dotenv
import openai
import yaml

print("python-dotenv:", getattr(dotenv, "__version__", "installed"))
print("openai:", getattr(openai, "__version__", "installed"))
print("PyYAML:", getattr(yaml, "__version__", "installed"))
PY

echo
echo "Done. Start with: python3 blm.py serve"
