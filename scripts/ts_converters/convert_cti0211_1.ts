import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import * as aq from "arquero";

const SRC_FILE = "cti0211_1.xlsx";
const TARGET_FILE = "cti_data.csv";
const HEADER_ROW = 8; // Row index 8 (0-indexed) has "時間軸コード", "月", "消費支出（名目）", etc.
// Row index 9+ is data

const SRC_PATH = path.join(process.cwd(), "public", "cpi_source", SRC_FILE);
const TARGET_PATH = path.join(process.cwd(), "public", TARGET_FILE);

function main() {
  if (!fs.existsSync(SRC_PATH)) {
    console.error(`Source file not found: ${SRC_PATH}`);
    process.exit(1);
  }

  console.log(`Loading ${SRC_FILE}...`);
  const workbook = XLSX.readFile(SRC_PATH);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Read all rows as 2D arrays for precise control
  const allRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

  // Extract header from row index 8
  const headerRow = allRows[HEADER_ROW];
  if (!headerRow) {
    console.error(`Header row (index ${HEADER_ROW}) not found`);
    process.exit(1);
  }

  const dataRows = allRows.slice(HEADER_ROW + 1);
  if (dataRows.length === 0) {
    console.error("No data rows found");
    process.exit(1);
  }

  // Build column data, skipping columns with empty/null headers
  const columns: Record<string, any[]> = {};
  const headerNames: string[] = [];

  headerRow.forEach((cell: any, colIdx: number) => {
    const name = String(cell ?? "").trim();
    if (name && name !== "") {
      headerNames.push(name);
      if (!columns[name]) columns[name] = [];
      dataRows.forEach((row: any[]) => {
        columns[name].push(row[colIdx]);
      });
    }
  });

  if (headerNames.length === 0) {
    console.error("No valid headers found");
    process.exit(1);
  }

  // Filter data rows to keep only those where '月' matches YYYY年M月
  let table = aq.table(columns).select(...headerNames);
  if ((table as any).columnNames().includes("月")) {
    table = table.filter(aq.escape((d: any) => /^\d+年\d+月$/.test(String(d["月"]))));
  }

  // Backup existing file
  if (fs.existsSync(TARGET_PATH)) {
    const ts = new Date().toISOString().replace(/[:T-]/g, "").slice(0, 14);
    const backupPath = TARGET_PATH.replace(".csv", `.bak.${ts}.csv`);
    fs.renameSync(TARGET_PATH, backupPath);
    console.log(`Backed up existing file to ${backupPath}`);
  }

  // Convert to CSV (toCSV includes header row by default)
  const csvContent = table.toCSV();
  fs.writeFileSync(TARGET_PATH, csvContent, "utf8");
  console.log(`Saved to ${TARGET_PATH} (${table.numRows()} rows, ${headerNames.length} columns)`);
}

main();
