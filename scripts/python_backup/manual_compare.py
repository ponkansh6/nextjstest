import pandas as pd
import sys

def compare_csv(py_csv, ts_csv):
    print(f"Comparing {py_csv} and {ts_csv}")
    try:
        py_df = pd.read_csv(py_csv, dtype=str)
        ts_df = pd.read_csv(ts_csv, dtype=str)

        # 1. Row count
        if len(py_df) != len(ts_df):
            print(f"❌ FAIL: Row count mismatch. Python: {len(py_df)}, TS: {len(ts_df)}")
            return False

        # 2. Column names
        if list(py_df.columns) != list(ts_df.columns):
            print(f"❌ FAIL: Column mismatch. Python: {list(py_df.columns)}, TS: {list(ts_df.columns)}")
            return False

        # 3. Data content
        # We use equals() which checks both shape and elements
        if py_df.equals(ts_df):
            print("✅ PASS: Data is identical.")
            return True
        else:
            print("❌ FAIL: Data content mismatch.")
            # Find first difference
            for r in range(len(py_df)):
                for c in range(len(py_df.columns)):
                    val_py = py_df.iloc[r, c]
                    val_ts = ts_df.iloc[r, c]
                    if val_py != val_ts:
                        print(f"  Mismatch at Row {r+1}, Col '{py_df.columns[c]}': Python='{val_py}', TS='{val_ts}'")
                        return False
            return False

    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python compare.py <py_csv> <ts_csv>")
        sys.exit(1)
    
    success = compare_csv(sys.argv[1], sys.argv[2])
    sys.exit(0 if success else 1)
