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
    if [ -f "$path" ]; then
        echo "Running $tool..."
        "$path"
    else
        echo "Error: $tool not found in $DIST_DIR"
    fi
done

echo "All conversions completed."
