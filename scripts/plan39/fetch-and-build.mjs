#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";

const SOURCES = {
  B: {
    statInfId: "000040499069",
    url: "https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=000040499069",
    sheet: "総・年",
    table: "第１－１－１表",
    start: 2002,
  },
  A: {
    statInfId: "000040499087",
    url: "https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=000040499087",
    sheet: "総・年",
    table: "第２－１－１表",
    start: 2017,
  },
  L: {
    statInfId: null,
    url: "https://www.stat.go.jp/data/kakei/longtime/zuhyou/lev-jnb.xls",
    sheet: "原指数(年)",
    start: 1981,
  },
};
const categories = [
  "総合",
  "食料",
  "住居",
  "光熱・水道",
  "家具・家事用品",
  "被服及び履物",
  "保健医療",
  "交通・通信",
  "教育",
  "教養娯楽",
];
const sourceHash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const parseNumber = (value) => {
  const text = String(value ?? "")
    .trim()
    .replace(/,/g, "");
  if (!text || text === "-") return null;
  const number = Number(text);
  if (!Number.isFinite(number)) throw new Error(`non-finite value: ${text}`);
  return number;
};
const args = new Map(
  process.argv
    .slice(2)
    .map((value, index, values) => (value.startsWith("--") ? [value, values[index + 1]] : [])),
);
const inputDir = args.get("--input-dir") ?? path.resolve("/tmp/plan39-fetch");
const outputDir = args.get("--output-dir") ?? path.resolve("data/source/cti-adjusted");
const revision = args.get("--revision") ?? new Date().toISOString().slice(0, 10);
const readSource = async (kind) => {
  const file = path.join(inputDir, `${kind}.download`);
  try {
    return await readFile(file);
  } catch {
    throw new Error(`missing downloaded source: ${file}`);
  }
};
const workbookRows = (bytes, sheet) => {
  const workbook = XLSX.read(bytes, { type: "buffer", raw: false, cellDates: false, WTF: true });
  if (!workbook.SheetNames.includes(sheet)) throw new Error(`missing expected sheet: ${sheet}`);
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, raw: false, defval: "" });
};
const parseCti = (kind, bytes) => {
  const source = SOURCES[kind];
  const rows = workbookRows(bytes, source.sheet);
  const header = rows[8] ?? [];
  const title = String(rows[5]?.[8] ?? "");
  if (
    String(rows[4]?.[8] ?? "") !== source.table ||
    !title.includes("10大費目別") ||
    String(rows[6]?.[7] ?? "").trim() !== "総世帯"
  )
    throw new Error(`${kind}: table/title/household mismatch`);
  if (!String(rows[7]?.[7] ?? "").includes("2025年消費支出平均月額=100"))
    throw new Error(`${kind}: index basis mismatch`);
  const expected = [
    "消費支出（実質）",
    ...categories.slice(1).map((category) => `${category}（実質）`),
    "その他の消費支出（実質）",
  ];
  if (header.slice(20, 31).join("\u0000") !== expected.join("\u0000"))
    throw new Error(`${kind}: real annual category header mismatch`);
  const parsed = [];
  for (const row of rows.slice(9)) {
    const yearText = String(row[8] ?? "")
      .replace(/年/g, "")
      .trim();
    if (!/^\d{4}$/.test(yearText)) continue;
    const year = Number(yearText);
    if (parsed.some((item) => item.year === year))
      throw new Error(`${kind}: duplicate year ${year}`);
    const values = Object.fromEntries(
      categories.map((category, index) => [category, parseNumber(row[20 + index])]),
    );
    parsed.push({ year, values });
  }
  const years = parsed.map(({ year }) => year);
  if (
    !years.length ||
    years[0] !== source.start ||
    years.some((year, index) => index && year !== years[index - 1] + 1)
  )
    throw new Error(`${kind}: non-continuous annual range`);
  return {
    rows: parsed,
    rawRange: { startYear: years[0], endYear: years.at(-1) },
    missingCount: parsed
      .flatMap(({ values }) => Object.values(values))
      .filter((value) => value === null).length,
  };
};
const parseLegacy = (bytes) => {
  const rows = workbookRows(bytes, SOURCES.L.sheet);
  const parsed = [];
  for (const row of rows.slice(7)) {
    const yearText = String(row[3] ?? "").trim();
    if (!/^\d{4}$/.test(yearText)) continue;
    const year = Number(yearText);
    if (parsed.some((item) => item.year === year)) throw new Error(`L: duplicate year ${year}`);
    const values = Object.fromEntries(
      categories.map((category, index) => [category, parseNumber(row[6 + index])]),
    );
    parsed.push({ year, values });
    if (parsed.length === 38) break;
  }
  const years = parsed.map(({ year }) => year);
  if (
    years[0] !== 1981 ||
    years.at(-1) !== 2018 ||
    years.length !== 38 ||
    years.some((year, index) => index && year !== years[index - 1] + 1)
  )
    throw new Error("L: expected complete 1981-2018 annual range");
  if (parsed.some(({ values }) => Object.values(values).some((value) => value === null)))
    throw new Error("L: missing annual index value");
  return { rows: parsed, rawRange: { startYear: 1981, endYear: 2018 }, missingCount: 0 };
};
const metadata = (kind, source, bytes, parsed, artifact) => ({
  schemaVersion: "plan39-annual-v1",
  revision,
  statisticalCode: "00200567",
  source: kind === "L" ? "総務省統計局 家計調査 長期時系列" : "総務省統計局 e-Stat CTI",
  artifact,
  artifactIdentifier: SOURCES[kind].statInfId ?? "lev-jnb.xls",
  officialPageUrl: SOURCES[kind].url,
  downloadUrl: SOURCES[kind].url,
  statInfId: SOURCES[kind].statInfId,
  retrievedAt: new Date().toISOString(),
  baseYear: 2025,
  unit: "指数",
  valueType: kind === "L" ? "原指数" : "原数値（指数）",
  householdScope: kind === "L" ? "二人以上の世帯（世帯人員及び世帯主の年齢分布調整済）" : "総世帯",
  frequency: "annual",
  rawRange: parsed.rawRange,
  adoptedRange: parsed.rawRange,
  yearization: null,
  missingRepresentation: "- は null。補完・補間なし。",
  sha256: sourceHash(bytes),
  sourceSha256: sourceHash(bytes),
  sourceFormat: kind === "L" ? "xls" : "xlsx",
});
const main = async () => {
  await mkdir(outputDir, { recursive: true });
  const manifest = {
    schemaVersion: "plan39-annual-v1",
    revision,
    statisticalCode: "00200567",
    artifacts: {},
    definitions: {
      B: "表1-1-1 基本系列 年平均・総世帯・2025年消費支出平均月額=100",
      A: "表2-1-1 調整系列 年平均・総世帯・2025年消費支出平均月額=100",
      L: "消費水準指数（世帯人員及び世帯主の年齢分布調整済）二人以上の世帯・原指数年平均",
    },
  };
  const audit = {
    revision,
    retrievedAt: new Date().toISOString(),
    sources: {},
    validation: { status: "ready", reasons: [] },
  };
  for (const kind of ["B", "A", "L"]) {
    const bytes = await readSource(kind);
    const parsed = kind === "L" ? parseLegacy(bytes) : parseCti(kind, bytes);
    const artifact = `${kind}.json`;
    const body = {
      metadata: metadata(kind, SOURCES[kind], bytes, parsed, artifact),
      categoryOrder: categories,
      rows: parsed.rows,
    };
    const encoded = `${JSON.stringify(body, null, 2)}\n`;
    await writeFile(path.join(outputDir, artifact), encoded);
    const sha256 = sourceHash(Buffer.from(encoded));
    manifest.artifacts[kind] = {
      path: artifact,
      sha256,
      statInfId: SOURCES[kind].statInfId,
      sourceUrl: SOURCES[kind].url,
      status: "ready",
    };
    audit.sources[kind] = {
      sourceUrl: SOURCES[kind].url,
      sourceFormat: kind === "L" ? "xls" : "xlsx",
      sourceSha256: sourceHash(bytes),
      artifactSha256: sha256,
      rawRange: parsed.rawRange,
      rows: parsed.rows.length,
      missingValues: parsed.missingCount,
    };
  }
  await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(outputDir, "audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
};
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
