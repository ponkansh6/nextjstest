import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as XLSX from "xlsx";

const source = process.argv[2] ?? "/tmp/hon-mks202606.xls";
const root = process.cwd();
const out = path.join(root, "data/source/earnings_method_b_202606.csv");
const metadata = path.join(root, "data/source/earnings_method_b_202606.metadata.json");
const expectedSha256 = "bdb5b5ad4f79030728c89502d1f27c2d3234c30b09a8f287900016eb89ab61c8";

if (!fs.existsSync(source)) throw new Error(`Source file not found: ${source}`);
const bytes = fs.readFileSync(source);
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
if (bytes.length !== 1_099_776 || sha256 !== expectedSha256) {
  throw new Error(`Source verification failed: ${bytes.length} bytes, ${sha256}`);
}

const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
if (workbook.SheetNames.length !== 1 || workbook.SheetNames[0] !== "実数原表") {
  throw new Error(`Unexpected sheets: ${workbook.SheetNames.join(",")}`);
}
const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["実数原表"], {
  header: 1,
  defval: "",
});
const header = rows.slice(0, 7).flat().join(" ");
if (
  !header.includes("現　　　　金　　　　給　　　　与　　　　額") ||
  !header.includes("実　労　働　時　間　数")
) {
  throw new Error("Required table headers were not found");
}
const period = rows[1]?.[5];
const month = rows[1]?.[6];
const status = rows[1]?.[13];
if (period !== "令和 8年" || month !== "6月分" || status !== "（ 確 報 ）") {
  throw new Error(`Unexpected period/status: ${period} ${month} ${status}`);
}

const row = rows.find(
  (candidate) => candidate[0] === "T" && candidate[1] === "T" && candidate[2] === "T",
);
if (!row) throw new Error("Total / total-employment row was not found");
const values = [
  ["total_earning", row[12], "円", "現金給与額/総額"],
  ["contractual_earnings", row[13], "円", "現金給与額/きまって支給する給与"],
  ["scheduled_earnings", row[14], "円", "現金給与額/所定内給与"],
  ["total_worked_hours", row[9], "時間", "実労働時間数/総数"],
  ["employment_indices", row[6], "人", "常用労働者数/本調査期間末"],
];
if (values.some(([, value]) => typeof value !== "number" || !Number.isFinite(value))) {
  throw new Error("A selected value is missing or non-numeric");
}
const csv = [
  "series,年月,value,unit,target,revision",
  ...values.map(
    ([series, value, unit, target]) => `${series},2026-06,${value},${unit},${target},確報`,
  ),
  "",
].join("\n");
fs.writeFileSync(out, csv, "utf8");
fs.writeFileSync(
  metadata,
  JSON.stringify(
    {
      sourceFile: path.basename(source),
      sourcePath: source,
      sourceUrl: "https://www.e-stat.go.jp/stat-search/files?stat_infid=000040491571",
      statInfId: "000040491571",
      statisticCode: "00450071",
      retrievedAt: new Date().toISOString(),
      bytes: bytes.length,
      sha256,
      method: "B",
      sheet: "実数原表",
      tableHeader: "毎月勤労統計調査全国調査結果原表",
      period: "2026-06",
      periodLabel: "令和8年6月",
      revision: "確報",
      target: "調査産業計 / 就業形態計 / 5人以上",
      mapping: values.map(([series, , unit, target]) => ({ series, unit, target })),
      note: "断面原表の実数抽出。既存の年行＋月列の指数CSVとは単位・値定義が異なるため、自動置換しない。",
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
console.log(`Wrote ${out} and ${metadata}`);
