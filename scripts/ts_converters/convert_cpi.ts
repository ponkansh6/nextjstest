import * as fs from "fs";
import * as path from "path";
import * as aq from "arquero";
import { readWorkbook } from "./lib/xlsx-reader";
import { pickBestSheet } from "./lib/sheet-selector";
import { writeCSVWithBackup } from "./lib/csv-writer";
import { ensureYM } from "./lib/date-utils";
import { extractTable } from "./lib/table-extractor";

const SRC_DIR = path.join(process.cwd(), "public", "economics_source");
const OUT_DIR = path.join(process.cwd(), "public", "cpi_data");

function main(n = 5) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = fs
    .readdirSync(SRC_DIR)
    .filter((f) => /\.(xls|xlsx|csv|xlsb)$/i.test(f))
    .map((f) => ({
      name: f,
      path: path.join(SRC_DIR, f),
      mtime: fs.statSync(path.join(SRC_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, n);

  console.log(`Found ${files.length} source files, processing ${files.length} latest`);

  for (const f of files) {
    console.log(`Processing ${f.name}...`);
    const sheets = readWorkbook(f.path);
    if (!sheets.size) {
      console.log(`  Could not read ${f.name}`);
      continue;
    }

    const [sheetName, data] = pickBestSheet(sheets);
    if (!data) {
      console.log(`  No usable sheet in ${f.name}`);
      continue;
    }

    const table = extractTable(data);
    if (table.numRows() === 0) {
      console.log(`  Could not extract table from ${f.name}`);
      continue;
    }

    // Coerce numeric columns (except 年月)
    const cols = (table as any).columnNames() as string[];
    let result = table;
    for (const c of cols) {
      if (c === "年月") continue;
      result = (result as any).derive({
        [c]: aq.escape((d: any) => {
          const v = String(d[c] ?? "").replace(/,/g, "");
          const n = Number(v);
          return isNaN(n) ? null : n;
        }),
      });
    }
    // Drop rows where all numeric cols are null
    result = (result as any).filter(
      aq.escape((d: any) => cols.some((c) => c !== "年月" && d[c] != null)),
    );

    // Final 年月 normalization
    result = (result as any).derive({ 年月: aq.escape((d: any) => ensureYM(String(d.年月))) });

    const outPath = path.join(OUT_DIR, f.name.replace(/\.(xls|xlsx|csv|xlsb)$/i, ".converted.csv"));
    writeCSVWithBackup(result, outPath);
    console.log(
      `  Saved to ${outPath} (${result.numRows()} rows, ${cols.length - 1} numeric cols)`,
    );
  }
}

main(5);
