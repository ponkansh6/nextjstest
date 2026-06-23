#!/usr/bin/env python3
"""
Convert public/cpi_source/cti0211_1.xlsx into the same format as public/cti_data.csv
- Overwrites original cti_data.csv by default
- Creates a timestamped backup of the original cti_data.csv before overwriting
- Use --trial to write a trial output instead of overwriting
- Prints summary of matches and a small preview comparison

Usage:
  python3 scripts/convert_cti0211_1.py       # overwrite cti_data.csv (default)
  python3 scripts/convert_cti0211_1.py --trial  # write trial CSV and do not touch original
"""

import argparse
import sys
from pathlib import Path
import datetime
import pandas as pd

def get_root():
    return Path('.').resolve()
            
    # Fallback if not found
    if getattr(sys, 'frozen', False):
        return start_dir.parents[1] # Assumes executable is in scripts/dist/
    return start_dir.parent

ROOT = get_root()

SRC_XLSX = ROOT / "public" / "cpi_source" / "cti0211_1.xlsx"
TARGET_CSV = ROOT / "public" / "cti_data.csv"
TRIAL_CSV = ROOT / "public" / "cti_data_converted_trial.csv"

def find_header_row(raw_df):
    for i in range(min(20, len(raw_df))):
        row = raw_df.iloc[i].astype(str).fillna("")
        if any(cell.strip() == '年月' or '年月' in cell for cell in row.values):
            return i
    return None

def normalize_colname(s):
    if pd.isna(s):
        return ""
    return str(s).strip()

def synthesize_nendo_month(df):
    if '年月' in df.columns:
        return df
    # try common variants
    possible = [c for c in df.columns if '年' in str(c) or '月' in str(c) or '年月' in str(c)]
    if possible: return df
    # try columns that look like YYYYMM
    for c in df.columns:
        try:
            sample = df[c].dropna().iloc[0]
            s = str(sample)
            if len(s) >= 6 and s[:4].isdigit() and s[4:6].isdigit():
                def fm(x):
                    xs = str(int(x)) if pd.notna(x) else ''
                    y, m = xs[:4], xs[4:6]
                    return f"{y}年{int(m)}月"
                df.insert(0, '年月', df[c].map(fm))
                return df
        except: continue
    return df

def load_xlsx_try(xlsx_path: Path):
    # The source file cti0211_1.xlsx has header at row 8 (0-indexed)
    df = pd.read_excel(xlsx_path, header=8, engine='openpyxl')
    
    # Filter out footer notes (rows where '月' is NaN or doesn't look like YYYY年M月)
    df = df[df['月'].astype(str).str.contains(r'\d+年\d+月', na=False)].copy()
    
    # Drop Unnamed columns from source
    df = df.loc[:, ~df.columns.str.contains('^Unnamed')]
    
    # Rename '月' to '年月' for internal logic
    df = df.rename(columns={'月': '年月'})
    
    # Clean column names
    df.columns = [str(c).strip() for c in df.columns]
    
    return df

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--trial', action='store_true')
    args = p.parse_args()

    if not SRC_XLSX.exists():
        print(f"Source xlsx not found: {SRC_XLSX}")
        sys.exit(1)
        
    src = load_xlsx_try(SRC_XLSX)
    
    if not TARGET_CSV.exists():
        print(f"Target {TARGET_CSV} not found.")
        sys.exit(1)

    # Read target CSV to get structure and existing metadata
    # Keep first 3 lines for output
    with open(TARGET_CSV, 'r', encoding='utf-8', newline='') as f:
        header_lines = [f.readline() for _ in range(3)]
    
    target_df = pd.read_csv(TARGET_CSV, header=2, dtype=str)
    # The '月' column is our key - check if it exists
    if '月' in target_df.columns:
        target_df['月'] = target_df['月'].fillna('').str.strip()
    else:
        # If '月' column doesn't exist, create it from the source data
        print(f"Warning: '月' column not found in target CSV. Creating from source data.")
        target_df['月'] = src['年月'].fillna('').str.strip()
    
    src['年月'] = src['年月'].fillna('').str.strip()
    
    # Identify data columns (those present in both)
    target_cols = target_df.columns.tolist()
    mapping = {}
    src_cols = src.columns.tolist()
    
    for tc in target_cols:
        if tc in src_cols:
            mapping[tc] = tc
        else:
            # Try removing spaces
            tc_clean = tc.replace(' ', '').replace('　', '')
            found = next((sc for sc in src_cols if sc.replace(' ', '').replace('　', '') == tc_clean), None)
            if found:
                mapping[tc] = found

    # Update existing rows
    out = target_df.copy()
    src_indexed = src.set_index('年月')
    
    for i, row in out.iterrows():
        ym = row['月']
        if ym in src_indexed.index:
            src_row = src_indexed.loc[ym]
            for tc, sc in mapping.items():
                if tc == '月': continue
                val = src_row[sc]
                if pd.notna(val):
                    # Round numeric values to 1 decimal place
                    try:
                        f_val = float(val)
                        if f_val == int(f_val):
                            out.at[i, tc] = f"{int(f_val)}" # Match "-" if it's 0? No, let's keep it 1 decimal if possible
                        out.at[i, tc] = f"{f_val:.1f}"
                    except:
                        out.at[i, tc] = str(val)

    # Append new rows if any
    existing_yms = set(target_df['月'])
    new_yms = [ym for ym in src['年月'] if ym not in existing_yms and ym != '']
    
    if new_yms:
        new_rows = []
        for ym in new_yms:
            # Use columns 0-6 from the last row as template
            last_row_template = target_df.iloc[-1].copy()
            # Clear data columns
            for col in target_cols[7:]:
                last_row_template[col] = ''
            
            last_row_template['月'] = ym
            src_row = src_indexed.loc[ym]
            for tc, sc in mapping.items():
                if tc == '月': continue
                val = src_row[sc]
                if pd.notna(val):
                    try:
                        f_val = float(val)
                        last_row_template[tc] = f"{f_val:.1f}"
                    except:
                        last_row_template[tc] = str(val)
            new_rows.append(last_row_template)
        
        if new_rows:
            out = pd.concat([out, pd.DataFrame(new_rows)], ignore_index=True)

    # Output path
    out_path = TRIAL_CSV if args.trial else TARGET_CSV
    
    if not args.trial and TARGET_CSV.exists():
        ts = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        backup = TARGET_CSV.with_name(f"{TARGET_CSV.name}.bak.{ts}")
        TARGET_CSV.rename(backup)
        print(f"Backup created: {backup}")

    # Write output
    with open(out_path, 'w', encoding='utf-8', newline='') as f:
        # Write the first 3 lines exactly as they were
        for line in header_lines:
            f.write(line)
        # Write the data part (excluding header)
        out.to_csv(f, index=False, header=False, lineterminator='\r\n')

    
    print(f"Written to {out_path}")
    print(f"Rows: {len(out)}")



if __name__ == '__main__':
    main()
