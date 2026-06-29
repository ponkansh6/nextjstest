import * as fs from "fs";
import * as path from "path";
import XLSX from "xlsx";
import * as aq from "arquero";

const SRC_XLS = path.join(process.cwd(), "public", "economics_source", "hon-t13.xls");
const TARGET_CSV = path.join(process.cwd(), "public", "contractual_earnings.csv");

function main() {
  if (!fs.existsSync(SRC_XLS)) {
    console.error(`Source file not found: ${SRC_XLS}`);
    process.exit(1);
  }

  console.log("Loading hon-t13.xls...");
  const workbook = XLSX.readFile(SRC_XLS);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // header: 6 means skip 6 rows
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: 6 });

  // Convert array of objects to object of arrays for arquero
  const columns: Record<string, any[]> = {};

  // Fix: preserve column order from Excel (not Object.keys() which reorders numeric keys)
  // Get header row from Excel directly to preserve column order
  const headerRange = XLSX.utils.decode_range(worksheet["!ref"] || "A1:U1");
  const headerRow: string[] = [];
  for (let c = headerRange.s.c; c <= headerRange.e.c; c++) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: 6, c })];
    if (cell) {
      headerRow.push(String(cell.v));
    }
  }

  // Use headerRow order instead of Object.keys
  const jsonKeys = jsonData.length > 0 ? (Object.keys(jsonData[0] as object) as string[]) : [];
  const orderedHeaders = headerRow.filter((h) => jsonKeys.includes(h));
  // Make sure all headers from jsonData are included (fallback if headerRow is empty)
  const headers = orderedHeaders.length > 0 ? orderedHeaders : jsonKeys;

  headers.forEach((key) => {
    columns[key] = jsonData.map((row) => (row as any)[key]);
  });

  const table = aq.table(columns).select(...headers);

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
