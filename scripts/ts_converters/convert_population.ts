import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";

const SRC_FILE = "lt01-b10.xlsx";
const TARGET_FILE = "population_statistics.csv";

const SRC_PATH = path.join(process.cwd(), "public", "economics_source", SRC_FILE);
const TARGET_PATH = path.join(process.cwd(), "public", TARGET_FILE);

function escapeCsv(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function main() {
  if (!fs.existsSync(SRC_PATH)) {
    console.error(`Source file not found: ${SRC_PATH}`);
    process.exit(1);
  }

  console.log(`Loading ${SRC_FILE}...`);
  const workbook = XLSX.readFile(SRC_PATH);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Read all rows as a 2D array for precise control
  // { header: 1 } returns raw rows as arrays instead of keyed objects
  const allRows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  // Python's pd.read_excel(path, header=6) uses row 6 (0-indexed) as the column names.
  // Row 6: Japanese column names (年　月, 総数, 15～64歳, …)
  // Row 7: English qualifiers (Year and month, 15～24, …)
  // Row 8: English qualifiers (Total, years old, …)
  // Row 9: Empty row
  // Row 10+: Actual data

  const headerRow6: unknown[] = allRows[6] ?? [];
  const headerRow7: unknown[] = allRows[7] ?? [];
  const headerRow8: unknown[] = allRows[8] ?? [];

  // Determine column count from the max width of the three header rows
  const columnCount = Math.max(headerRow6.length, headerRow7.length, headerRow8.length);

  // Build pandas-style column names from row 6:
  // - Empty/null cells -> "Unnamed: {index}"
  // - Duplicate values -> append ".1", ".2", … (matching pandas behavior)
  const seen = new Map<string, number>();
  const headers: string[] = [];

  for (let i = 0; i < columnCount; i++) {
    const raw = i < headerRow6.length ? headerRow6[i] : null;
    let name: string;
    if (raw == null || String(raw).trim() === "") {
      name = `Unnamed: ${i}`;
    } else {
      name = String(raw);
    }
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count > 0) {
      name = `${name}.${count}`;
    }
    headers.push(name);
  }

  // Build CSV content
  const lines: string[] = [];

  // Line 1: processed column names (from row 6, matching pandas naming)
  lines.push(headers.map(escapeCsv).join(","));

  // Data rows: rows 7 onwards (includes English qualifier rows, empty row, and actual data)
  for (let i = 7; i < allRows.length; i++) {
    const row = allRows[i] ?? [];
    const csvRow: string[] = [];
    for (let j = 0; j < columnCount; j++) {
      csvRow.push(escapeCsv(j < row.length ? row[j] : null));
    }
    lines.push(csvRow.join(","));
  }

  // Add trailing newline and BOM (utf-8-sig) to match Python's
  // df.to_csv(…, encoding="utf-8-sig") output
  const csvContent = "\ufeff" + lines.join("\n") + "\n";

  // Backup existing file
  if (fs.existsSync(TARGET_PATH)) {
    const ts = new Date().toISOString().replace(/[:T-]/g, "").slice(0, 14);
    const backupPath = TARGET_PATH.replace(".csv", `.bak.${ts}.csv`);
    fs.renameSync(TARGET_PATH, backupPath);
    console.log(`Backed up existing file to ${backupPath}`);
  }

  fs.writeFileSync(TARGET_PATH, csvContent, "utf8");
  console.log(`Saved to ${TARGET_PATH}`);
}

main();
