import * as fs from "fs";
import * as path from "path";
import XLSX from "xlsx";
import * as aq from "arquero";

const SRC_XLS = path.join(process.cwd(), "public", "cpi_source", "hon-t29.xls");
const TARGET_CSV = path.join(process.cwd(), "public", "total_worked_hours.csv");

const EXPECTED_ORDER = [
  "年",
  "1-12",
  "1-6",
  "7-12",
  "1-3",
  "4-6",
  "7-9",
  "10-12",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "4-3",
];

function main() {
  if (!fs.existsSync(SRC_XLS)) {
    console.error(`Source file not found: ${SRC_XLS}`);
    process.exit(1);
  }

  console.log("Loading hon-t29.xls...");
  const workbook = XLSX.readFile(SRC_XLS);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Read all rows as 2D arrays for precise column order control
  const allRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

  // Row 6 (0-indexed) is the header row
  const headerRow = allRows[6];
  if (!headerRow) {
    console.error("Header row (index 6) not found");
    process.exit(1);
  }

  const dataRows = allRows.slice(7);
  if (dataRows.length === 0) {
    console.error("No data rows found");
    process.exit(1);
  }

  // Map header values to column indices (convert cells to strings for comparison)
  const headerIndexMap = new Map<string, number>();
  headerRow.forEach((cell: any, colIdx: number) => {
    const name = String(cell ?? "").trim();
    if (name !== "") {
      headerIndexMap.set(name, colIdx);
    }
  });

  // Build columns in EXPECTED_ORDER, only including those found in the header
  const columns: Record<string, any[]> = {};
  const resolvedColumns: string[] = [];

  for (const colName of EXPECTED_ORDER) {
    const idx = headerIndexMap.get(colName);
    if (idx !== undefined) {
      resolvedColumns.push(colName);
      if (!columns[colName]) columns[colName] = [];
      for (const row of dataRows) {
        columns[colName].push(row[idx]);
      }
    }
  }

  if (resolvedColumns.length === 0) {
    console.error("No matching columns found in header row");
    process.exit(1);
  }

  const table = aq.table(columns).select(...resolvedColumns);

  // Backup existing file
  if (fs.existsSync(TARGET_CSV)) {
    const ts = new Date().toISOString().replace(/[:T-]/g, "").slice(0, 14);
    const backupPath = TARGET_CSV.replace(".csv", `.bak.${ts}.csv`);
    fs.renameSync(TARGET_CSV, backupPath);
    console.log(`Backed up existing file to ${backupPath}`);
  }

  // Convert to CSV
  const csvContent = table.toCSV();
  fs.writeFileSync(TARGET_CSV, csvContent, "utf8");
  console.log(
    `Saved to ${TARGET_CSV} (${table.numRows()} rows, ${resolvedColumns.length} columns)`,
  );
}

main();
