#!/usr/bin/env python3
"""
Convert public/cpi_source/lt01-b10.xlsx into public/population_statistics.csv
"""

import sys
from pathlib import Path
import pandas as pd

def get_root():
    return Path('.').resolve()

ROOT = get_root()
SRC_XLSX = ROOT / "public" / "cpi_source" / "lt01-b10.xlsx"
TARGET_CSV = ROOT / "public" / "population_statistics.csv"

def main():
    if not SRC_XLSX.exists():
        print(f"Source file not found: {SRC_XLSX}")
        sys.exit(1)

    print("Loading lt01-b10.xlsx...")
    # lt01-b10はxlsx形式のため、エンジンを指定して読み込み
    df = pd.read_excel(SRC_XLSX, header=6, engine='openpyxl')
    
    out_path = ROOT / "public" / "population_statistics.csv"
    # Backup existing file
    if TARGET_CSV.exists():
        import datetime
        ts = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        TARGET_CSV.rename(TARGET_CSV.with_suffix(f".bak.{ts}"))
        print(f"Backed up existing file to {TARGET_CSV.with_suffix(f".bak.{ts}")}")
    df.to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"Saved to {out_path}")

if __name__ == '__main__':
    main()
