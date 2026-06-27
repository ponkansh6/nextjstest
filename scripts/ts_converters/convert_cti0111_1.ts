import * as fs from "fs";
import * as path from "path";
import * as aq from "arquero";
import { readWorkbook } from "./lib/xlsx-reader";
import { findHeaderRow, synthesizeColumns } from "./lib/header-detector";
import { mergeByNengetsu } from "./lib/merger";
import { writeCSVWithBackup } from "./lib/csv-writer";

const SRC_FILE = "cti0111_1.xlsx";
const TARGET_FILE = "cti_data.csv";
const TRIAL_FILE = "cti_data_converted_trial.csv";

const SRC_PATH = path.join(process.cwd(), "public", "cpi_source", SRC_FILE);
const TARGET_PATH = path.join(process.cwd(), "public", TARGET_FILE);
const TRIAL_PATH = path.join(process.cwd(), "public", TRIAL_FILE);

function main() {
  const isTrial = process.argv.includes("--trial");
  const outPath = isTrial ? TRIAL_PATH : TARGET_PATH;

  if (!fs.existsSync(SRC_PATH)) {
    console.error(`Source file not found: ${SRC_PATH}`);
    process.exit(1);
  }

  console.log(`Loading ${SRC_FILE}...`);
  const sheets = readWorkbook(SRC_PATH);
  const sheetName = Array.from(sheets.keys())[0];
  const rawData = sheets.get(sheetName)!;

  // Python uses header=8 (0-indexed 8)
  const headerRowIdx = 8;
  const headerVals = rawData[headerRowIdx].map((v: any) => String(v ?? "").trim());
  const dataRows = rawData.slice(headerRowIdx + 1);

  const tableData = dataRows.map((row: any[]) => {
    const obj: Record<string, any> = {};
    headerVals.forEach((h, i) => {
      if (h && !h.startsWith("Unnamed")) obj[h] = row[i];
    });
    return obj;
  });

  let table = aq.from(tableData);

  // Filter rows where '月' matches YYYY年M月
  table = table.filter(aq.escape((d: any) => /^\d+年\d+月$/.test(String(d["月"]))));
  table = table.rename({ 月: "年月" });

  // Check if target file exists and has the expected format
  let targetTableRenamed;
  let headerLines: string[] = [];

  if (fs.existsSync(TARGET_PATH)) {
    const targetContent = fs.readFileSync(TARGET_PATH, "utf-8");
    const lines = targetContent.split("\n");

    // Check if the file has the expected format (3 header lines + data)
    if (lines.length >= 4) {
      headerLines = lines.slice(0, 3);
      // The header row is at index 2 (0-indexed)
      const targetTable = aq.fromCSV(lines.slice(2).join("\n"));

      // Rename '月' to '年月' if it exists
      targetTableRenamed = targetTable;
      if ((targetTable as any).columnNames().includes("月")) {
        targetTableRenamed = targetTable.rename({ 月: "年月" });
      }
    } else {
      // File doesn't have expected format, create empty target table
      targetTableRenamed = aq.from([]);
      headerLines = ["", "", ""];
    }
  } else {
    // Create empty target table with expected columns
    targetTableRenamed = aq.from([]);
    headerLines = ["", "", ""];
  }

  // Mapping
  const targetCols = (targetTableRenamed as any).columnNames() as string[];
  const srcCols = (table as any).columnNames() as string[];
  const mapping = new Map<string, string | null>();

  for (const tc of targetCols) {
    if (srcCols.includes(tc)) {
      mapping.set(tc, tc);
    } else {
      const tcClean = tc.replace(/[\s　]/g, "");
      const found = srcCols.find((sc) => sc.replace(/[\s　]/g, "") === tcClean);
      if (found) mapping.set(tc, found);
    }
  }

  const merged = mergeByNengetsu(targetTableRenamed, table, mapping, targetCols);

  writeCSVWithBackup(merged, outPath, headerLines);
  console.log(`Saved to ${outPath}`);
}

main();
