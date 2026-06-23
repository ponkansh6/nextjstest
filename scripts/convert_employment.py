#!/usr/bin/env python3
"""
Convert public/cpi_source/hon-t01.xls into public/employment_indices.csv
"""

import sys
from pathlib import Path
import pandas as pd
import datetime

def get_root():
    return Path('.').resolve()

ROOT = get_root()
SRC_XLS = ROOT / "public" / "cpi_source" / "hon-t01.xls"
TARGET_CSV = ROOT / "public" / "employment_indices.csv"

def main():
    if not SRC_XLS.exists():
        print(f"Source file not found: {SRC_XLS}")
        sys.exit(1)

    print("Loading source xls...")
    # ヘッダーは6行目（インデックス）から始まっている様子
    # 6行目がメインヘッダー、7行目が日本語、8行目が英語
    df = pd.read_excel(SRC_XLS, header=6)
    
    # 必要に応じて、targetのフォーマットに合わせる加工ロジックをここに記述する
    # 今回は単純に確認用としてCSV化する
    print(f"Loaded {df.shape[0]} rows.")
    
    out_path = ROOT / "public" / "employment_indices.csv"
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
