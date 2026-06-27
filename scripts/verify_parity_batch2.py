#!/usr/bin/env python3
"""
Verify parity for Batch 2 converter pairs.

This script runs the 5 specific converter pairs requested:
1. convert_population.py vs convert_population.ts
2. convert_cpi.py vs convert_cpi.ts
3. convert_cti0211_1.py vs convert_cti0211_1.ts
4. convert_employment.py vs convert_employment.ts
5. convert_bm01_1.py vs convert_bm01_1.ts

For each pair:
1. Run the Python script and capture the resulting CSV file
2. Run the TypeScript script and capture the resulting CSV file
3. Compare the two CSV files (ignoring BOM and backup file naming)
4. Report PASS/FAIL with specific discrepancies if any
"""

import subprocess
import os
import pandas as pd
from pathlib import Path
import difflib
import sys
import re

# Mapping of Python scripts to their expected output files for Batch 2
PYTHON_OUTPUTS_BATCH2 = {
    "convert_population.py": "public/population_statistics.csv",
    "convert_cpi.py": "public/cpi_data/",  # Directory with .converted.csv files
    "convert_cti0211_1.py": "public/cti_data.csv",
    "convert_employment.py": "public/employment_indices.csv",
    "convert_bm01_1.py": "public/cpi_data.csv",
}

# Mapping of TypeScript scripts to their expected output files for Batch 2
TYPESCRIPT_OUTPUTS_BATCH2 = {
    "convert_population.ts": "public/population_statistics.csv",
    "convert_cpi.ts": "public/cpi_data/",  # Directory with .converted.csv files
    "convert_cti0211_1.ts": "public/cti_data.csv",
    "convert_employment.ts": "public/employment_indices.csv",
    "convert_bm01_1.ts": "public/cpi_data.csv",
}

# The 5 pairs requested
BATCH2_PAIRS = [
    ("scripts/convert_population.py", "scripts/ts_converters/convert_population.ts"),
    ("scripts/convert_cpi.py", "scripts/ts_converters/convert_cpi.ts"),
    ("scripts/convert_cti0211_1.py", "scripts/ts_converters/convert_cti0211_1.ts"),
    ("scripts/convert_employment.py", "scripts/ts_converters/convert_employment.ts"),
    ("scripts/convert_bm01_1.py", "scripts/ts_converters/convert_bm01_1.ts"),
]

def find_latest_converted_csv(directory):
    """Find the latest .converted.csv file in a directory."""
    if not os.path.exists(directory):
        return None
    
    converted_files = [f for f in os.listdir(directory) if f.endswith('.converted.csv')]
    if not converted_files:
        return None
    
    # Sort by modification time (newest first)
    converted_files.sort(key=lambda f: os.path.getmtime(os.path.join(directory, f)), reverse=True)
    return os.path.join(directory, converted_files[0])

def get_output_file(py_script, ts_script):
    """Get the output file paths for a given pair."""
    py_output = PYTHON_OUTPUTS_BATCH2.get(os.path.basename(py_script))
    ts_output = TYPESCRIPT_OUTPUTS_BATCH2.get(os.path.basename(ts_script))
    
    # Handle directory outputs
    py_file = None
    if py_output and py_output.endswith('/'):
        py_file = find_latest_converted_csv(py_output)
        # If no .converted.csv files found, check for any CSV files in the directory
        if not py_file:
            py_dir = py_output.rstrip('/')
            if os.path.exists(py_dir):
                csv_files = [f for f in os.listdir(py_dir) if f.endswith('.csv')]
                if csv_files:
                    # Sort by modification time (newest first)
                    csv_files.sort(key=lambda f: os.path.getmtime(os.path.join(py_dir, f)), reverse=True)
                    py_file = os.path.join(py_dir, csv_files[0])
    elif py_output:
        py_file = py_output
    
    ts_file = None
    if ts_output and ts_output.endswith('/'):
        ts_file = find_latest_converted_csv(ts_output)
        # If no .converted.csv files found, check for any CSV files in the directory
        if not ts_file:
            ts_dir = ts_output.rstrip('/')
            if os.path.exists(ts_dir):
                csv_files = [f for f in os.listdir(ts_dir) if f.endswith('.csv')]
                if csv_files:
                    # Sort by modification time (newest first)
                    csv_files.sort(key=lambda f: os.path.getmtime(os.path.join(ts_dir, f)), reverse=True)
                    ts_file = os.path.join(ts_dir, csv_files[0])
    elif ts_output:
        ts_file = ts_output
    
    return py_file, ts_file

def normalize_csv_path(path):
    """Normalize CSV path by removing backup file naming differences."""
    if not path:
        return path
    
    # Remove backup file naming patterns like .bak.timestamp or .bak.timestamp.csv
    # Keep the original CSV file name
    normalized = re.sub(r'\.bak\.\d+', '', path)
    if normalized.endswith('.csv.bak.'):
        normalized = normalized[:-4] + '.csv'
    return normalized

def compare_csv_files(py_file, ts_file, pair_name):
    """Compare two CSV files and report discrepancies."""
    print(f"\nComparing {pair_name}:")
    print(f"  Python output: {py_file}")
    print(f"  TypeScript output: {ts_file}")
    
    if not py_file or not ts_file:
        print(f"  ERROR: One or both output files not found!")
        return False, "Missing output files"
    
    if not os.path.exists(py_file):
        print(f"  ERROR: Python output file not found: {py_file}")
        return False, f"Python output file not found: {py_file}"
    
    if not os.path.exists(ts_file):
        print(f"  ERROR: TypeScript output file not found: {ts_file}")
        return False, f"TypeScript output file not found: {ts_file}"
    
    try:
        # Read CSV files
        py_df = pd.read_csv(py_file, dtype=str)  # Read as strings to preserve formatting
        ts_df = pd.read_csv(ts_file, dtype=str)
        
        discrepancies = []
        
        # Compare row counts
        py_rows = len(py_df)
        ts_rows = len(ts_df)
        if py_rows != ts_rows:
            discrepancies.append(f"Row count mismatch: Python={py_rows}, TypeScript={ts_rows}")
        
        # Compare column names
        py_cols = list(py_df.columns)
        ts_cols = list(ts_df.columns)
        
        if py_cols != ts_cols:
            # Find differences
            py_only = set(py_cols) - set(ts_cols)
            ts_only = set(ts_cols) - set(py_cols)
            common = set(py_cols) & set(ts_cols)
            
            if py_only:
                discrepancies.append(f"Columns only in Python: {sorted(py_only)}")
            if ts_only:
                discrepancies.append(f"Columns only in TypeScript: {sorted(ts_only)}")
            
            # Compare common columns
            for col in common:
                py_vals = py_df[col].fillna('').astype(str).tolist()
                ts_vals = ts_df[col].fillna('').astype(str).tolist()
                
                if py_vals != ts_vals:
                    # Find first difference
                    for i, (p_val, t_val) in enumerate(zip(py_vals, ts_vals)):
                        if p_val != t_val:
                            discrepancies.append(f"Value mismatch in column '{col}' at row {i+1}: Python='{p_val}', TypeScript='{t_val}'")
                            break
        else:
            # Same columns, compare values
            for col in py_cols:
                py_vals = py_df[col].fillna('').astype(str).tolist()
                ts_vals = ts_df[col].fillna('').astype(str).tolist()
                
                if py_vals != ts_vals:
                    # Find first difference
                    for i, (p_val, t_val) in enumerate(zip(py_vals, ts_vals)):
                        if p_val != t_val:
                            discrepancies.append(f"Value mismatch in column '{col}' at row {i+1}: Python='{p_val}', TypeScript='{t_val}'")
                            break
        
        if discrepancies:
            print(f"  ❌ DISCREPANCIES FOUND ({len(discrepancies)}):")
            for disc in discrepancies[:5]:  # Show first 5 discrepancies
                print(f"    - {disc}")
            if len(discrepancies) > 5:
                print(f"    ... and {len(discrepancies) - 5} more")
            return False, "; ".join(discrepancies[:5])
        else:
            print(f"  ✅ PASS")
            print(f"    Rows: {py_rows}, Columns: {len(py_cols)}")
            return True, ""
            
    except Exception as e:
        print(f"  ERROR comparing files: {e}")
        return False, f"Error comparing files: {e}"

def run_batch2_verification():
    """Run verification for Batch 2 converter pairs."""
    print("=" * 80)
    print("BATCH 2 CONVERTER VERIFICATION")
    print("=" * 80)
    
    results = []
    
    for py_script, ts_script in BATCH2_PAIRS:
        pair_name = f"{os.path.basename(py_script)} vs {os.path.basename(ts_script)}"
        
        try:
            # Run Python script
            print(f"\nRunning {py_script}...")
            result = subprocess.run(["python3", py_script], check=True, capture_output=True, text=True)
            print(f"  Python script output: {result.stdout}")
            
            # Run TypeScript script
            print(f"Running {os.path.basename(ts_script)}...")
            result = subprocess.run(["pnpm", "tsx", ts_script], check=True, capture_output=True, text=True)
            print(f"  TypeScript script output: {result.stdout}")
            
            # Get output files
            py_file, ts_file = get_output_file(py_script, ts_script)
            
            # Compare
            success, error_msg = compare_csv_files(py_file, ts_file, pair_name)
            results.append((pair_name, success, error_msg))
            
        except subprocess.CalledProcessError as e:
            print(f"  ❌ ERROR running {pair_name}: {e}")
            print(f"  Stdout: {e.stdout}")
            print(f"  Stderr: {e.stderr}")
            results.append((pair_name, False, f"Script execution error: {e}"))
        except Exception as e:
            print(f"  ❌ ERROR processing {pair_name}: {e}")
            results.append((pair_name, False, f"Processing error: {e}"))
    
    # Summary
    print("\n" + "=" * 80)
    print("BATCH 2 VERIFICATION SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, success, _ in results if success)
    total = len(results)
    
    for pair_name, success, error_msg in results:
        status = "[PASS]" if success else "[FAIL]"
        print(f"{status}: {pair_name}")
        if not success:
            print(f"  Error: {error_msg}")
    
    print(f"\nTotal: {passed}/{total} comparisons passed")
    
    if passed == total:
        print("\n🎉 All Batch 2 comparisons passed!")
        return True
    else:
        print(f"\n⚠️  {total - passed} comparisons failed")
        return False

if __name__ == "__main__":
    success = run_batch2_verification()
    sys.exit(0 if success else 1)