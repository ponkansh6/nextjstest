import pandas as pd
from pathlib import Path

ROOT = Path('.').resolve()
SRC_XLSX = ROOT / 'public' / 'cpi_source' / 'lt01-b10.xlsx'

# Read the Excel file
print("Reading Excel file...")
df = pd.read_excel(SRC_XLSX, engine='openpyxl')

print(f"Total rows in Excel: {len(df)}")
print(f"Total columns in Excel: {len(df.columns)}")

# Show first 20 rows
print("\nFirst 20 rows:")
print(df.head(20))

# Show the last 20 rows
print("\nLast 20 rows:")
print(df.tail(20))

# Check for empty rows
print("\nChecking for empty rows...")
empty_rows = df[df.iloc[:, 0].isna()]
print(f"Number of empty rows: {len(empty_rows)}")

# Check the actual data rows (excluding header rows)
print("\nData rows (excluding header rows):")
# Based on the Python script, header=6 means rows 0-5 are headers
# So data starts from row 6
data_rows = df.iloc[6:]
print(f"Number of data rows: {len(data_rows)}")
print(data_rows.head(10))