#!/usr/bin/env node

/** Normalize official annual Household Survey spreadsheets for the candidate. */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = path.join(ROOT, "data/source/cti-size-composition/raw");
const OUTPUT = path.join(ROOT, "data/source/cti-size-composition");
const YEARS = Array.from({ length: 13 }, (_, index) => 2005 + index);
const LABELS = [
  "消費支出",
  "食料",
  "住居",
  "光熱・水道",
  "家具・家事用品",
  "被服及び履物",
  "保健医療",
  "交通・通信",
  "教育",
  "教養娯楽",
  "その他の消費支出",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const cellLabel = (row, label) =>
  row.some((cell) => typeof cell === "string" && cell.trim() === label);
const numberCell = (value, context) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error(`${context} is not a non-negative number: ${value}`);
  return value;
};
const csv = (rows) =>
  rows
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n") + "\n";

function resolveSourceFile(relative, label) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative))
    throw new Error(`${label} path must be relative`);
  const resolved = path.resolve(ROOT, relative);
  if (!resolved.startsWith(`${ROOT}${path.sep}`))
    throw new Error(`${label} path escapes workspace`);
  return resolved;
}

async function verifyAcquiredSourceManifest() {
  const manifestFile = path.join(OUTPUT, "household-survey-panel-manifest.json");
  const manifest = JSON.parse((await readFile(manifestFile)).toString("utf8"));
  if (manifest.schemaVersion !== "cti-size-composition-household-survey-panel-v1")
    throw new Error("unsupported prior household-survey-panel-manifest schema");
  const expectedYears = YEARS;
  const actualYears = (manifest.sources ?? []).map((entry) => entry.year).sort((a, b) => a - b);
  if (JSON.stringify(actualYears) !== JSON.stringify(expectedYears))
    throw new Error("prior source manifest must cover exactly 2005-2017 before extraction");
  for (const entry of manifest.sources) {
    for (const key of ["twoOrMore", "single"]) {
      const source = entry[key];
      const tablePhrase = key === "twoOrMore" ? "表番号3-1" : "表番号1";
      if (
        !source?.table?.includes(tablePhrase) ||
        typeof source.sheet !== "string" ||
        !source.sheet
      )
        throw new Error(`${entry.year} ${key}: table/sheet identity is missing`);
      if (!/^[A-Z0-9]{10,20}$/.test(source?.statInfId ?? ""))
        throw new Error(`${entry.year} ${key}: missing e-Stat file ID`);
      const url = `https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=${source.statInfId}`;
      if (source.url !== url) throw new Error(`${entry.year} ${key}: download URL mismatch`);
      if (!source.file.includes(`/${entry.year}-`))
        throw new Error(`${entry.year} ${key}: raw path does not match source year`);
      const bytes = await readFile(resolveSourceFile(source.file, `${entry.year} ${key}`));
      const actualHash = sha256(bytes);
      if (source.sha256 !== actualHash)
        throw new Error(`${entry.year} ${key}: raw SHA-256 mismatch; refusing extraction`);
    }
  }
  return manifest;
}

async function workbookRows(file) {
  const bytes = await readFile(file);
  const workbook = XLSX.read(bytes, { type: "buffer", raw: true });
  const sheetName = workbook.SheetNames[0];
  return {
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: true,
      defval: null,
    }),
    sheetName,
    sha256: sha256(bytes),
  };
}

function findAmountRow(rows, category, totalIndex) {
  for (let index = totalIndex; index < rows.length; index += 1) {
    if (cellLabel(rows[index], category)) return rows[index];
    if (index > totalIndex && cellLabel(rows[index], "非消費支出")) break;
  }
  throw new Error(`required category not found after consumption expenditure: ${category}`);
}

async function filesFor(kind) {
  const directory = path.join(SOURCE, kind);
  const files = (await readdir(directory)).filter((name) => name.endsWith(".xls")).sort();
  const byYear = new Map(
    files.map((name) => [Number(name.slice(0, 4)), path.join(directory, name)]),
  );
  const missing = YEARS.filter((year) => !byYear.has(year));
  if (missing.length)
    throw new Error(`${kind}: missing annual source files for ${missing.join(", ")}`);
  return byYear;
}

async function main() {
  const priorManifest = await verifyAcquiredSourceManifest();
  const twoPlusFiles = await filesFor("two-or-more");
  const singleFiles = await filesFor("single");
  const expenditureRows = [["year", "size", "category", "value_yen"]];
  const conditionalShareRows = [
    ["year", "size", "household_count_10000", "share_within_two_or_more", "source_stat_inf_id"],
  ];
  const sources = [];

  for (const year of YEARS) {
    const twoPlusFile = twoPlusFiles.get(year);
    const singleFile = singleFiles.get(year);
    const twoPlus = await workbookRows(twoPlusFile);
    const single = await workbookRows(singleFile);
    const totalIndex = twoPlus.rows.findIndex((row) => cellLabel(row, "消費支出"));
    const singleTotalIndex = single.rows.findIndex((row) => cellLabel(row, "消費支出"));
    if (totalIndex < 0 || singleTotalIndex < 0)
      throw new Error(`${year}: expenditure total missing`);
    const countsRow = twoPlus.rows.find((row) =>
      row.some((cell) => typeof cell === "string" && /世帯数分布/.test(cell)),
    );
    if (!countsRow)
      throw new Error(`${year}: household-size distribution row missing from table 3-1`);
    // Published 3-1 columns: average, 2, 3, 4, 5, 6+ persons.
    const counts = [countsRow[16], countsRow[17], countsRow[18], countsRow[19], countsRow[20]].map(
      (value, index) => numberCell(value, `${year} household distribution bin ${index + 2}`),
    );
    const count5Plus = counts[3] + counts[4];
    if (!(count5Plus > 0)) throw new Error(`${year}: 5+ household count is zero`);
    for (let index = 0; index < 5; index += 1) {
      conditionalShareRows.push([
        year,
        index + 2 === 6 ? "6+" : String(index + 2),
        counts[index],
        counts[index] / counts.reduce((sum, value) => sum + value, 0),
        path.basename(twoPlusFile).match(/-(\w+)\.xls$/)?.[1] ?? "",
      ]);
    }

    for (const category of LABELS) {
      const twoPlusRow = findAmountRow(twoPlus.rows, category, totalIndex);
      const onePersonRow = findAmountRow(single.rows, category, singleTotalIndex);
      expenditureRows.push([
        year,
        "1",
        category,
        numberCell(onePersonRow[16], `${year} single ${category}`),
      ]);
      const bySize = [
        twoPlusRow[16],
        twoPlusRow[17],
        twoPlusRow[18],
        twoPlusRow[19],
        twoPlusRow[20],
      ].map((value, index) => numberCell(value, `${year} two-plus ${category} size ${index + 2}`));
      const fivePlus = (counts[3] * bySize[3] + counts[4] * bySize[4]) / count5Plus;
      ["2", "3", "4", "5+"].forEach((size, index) =>
        expenditureRows.push([year, size, category, index < 3 ? bySize[index] : fivePlus]),
      );
    }

    const twoPlusStatInfId = path.basename(twoPlusFile).match(/-(\w+)\.xls$/)?.[1];
    const singleStatInfId = path.basename(singleFile).match(/-(\w+)\.xls$/)?.[1];
    sources.push({
      year,
      twoOrMore: {
        statInfId: twoPlusStatInfId,
        url: `https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=${twoPlusStatInfId}`,
        file: path.relative(ROOT, twoPlusFile),
        sha256: twoPlus.sha256,
        sheet: twoPlus.sheetName,
        table: "詳細結果表 年次 表番号3-1 世帯人員別 全国・二人以上の世帯",
      },
      single: {
        statInfId: singleStatInfId,
        url: `https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=${singleStatInfId}`,
        file: path.relative(ROOT, singleFile),
        sha256: single.sha256,
        sheet: single.sheetName,
        table: "単身世帯 詳細結果表 年次 表番号1 全世帯",
      },
    });
  }

  await mkdir(OUTPUT, { recursive: true });
  const expenditureCsv = csv(expenditureRows);
  const conditionalCsv = csv(conditionalShareRows);
  await writeFile(path.join(OUTPUT, "expenditure.csv"), expenditureCsv);
  await writeFile(path.join(OUTPUT, "two-plus-household-distribution.csv"), conditionalCsv);
  await writeFile(
    path.join(OUTPUT, "household-survey-panel-manifest.json"),
    `${JSON.stringify({ schemaVersion: "cti-size-composition-household-survey-panel-v1", sources, classifications: LABELS, classificationReference: "https://www.stat.go.jp/data/kakei/9.html", classificationBreaksToReview: [2005, 2007, 2010, 2015], output: { expenditureCsv: "expenditure.csv", conditionalTwoPlusDistributionCsv: "two-plus-household-distribution.csv", normalizedOutputs: { expenditureCsv: { path: "expenditure.csv", sha256: sha256(Buffer.from(expenditureCsv)) }, conditionalTwoPlusDistributionCsv: { path: "two-plus-household-distribution.csv", sha256: sha256(Buffer.from(conditionalCsv)) } }, unit: "yen per household per month", nominal: true, fivePlusAggregation: "within each two-or-more-household source table, average 5-person and 6+-person expenditures using the same year's table 3-1 adjusted household counts", categoryMatching: "exact top-level Japanese labels only; no CPI or real-value fields are used" }, caveats: priorManifest.caveats ?? ["Household Survey proxy; classification changes require review."] }, null, 2)}\n`,
  );
  process.stdout.write(`Wrote ${expenditureRows.length - 1} expenditure rows for 2005–2017.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
