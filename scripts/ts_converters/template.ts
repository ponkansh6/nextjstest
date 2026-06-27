import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import * as aq from "arquero";

// Configuration - update these for each script
const SRC_FILE = "REPLACE_ME_SRC";
const TARGET_FILE = "REPLACE_ME_TARGET";
const HEADER_SKIP = 0; // Number of rows to skip

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

  const table = aq.table(columns).select(...headers);

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
