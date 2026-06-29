#!/usr/bin/env python3
import subprocess, os, tempfile, json
import pandas as pd

FILES = [
    "../public/contractual_earnings.csv",
    "../public/cpi_data.csv",
    "../public/cti_data.csv",
    "../public/employment_indices.csv",
    "../public/population_statistics.csv",
    "../public/scheduled_earnings.csv",
    "../public/total_earning.csv",
    "../public/total_worked_hours.csv",
]

def get_head_csv(filepath):
    result = subprocess.run(
        ["git", "show", f"HEAD:{filepath}"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        return None
    tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False)
    tmp.write(result.stdout)
    tmp.close()
    return tmp.name

def analyze_differences(head_path, work_path, filename):
    result = {
        "file": filename,
        "head_rows": 0, "work_rows": 0,
        "head_cols": 0, "work_cols": 0,
        "head_columns": [],
        "work_columns": [],
        "added_columns": [],
        "removed_columns": [],
        "common_columns": [],
        "head_file_size": 0,
        "work_file_size": 0,
        "row_diff": 0,
        "rows_only_in_head": 0,
        "rows_only_in_work": 0,
        "changed_rows": 0,
        "sample_changes": [],
        "head_last_date": None,
        "work_last_date": None,
    }
    
    head_df = pd.read_csv(head_path, dtype=str)
    work_df = pd.read_csv(work_path, dtype=str)
    
    result["head_rows"] = len(head_df)
    result["work_rows"] = len(work_df)
    result["head_cols"] = len(head_df.columns)
    result["work_cols"] = len(work_df.columns)
    result["head_columns"] = list(head_df.columns)
    result["work_columns"] = list(work_df.columns)
    result["head_file_size"] = os.path.getsize(head_path)
    result["work_file_size"] = os.path.getsize(work_path)
    result["row_diff"] = len(work_df) - len(head_df)
    
    # Column analysis
    head_cols_set = set(head_df.columns)
    work_cols_set = set(work_df.columns)
    result["added_columns"] = sorted(work_cols_set - head_cols_set)
    result["removed_columns"] = sorted(head_cols_set - work_cols_set)
    result["common_columns"] = sorted(head_cols_set & work_cols_set)
    
    # If same structure, compare common rows
    common_cols = result["common_columns"]
    date_col = None
    if common_cols:
        # Try to find a date/time column for context
        for cn in ['年月', 'date', 'year_month', 'period', 'year']:
            if cn in head_df.columns:
                date_col = cn
                break
        
        # Check last dates
        if date_col:
            try:
                result["head_last_date"] = head_df[date_col].iloc[-1]
                result["work_last_date"] = work_df[date_col].iloc[-1]
            except:
                pass
        
        # For common columns and common row range, compare values
        min_rows = min(len(head_df), len(work_df))
        if min_rows > 0 and common_cols:
            head_common = head_df[common_cols].head(min_rows).fillna('').astype(str)
            work_common = work_df[common_cols].head(min_rows).fillna('').astype(str)
            
            # Count differences per row
            changed_rows_idx = []
            for i in range(min_rows):
                row_diff = False
                for col in common_cols:
                    if head_common.iloc[i][col] != work_common.iloc[i][col]:
                        row_diff = True
                        break
                if row_diff:
                    changed_rows_idx.append(i)
            
            result["changed_rows"] = len(changed_rows_idx)
            
            # Sample changes
            for i in changed_rows_idx[:10]:
                row_changes = []
                for col in common_cols:
                    hv = head_common.iloc[i][col]
                    wv = work_common.iloc[i][col]
                    if hv != wv:
                        row_changes.append({"col": col, "head": hv[:60], "work": wv[:60]})
                result["sample_changes"].append({
                    "row_index": i + 1,
                    "date": head_df[date_col].iloc[i] if date_col else None,
                    "changes": row_changes
                })
    
    # Rows only in HEAD (tail rows that don't exist in WORK)
    if len(head_df) > len(work_df) and date_col:
        extra = head_df.tail(len(head_df) - len(work_df))
        result["rows_only_in_head"] = len(extra)
        result["extra_head_dates"] = extra[date_col].tolist()[:5]
    elif len(work_df) > len(head_df) and date_col:
        extra = work_df.tail(len(work_df) - len(head_df))
        result["rows_only_in_work"] = len(extra)
        result["extra_work_dates"] = extra[date_col].tolist()[:5]
    
    return result

print("# Git HEAD vs TS Converter CSV Comparison\n")

overall = []
for f in FILES:
    print(f"## {f}\n")
    head_tmp = get_head_csv(f)
    if not head_tmp:
        print(f"❌ Could not get HEAD version\n")
        continue
    
    if not os.path.exists(f):
        print(f"❌ Working tree file not found\n")
        os.unlink(head_tmp)
        continue
    
    r = analyze_differences(head_tmp, work_path=f, filename=f)
    overall.append(r)
    os.unlink(head_tmp)
    
    # Print report
    HEAD_SIZE = r['head_file_size']
    WORK_SIZE = r['work_file_size']
    SIZE_DIFF = WORK_SIZE - HEAD_SIZE
    SIZE_SIGN = "+" if SIZE_DIFF >= 0 else ""
    
    print(f"| 項目 | HEAD (git) | WORK (TS生成) | 差分 |")
    print(f"|------|-----------|--------------|------|")
    print(f"| ファイルサイズ | {HEAD_SIZE:,} bytes | {WORK_SIZE:,} bytes | {SIZE_SIGN}{SIZE_DIFF:,} bytes |")
    print(f"| 行数 | {r['head_rows']} | {r['work_rows']} | {SIZE_SIGN}{r['row_diff']} |")
    print(f"| 列数 | {r['head_cols']} | {r['work_cols']} | {r['work_cols'] - r['head_cols']:+d} |")
    if r.get('head_last_date'):
        print(f"| 最終日付 | {r['head_last_date']} | {r['work_last_date']} | - |")
    print(f"| 値の異なる行 (共通範囲) | - | - | {r['changed_rows']} rows |")
    
    if r['added_columns']:
        print(f"\n**追加された列:** {', '.join(r['added_columns'])}")
    if r['removed_columns']:
        print(f"\n**削除された列:** {', '.join(r['removed_columns'])}")
    if r['rows_only_in_head'] > 0:
        print(f"\n**HEADのみの行 (末尾):** {r['rows_only_in_head']}行")
        print(f"  例: {r.get('extra_head_dates', [])}")
    if r['rows_only_in_work'] > 0:
        print(f"\n**WORKのみの行 (末尾):** {r['rows_only_in_work']}行")
        print(f"  例: {r.get('extra_work_dates', [])}")
    if r['sample_changes']:
        print(f"\n**値の変更サンプル (最大10行):**")
        for s in r['sample_changes'][:5]:
            print(f"  - Row {s['row_index']} (date: {s['date']}):")
            for c in s['changes'][:8]:
                print(f"    - Col '{c['col']}': HEAD='{c['head']}' → WORK='{c['work']}'")

# Summary table
print("\n## サマリー\n")
print("| ファイル | HEAD行/列 | WORK行/列 | 行差分 | 列差分 | 値変更行数 | HEAD最終日 | WORK最終日 |")
print("|---------|-----------|----------|-------|-------|-----------|-----------|-----------|")
for r in overall:
    date_info = f"{r.get('head_last_date','?')} → {r.get('work_last_date','?')}" if r.get('head_last_date') else "-"
    print(f"| {os.path.basename(r['file'])} | {r['head_rows']}r/{r['head_cols']}c | {r['work_rows']}r/{r['work_cols']}c | {r['row_diff']:+d} | {r['work_cols']-r['head_cols']:+d} | {r['changed_rows']} | {r.get('head_last_date','-')} | {r.get('work_last_date','-')} |")