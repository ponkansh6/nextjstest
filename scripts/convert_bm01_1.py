#!/usr/bin/env python3
"""
Convert public/cpi_source/bm01-1.xlsx into the same format as public/cpi_data.csv
- Overwrites original cpi_data.csv by default (no option needed)
- Creates a timestamped backup of the original cpi_data.csv before overwriting
- Use --trial to write a trial output instead of overwriting
- Prints summary of matches and a small preview comparison

Usage:
  python3 scripts/convert_bm01_1.py       # overwrite cpi_data.csv (default)
  python3 scripts/convert_bm01_1.py --trial  # write trial CSV and do not touch original

Dependencies: pandas, openpyxl
"""

import argparse
import sys
from pathlib import Path
import datetime

try:
    import pandas as pd
except Exception as e:
    print("This script requires pandas. Install with: pip install pandas openpyxl")
    raise

ROOT = Path(__file__).resolve().parents[1]
SRC_XLSX = ROOT / "public" / "cpi_source" / "bm01-1.xlsx"
TARGET_CSV = ROOT / "public" / "cpi_data.csv"
TRIAL_CSV = ROOT / "public" / "cpi_data_converted_trial.csv"


def find_header_row(raw_df):
    # search for a cell that exactly equals '年月' or contains '年月'
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
    # Some bm01 sheets have year/month split columns or codes like 197001
    # Attempt to produce a '年月' column in format like '1970年1月'
    if '年月' in df.columns:
        return df

    # try common variants
    possible = [c for c in df.columns if '年' in str(c) or '月' in str(c) or '年月' in str(c)]
    if possible:
        # already fine
        return df

    # try columns that look like YYYYMM numeric codes
    for c in df.columns:
        try:
            sample = df[c].dropna().iloc[0]
            s = str(sample)
            if len(s) >= 6 and s[:4].isdigit() and s[4:6].isdigit():
                # convert
                def fm(x):
                    xs = str(int(x)) if pd.notna(x) else ''
                    y, m = xs[:4], xs[4:6]
                    return f"{y}年{int(m)}月"
                df.insert(0, '年月', df[c].map(fm))
                return df
        except Exception:
            continue

    # last resort: check for separate year and month columns
    year_cols = [c for c in df.columns if '年' in str(c) or '年度' in str(c) or 'year' in str(c).lower()]
    mon_cols = [c for c in df.columns if '月' in str(c) or 'month' in str(c).lower()]
    if year_cols and mon_cols:
        df.insert(0, '年月', df[year_cols[0]].astype(str).str.replace(r"[^0-9]","", regex=True).str.replace(r"^(\\d{4})0?([1-9])$", lambda m: f"{m.group(1)}年{int(m.group(2))}月", regex=True))
        return df

    return df


def load_xlsx_try(xlsx_path: Path):
    # read with no header first to locate header row and possible label row
    raw = pd.read_excel(xlsx_path, header=None, engine='openpyxl')
    header_row = find_header_row(raw)
    if header_row is None:
        # fallback: assume header at row 0
        header_row = 0

    # attempt to find an earlier row that contains item labels like '類・品目' or '表章項目'
    label_row = None
    search_start = max(0, header_row - 15)
    # prefer the row with the most non-numeric (likely item-name) cells in the area where item labels live (after column 10)
    best_score = 0
    best_row = None
    for i in range(search_start, header_row):
        row_vals = raw.iloc[i].astype(str).fillna("")
        # score cells that contain non-digit characters (likely item names) in columns 11 onwards
        score = 0
        for c in row_vals[11:]:
            s = str(c).strip()
            if not s or s.lower() == 'nan':
                continue
            # if cell contains any non-digit character, count it as a name
            if any(ch for ch in s if not ch.isdigit()):
                score += 1
        if score > best_score:
            best_score = score
            best_row = i
    if best_row is not None and best_score > 0:
        label_row = best_row

    # read using the detected header_row
    df = pd.read_excel(xlsx_path, header=header_row, engine='openpyxl')

    # if a label row was found, synthesize column names using the label row where available,
    # otherwise fall back to the header row names
    if label_row is not None:
        label_vals = raw.iloc[label_row].astype(str).fillna("").tolist()
        header_vals = raw.iloc[header_row].astype(str).fillna("").tolist()
        combined = []
        # combine label row and header row: prefer label (item) names when present
        for a, b in zip(label_vals, header_vals):
            a_str = str(a).strip()
            b_str = str(b).strip()
            if a_str and a_str.lower() != 'nan':
                combined.append(a_str)
            elif b_str and b_str.lower() != 'nan':
                combined.append(b_str)
            else:
                combined.append("")
        df.columns = combined
    else:
        df.columns = [normalize_colname(c) for c in df.columns]

    # normalize column names
    df.columns = [normalize_colname(c) for c in df.columns]
    # synthesize '年月' if missing
    df = synthesize_nendo_month(df)
    return df


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--trial', action='store_true', help='Write trial CSV and do not touch original')
    args = p.parse_args()

    if not SRC_XLSX.exists():
        print(f"Source xlsx not found: {SRC_XLSX}")
        sys.exit(1)
    if not TARGET_CSV.exists():
        print(f"Target reference csv not found: {TARGET_CSV} (it will be created when overwriting unless --trial is used)")

    print("Reading target CSV header to determine desired columns...")
    target_cols = pd.read_csv(TARGET_CSV, nrows=0).columns.tolist()
    print(f"Target has {len(target_cols)} columns")

    print("Loading source xlsx (attempting to detect header)...")
    src = load_xlsx_try(SRC_XLSX)
    print(f"Source loaded: {src.shape[0]} rows, {src.shape[1]} columns")

    # attempt to map columns: exact match first, then case-insensitive
    src_cols = list(src.columns)
    mapped = {}
    unmatched_target = []
    for tc in target_cols:
        if tc in src_cols:
            mapped[tc] = tc
        else:
            # case-insensitive match
            found = next((c for c in src_cols if str(c).strip().lower() == str(tc).strip().lower()), None)
            if found:
                mapped[tc] = found
            else:
                # try contains
                found = next((c for c in src_cols if str(tc) in str(c)), None)
                if found:
                    mapped[tc] = found
                else:
                    mapped[tc] = None
                    unmatched_target.append(tc)

    # build output dataframe with target columns order, aligning rows by '年月' if possible
    # If possible, load the original target CSV and preserve its rows/order, then fill from source where available.
    if '年月' in target_cols and '年月' in src.columns:
        target_df = pd.read_csv(TARGET_CSV, dtype=str)
        # normalize 年月 in target for matching
        target_df['年月'] = target_df['年月'].astype(str).str.replace(r"\s+","", regex=True)
        src_indexed = src.set_index('年月')
        out = target_df.copy()
        import re
        for tc in target_cols:
            sc = mapped.get(tc)
            # try positional mapping for Unnamed columns
            if sc is None:
                m = re.match(r'^Unnamed:\s*(\d+)$', str(tc))
                if m:
                    idx = int(m.group(1))
                    if idx < len(src.columns):
                        # derive a series from the src by positional index and align on 年月
                        if '年月' in src.columns:
                            index_pos = list(src.columns).index('年月')
                            src_by_key = src.set_index('年月')
                            col_pos = idx if idx < index_pos else idx - 1
                            if 0 <= col_pos < src_by_key.shape[1]:
                                col_series = src_by_key.iloc[:, col_pos]
                                # update only where source has a value for that 年月
                                for i, ym in enumerate(out['年月']):
                                    if pd.notna(ym) and ym in col_series.index and pd.notna(col_series.loc[ym]):
                                        # preserve original blank cells: only overwrite if the original target had a non-blank value
                                        orig_val = target_df.at[i, tc]
                                        if pd.isna(orig_val) or str(orig_val).strip() == '':
                                            continue
                                        val = col_series.loc[ym]
                                        out.at[i, tc] = str(val)
                                continue
                        # fallback: map by original column name if exists
                        sc = src.columns[idx]
            # if no mapping or mapping points to 年月, preserve original values
            if sc is None or sc == '年月':
                continue
            # if mapped sc exists in src, use it to overwrite out where available
            if sc in src_indexed.columns:
                col_series = src_indexed[sc]
                for i, ym in enumerate(out['年月']):
                    if pd.notna(ym) and ym in col_series.index and pd.notna(col_series.loc[ym]):
                        orig_val = target_df.at[i, tc]
                        if pd.isna(orig_val) or str(orig_val).strip() == '':
                            continue
                        val = col_series.loc[ym]
                        out.at[i, tc] = str(val)
            elif sc in src.columns:
                s = src[sc].astype(str).reset_index(drop=True)
                for i in range(min(len(s), len(out))):
                    if pd.notna(s.iloc[i]):
                        out.at[i, tc] = s.iloc[i]
            else:
                continue

        # --- New: append rows that exist in source but not in the target (追加行対応) ---
        try:
            src_yms = [str(x) for x in src_indexed.index.astype(str).tolist()]
        except Exception:
            src_yms = []
        target_yms = [str(x) for x in out['年月'].astype(str).tolist()]
        new_yms = [y for y in src_yms if y not in target_yms]
        if new_yms:
            new_rows = []
            for ym in new_yms:
                # start with empty row matching out's columns
                row = {c: pd.NA for c in out.columns}
                row['年月'] = ym
                for tc in target_cols:
                    sc = mapped.get(tc)
                    # positional Unnamed mapping (same logic as above)
                    if sc is None:
                        m = re.match(r'^Unnamed:\s*(\d+)$', str(tc))
                        if m:
                            idx = int(m.group(1))
                            try:
                                index_pos = list(src.columns).index('年月')
                                col_pos = idx if idx < index_pos else idx - 1
                                if 0 <= col_pos < src.shape[1]:
                                    val = src_indexed.iloc[:, col_pos].get(ym, pd.NA)
                                    if pd.notna(val):
                                        row[tc] = str(val)
                                    continue
                            except Exception:
                                pass
                        # fallback: leave as NA
                        continue
                    # normal mapping
                    if sc in src_indexed.columns:
                        try:
                            val = src_indexed.at[ym, sc]
                        except Exception:
                            val = pd.NA
                        if pd.notna(val):
                            row[tc] = str(val)
                    elif sc in src.columns:
                        try:
                            sr = src.set_index('年月')[sc]
                            val = sr.get(ym, pd.NA)
                            if pd.notna(val):
                                row[tc] = str(val)
                        except Exception:
                            pass
                new_rows.append(row)
            if new_rows:
                out = pd.concat([out, pd.DataFrame(new_rows)], ignore_index=True, sort=False)
    else:
        # default behavior: preserve target column order and copy columns from source by mapped names
        out = pd.DataFrame()
        for tc in target_cols:
            sc = mapped.get(tc)
            if sc is None:
                out[tc] = pd.NA
            else:
                out[tc] = src[sc]

    # Some CSV columns might expect string formatting of '年月' -- unify spacing
    if '年月' in out.columns:
        out['年月'] = out['年月'].astype(str).str.replace(r"\s+","", regex=True)

    # Attempt to preserve numeric formatting from the original target where values are numerically equal
    try:
        ref = pd.read_csv(TARGET_CSV, dtype=str)
        def _to_num(x):
            try:
                if pd.isna(x):
                    return None
                s = str(x).strip()
                if s == '' or s == '-':
                    return None
                return float(s)
            except Exception:
                return None
        for c in out.columns:
            if c not in ref.columns:
                continue
            for i in range(len(out)):
                orig_val = ref.at[i, c]
                new_val = out.at[i, c]
                if pd.isna(orig_val) and pd.isna(new_val):
                    continue
                if str(orig_val) == str(new_val):
                    continue
                o_num = _to_num(orig_val)
                n_num = _to_num(new_val)
                if o_num is not None and n_num is not None and abs(o_num - n_num) < 1e-9:
                    out.at[i, c] = orig_val
        # preserve Unnamed columns exactly from the original target (metadata/positional fields)
        for c in out.columns:
            if str(c).startswith('Unnamed:') and c in ref.columns:
                out[c] = ref[c]
    except Exception:
        # if anything goes wrong, skip normalization and proceed
        pass

    # Decide output mode: trial or overwrite
    if args.trial:
        trial_path = TRIAL_CSV
        print(f"Writing trial CSV to: {trial_path}")
        out.to_csv(trial_path, index=False)
    else:
        # backup existing target if it exists
        if TARGET_CSV.exists():
            ts = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
            backup = TARGET_CSV.with_name(f"{TARGET_CSV.name}.bak.{ts}")
            TARGET_CSV.rename(backup)
            print(f"Existing target renamed to: {backup}")
        print(f"Overwriting target CSV: {TARGET_CSV}")
        out.to_csv(TARGET_CSV, index=False)

    # summary
    print('\nSummary:')
    print(f'  Source rows: {src.shape[0]}')
    print(f'  Output rows: {out.shape[0]}')
    print(f'  Matched columns: {len([v for v in mapped.values() if v])} / {len(target_cols)}')
    if unmatched_target:
        print('  Unmatched target columns (will be empty in output):')
        for c in unmatched_target[:20]:
            print('   -', c)
        if len(unmatched_target) > 20:
            print('   - ...', len(unmatched_target)-20, 'more')

    # show a small preview comparison for common columns
    common = [tc for tc, sc in mapped.items() if sc]
    preview_n = min(10, out.shape[0])
    if preview_n > 0 and common:
        print('\nPreview (first rows) for first 8 common columns:')
        cols_preview = common[:8]
        print(out[cols_preview].head(preview_n).to_string(index=False))

    if args.trial:
        print('\nDone. Review the trial CSV. The original cpi_data.csv was not modified.')
    else:
        print('\nDone. cpi_data.csv overwritten. A timestamped backup was kept if the file existed.')


if __name__ == '__main__':
    main()
