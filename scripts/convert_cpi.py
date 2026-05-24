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

import pandas as pd


DATE_PATTERNS = [
    re.compile(r"^(\d{4})[/-]?(\d{1,2})$"),
    re.compile(r"^(\d{4})年\s*0?(\d{1,2})月$"),
    re.compile(r"^(\d{4})\.\s*0?(\d{1,2})$"),
]


def detect_date_in_series(s: pd.Series):
    # Try to find a parseable date-like value in a pandas Series
    for v in s.dropna().astype(str).head(50):
        v = v.strip()
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
    return None


def normalize_year_month(year: int, month: int) -> str:
    return f"{year}年{str(month).zfill(2)}月"


def read_file_guess(path: Path) -> dict:
    """Read a file and return a dict of sheet_name->DataFrame (for csv, one entry)."""
    suffix = path.suffix.lower()
    if suffix in (".xls", ".xlsx", ".xlsb"):
        try:
            sheets = pd.read_excel(path, sheet_name=None, engine="openpyxl")
        except Exception:
            # fallback without engine spec
            sheets = pd.read_excel(path, sheet_name=None)
        return sheets
    elif suffix == ".csv":
        # try utf-8 then shift_jis
        try:
            df = pd.read_csv(path, encoding="utf-8", header=None)
            return {"_csv": df}
        except Exception:
            df = pd.read_csv(path, encoding="cp932", header=None)
            return {"_csv": df}
    else:
        # attempt pandas read_excel for unknown binary formats
        try:
            sheets = pd.read_excel(path, sheet_name=None)
            return sheets
        except Exception:
            # as last resort, return empty
            return {}


def pick_best_sheet(sheets: dict) -> (str, pd.DataFrame):
    # heuristics: prefer sheet with the most numeric cells
    best_name, best_df, best_score = None, None, -1
    for name, df in sheets.items():
        # ensure we have a DataFrame
        if not isinstance(df, pd.DataFrame):
            try:
                df = pd.DataFrame(df)
            except Exception:
                continue
        # compute score: count numeric values robustly
        try:
            vals = df.values.flatten()
            numeric_count = sum(1 for v in vals if pd.notna(v) and isinstance(v, (int, float)))
        except Exception:
            numeric_count = 0
        if numeric_count > best_score:
            best_score = numeric_count
            best_name = name
            best_df = df
    return best_name, best_df


def coerce_header(df: pd.DataFrame) -> pd.DataFrame:
    # If first row looks like header, promote it
    # Work with plain Python strings to avoid dtype issues
    try:
        first_row = [str(x).strip() for x in df.iloc[0].tolist()]
    except Exception:
        return df
    # If many non-numeric in first row, treat as header
    nonnum = sum(1 for s in first_row if not bool(re.search(r"\d", s)))
    if nonnum >= len(first_row) / 2:
        df2 = df.copy()
        df2.columns = df2.iloc[0].fillna("")
        df2 = df2.drop(df2.index[0]).reset_index(drop=True)
        return df2
    return df


def extract_table(df: pd.DataFrame) -> pd.DataFrame:
    # Try to find a date column in columns; if found, set it as "年月" and keep numeric columns
    df = df.copy()
    # Strip column names
    df.columns = [str(c).strip() for c in df.columns]
    # Try common date column names
    date_col_candidates = [c for c in df.columns if re.search(r"年|年月|月|year|date|時間", c, re.I)]
    if date_col_candidates:
        for dc in date_col_candidates:
            ym = detect_date_in_series(df[dc])
            if ym:
                year, month = ym
                out = df.loc[:, df.columns != dc].copy()
                out.insert(0, "年月", df[dc].astype(str).map(lambda v: normalize_year_month(*detect_date_in_series(pd.Series([v])) ) if detect_date_in_series(pd.Series([v])) else str(v)))
                return out
    # Otherwise, try to detect date-like values in first column
    first_col = df.columns[0]
    ym = detect_date_in_series(df[first_col])
    if ym:
        # promote
        df = df.rename(columns={first_col: "年月"})
        df["年月"] = df["年月"].astype(str).map(lambda v: (lambda t: normalize_year_month(*t) if t else v)(detect_date_in_series(pd.Series([v]))))
        return df

    # If columns look like dates (wide table), melt them
    wide_date_cols = [c for c in df.columns if re.match(r"^\d{4}$|^\d{4}[/-]\d{1,2}$|^\d{4}年", str(c))]
    if wide_date_cols:
        id_vars = [c for c in df.columns if c not in wide_date_cols]
        melted = df.melt(id_vars=id_vars, value_vars=wide_date_cols, var_name="年月", value_name="value")
        # if id_vars empty, just rename
        if not id_vars:
            melted = df.T.reset_index()
            melted.columns = ["年月", "value"]
        # normalize 年月
        def parse_col_to_ym(v):
            s = str(v)
            for p in DATE_PATTERNS:
                m = p.match(s)
                if m:
                    return normalize_year_month(int(m.group(1)), int(m.group(2)))
            # fallback: try extract numbers
            m = re.search(r"(\d{4}).*?(\d{1,2})", s)
            if m:
                return normalize_year_month(int(m.group(1)), int(m.group(2)))
            return s
        melted["年月"] = melted["年月"].map(parse_col_to_ym)
        return melted

    # Last resort: try to coerce header and pick numeric columns
    df = coerce_header(df)
    # find any column with date-like entries
    for col in df.columns:
        if detect_date_in_series(df[col]):
            df = df.rename(columns={col: "年月"})
            df["年月"] = df["年月"].astype(str).map(lambda v: (lambda t: normalize_year_month(*t) if t else v)(detect_date_in_series(pd.Series([v]))))
            return df

    # If nothing else, return empty DataFrame
    return pd.DataFrame()


def process_file(path: Path, out_dir: Path):
    print(f"Processing {path}")
    sheets = read_file_guess(path)
    if not sheets:
        print(f"  Could not read {path}")
        return
    name, df = pick_best_sheet(sheets)
    if df is None:
        print(f"  No usable sheet in {path}")
        return
    df2 = extract_table(df)
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
    # ensure 年月 formatting where possible
    def ensure_ym(v):
        t = detect_date_in_series(pd.Series([v]))
        if t:
            return normalize_year_month(*t)
        # try to parse common formats
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
    if TARGET_CSV.exists():
        import datetime
        ts = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        TARGET_CSV.rename(TARGET_CSV.with_suffix(f".bak.{ts}"))
        print(f"Backed up existing file to {TARGET_CSV.with_suffix(f".bak.{ts}")}")
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
