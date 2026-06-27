import * as fs from "fs";
import * as path from "path";
import XLSX from "xlsx";
import * as aq from "arquero";

const SRC_XLS = path.join(process.cwd(), "public", "cpi_source", "hon-t19.xls");
const TARGET_CSV = path.join(process.cwd(), "public", "scheduled_earnings.csv");

function main() {
  if (!fs.existsSync(SRC_XLS)) {
    console.error(`Source file not found: ${SRC_XLS}`);
    process.exit(1);
  }

  console.log("Loading hon-t19.xls...");
  const workbook = XLSX.readFile(SRC_XLS);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // header: 6 means skip 6 rows
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: 6 });

  // Convert array of objects to object of arrays for arquero
  const columns: Record<string, any[]> = {};
  const headers = jsonData.length > 0 ? Object.keys(jsonData[0] as object) : [];

  headers.forEach((key) => {
    columns[key] = jsonData.map((row) => (row as any)[key]);
  });

  // Reorder columns to match expected format (年 first, then summary cols, then monthly cols)
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
  const columnOrder = EXPECTED_ORDER.filter((col) => headers.includes(col));
  const table = aq.table(columns).select(...columnOrder);

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
  console.log(`Saved to ${TARGET_CSV}`);
}

main();
