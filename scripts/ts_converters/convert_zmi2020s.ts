import * as fs from "fs";
import * as path from "path";
import iconv from "iconv-lite";

/**
 * convert_zmi2020s.ts
 *
 * Converts zmi2020s.csv (raw Shift-JIS CPI data) into cpi_data.csv format.
 *
 * zmi2020s.csv differs from cpi_data.csv in:
 *  - Encoding: Shift-JIS → UTF-8
 *  - Header rows: 6 rows (jp/en names, codes, weights) → 1 row
 *  - Date format: YYYYMM → "YYYY年M月"
 *  - Leading columns: none → 6 empty unnamed columns + 年月
 *
 * Usage:
 *   pnpm exec tsx scripts/ts_converters/convert_zmi2020s.ts          # overwrite cpi_data.csv
 *   pnpm exec tsx scripts/ts_converters/convert_zmi2020s.ts --trial  # write to cpi_data_converted_trial.csv
 */

const SRC_FILE = "zmi2020s.csv";
const TARGET_FILE = "cpi_data.csv";
const TRIAL_FILE = "cpi_data_converted_trial.csv";

const SRC_PATH = path.join(process.cwd(), "public", SRC_FILE);
const TARGET_PATH = path.join(process.cwd(), "public", TARGET_FILE);
const TRIAL_PATH = path.join(process.cwd(), "public", TRIAL_FILE);

/** Number of header/metadata rows before data starts in zmi2020s.csv */
const ZMI_HEADER_ROWS = 6;

function main(trial: boolean): void {
  // 1. Read zmi2020s.csv (Shift-JIS)
  if (!fs.existsSync(SRC_PATH)) {
    console.error(`Source file not found: ${SRC_PATH}`);
    process.exit(1);
  }
  const rawBuffer = fs.readFileSync(SRC_PATH);
  const rawContent = iconv.decode(rawBuffer, "Shift_JIS");
  const lines = rawContent.split("\n").filter((l) => l.trim().length > 0);

  if (lines.length < ZMI_HEADER_ROWS + 1) {
    console.error(
      `zmi2020s.csv has only ${lines.length} lines; expected at least ${ZMI_HEADER_ROWS + 1}`,
    );
    process.exit(1);
  }

  // 2. Extract column names from Japanese header (row 1)
  const jpHeader = lines[0].split(",");
  let dataColumns = jpHeader.slice(1); // skip "類・品目"

  // Normalize column names to match cpi_data.csv conventions
  // zmi2020s uses "（再掲）" suffix on some sub-categories; cpi_data.csv does not
  dataColumns = dataColumns.map((col) => col.replace("（再掲）", ""));

  console.log(`Found ${dataColumns.length} data columns`);

  // 3. Build output CSV header
  const outputHeader = [
    "Unnamed: 0",
    "Unnamed: 1",
    "Unnamed: 2",
    "Unnamed: 3",
    "Unnamed: 4",
    "Unnamed: 5",
    "Unnamed: 6",
    "年月",
    ...dataColumns,
  ];

  // 4. Convert data rows
  const dataLines = lines.slice(ZMI_HEADER_ROWS);
  const outputRows: string[] = [];

  for (const line of dataLines) {
    const parts = line.split(",");
    const dateRaw = parts[0]?.trim() ?? "";
    const values = parts.slice(1);

    // Validate and convert date: YYYYMM → "YYYY年M月"
    const year = dateRaw.slice(0, 4);
    const monthNum = parseInt(dateRaw.slice(4, 6), 10);
    if (!/^\d{4}$/.test(year) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      console.warn(`Skipping row with invalid date: "${dateRaw}"`);
      continue;
    }
    const dateFormatted = `${year}年${monthNum}月`;

    // Pad/trim values to match dataColumns count
    const padded = [
      ...values,
      ...Array(Math.max(0, dataColumns.length - values.length)).fill(""),
    ].slice(0, dataColumns.length);

    const row = ["", "", "", "", "", "", "", dateFormatted, ...padded].join(",");

    outputRows.push(row);
  }

  // 5. Write output
  const csvContent = [outputHeader.join(","), ...outputRows].join("\n");
  const outPath = trial ? TRIAL_PATH : TARGET_PATH;

  if (!trial && fs.existsSync(TARGET_PATH)) {
    const ts = new Date().toISOString().replace(/[:T-]/g, "").slice(0, 14);
    const backup = TARGET_PATH.replace(".csv", `.bak.${ts}.csv`);
    fs.renameSync(TARGET_PATH, backup);
    console.log(`Backed up existing file to ${backup}`);
  }

  fs.writeFileSync(outPath, csvContent, "utf-8");
  console.log(`Saved ${outputRows.length} rows to ${outPath}`);

  if (trial) {
    console.log("Trial mode: original cpi_data.csv was NOT modified.");
  } else {
    console.log("Done. cpi_data.csv has been updated with data from zmi2020s.csv.");
  }
}

main(process.argv.includes("--trial"));
