#!/usr/bin/env bash
set -euo pipefail

# Build a standalone executable for scripts/convert using PyInstaller
# Usage: ./scripts/build_convert_executable.sh

# Create venv
if [ ! -d ".venv-convert" ]; then
  python3 -m venv .venv-convert
fi
. .venv-convert/bin/activate

# Install build tools
pip install --upgrade pip pyinstaller

# Find entrypoint
if [ -f "scripts/convert.py" ]; then
  ENTRY="scripts/convert.py"
elif [ -f "scripts/convert_bm01_1.py" ]; then
  ENTRY="scripts/convert_bm01_1.py"
elif [ -f "scripts/convert" ]; then
  ENTRY="scripts/convert"
else
  echo "ERROR: No entrypoint found at scripts/convert.py, scripts/convert_bm01_1.py, or scripts/convert"
  exit 1
fi

# Build into scripts/dist
mkdir -p scripts/dist scripts/build
pyinstaller --onefile --name convert --distpath scripts/dist --workpath scripts/build --specpath scripts "$ENTRY"

echo "Built executable at scripts/dist/convert"
