#!/usr/bin/env bash
set -euo pipefail

# Build a standalone executable for scripts/convert_cti0111_1.py using PyInstaller
# Usage: ./scripts/build_cti_executable.sh

# Create venv if not exists
if [ ! -d ".venv-convert" ]; then
  python3 -m venv .venv-convert
fi
. .venv-convert/bin/activate

# Install build tools and dependencies
pip install --upgrade pip pyinstaller pandas openpyxl

# Build into scripts/dist
mkdir -p scripts/dist scripts/build
pyinstaller --onefile --name convert_cti0111_1 --distpath scripts/dist --workpath scripts/build --specpath scripts "scripts/convert_cti0111_1.py"

echo "Built executable at scripts/dist/convert_cti0111_1"
