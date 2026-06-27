#!/usr/bin/env python3
"""
Compare Python and TypeScript converter outputs.

This script runs each converter pair, then compares the resulting CSV files
to identify any discrepancies in row count, column structure, or values.
"""

import subprocess
import os
import pandas as pd
from pathlib import Path
import difflib
import sys

# Mapping of Python scripts to their expected output files
PYTHON_OUTPUTS = {
    "convert_bm01_1.py": "public/cpi_data.csv",
    "convert_contractual.py": "public/contractual_earnings.csv",
    "convert_cpi.py": "data/converted_cpi/",  # Directory with .converted.csv files (Python writes to data/converted_cpi/)
    "convert_cti0111_1.py": "public/cti_data.csv",
    "convert_cti0211_1.py": "public/cti_data.csv",
    "convert_employment.py": "public/employment_indices.csv",
    "convert_population.py": "public/population_statistics.csv",
    "convert_scheduled.py": "public/scheduled_earnings.csv",
    "convert_total.py": "public/total_earning.csv",
    "convert_worked.py": "public/total_worked_hours.csv",
}

# Mapping of TypeScript scripts to their expected output files
TYPESCRIPT_OUTPUTS = {
    "convert_bm01_1.ts": "public/cpi_data.csv",
    "convert_contractual.ts": "public/contractual_earnings.csv",
    "convert_cpi.ts": "public/cpi_data/",  # Directory with .converted.csv files
    "convert_cti0111_1.ts": "public/cti_data.csv",
    "convert_cti0211_1.ts": "public/cti_data.csv",  # Fixed to match Python output
    "convert_employment.ts": "public/employment_indices.csv",
    "convert_population.ts": "public/population_statistics.csv",
    "convert_scheduled.ts": "public/scheduled_earnings.csv",
    "convert_total.ts": "public/total_earning.csv",
    "convert_worked.ts": "public/total_worked_hours.csv",
}

PAIRS = [
    ("convert_bm01_1.py", "scripts/ts_converters/convert_bm01_1.ts"),
    ("convert_contractual.py", "scripts/ts_converters/convert_contractual.ts"),
    ("convert_cpi.py", "scripts/ts_converters/convert_cpi.ts"),
    ("convert_cti0111_1.py", "scripts/ts_converters/convert_cti0111_1.ts"),
    ("convert_cti0211_1.py", "scripts/ts_converters/convert_cti0211_1.ts"),
    ("convert_employment.py", "scripts/ts_converters/convert_employment.ts"),
    ("convert_population.py", "scripts/ts_converters/convert_population.ts"),
    ("convert_scheduled.py", "scripts/ts_converters/convert_scheduled.ts"),
    ("convert_total.py", "scripts/ts_converters/convert_total.ts"),
    ("convert_worked.py", "scripts/ts_converters/convert_worked.ts"),
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
    py_output = PYTHON_OUTPUTS.get(py_script)
    ts_output = TYPESCRIPT_OUTPUTS.get(os.path.basename(ts_script))
    
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

def compare_csv_files(py_file, ts_file, pair_name):
    """Compare two CSV files and report discrepancies."""
    print(f"\nComparing {pair_name}:")
    print(f"  Python output: {py_file}")
    print(f"  TypeScript output: {ts_file}")
    
    if not py_file or not ts_file:
        print(f"  ERROR: One or both output files not found!")
        return False
    
    if not os.path.exists(py_file):
        print(f"  ERROR: Python output file not found: {py_file}")
        return False
    
    if not os.path.exists(ts_file):
        print(f"  ERROR: TypeScript output file not found: {ts_file}")
        return False
    
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
            for disc in discrepancies[:10]:  # Show first 10 discrepancies
                print(f"    - {disc}")
            if len(discrepancies) > 10:
                print(f"    ... and {len(discrepancies) - 10} more")
            return False
        else:
            print(f"  ✅ No discrepancies found")
            print(f"    Rows: {py_rows}, Columns: {len(py_cols)}")
            return True
            
    except Exception as e:
        print(f"  ERROR comparing files: {e}")
        return False

def run_comparison():
    """Run all converter pairs and compare outputs."""
    print("=" * 60)
    print("Starting converter comparison")
    print("=" * 60)
    
    results = []
    
    for py_script, ts_script in PAIRS:
        pair_name = f"{py_script} vs {os.path.basename(ts_script)}"
        
        try:
            # Run Python script
            print(f"\nRunning {py_script}...")
            subprocess.run(["python3", f"scripts/{py_script}"], check=True, capture_output=True, text=True)
            
            # Run TypeScript script
            print(f"Running {os.path.basename(ts_script)}...")
            subprocess.run(["pnpm", "tsx", ts_script], check=True, capture_output=True, text=True)
            
            # Get output files
            py_file, ts_file = get_output_file(py_script, ts_script)
            
            # Compare
            success = compare_csv_files(py_file, ts_file, pair_name)
            results.append((pair_name, success))
            
        except subprocess.CalledProcessError as e:
            print(f"  ❌ ERROR running {pair_name}: {e}")
            print(f"  Stdout: {e.stdout}")
            print(f"  Stderr: {e.stderr}")
            results.append((pair_name, False))
        except Exception as e:
            print(f"  ❌ ERROR processing {pair_name}: {e}")
            results.append((pair_name, False))
    
    # Summary
    print("\n" + "=" * 60)
    print("COMPARISON SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for pair_name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {pair_name}")
    
    print(f"\nTotal: {passed}/{total} comparisons passed")
    
    if passed == total:
        print("\n🎉 All comparisons passed!")
        return True
    else:
        print(f"\n⚠️  {total - passed} comparisons failed")
        return False

if __name__ == "__main__":
    success = run_comparison()
    sys.exit(0 if success else 1)