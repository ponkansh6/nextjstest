#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";
import {
  ADJUSTED_CTI_ANNUAL_SCHEMA,
  ADJUSTED_CTI_QUARTERLY_NOMINAL_SCHEMA,
} from "../../shared/cti-contract-schemas.mjs";

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
    quarterlySheet: "総・四(原)",
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
const quarterlyCategories = [...categories, "その他の消費支出"];
const quarterlyColumnMapping = [
  { column: "B", header: null, canonicalSeries: "period", sourceRole: "coded_period" },
  { column: "H", header: "時間軸コード", canonicalSeries: "period", sourceRole: "period_code" },
  { column: "I", header: "四半期平均", canonicalSeries: "period", sourceRole: "period_label" },
  ...categories.map((category, index) => ({
    column: XLSX.utils.encode_col(9 + index),
    header: `${category === "総合" ? "消費支出" : category}（名目）`,
    canonicalSeries: category,
    normalizedColumn: category,
    sourceRole: category === "総合" ? "official_total" : "official_nominal_observation",
  })),
  {
    column: "T",
    header: "その他の消費支出（名目）",
    canonicalSeries: "その他の消費支出",
    normalizedColumn: "その他の消費支出",
    sourceRole: "unpublished_derived_residual",
    sourceValue: "-",
    derivation: "J (official total) minus K:S (nine official nominal categories)",
  },
];
const sourceHash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const writeJsonAtomic = async (file, value) => {
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
};
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
    "消費支出（名目）",
    ...categories.slice(1).map((category) => `${category}（名目）`),
    "その他の消費支出（名目）",
  ];
  if (header.slice(9, 20).join("\u0000") !== expected.join("\u0000"))
    throw new Error(`${kind}: nominal annual category header mismatch`);
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
      categories.map((category, index) => [category, parseNumber(row[9 + index])]),
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
const parseCtiQuarterly = (bytes) => {
  const source = SOURCES.A;
  const rows = workbookRows(bytes, source.quarterlySheet);
  const header = rows[8] ?? [];
  const title = String(rows[5]?.[8] ?? "");
  if (
    String(rows[4]?.[8] ?? "") !== source.table ||
    !title.includes("10大費目別") ||
    !title.includes("分布調整値（原数値）") ||
    String(rows[6]?.[7] ?? "").trim() !== "総世帯"
  )
    throw new Error("A quarterly: table/title/household mismatch");
  if (!String(rows[7]?.[7] ?? "").includes("2025年消費支出平均月額=100"))
    throw new Error("A quarterly: index basis mismatch");
  const expected = [
    "消費支出（名目）",
    ...categories.slice(1).map((category) => `${category}（名目）`),
    "その他の消費支出（名目）",
  ];
  if (header.slice(9, 20).join("\u0000") !== expected.join("\u0000"))
    throw new Error("A quarterly: nominal quarterly category header mismatch");
  const parsed = [];
  for (const row of rows.slice(9)) {
    const periodCode = String(row[1] ?? "").trim();
    const match = periodCode.match(/^(\d{4})Q([1-4])B$/);
    if (!match) continue;
    const year = Number(match[1]);
    const quarter = Number(match[2]);
    const label = `${year}Q${quarter}`;
    if (parsed.some((item) => item.label === label))
      throw new Error(`A quarterly: duplicate period ${label}`);
    if (String(row[8] ?? "").trim() !== `${year}年${(quarter - 1) * 3 + 1}-${quarter * 3}月`)
      throw new Error(`A quarterly: period label mismatch ${label}`);
    const values = Object.fromEntries(
      quarterlyCategories.map((category, index) => [category, parseNumber(row[9 + index])]),
    );
    parsed.push({ year, quarter, label, values });
  }
  const periodIndex = ({ year, quarter }) => year * 4 + quarter - 1;
  if (
    parsed.length === 0 ||
    parsed[0].label !== "2017Q1" ||
    parsed.some(
      (item, index) => index > 0 && periodIndex(item) !== periodIndex(parsed[index - 1]) + 1,
    ) ||
    parsed.some(({ values }) => categories.some((category) => values[category] === null))
  )
    throw new Error("A quarterly: expected continuous nominal quarters from 2017Q1");
  return {
    rows: parsed,
    rawRange: { start: parsed[0].label, end: parsed.at(-1).label, rows: parsed.length },
    missingCount: parsed
      .flatMap(({ values }) => Object.values(values))
      .filter((value) => value === null).length,
  };
};
const csvCell = (value) => {
  const text = value === null || value === undefined ? "-" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
const metadata = (
  kind,
  source,
  bytes,
  parsed,
  artifact,
  revisionValue = revision,
  retrievedAt = new Date().toISOString(),
  sourceIdentity = null,
) => ({
  schemaVersion: ADJUSTED_CTI_ANNUAL_SCHEMA.canonical,
  revision: revisionValue,
  statisticalCode: "00200567",
  source: kind === "L" ? "総務省統計局 家計調査 長期時系列" : "総務省統計局 e-Stat CTI",
  artifact,
  artifactIdentifier: SOURCES[kind].statInfId ?? "lev-jnb.xls",
  officialPageUrl: SOURCES[kind].url,
  downloadUrl: SOURCES[kind].url,
  downloadUrlHash: sourceHash(Buffer.from(sourceIdentity?.url ?? SOURCES[kind].url)),
  statInfId: SOURCES[kind].statInfId,
  legacyStatInfId: sourceIdentity?.legacyStatInfId ?? null,
  logicalSourceStatInfId: SOURCES[kind].statInfId,
  sourceIdentity: sourceIdentity
    ? {
        kind: "estat-catalog-resource",
        catalogResourceId: sourceIdentity.catalogResourceId,
        legacyStatInfId: sourceIdentity.legacyStatInfId ?? null,
        downloadUrlHash: sourceHash(Buffer.from(sourceIdentity.url)),
        title: sourceIdentity.semantic?.title ?? null,
        format: sourceIdentity.semantic?.format ?? null,
        releaseDate: sourceIdentity.semantic?.releaseDate ?? null,
        lastModifiedDate: sourceIdentity.semantic?.lastModifiedDate ?? null,
      }
    : {
        kind: "legacy-stat-inf-id",
        logicalSourceStatInfId: SOURCES[kind].statInfId,
        legacyStatInfId: SOURCES[kind].statInfId,
      },
  retrievedAt,
  baseYear: 2025,
  unit: "指数",
  valueType: kind === "L" ? "原指数" : "原数値（名目指数）",
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

/**
 * @typedef {{ title?: string | null, format?: string | null, releaseDate?: string | null, lastModifiedDate?: string | null }} Plan39SourceSemantics
 * @typedef {{ url?: string, catalogResourceId?: string | null, legacyStatInfId?: string | null, semantic?: Plan39SourceSemantics }} Plan39SourceIdentity
 * @typedef {{ stageRoot: string, sources: { B: Buffer | Uint8Array, A: Buffer | Uint8Array }, pinnedLegacyArtifactBytes: Buffer | Uint8Array, revision: string, retrievedAt?: string, sourceRevisionAudit?: Record<string, unknown>, sourceIdentities?: Record<string, Plan39SourceIdentity> }} Plan39CtiBuildOptions
 * @typedef {{ path: string, bytes: Buffer }} Plan39BuiltArtifact
 * @typedef {{ schemaVersion: string, revision: string, statisticalCode: string, artifacts: Record<string, { sha256: string }> }} Plan39CtiBuildManifest
 *
 * Pure Plan39 CTI artifact builder for callers that own a staging root.
 * @param {Plan39CtiBuildOptions} options
 * @returns {{ artifacts: Plan39BuiltArtifact[], manifest: Plan39CtiBuildManifest, audit: Record<string, unknown>, semanticValue: Record<string, unknown> }}
 */
export function buildPlan39CtiArtifacts({
  stageRoot,
  sources,
  pinnedLegacyArtifactBytes,
  revision: revisionValue,
  retrievedAt = new Date().toISOString(),
  sourceRevisionAudit = {},
  sourceIdentities = {},
} = {}) {
  if (typeof stageRoot !== "string" || !stageRoot)
    throw new Error("explicit Plan39 staging root is required");
  if (!revisionValue || !/^\d{4}-\d{2}-\d{2}$/.test(revisionValue))
    throw new Error("Plan39 revision must be YYYY-MM-DD");
  const artifacts = [];
  const manifest = {
    schemaVersion: ADJUSTED_CTI_ANNUAL_SCHEMA.canonical,
    revision: revisionValue,
    statisticalCode: "00200567",
    artifacts: {},
    definitions: {
      B: "表1-1-1 基本系列・名目 年平均・総世帯・2025年消費支出平均月額=100",
      A: "表2-1-1 調整系列・名目 年平均・総世帯・2025年消費支出平均月額=100",
      L: "消費水準指数（世帯人員及び世帯主の年齢分布調整済）二人以上の世帯・原指数年平均・V2計算非使用",
    },
  };
  const audit = {
    revision: revisionValue,
    retrievedAt,
    sources: {},
    sourceRevisionAudit,
    validation: { status: "ready", reasons: [] },
  };
  for (const kind of ["B", "A"]) {
    const bytes = Buffer.from(sources?.[kind] ?? []);
    if (!bytes.length) throw new Error(`missing Plan39 source bytes for ${kind}`);
    const parsed = parseCti(kind, bytes);
    const artifact = `${kind}.json`;
    const sourceId = SOURCES[kind].statInfId;
    const identity = sourceIdentities[sourceId] ?? null;
    const sourceMeta = metadata(
      kind,
      SOURCES[kind],
      bytes,
      parsed,
      artifact,
      revisionValue,
      retrievedAt,
      identity,
    );
    const body = {
      metadata: { ...sourceMeta, sourceRevisionAudit: sourceRevisionAudit[sourceId] ?? null },
      categoryOrder: categories,
      rows: parsed.rows,
    };
    const encoded = Buffer.from(`${JSON.stringify(body, null, 2)}\n`);
    const sha256 = sourceHash(encoded);
    artifacts.push({ path: `data/source/cti-adjusted/${artifact}`, bytes: encoded });
    manifest.artifacts[kind] = {
      path: artifact,
      sha256,
      revision: revisionValue,
      statInfId: sourceId,
      logicalSourceStatInfId: sourceId,
      catalogResourceId: identity?.catalogResourceId ?? null,
      legacyStatInfId: identity?.legacyStatInfId ?? null,
      downloadUrlHash: sourceHash(Buffer.from(identity?.url ?? SOURCES[kind].url)),
      status: "ready",
    };
    audit.sources[kind] = {
      catalogResourceId: identity?.catalogResourceId ?? null,
      legacyStatInfId: identity?.legacyStatInfId ?? null,
      logicalSourceStatInfId: sourceId,
      downloadUrlHash: sourceHash(Buffer.from(identity?.url ?? SOURCES[kind].url)),
      sourceFormat: "xlsx",
      sourceSha256: sourceHash(bytes),
      artifactSha256: sha256,
      rawRange: parsed.rawRange,
      rows: parsed.rows.length,
      missingValues: parsed.missingCount,
    };
  }
  const legacyBytes = Buffer.from(pinnedLegacyArtifactBytes ?? []);
  if (
    !legacyBytes.length ||
    sourceHash(legacyBytes) !== "26902849c7d835a1dcf3db130384600d0f853907fac927e7942fb806e2eec076"
  )
    throw new Error("pinned Plan39 L artifact is missing or has an unknown hash");
  const legacy = JSON.parse(legacyBytes.toString("utf8"));
  if (legacy.metadata?.artifact !== "L.json" || legacy.metadata?.statInfId !== null)
    throw new Error("pinned Plan39 L artifact identity mismatch");
  artifacts.push({ path: "data/source/cti-adjusted/L.json", bytes: legacyBytes });
  manifest.artifacts.L = {
    path: "L.json",
    sha256: sourceHash(legacyBytes),
    statInfId: null,
    sourceUrl: "https://www.stat.go.jp/data/kakei/longtime/zuhyou/lev-jnb.xls",
    status: "ready",
    revision: legacy.metadata.revision ?? "2026-09-20",
  };
  audit.sources.L = {
    sourceUrl: "https://www.stat.go.jp/data/kakei/longtime/zuhyou/lev-jnb.xls",
    sourceFormat: "pinned-json-artifact",
    sourceSha256: legacy.metadata.sourceSha256,
    artifactSha256: sourceHash(legacyBytes),
    rawRange: legacy.metadata.rawRange,
    rows: legacy.rows?.length ?? 0,
    missingValues: 0,
  };
  const aBytes = Buffer.from(sources?.A ?? []);
  if (!aBytes.length) throw new Error("missing Plan39 source bytes for A");
  const quarterly = parseCtiQuarterly(aBytes);
  const quarterlyCsv = Buffer.from(
    [
      ["period", ...quarterlyCategories].map(csvCell).join(","),
      ...quarterly.rows.map(({ label, values }) =>
        [label, ...quarterlyCategories.map((category) => values[category])].map(csvCell).join(","),
      ),
    ].join("\n") + "\n",
  );
  const quarterlyMetadata = {
    schemaVersion: ADJUSTED_CTI_QUARTERLY_NOMINAL_SCHEMA.canonical,
    revision: revisionValue,
    statisticalCode: "00200567",
    source: "総務省統計局 e-Stat CTI",
    artifact: "cti_data2025_distribution_adjusted_quarterly.csv",
    artifactIdentifier: SOURCES.A.statInfId,
    officialPageUrl: SOURCES.A.url,
    downloadUrl: SOURCES.A.url,
    downloadUrlHash: sourceHash(
      Buffer.from(sourceIdentities[SOURCES.A.statInfId]?.url ?? SOURCES.A.url),
    ),
    statInfId: SOURCES.A.statInfId,
    legacyStatInfId: sourceIdentities[SOURCES.A.statInfId]?.legacyStatInfId ?? null,
    logicalSourceStatInfId: SOURCES.A.statInfId,
    sourceIdentity: sourceIdentities[SOURCES.A.statInfId]
      ? {
          kind: "estat-catalog-resource",
          catalogResourceId: sourceIdentities[SOURCES.A.statInfId].catalogResourceId,
          legacyStatInfId: sourceIdentities[SOURCES.A.statInfId].legacyStatInfId ?? null,
          downloadUrlHash: sourceHash(Buffer.from(sourceIdentities[SOURCES.A.statInfId].url)),
          title: sourceIdentities[SOURCES.A.statInfId].semantic?.title ?? null,
          format: sourceIdentities[SOURCES.A.statInfId].semantic?.format ?? null,
          releaseDate: sourceIdentities[SOURCES.A.statInfId].semantic?.releaseDate ?? null,
          lastModifiedDate:
            sourceIdentities[SOURCES.A.statInfId].semantic?.lastModifiedDate ?? null,
        }
      : {
          kind: "legacy-stat-inf-id",
          logicalSourceStatInfId: SOURCES.A.statInfId,
          legacyStatInfId: SOURCES.A.statInfId,
        },
    retrievedAt,
    baseYear: 2025,
    unit: "指数",
    valueType: "原数値（名目指数）",
    seriesClassification: "調整系列・分布調整値（原数値）",
    householdScope: "総世帯",
    frequency: "quarterly",
    rawRange: quarterly.rawRange,
    adoptedRange: quarterly.rawRange,
    missingRepresentation:
      "- は未公表値。補完・補間なし。その他は公式表の未公表値を補完せず、表示時に総合−他9費目の残差として導出。",
    sha256: sourceHash(aBytes),
    sourceSha256: sourceHash(aBytes),
    csvSha256: sourceHash(quarterlyCsv),
    sourceFormat: "xlsx",
    sourceSheet: SOURCES.A.quarterlySheet,
    sourceWorkbook: {
      path: "data/source/official-cti-2025/cti-distribution-adjusted-000040499087.xlsx",
      fileName: "cti-distribution-adjusted-000040499087.xlsx",
    },
    columnMapping: quarterlyColumnMapping,
    sourceRevisionAudit: sourceRevisionAudit[SOURCES.A.statInfId] ?? null,
  };
  const quarterlyMetadataBytes = Buffer.from(`${JSON.stringify(quarterlyMetadata, null, 2)}\n`);
  const csvHash = sourceHash(quarterlyCsv),
    metadataHash = sourceHash(quarterlyMetadataBytes);
  artifacts.push({
    path: "data/source/cti_data2025_distribution_adjusted_quarterly.csv",
    bytes: quarterlyCsv,
  });
  artifacts.push({
    path: "data/source/cti_data2025_distribution_adjusted_quarterly.metadata.json",
    bytes: quarterlyMetadataBytes,
  });
  const quarterlyIdentity = sourceIdentities[SOURCES.A.statInfId];
  manifest.artifacts.quarterlyNominal = {
    path: "../cti_data2025_distribution_adjusted_quarterly.csv",
    metadataPath: "../cti_data2025_distribution_adjusted_quarterly.metadata.json",
    sha256: csvHash,
    metadataSha256: metadataHash,
    revision: revisionValue,
    statInfId: SOURCES.A.statInfId,
    logicalSourceStatInfId: SOURCES.A.statInfId,
    catalogResourceId: quarterlyIdentity?.catalogResourceId ?? null,
    legacyStatInfId: quarterlyIdentity?.legacyStatInfId ?? null,
    downloadUrlHash: sourceHash(Buffer.from(quarterlyIdentity?.url ?? SOURCES.A.url)),
    sourceSha256: sourceHash(aBytes),
    status: "ready",
  };
  audit.sources.quarterlyNominal = {
    catalogResourceId: quarterlyIdentity?.catalogResourceId ?? null,
    legacyStatInfId: quarterlyIdentity?.legacyStatInfId ?? null,
    logicalSourceStatInfId: SOURCES.A.statInfId,
    downloadUrlHash: sourceHash(Buffer.from(quarterlyIdentity?.url ?? SOURCES.A.url)),
    sourceFormat: "xlsx",
    sourceSheet: SOURCES.A.quarterlySheet,
    sourceSha256: sourceHash(aBytes),
    artifactSha256: csvHash,
    metadataSha256: metadataHash,
    rawRange: quarterly.rawRange,
    rows: quarterly.rows.length,
    missingValues: quarterly.missingCount,
  };
  artifacts.push({
    path: "data/source/cti-adjusted/audit.json",
    bytes: Buffer.from(`${JSON.stringify(audit, null, 2)}\n`),
  });
  artifacts.push({
    path: "data/source/cti-adjusted/manifest.json",
    bytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
  });
  return {
    artifacts,
    manifest,
    audit,
    semanticValue: {
      revision: revisionValue,
      artifacts: Object.fromEntries(
        Object.entries(manifest.artifacts).map(([key, item]) => [key, item.sha256]),
      ),
    },
  };
}
const main = async () => {
  await mkdir(outputDir, { recursive: true });
  const manifest = {
    schemaVersion: ADJUSTED_CTI_ANNUAL_SCHEMA.canonical,
    revision,
    statisticalCode: "00200567",
    artifacts: {},
    definitions: {
      B: "表1-1-1 基本系列・名目 年平均・総世帯・2025年消費支出平均月額=100",
      A: "表2-1-1 調整系列・名目 年平均・総世帯・2025年消費支出平均月額=100",
      L: "消費水準指数（世帯人員及び世帯主の年齢分布調整済）二人以上の世帯・原指数年平均・V2計算非使用",
    },
  };
  const audit = {
    revision,
    retrievedAt: new Date().toISOString(),
    sources: {},
    validation: { status: "ready", reasons: [] },
  };
  if (!args.has("--quarterly-only"))
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
        revision,
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
  const aBytes = await readSource("A");
  const quarterly = parseCtiQuarterly(aBytes);
  const quarterlyArtifact = "../cti_data2025_distribution_adjusted_quarterly.csv";
  const quarterlyMetadataArtifact = "../cti_data2025_distribution_adjusted_quarterly.metadata.json";
  const quarterlyCsv =
    [
      ["period", ...quarterlyCategories].map(csvCell).join(","),
      ...quarterly.rows.map(({ label, values }) =>
        [label, ...quarterlyCategories.map((category) => values[category])].map(csvCell).join(","),
      ),
    ].join("\n") + "\n";
  let quarterlyOnlyManifest;
  let quarterlyOnlyAudit;
  if (args.has("--quarterly-only")) {
    const existingManifest = JSON.parse(
      await readFile(path.join(outputDir, "manifest.json"), "utf8"),
    );
    quarterlyOnlyAudit = JSON.parse(await readFile(path.join(outputDir, "audit.json"), "utf8"));
    const annualABytes = await readFile(path.join(outputDir, "A.json"));
    const annualA = JSON.parse(annualABytes.toString("utf8"));
    if (
      existingManifest.revision !== revision ||
      (existingManifest.artifacts?.A?.revision ?? existingManifest.revision) !== revision ||
      existingManifest.artifacts?.A?.sha256 !== sourceHash(annualABytes) ||
      annualA.metadata?.revision !== revision ||
      annualA.metadata?.sourceSha256 !== sourceHash(aBytes)
    )
      throw new Error(
        "quarterly-only build requires annual A artifact from the same source revision; run a full build",
      );
    quarterlyOnlyManifest = existingManifest;
  }
  await writeFile(path.join(outputDir, quarterlyArtifact), quarterlyCsv);
  const quarterlyMetadata = {
    schemaVersion: ADJUSTED_CTI_QUARTERLY_NOMINAL_SCHEMA.canonical,
    revision,
    statisticalCode: "00200567",
    source: "総務省統計局 e-Stat CTI",
    artifact: path.basename(quarterlyArtifact),
    artifactIdentifier: SOURCES.A.statInfId,
    officialPageUrl: SOURCES.A.url,
    downloadUrl: SOURCES.A.url,
    statInfId: SOURCES.A.statInfId,
    retrievedAt: new Date().toISOString(),
    baseYear: 2025,
    unit: "指数",
    valueType: "原数値（名目指数）",
    seriesClassification: "調整系列・分布調整値（原数値）",
    householdScope: "総世帯",
    frequency: "quarterly",
    rawRange: quarterly.rawRange,
    adoptedRange: quarterly.rawRange,
    missingRepresentation:
      "- は未公表値。補完・補間なし。その他は公式表の未公表値を補完せず、表示時に総合−他9費目の残差として導出。",
    sha256: sourceHash(aBytes),
    sourceSha256: sourceHash(aBytes),
    csvSha256: sourceHash(Buffer.from(quarterlyCsv)),
    sourceFormat: "xlsx",
    sourceSheet: SOURCES.A.quarterlySheet,
    sourceWorkbook: {
      path: "data/source/official-cti-2025/cti-distribution-adjusted-000040499087.xlsx",
      fileName: "cti-distribution-adjusted-000040499087.xlsx",
    },
    columnMapping: quarterlyColumnMapping,
  };
  const quarterlyMetadataPath = path.join(outputDir, quarterlyMetadataArtifact);
  await writeFile(quarterlyMetadataPath, `${JSON.stringify(quarterlyMetadata, null, 2)}\n`);
  const quarterlyCsvSha256 = sourceHash(Buffer.from(quarterlyCsv));
  const quarterlyMetadataSha256 = sourceHash(
    Buffer.from(`${JSON.stringify(quarterlyMetadata, null, 2)}\n`),
  );
  const quarterlyEntry = {
    path: quarterlyArtifact,
    metadataPath: quarterlyMetadataArtifact,
    sha256: quarterlyCsvSha256,
    metadataSha256: quarterlyMetadataSha256,
    revision,
    statInfId: SOURCES.A.statInfId,
    sourceUrl: SOURCES.A.url,
    sourceSha256: sourceHash(aBytes),
    status: "ready",
  };
  if (args.has("--quarterly-only")) {
    const manifestPath = path.join(outputDir, "manifest.json");
    const auditPath = path.join(outputDir, "audit.json");
    quarterlyOnlyManifest.artifacts.quarterlyNominal = quarterlyEntry;
    quarterlyOnlyAudit.sources.quarterlyNominal = {
      sourceUrl: SOURCES.A.url,
      sourceFormat: "xlsx",
      sourceSheet: SOURCES.A.quarterlySheet,
      sourceSha256: quarterlyMetadata.sourceSha256,
      artifactSha256: quarterlyMetadata.csvSha256,
      metadataSha256: quarterlyMetadataSha256,
      rawRange: quarterly.rawRange,
      rows: quarterly.rows.length,
      missingValues: quarterly.missingCount,
    };
    await writeJsonAtomic(auditPath, quarterlyOnlyAudit);
    await writeJsonAtomic(manifestPath, quarterlyOnlyManifest);
  } else {
    manifest.artifacts.quarterlyNominal = quarterlyEntry;
    audit.sources.quarterlyNominal = {
      sourceUrl: SOURCES.A.url,
      sourceFormat: "xlsx",
      sourceSheet: SOURCES.A.quarterlySheet,
      sourceSha256: quarterlyMetadata.sourceSha256,
      artifactSha256: quarterlyMetadata.csvSha256,
      metadataSha256: quarterlyMetadataSha256,
      rawRange: quarterly.rawRange,
      rows: quarterly.rows.length,
      missingValues: quarterly.missingCount,
    };
  }
  if (!args.has("--quarterly-only")) {
    await writeJsonAtomic(path.join(outputDir, "audit.json"), audit);
    await writeJsonAtomic(path.join(outputDir, "manifest.json"), manifest);
  }
};
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
