#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";

export const SERIES = [
  {
    kind: "nominal",
    statInfId: "000040499070",
    label: "原数値",
    sheet: "二人以上・月(原)",
    title: "10大費目別 世帯消費動向指数（原数値）",
    headerRow: 9,
    dataRow: 10,
    timeCodeColumn: 7,
    monthColumn: 8,
    valueStart: 9,
    valueEnd: 30,
    codeRows: [0, 1],
  },
  {
    kind: "seasonallyAdjusted",
    statInfId: "000040499082",
    label: "季節調整値",
    sheet: "二人以上・月(季)",
    title: "10大費目別 世帯消費動向指数（季節調整値）",
    headerRow: 7,
    dataRow: 8,
    timeCodeColumn: 0,
    monthColumn: 1,
    valueStart: 2,
    valueEnd: 23,
    codeRows: [],
  },
];
export const endpoint = "https://www.e-stat.go.jp/stat-search/file-download?fileKind=0";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const monthNumber = (value) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5));
const sourceStart = "2002-01";
const requestedStart = "2005-01";
export const representativeMonths = ["2005-01", "2020-01", "2026-07"];
const missing = new Set(["", "-", "…", "na", "n/a"]);
const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const titleBase = "10大費目別世帯消費動向指数";
const valueTypes = SERIES.map(({ label }) => label);
const normalizeTitle = (value) => String(value ?? "").replace(/\s/g, "");
export function isExpectedTitle(value, series) {
  const title = normalizeTitle(value);
  return (
    title.includes(titleBase) &&
    title.includes(series.label) &&
    valueTypes.filter((label) => label !== series.label).every((label) => !title.includes(label))
  );
}
const parseMonth = (value) => {
  const match = String(value)
    .trim()
    .replace(/^'(.*)'$/, "$1")
    .match(/^(\d{4})[-年/]([0-9]{1,2})(?:月)?$/);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) throw new Error("invalid CTI month");
  return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}`;
};
const valueOf = (value, month) => {
  const raw = String(value ?? "")
    .trim()
    .replace(/,/g, "");
  if (missing.has(raw.toLowerCase())) return { rawValue: null, isMissing: true };
  const number = Number(raw);
  if (!Number.isFinite(number)) throw new Error(`CTI value is not numeric at ${month}`);
  return { rawValue: number, isMissing: false };
};
const csvEscape = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
export function parseOfficialFile(bytes, series) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array))
    throw new Error("CTI source is not binary");
  const buffer = Buffer.from(bytes);
  if (!buffer.subarray(0, 4).equals(zip)) throw new Error("CTI source is not an XLSX file");
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false, cellDates: false, WTF: true });
  if (!workbook.SheetNames.includes(series.sheet))
    throw new Error(`CTI source has unexpected sheet identity; expected ${series.sheet}`);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[series.sheet], {
    header: 1,
    raw: false,
    defval: "",
  });
  const titleCells = rows.flatMap((row) =>
    row
      .filter((cell) => normalizeTitle(cell).includes(titleBase))
      .map((cell) => String(cell).trim()),
  );
  if (
    !titleCells.some((title) => isExpectedTitle(title, series)) ||
    titleCells.some((title) =>
      valueTypes.some((label) => label !== series.label && normalizeTitle(title).includes(label)),
    )
  )
    throw new Error("CTI source title mismatch");
  const sourceTitle = titleCells.find((title) => isExpectedTitle(title, series));
  const header = rows[series.headerRow - 1] ?? [];
  const names = header
    .slice(series.valueStart, series.valueEnd + 1)
    .map((name) => String(name).trim());
  if (names.length !== 22 || names.some((name) => !name))
    throw new Error("CTI source must have exactly 22 series names");
  if (
    !String(header[series.monthColumn] ?? "").trim() ||
    !String(header[series.timeCodeColumn] ?? "").trim()
  )
    throw new Error("CTI source time columns are missing");
  const codes = series.codeRows.length
    ? names.map(
        (_, offset) =>
          series.codeRows
            .map((row) => String(rows[row]?.[series.valueStart + offset] ?? "").trim())
            .find(Boolean) ?? "",
      )
    : names.map(() => null);
  if (
    codes.some((code, index) =>
      series.codeRows.length ? code !== String(index + 1) : code !== null,
    )
  )
    throw new Error("CTI source series codes/order mismatch");
  const records = [];
  for (const row of rows.slice(series.dataRow - 1)) {
    const monthCell = String(row[series.monthColumn] ?? "").trim();
    if (!monthCell) continue;
    const month = parseMonth(monthCell);
    if (!String(row[series.timeCodeColumn] ?? "").trim())
      throw new Error(`CTI time code is missing at ${month}`);
    for (let offset = 0; offset < 22; offset += 1)
      records.push({
        variant: series.kind,
        seriesIndex: offset + 1,
        officialSeriesCode: codes[offset],
        seriesName: names[offset],
        month,
        ...valueOf(row[series.valueStart + offset], month),
      });
  }
  if (!records.length || records.some((record) => record.month < sourceStart))
    throw new Error(`CTI source does not start at ${sourceStart}`);
  for (const index of Array.from({ length: 22 }, (_, i) => i + 1)) {
    const list = records
      .filter((record) => record.seriesIndex === index)
      .sort((a, b) => monthNumber(a.month) - monthNumber(b.month));
    if (list[0]?.month !== sourceStart)
      throw new Error(`CTI source does not start at ${sourceStart}`);
    for (let i = 1; i < list.length; i += 1)
      if (monthNumber(list[i].month) !== monthNumber(list[i - 1].month) + 1)
        throw new Error(`CTI source months are not continuous at ${list[i].month}`);
    const adopted = list.filter((record) => record.month >= requestedStart);
    if (adopted[0]?.month !== requestedStart)
      throw new Error(`CTI requested series does not start at ${requestedStart}`);
    for (let i = 1; i < adopted.length; i += 1)
      if (monthNumber(adopted[i].month) !== monthNumber(adopted[i - 1].month) + 1)
        throw new Error(`CTI requested months are not continuous at ${adopted[i].month}`);
  }
  const seen = new Set();
  for (const record of records) {
    const key = `${record.seriesIndex}:${record.month}`;
    if (seen.has(key)) throw new Error(`CTI duplicate key ${key}`);
    seen.add(key);
  }
  return {
    sheetName: series.sheet,
    title: sourceTitle,
    series: names.map((seriesName, index) => ({
      seriesIndex: index + 1,
      officialSeriesCode: codes[index],
      seriesName,
    })),
    records,
  };
}
export const parseOfficialXls = parseOfficialFile;
export function normalizedCsv(records) {
  const adopted = records.filter((record) => record.month >= "2005-01");
  return (
    [
      "variant,series_index,official_series_code,series_name,month,raw_value,is_missing",
      ...adopted.map((record) =>
        [
          record.variant,
          record.seriesIndex,
          record.officialSeriesCode ?? "",
          record.seriesName,
          record.month,
          record.rawValue === null ? "" : record.rawValue,
          record.isMissing,
        ]
          .map(csvEscape)
          .join(","),
      ),
    ].join("\n") + "\n"
  );
}
const stableDisplayKey = (record) =>
  `cti-basic-${record.variant}-${String(record.seriesIndex).padStart(2, "0")}`;
export function seriesMapCsv(records) {
  const firstByKey = new Map();
  for (const record of records) firstByKey.set(`${record.variant}:${record.seriesIndex}`, record);
  const rows = [];
  for (const variant of ["nominal", "seasonallyAdjusted"])
    for (let seriesIndex = 1; seriesIndex <= 22; seriesIndex += 1) {
      const record = firstByKey.get(`${variant}:${seriesIndex}`);
      if (!record) throw new Error(`CTI series map is missing ${variant}:${seriesIndex}`);
      rows.push(
        [
          record.variant,
          record.seriesIndex,
          record.officialSeriesCode ?? "",
          record.seriesName,
          stableDisplayKey(record),
        ]
          .map(csvEscape)
          .join(","),
      );
    }
  return (
    ["variant,series_index,official_series_code,series_name,stable_display_key", ...rows].join(
      "\n",
    ) + "\n"
  );
}
export function representativeSnapshotCsv(records) {
  const selected = records.filter((record) => representativeMonths.includes(record.month));
  if (selected.length !== 2 * 22 * representativeMonths.length)
    throw new Error("CTI representative snapshot is incomplete");
  return (
    [
      "variant,series_index,series_name,month,raw_value,is_missing",
      ...selected.map((record) =>
        [
          record.variant,
          record.seriesIndex,
          record.seriesName,
          record.month,
          record.rawValue === null ? "" : record.rawValue,
          record.isMissing,
        ]
          .map(csvEscape)
          .join(","),
      ),
    ].join("\n") + "\n"
  );
}
async function download(url, timeoutMs, retries, fetcher = fetch) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const type = response.headers.get("content-type")?.toLowerCase() ?? "";
      const disposition = response.headers.get("content-disposition")?.slice(0, 300) ?? null;
      if (!bytes.length || type.includes("text/html") || !bytes.subarray(0, 4).equals(zip))
        throw new Error("e-Stat response is HTML, empty, 404, or not an XLSX file");
      return {
        bytes,
        contentType: type,
        contentDisposition: disposition,
        lastModified: response.headers.get("last-modified")?.slice(0, 100) ?? null,
      };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  throw new Error(`download failed: ${lastError?.message}`);
}
function metadataFor(series, raw, normalized, retrievedAt, parsed, response) {
  const rawFile = `${series.statInfId}.raw`;
  const normalizedFile = `${series.statInfId}.normalized.csv`;
  const metadataFile = `${series.statInfId}.metadata.json`;
  const adopted = parsed.records.filter((record) => record.month >= "2005-01");
  return {
    status: "ready",
    statisticName: "2025年基準 消費動向指数",
    governmentStatisticsCode: "00200567",
    baseYear: 2025,
    unit: "指数",
    statInfId: series.statInfId,
    seriesKind: series.kind,
    seriesLabel: series.label,
    householdScope: "二人以上の世帯",
    valueType: series.label,
    sourceTitle: parsed.title,
    frequency: "monthly",
    sourceStart: "2002-01",
    requestedStart: "2005-01",
    availabilityStart: "2002-01",
    retrieval: { retrievedAt, updatedAt: response.lastModified },
    officialUrl: `${endpoint}&statInfId=${series.statInfId}`,
    encoding: "binary/official",
    rawFile,
    normalizedFile,
    metadataFile,
    rawBytes: raw.length,
    normalizedBytes: Buffer.byteLength(normalized),
    parserVersion: "xlsx-0.20.3",
    transformVersion: "cti-basic-2025-long-term-v2",
    sourceHeaders: {
      contentType: response.contentType,
      contentDisposition: response.contentDisposition,
      lastModified: response.lastModified,
    },
    rawSha256: digest(raw),
    normalizedSha256: digest(Buffer.from(normalized)),
    latestPublishedMonth: adopted.at(-1)?.month ?? null,
    rowCount: adopted.length,
    seriesCount: 22,
    series: parsed.series,
    validation: {
      ok: true,
      checks: ["identity", "format", "schema", "period", "continuity", "duplicates", "sha256"],
    },
    unavailable: { periods: [], reason: null },
  };
}
async function publishAtomically(root, staging) {
  const backup = `${root}.previous-${process.pid}`;
  let moved = false;
  await mkdir(path.dirname(root), { recursive: true });
  try {
    await rm(backup, { recursive: true, force: true });
    try {
      await rename(root, backup);
      moved = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await rename(staging, root);
    if (moved) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    try {
      await rm(root, { recursive: true, force: true });
      if (moved) await rename(backup, root);
    } catch {}
    throw error;
  }
}
export async function buildSnapshot(root, appId, options = {}) {
  if (typeof appId !== "string" || !appId)
    throw new Error("e-Stat app ID is required; it is never printed or persisted");
  await mkdir(path.dirname(root), { recursive: true });
  const staging = await mkdtemp(path.join(path.dirname(root), ".cti-2025-"));
  const retrievedAt = new Date().toISOString();
  try {
    const files = [];
    const allRecords = [];
    for (const series of SERIES) {
      const response = await download(
        `${endpoint}&statInfId=${series.statInfId}`,
        Number(options.timeoutMs ?? 30000),
        Math.max(0, Math.min(5, Number(options.retries ?? 3))),
        options.fetcher,
      );
      const parsed = parseOfficialFile(response.bytes, series);
      allRecords.push(...parsed.records);
      const normalized = normalizedCsv(parsed.records);
      const meta = metadataFor(series, response.bytes, normalized, retrievedAt, parsed, response);
      await writeFile(path.join(staging, meta.rawFile), response.bytes);
      await writeFile(path.join(staging, meta.normalizedFile), normalized);
      await writeFile(path.join(staging, meta.metadataFile), `${JSON.stringify(meta, null, 2)}\n`);
      files.push({
        statInfId: series.statInfId,
        seriesKind: series.kind,
        rawFile: meta.rawFile,
        normalizedFile: meta.normalizedFile,
        metadataFile: meta.metadataFile,
        rawSha256: meta.rawSha256,
        normalizedSha256: meta.normalizedSha256,
        metadataSha256: digest(Buffer.from(JSON.stringify(meta, null, 2) + "\n")),
      });
    }
    const derivedFiles = [];
    const derived = [
      ["series-map.csv", seriesMapCsv(allRecords)],
      ["representative-snapshot.csv", representativeSnapshotCsv(allRecords)],
    ];
    for (const [file, content] of derived) {
      await writeFile(path.join(staging, file), content);
      derivedFiles.push({ file, sha256: digest(Buffer.from(content)) });
    }
    for (const item of files) {
      if (
        digest(await readFile(path.join(staging, item.rawFile))) !== item.rawSha256 ||
        digest(await readFile(path.join(staging, item.normalizedFile))) !== item.normalizedSha256 ||
        digest(await readFile(path.join(staging, item.metadataFile))) !== item.metadataSha256
      )
        throw new Error("artifact hash validation failed");
    }
    for (const item of derivedFiles)
      if (digest(await readFile(path.join(staging, item.file))) !== item.sha256)
        throw new Error("artifact hash validation failed");
    await writeFile(
      path.join(staging, "manifest.json"),
      `${JSON.stringify({ schemaVersion: 1, generatedAt: retrievedAt, files, derivedFiles }, null, 2)}\n`,
    );
    await publishAtomically(root, staging);
    return { schemaVersion: 1, generatedAt: retrievedAt, files, derivedFiles };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const appId = process.env.ESTAT_APP_ID;
  const root = path.resolve(
    process.env.CTI_2025_OUTPUT_DIR ?? "data/source/official-cti-2025-long-term",
  );
  await buildSnapshot(root, appId, {
    timeoutMs: process.env.ESTAT_TIMEOUT_MS,
    retries: process.env.ESTAT_RETRIES,
  });
  console.log(`CTI 2025 snapshot published atomically: ${root}`);
}
