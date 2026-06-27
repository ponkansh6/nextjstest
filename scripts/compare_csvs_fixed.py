#!/usr/bin/env python3
"""
Compare git HEAD CSV vs working tree CSV for each file.
Report row count, column count, and any value differences.
"""

import subprocess, os, csv, tempfile, json
import pandas as pd

FILES = [
    "public/contractual_earnings.csv",
    "public/cpi_data.csv",
    "public/cti_data.csv",
    "public/employment_indices.csv",
    "public/population_statistics.csv",
    "public/scheduled_earnings.csv",
    "public/total_earning.csv",
    "public/total_worked_hours.csv",
]

def get_head_csv(filepath):
    """Get the committed (HEAD) version of a CSV file."""
    result = subprocess.run(
        ["git", "show", f"HEAD:{filepath}"],
        capture_output=True, text=True, cwd=os.getcwd()
    )
    if result.returncode != 0:
        return None
    # Write to temp file
    tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False)
    tmp.write(result.stdout)
    tmp.close()
    return tmp.name

def compare_csv(head_path, work_path, filename):
    """Compare HEAD vs working tree CSV."""
    result = {
        "file": filename,
        "head_rows": 0, "work_rows": 0,
        "head_cols": 0, "work_cols": 0,
        "same_row_count": False,
        "same_columns": False,
        "all_values_match": False,
        "differences": [],
    }
    
    try:
        # Read CSV files with proper handling of multi-line headers
        # First, let's check the structure
        with open(head_path, 'r', encoding='utf-8') as f:
            head_lines = f.readlines()
        
        with open(work_path, 'r', encoding='utf-8') as f:
            work_lines = f.readlines()
        
        # Find the actual data start (skip header lines)
        head_data_start = 0
        for i, line in enumerate(head_lines):
            if line.strip() and not line.startswith(',') and not line.startswith('年') and not line.startswith('Unnamed'):
                head_data_start = i
                break
        
        work_data_start = 0
        for i, line in enumerate(work_lines):
            if line.strip() and not line.startswith(',') and not line.startswith('年') and not line.startswith('Unnamed'):
                work_data_start = i
                break
        
        # Count rows and columns
        head_df = pd.read_csv(head_path, dtype=str)
        work_df = pd.read_csv(work_path, dtype=str)
        
        result["head_rows"] = len(head_df)
        result["work_rows"] = len(work_df)
        result["head_cols"] = len(head_df.columns)
        result["work_cols"] = len(work_df.columns)
        result["same_row_count"] = len(head_df) == len(work_df)
        result["same_columns"] = list(head_df.columns) == list(work_df.columns)
        
        # Compare values
        if list(head_df.columns) == list(work_df.columns) and len(head_df) == len(work_df):
            # Same structure, compare all values
            head_vals = head_df.fillna('').astype(str)
            work_vals = work_df.fillna('').astype(str)
            
            diff_count = 0
            sample_diffs = []
            for col in head_df.columns:
                for i in range(len(head_df)):
                    if head_vals.iloc[i][col] != work_vals.iloc[i][col]:
                        diff_count += 1
                        if len(sample_diffs) < 10:
                            sample_diffs.append({
                                "row": i + 1, "col": col,
                                "head": head_vals.iloc[i][col][:50],
                                "work": work_vals.iloc[i][col][:50],
                            })
            result["all_values_match"] = diff_count == 0
            result["total_differences"] = diff_count
            result["sample_differences"] = sample_diffs
        else:
            result["all_values_match"] = False
            # Different structure, just report structural diff
            
    except Exception as e:
        result["error"] = str(e)
    
    return result

results = []
for f in FILES:
    print(f"\n{'='*60}")
    print(f"Comparing: {f}")
    print(f"{'='*60}")
    
    head_tmp = get_head_csv(f)
    if head_tmp is None:
        print(f"  ❌ Could not get HEAD version of {f}")
        results.append({"file": f, "error": "HEAD not found"})
        continue
    
    work_path = f  # working tree file
    
    if not os.path.exists(work_path):
        print(f"  ❌ Working tree file not found: {work_path}")
        os.unlink(head_tmp)
        results.append({"file": f, "error": "working tree file not found"})
        continue
    
    result = compare_csv(head_tmp, work_path, f)
    results.append(result)
    
    # Print summary
    print(f"  HEAD rows: {result['head_rows']}, cols: {result['head_cols']}")
    print(f"  WORK rows: {result['work_rows']}, cols: {result['work_cols']}")
    print(f"  Same row count: {result.get('same_row_count', 'N/A')}")
    print(f"  Same columns: {result.get('same_columns', 'N/A')}")
    print(f"  All values match: {result.get('all_values_match', 'N/A')}")
    if not result.get('all_values_match', True):
        diff_count = result.get('total_differences', 0)
        print(f"  Total differences: {diff_count}")
        for d in result.get('sample_differences', []):
            print(f"    Row {d['row']}, Col '{d['col']}': HEAD='{d['head']}' vs WORK='{d['work']}'")
    
    os.unlink(head_tmp)

# Save results to file
output_file = "scripts/head_vs_ts_comparison.md"
with open(output_file, 'w', encoding='utf-8') as f:
    f.write("# Git HEAD vs TS Generator CSV Comparison\n\n")
    f.write("## Summary\n\n")
    
    for r in results:
        status = "✅" if r.get('all_values_match', False) else "⚠️"
        diff_info = f"({r.get('total_differences', '?')} diffs)" if not r.get('all_values_match', True) else ""
        f.write(f"- {status} {r['file']}: HEAD={r.get('head_rows','?')}r/{r.get('head_cols','?')}c vs WORK={r.get('work_rows','?')}r/{r.get('work_cols','?')}c {diff_info}\n")
    
    f.write("\n## Detailed Results\n\n")
    
    for r in results:
        f.write(f"### {r['file']}\n\n")
        if 'error' in r:
            f.write(f"Error: {r['error']}\n\n")
            continue
            
        f.write(f"- HEAD rows: {r['head_rows']}, columns: {r['head_cols']}\n")
        f.write(f"- WORK rows: {r['work_rows']}, columns: {r['work_cols']}\n")
        f.write(f"- Same row count: {r.get('same_row_count', 'N/A')}\n")
        f.write(f"- Same columns: {r.get('same_columns', 'N/A')}\n")
        f.write(f"- All values match: {r.get('all_values_match', 'N/A')}\n")
        
        if not r.get('all_values_match', True):
            diff_count = r.get('total_differences', 0)
            f.write(f"- Total differences: {diff_count}\n")
            
            if diff_count > 0:
                f.write("\nSample differences:\n")
                for d in r.get('sample_differences', []):
                    f.write(f"  - Row {d['row']}, Column '{d['col']}': HEAD='{d['head']}' vs WORK='{d['work']}'\n")
        
        f.write("\n")

print(f"\n{'='*60}")
print(f"Results saved to: {output_file}")
print(f"{'='*60}")