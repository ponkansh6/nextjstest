#!/bin/bash
# Master script to run all data conversion tools

DIST_DIR="./scripts/dist"

echo "Starting all data conversions..."

# List of executables
TOOLS=(
    "convert_employment"
    "convert_contractual"
    "convert_scheduled"
    "convert_total"
    "convert_worked"
    "convert_population"
)

for tool in "${TOOLS[@]}"; do
    path="$DIST_DIR/$tool"
    if [ ! -f "$path" ] || [ ! -x "$path" ]; then
        echo "Error: required converter is missing or not executable: $path" >&2
        exit 1
    fi
done

for tool in "${TOOLS[@]}"; do
    path="$DIST_DIR/$tool"
    echo "Running $tool..."
    if "$path"; then
        :
    else
        status=$?
        echo "Error: $tool failed with exit status $status" >&2
        exit "$status"
    fi
done

echo "All conversions completed."
