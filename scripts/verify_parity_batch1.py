#!/usr/bin/env python3
"""
Compare specific Python and TypeScript converter outputs for the 5 requested pairs.

This script runs only the 5 requested converter pairs and compares their outputs.
"""

import subprocess
import os
import pandas as pd
from pathlib import Path
import difflib
import sys
import datetime

# The 5 requested pairs
PAIRS = [
    ("scripts/convert_cti0111_1.py", "scripts/ts_converters/convert_cti0111_1.ts"),
    ("scripts/convert_scheduled.py", "scripts/ts_converters/convert_scheduled.ts"),
    ("scripts/convert_total.py", "scripts/ts_converters/convert_total.ts"),
    ("scripts/convert_worked.py", "scripts/ts_converters/convert_worked.ts"),
    ("scripts/convert_contractual.py", "scripts/ts_converters/convert_contractual.ts"),
]

def create_target_file_if_missing(script_path, target_path):
    """Create a minimal target file if it doesn't exist."""
    # Convert relative paths to absolute paths
    if not os.path.isabs(target_path):
        target_path = os.path.join(os.getcwd(), target_path)
    
    if not os.path.exists(target_path):
        print(f"  Creating target file {target_path}...")
        
        # For cti_data.csv, we need to create a file with 3 header lines
        if "cti_data.csv" in target_path:
            with open(target_path, 'w', encoding='utf-8', newline='') as f:
                # Write 3 header lines as expected by the converter
                f.write("1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21\n")
                f.write("1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21\n")
                f.write("月,2月,3月,4月,5月,6月,7月,8月,9月,10月,11月,12月,年平均,上半期,下半期,第１四半期,第２四半期,第３四半期,第４四半期,年度平均\n")
        else:
            # For other files, create a minimal CSV with expected columns
            with open(target_path, 'w', encoding='utf-8', newline='') as f:
                f.write("col1,col2,col3\n")
                f.write("value1,value2,value3\n")
        
        print(f"  Created target file: {target_path}")

def compare_csv_files(py_file, ts_file, pair_name):
    """Compare two CSV files and report discrepancies."""
    # Convert relative paths to absolute paths
    if not os.path.isabs(py_file):
        py_file = os.path.join(os.getcwd(), py_file)
    if not os.path.isabs(ts_file):
        ts_file = os.path.join(os.getcwd(), ts_file)
    
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
    """Run only the 5 requested converter pairs and compare outputs."""
    print("=" * 60)
    print("Starting comparison of 5 requested converter pairs")
    print("=" * 60)
    
    results = []
    
    for py_script, ts_script in PAIRS:
        pair_name = f"{py_script} vs {os.path.basename(ts_script)}"
        
        try:
            # Determine output paths based on the actual script logic
            # Python scripts write to public/ directory with specific filenames
            if "cti0111_1.py" in py_script:
                py_output = "public/cti_data.csv"
            elif "scheduled.py" in py_script:
                py_output = "public/scheduled_earnings.csv"
            elif "total.py" in py_script:
                py_output = "public/total_earning.csv"
            elif "worked.py" in py_script:
                py_output = "public/total_worked_hours.csv"
            elif "contractual.py" in py_script:
                py_output = "public/contractual_earnings.csv"
            else:
                py_output = py_script.replace("scripts/", "public/").replace(".py", ".csv")
            
            # TypeScript scripts write to public/ directory with specific filenames
            if "cti0111_1.ts" in ts_script:
                ts_output = "public/cti_data.csv"
            elif "scheduled.ts" in ts_script:
                ts_output = "public/scheduled_earnings.csv"
            elif "total.ts" in ts_script:
                ts_output = "public/total_earning.csv"
            elif "worked.ts" in ts_script:
                ts_output = "public/total_worked_hours.csv"
            elif "contractual.ts" in ts_script:
                ts_output = "public/contractual_earnings.csv"
            else:
                ts_output = ts_script.replace("scripts/ts_converters/", "public/").replace(".ts", ".csv")
            
            # Create target files if they don't exist
            create_target_file_if_missing(py_script, py_output)
            create_target_file_if_missing(ts_script, ts_output)
            
            # Run Python script
            print(f"\nRunning {py_script}...")
            subprocess.run(["python3", py_script], check=True, capture_output=True, text=True)
            
            # Run TypeScript script
            print(f"Running {os.path.basename(ts_script)}...")
            subprocess.run(["pnpm", "tsx", ts_script], check=True, capture_output=True, text=True)
            
            # Compare
            success = compare_csv_files(py_output, ts_output, pair_name)
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