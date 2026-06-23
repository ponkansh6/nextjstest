#!/usr/bin/env python3
"""
Convert CPI source files (latest N files in public/cpi_source) to normalized CSVs suitable for wage graphs.
Outputs per-file CSVs to data/converted_cpi/ by default.

Usage:
  python scripts/convert_cpi.py --source-dir public/cpi_source --n 5 --out-dir data/converted_cpi

Produces CSVs with columns: 年月 (YYYY年MM月), <numeric columns...>
"""

import argparse
import os
import re
from datetime import datetime
from pathlib import Path
import copy

import pandas as pd


DATE_PATTERNS = [
    re.compile(r"^(\d{4})[/-]?(\d{1,2})$"),
    re.compile(r"^(\d{4})年\s*0?(\d{1,2})月$"),
    re.compile(r"^(\d{4})\.\s*0?(\d{1,2})$"),
]

YEAR_PATTERN = re.compile(r"^\d{4}$")


def detect_date_in_series(values):
    """Try to find a parseable date-like value in a list/Series."""
    for v in values:
        if pd.isna(v):
            continue
        v = str(v).strip()
        # direct YYYY年MM月
        m = re.search(r"(\d{4})年\s*0?(\d{1,2})月", v)
        if m:
            return int(m.group(1)), int(m.group(2))
        # YYYY/MM or YYYY-MM
        m = re.search(r"(\d{4})[/-](0?\d{1,2})", v)
        if m:
            return int(m.group(1)), int(m.group(2))
        # YYYYMM like 197005
        m = re.search(r"^(\d{4})(0[1-9]|1[0-2])$", v)
        if m:
            return int(m.group(1)), int(m.group(2))
        # fallback: YYYY followed by MM with non-digit separator
        m = re.search(r"(\d{4}).*?(\d{1,2})", v)
        if m:
            return int(m.group(1)), int(m.group(2))
    return None


def normalize_year_month(year: int, month: int) -> str:
    return f"{year}年{str(month).zfill(2)}月"


def read_file_as_arrays(path: Path) -> dict:
    """Read a file and return a dict of sheet_name->list_of_lists (raw 2D arrays).
    
    This mirrors the TS readWorkbook approach: reads rows as raw arrays
    without interpreting headers, so column detection is consistent.
    """
    suffix = path.suffix.lower()
    sheets = {}

    if suffix in (".xls", ".xlsx", ".xlsb"):
        try:
            xls = pd.ExcelFile(path, engine="openpyxl")
        except Exception:
            try:
                xls = pd.ExcelFile(path)
            except Exception:
                return sheets
        for name in xls.sheet_names:
            df = pd.read_excel(xls, sheet_name=name, header=None)
            # Convert to list of lists, preserving types (raw: True equivalent)
            rows = []
            for _, row in df.iterrows():
                rows.append([v if pd.notna(v) else "" for v in row.tolist()])
            sheets[name] = rows
    elif suffix == ".csv":
        for enc in ("utf-8", "cp932"):
            try:
                df = pd.read_csv(path, encoding=enc, header=None)
                rows = [[v if pd.notna(v) else "" for v in row.tolist()] for _, row in df.iterrows()]
                sheets["_csv"] = rows
                break
            except Exception:
                continue
    else:
        try:
            df = pd.read_excel(path, header=None)
            rows = [[v if pd.notna(v) else "" for v in row.tolist()] for _, row in df.iterrows()]
            sheets["_sheet"] = rows
        except Exception:
            pass
    return sheets


def pick_best_sheet(sheets: dict):
    """Pick the sheet with the most numeric cells (matches TS pickBestSheet)."""
    best_name = None
    best_data = None
    max_numeric = -1
    for name, data in sheets.items():
        numeric_count = sum(
            1 for row in data for cell in row
            if isinstance(cell, (int, float)) and not (isinstance(cell, float) and pd.isna(cell))
        )
        if numeric_count > max_numeric:
            max_numeric = numeric_count
            best_name = name
            best_data = data
    if best_name is None:
        raise ValueError("No sheets found")
    return best_name, best_data


def coerce_header(data: list) -> list:
    """If first row looks like a header (many non-numeric), promote it.
    
    Mirrors TS coerceHeader: uses first row as column names if >= half cells are non-numeric.
    """
    if not data:
        return []
    first_row = [str(v).strip() for v in data[0]]
    nonnum = sum(1 for s in first_row if not re.search(r"\d", s))
    if nonnum >= len(first_row) / 2:
        headers = first_row
        result = []
        for row in data[1:]:
            obj = {}
            for i, h in enumerate(headers):
                val = row[i] if i < len(row) else ""
                obj[h] = val
            result.append(obj)
        return result
    else:
        result = []
        for row in data:
            obj = {}
            for i, v in enumerate(row):
                obj[f"c{i}"] = v
            result.append(obj)
        return result


def extract_table(data: list) -> pd.DataFrame:
    """Extract a table from raw 2D array data, mirroring TS extractTable logic."""
    
    # 1. Build generic table with c0, c1, ... columns
    if not data:
        return pd.DataFrame()
    
    max_cols = max(len(row) for row in data) if data else 0
    generic_rows = []
    for row_idx, row in enumerate(data):
        row_dict = {}
        for j in range(max_cols):
            val = row[j] if j < len(row) else ""
            row_dict[f"c{j}"] = val
        generic_rows.append(row_dict)
    
    generic_df = pd.DataFrame(generic_rows)
    
    # 2. Try to find date column by column name
    date_col_candidates = [c for c in generic_df.columns if re.search(r"年|年月|月|year|date|時間", c, re.I)]
    for dc in date_col_candidates:
        ym = detect_date_in_series(generic_df[dc])
        if ym:
            out = generic_df.drop(columns=[dc]).copy()
            out.insert(0, "年月", generic_df[dc].astype(str).map(
                lambda v: normalize_year_month(*detect_date_in_series([v])) if detect_date_in_series([v]) else str(v)
            ))
            return out
    
    # 3. Check first column for date-like values
    first_col = generic_df.columns[0]
    ym = detect_date_in_series(generic_df[first_col])
    if ym:
        df = generic_df.rename(columns={first_col: "年月"})
        df["年月"] = df["年月"].astype(str).map(
            lambda v: normalize_year_month(*detect_date_in_series([v])) if detect_date_in_series([v]) else str(v)
        )
        return df
    
    # 3b. Check first column for YEAR-ONLY values (4-digit years)
    first_col_vals = generic_df[first_col].dropna().astype(str).str.strip()
    year_vals = first_col_vals[first_col_vals.str.match(r"^\d{4}$")]
    if len(year_vals) >= 5:  # At least 5 years = data region detected
        # Find the data start row (first occurrence of 4-digit year)
        data_start = None
        for i, v in enumerate(generic_df[first_col]):
            s = str(v).strip()
            if re.match(r"^\d{4}$", s):
                data_start = i
                break
        
        if data_start is not None:
            # Collect data rows (consecutive 4-digit years until gap)
            data_rows = []
            for i in range(data_start, len(generic_df)):
                s = str(generic_df.iloc[i][first_col]).strip()
                if re.match(r"^\d{4}$", s):
                    data_rows.append(i)
                elif data_rows and i > data_rows[-1] + 2:
                    # Gap detected - end of this section
                    break
            
            if data_rows:
                # Build output DataFrame
                out_rows = []
                for ri in data_rows:
                    row_data = {}
                    year_val = str(generic_df.iloc[ri][first_col]).strip()
                    row_data["年月"] = f"{year_val}年"
                    for j in range(1, max_cols):
                        col_name = f"c{j}"
                        if col_name in generic_df.columns:
                            row_data[col_name] = generic_df.iloc[ri][col_name]
                    out_rows.append(row_data)
                
                out_df = pd.DataFrame(out_rows)
                
                # Try to find better column names from rows above data
                for header_candidate_row in range(max(0, data_start - 6), data_start):
                    candidate_headers = [str(generic_df.iloc[header_candidate_row][f"c{j}"]).strip() 
                                        for j in range(max_cols)
                                        if f"c{j}" in generic_df.columns]
                    non_empty = [h for h in candidate_headers if h and h.lower() != "nan" and h.lower() != "none"]
                    # If we find meaningful headers with year-related labels, use them
                    has_year_label = any("年" in h or "year" in h.lower() for h in non_empty)
                    if has_year_label and len(non_empty) >= 3:
                        new_cols = {"年月": "年月"}
                        for j in range(1, max_cols):
                            cn = f"c{j}"
                            hn = str(generic_df.iloc[header_candidate_row][cn]).strip() if cn in generic_df.columns else ""
                            if hn and hn.lower() not in ("nan", "none", ""):
                                new_cols[cn] = hn
                        # Rename columns if unique
                        used_names = set()
                        rename_map = {}
                        for old, new in new_cols.items():
                            if new not in used_names:
                                rename_map[old] = new
                                used_names.add(new)
                            else:
                                rename_map[old] = old
                        out_df = out_df.rename(columns=rename_map)
                        break
                
                return out_df
    
    # 4. Wide format: column headers look like dates
    wide_date_cols = [c for c in generic_df.columns if re.match(r"^\d{4}$|^\d{4}[/-]\d{1,2}$|^\d{4}年", str(c))]
    if wide_date_cols:
        id_vars = [c for c in generic_df.columns if c not in wide_date_cols]
        melted = generic_df.melt(id_vars=id_vars, value_vars=wide_date_cols, var_name="年月", value_name="value")
        if not id_vars:
            melted = generic_df.T.reset_index()
            melted.columns = ["年月", "value"]
        
        def parse_col_to_ym(v):
            s = str(v)
            for p in DATE_PATTERNS:
                m = p.match(s)
                if m:
                    return normalize_year_month(int(m.group(1)), int(m.group(2)))
            m = re.search(r"(\d{4}).*?(\d{1,2})", s)
            if m:
                return normalize_year_month(int(m.group(1)), int(m.group(2)))
            return s
        
        melted["年月"] = melted["年月"].map(parse_col_to_ym)
        return melted
    
    # 5. Last resort: coerce header and retry (mirrors TS Step 4)
    coerced_data = coerce_header(data)
    if not coerced_data:
        return pd.DataFrame({"年月": []})
    
    coerced_df = pd.DataFrame(coerced_data)
    
    # Retry date column detection on coerced table
    coerced_date_cols = [c for c in coerced_df.columns if re.search(r"年|年月|月|year|date|時間", str(c), re.I)]
    for dc in coerced_date_cols:
        ym = detect_date_in_series(coerced_df[dc])
        if ym:
            out = coerced_df.drop(columns=[dc]).copy()
            out.insert(0, "年月", coerced_df[dc].astype(str).map(
                lambda v: normalize_year_month(*detect_date_in_series([v])) if detect_date_in_series([v]) else str(v)
            ))
            return out
    
    return coerced_df


def process_file(path: Path, out_dir: Path):
    print(f"Processing {path}")
    sheets = read_file_as_arrays(path)
    if not sheets:
        print(f"  Could not read {path}")
        return
    name, data = pick_best_sheet(sheets)
    if data is None or not data:
        print(f"  No usable sheet in {path}")
        return
    
    df2 = extract_table(data)
    if df2.empty:
        print(f"  Could not extract table from {path}")
        return
    
    # Keep only numeric columns aside from 年月
    cols = [c for c in df2.columns if c != "年月"]
    # try to coerce numeric
    for c in cols:
        df2[c] = pd.to_numeric(df2[c].astype(str).str.replace(",", ""), errors="coerce")
    # drop rows that are fully NA aside from 年月
    df2 = df2.dropna(subset=[c for c in df2.columns if c != "年月"], how="all")
    # Fill NaN with 0 to match TS behavior (TS converts empty→Number('')→0)
    df2[cols] = df2[cols].fillna(0.0)
    # Format numeric values to match TS: no trailing .0 for integers
    def fmt_val(x):
        try:
            f = float(x)
            if f == int(f):
                return str(int(f))
            return f"{f:.1f}"
        except (ValueError, TypeError):
            return str(x)
    for c in cols:
        df2[c] = df2[c].apply(fmt_val)
    # ensure 年月 formatting where possible
    def ensure_ym(v):
        t = detect_date_in_series([v])
        if t:
            return normalize_year_month(*t)
        try:
            d = pd.to_datetime(v, errors="coerce")
            if pd.notna(d):
                return normalize_year_month(d.year, d.month)
        except Exception:
            pass
        return str(v)
    df2["年月"] = df2["年月"].astype(str).map(ensure_ym)
    
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / (path.stem + ".converted.csv")
    # Backup existing file
    if out_path.exists():
        ts = datetime.now().strftime("%Y%m%d%H%M%S")
        backup = out_path.with_name(f"{out_path.stem}.bak.{ts}{out_path.suffix}")
        out_path.rename(backup)
        print(f"Backed up existing file to {backup}")
    df2.to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"  Wrote {out_path} ({len(df2)} rows, {len(df2.columns)-1} numeric cols)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-dir", default="public/cpi_source")
    ap.add_argument("--n", type=int, default=5)
    ap.add_argument("--out-dir", default="data/converted_cpi")
    args = ap.parse_args()

    src = Path(args.source_dir)
    out = Path(args.out_dir)

    if not src.exists() or not src.is_dir():
        print(f"Source directory {src} not found")
        return

    files = [p for p in src.iterdir() if p.suffix.lower() in (".xls", ".xlsx", ".csv", ".xlsb")]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    targets = files[: args.n]

    print(f"Found {len(files)} source files, processing {len(targets)} latest")
    for p in targets:
        process_file(p, out)


if __name__ == "__main__":
    main()
