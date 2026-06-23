#!/usr/bin/env python3
"""
Convert public/cpi_source/hon-t29.xls into public/total_worked_hours.csv
"""

import sys
from pathlib import Path
import pandas as pd

def get_root():
    return Path('/home/menon/claude-test/nextjs-app')

ROOT = get_root()
SRC_XLS = ROOT / "public" / "cpi_source" / "hon-t29.xls"
TARGET_CSV = ROOT / "public" / "total_worked_hours.csv"

def main():
    if not SRC_XLS.exists():
        print(f"Source file not found: {SRC_XLS}")
        sys.exit(1)

    print("Loading hon-t29.xls...")
    df = pd.read_excel(SRC_XLS, header=6)
    
    out_path = ROOT / "public" / "total_worked_hours.csv"
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
