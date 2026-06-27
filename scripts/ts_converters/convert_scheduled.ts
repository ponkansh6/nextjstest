import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import * as aq from "arquero";

const SRC_FILE = "hon-t19.xls";
const TARGET_FILE = "scheduled_earnings.csv";
const HEADER_SKIP = 6;

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

  const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: HEADER_SKIP });

  if (jsonData.length === 0) {
    console.error("No data found in sheet");
    process.exit(1);
  }

  const columns: Record<string, any[]> = {};
  const headers = Object.keys(jsonData[0] as object);

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
  if (fs.existsSync(TARGET_PATH)) {
    const ts = new Date().toISOString().replace(/[:T-]/g, "").slice(0, 14);
    const backupPath = TARGET_PATH.replace(".csv", `.bak.${ts}.csv`);
    fs.renameSync(TARGET_PATH, backupPath);
    console.log(`Backed up existing file to ${backupPath}`);
  }

  // Convert to CSV
  const csvContent = table.toCSV();
  fs.writeFileSync(TARGET_PATH, csvContent, "utf8");
  console.log(`Saved to ${TARGET_PATH}`);
}

main();
