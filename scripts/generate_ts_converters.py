import os

# (source_file, target_csv, header_skip)
files = [
    ("bm01-1.xlsx", "bm01_1.csv", 0),
    ("hon-t13.xls", "contractual_earnings.csv", 6),
    ("cti0111_1.xlsx", "cti0111_1.csv", 0),
    ("cti0211_1.xlsx", "cti0211_1.csv", 0),
    ("hon-t01.xls", "employment_indices.csv", 6),
    ("lt01-b10.xlsx", "population_statistics.csv", 0),
    ("hon-t19.xls", "scheduled_earnings.csv", 6),
    ("hon-t07.xls", "total_earning.csv", 6),
    ("hon-t29.xls", "total_worked_hours.csv", 6),
]

template = """import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import * as aq from 'arquero';

const SRC_FILE = 'SRC_FILE_NAME';
const TARGET_FILE = 'TARGET_FILE_NAME';
const HEADER_SKIP = SKIP_ROWS;

const SRC_PATH = path.join(process.cwd(), 'public', 'cpi_source', SRC_FILE);
const TARGET_PATH = path.join(process.cwd(), 'public', TARGET_FILE);

function main() {
  if (!fs.existsSync(SRC_PATH)) {
    console.error(`Source file not found: ${SRC_PATH}`);
    process.exit(1);
  }

  console.log(`Loading ${SRC_FILE}...`);
  const workbook = XLSX.readFile(SRC_PATH);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: HEADER_SKIP });
  
  if (jsonData.length === 0) {
    console.error('No data found in sheet');
    process.exit(1);
  }

  const columns: Record<string, any[]> = {};
  const headers = Object.keys(jsonData[0] as object);
  
  headers.forEach(key => {
    columns[key] = jsonData.map(row => (row as any)[key]);
  });
  
  const table = aq.table(columns).select(...headers);

  // Backup existing file
  if (fs.existsSync(TARGET_PATH)) {
    const ts = new Date().toISOString().replace(/[:T-]/g, '').slice(0, 14);
    const backupPath = TARGET_PATH.replace('.csv', `.bak.${ts}.csv`);
    fs.renameSync(TARGET_PATH, backupPath);
    console.log(`Backed up existing file to ${backupPath}`);
  }

  // Convert to CSV
  const csvContent = table.toCSV();
  fs.writeFileSync(TARGET_PATH, csvContent, 'utf8');
  console.log(`Saved to ${TARGET_PATH}`);
}

main();
"""

for src, target, skip in files:
    script_name = f'convert_{target.replace(".csv", "").replace("-", "_")}.ts'
    # Special case for cpi
    if "cpi" in target:
        script_name = "convert_cpi.ts"
    
    content = template.replace('SRC_FILE_NAME', src).replace('TARGET_FILE_NAME', target).replace('SKIP_ROWS', str(skip))
    with open(f'scripts/ts_converters/{script_name}', 'w') as f:
        f.write(content)
