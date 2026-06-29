import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import * as aq from "arquero";
import { readWorkbook } from "./lib/xlsx-reader.js";
import { findHeaderRow, findLabelRow, synthesizeColumns } from "./lib/header-detector";
import { synthesizeNendoMonth } from "./lib/nendo-synthesizer";
import { mapColumns } from "./lib/column-mapper";
import { mergeByNengetsu } from "./lib/merger";
import { writeCSVWithBackup } from "./lib/csv-writer";

const SRC_FILE = "bm01-1.xlsx";
const TARGET_FILE = "cpi_data.csv";
const TRIAL_FILE = "cpi_data_converted_trial.csv";

const SRC_PATH = path.join(process.cwd(), "public", "economics_source", SRC_FILE);
const TARGET_PATH = path.join(process.cwd(), "public", TARGET_FILE);
const TRIAL_PATH = path.join(process.cwd(), "public", TRIAL_FILE);

async function main(trial = false) {
  if (!fs.existsSync(SRC_PATH)) {
    console.error(`Source xlsx not found: ${SRC_PATH}`);
    process.exit(1);
  }

  // 1. Load target CSV header to determine desired columns
  if (!fs.existsSync(TARGET_PATH)) {
    console.error(`Target reference csv not found: ${TARGET_PATH}`);
    process.exit(1);
  }
  const targetHeader = fs
    .readFileSync(TARGET_PATH, "utf-8")
    .split("\n")[0]
    .split(",")
    .map((h) => h.trim());
  console.log(`Target has ${targetHeader.length} columns`);

  // 2. Load source xlsx with header detection
  const sheets = readWorkbook(SRC_PATH);
  const [sheetName, rawData] = [...sheets.entries()][0];
  console.log(`Loading ${SRC_FILE} (sheet: ${sheetName})...`);

  const headerRow = findHeaderRow(rawData);
  if (headerRow === null) {
    console.error("Could not find header row");
    process.exit(1);
  }
  const labelRow = findLabelRow(rawData, headerRow);
  const columns = synthesizeColumns(rawData, headerRow, labelRow);
  console.log(`Synthesized columns: ${columns.join(", ")}`);

  // Build source table from data rows (after header)
  const dataRows = rawData.slice(headerRow + 1);
  const srcTable = aq.from(
    dataRows.map((row, i) => {
      const obj: any = { _row: i };
      columns.forEach((c, j) => (obj[c] = row[j]));
      return obj;
    }),
  );
  console.log(`Source loaded: ${srcTable.numRows()} rows, ${srcTable.numCols()} columns`);

  // 3. Synthesize 年月
  const srcWithYM = synthesizeNendoMonth(srcTable);

  // 4. Load full target CSV for merging
  const targetTable = aq.fromCSV(fs.readFileSync(TARGET_PATH, "utf-8"));

  // 5. Map columns
  const mapping = mapColumns(targetHeader, (srcWithYM as any).columnNames());

  // 6. Merge
  const merged = mergeByNengetsu(targetTable, srcWithYM, mapping, targetHeader);

  // 7. Normalize 年月 spacing
  const final = (merged as any).derive({
    年月: aq.escape((d: any) => String(d.年月).replace(/\s+/g, "")),
  });

  // 8. Output
  const outPath = trial ? TRIAL_PATH : TARGET_PATH;
  if (!trial && fs.existsSync(TARGET_PATH)) {
    const ts = new Date().toISOString().replace(/[:T-]/g, "").slice(0, 14);
    const backup = TARGET_PATH.replace(".csv", `.bak.${ts}.csv`);
    fs.renameSync(TARGET_PATH, backup);
    console.log(`Existing target renamed to: ${backup}`);
  }

  writeCSVWithBackup(final, outPath);
  console.log(`Saved to ${outPath}`);

  if (!trial) {
    console.log(
      "\nDone. cpi_data.csv overwritten. A timestamped backup was kept if the file existed.",
    );
  } else {
    console.log("\nDone. Review the trial CSV. The original cpi_data.csv was not modified.");
  }
}

main(process.argv.includes("--trial")).catch((err) => {
  console.error(err);
  process.exit(1);
});
