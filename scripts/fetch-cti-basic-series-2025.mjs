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
    householdScope: "二人以上の世帯",
    sourceStart: "2002-01",
    requestedStart: "2005-01",
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
    householdScope: "二人以上の世帯",
    sourceStart: "2002-01",
    requestedStart: "2005-01",
  },
  {
    kind: "distributionAdjustedNominal",
    statInfId: "000040499028",
    label: "分布調整値（原数値）",
    sheet: "総・月(原)",
    title: "10大費目別 世帯消費動向指数 分布調整値（原数値）",
    headerRow: 9,
    dataRow: 10,
    timeCodeColumn: 7,
    monthColumn: 8,
    valueStart: 9,
    valueEnd: 30,
    codeRows: [0, 1],
    householdScope: "総世帯",
    sourceStart: "2017-01",
    requestedStart: "2017-01",
  },
];
export const endpoint = "https://www.e-stat.go.jp/stat-search/file-download?fileKind=0";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const monthNumber = (value) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5));
export const representativeMonths = ["2005-01", "2020-01", "2026-07"];
const missing = new Set(["", "-", "…", "na", "n/a"]);
const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const titleBase = "10大費目別世帯消費動向指数";
const normalizeTitle = (value) => String(value ?? "").replace(/\s/g, "");
export function isExpectedTitle(value, series) {
  const title = normalizeTitle(value);
  const expectedLabel = normalizeTitle(series.label);
  return title.includes(titleBase) && title.includes(expectedLabel);
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
  if (!titleCells.some((title) => isExpectedTitle(title, series)))
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
  if (!records.length || records.some((record) => record.month < series.sourceStart))
    throw new Error(`CTI source does not start at ${series.sourceStart}`);
  for (const index of Array.from({ length: 22 }, (_, i) => i + 1)) {
    const list = records
      .filter((record) => record.seriesIndex === index)
      .sort((a, b) => monthNumber(a.month) - monthNumber(b.month));
    if (list[0]?.month !== series.sourceStart)
      throw new Error(`CTI source does not start at ${series.sourceStart}`);
    for (let i = 1; i < list.length; i += 1)
      if (monthNumber(list[i].month) !== monthNumber(list[i - 1].month) + 1)
        throw new Error(`CTI source months are not continuous at ${list[i].month}`);
    const adopted = list.filter((record) => record.month >= series.requestedStart);
    if (adopted[0]?.month !== series.requestedStart)
      throw new Error(`CTI requested series does not start at ${series.requestedStart}`);
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
export function normalizedCsv(records, series) {
  const adopted = records.filter((record) => record.month >= series.requestedStart);
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
const CURRENT_SERIES = Object.freeze({
  basic: {
    statInfId: "000040499069",
    tableCode: "00401",
    tableTitle: "第１－１－１表",
    classification: "基本系列（原数値）",
    titleMarker: "原数値",
  },
  distributionAdjusted: {
    statInfId: "000040499087",
    tableCode: "00501",
    tableTitle: "第２－１－１表",
    classification: "調整系列・分布調整値（原数値）",
    titleMarker: "分布調整値（原数値）",
  },
});
const sourceIdentityMetadata = (logicalStatInfId, identity, semantic = {}) =>
  identity
    ? {
        kind: "estat-catalog-resource",
        logicalSourceStatInfId: logicalStatInfId,
        catalogResourceId: identity.catalogResourceId,
        legacyStatInfId: identity.legacyStatInfId ?? null,
        downloadUrlHash: digest(Buffer.from(identity.url)),
        title: semantic.title ?? null,
        resourceTitle: semantic.resourceTitle ?? null,
        format: semantic.format ?? null,
        releaseDate: semantic.releaseDate ?? null,
        lastModifiedDate: semantic.lastModifiedDate ?? null,
        identityMarkers:
          semantic.table || semantic.category || semantic.period || semantic.year
            ? {
                table: semantic.table ?? [],
                category: semantic.category ?? [],
                period: semantic.period ?? [],
                year: semantic.year ?? [],
              }
            : null,
      }
    : {
        kind: "legacy-stat-inf-id",
        logicalSourceStatInfId: logicalStatInfId,
        legacyStatInfId: logicalStatInfId,
      };
const currentCategories = Object.freeze([
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
]);

/** Parse the official all-households monthly sheet; distinct from the 2+ long-term parser above. */
export function parseCtiCurrentHouseholdMonthly(bytes, { kind, now = new Date() } = {}) {
  const source = CURRENT_SERIES[kind];
  if (!source) throw new Error("unknown current CTI monthly source kind");
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array))
    throw new Error("CTI current source is not binary");
  const buffer = Buffer.from(bytes);
  if (!buffer.subarray(0, 4).equals(zip)) throw new Error("CTI current source is not an XLSX file");
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false, cellDates: false, WTF: true });
  const sheetName = "総・月(原)";
  if (!workbook.SheetNames.includes(sheetName))
    throw new Error(`${kind}: missing expected current monthly sheet`);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: "",
  });
  const title = String(rows[5]?.[8] ?? "").replace(/\s/g, "");
  if (
    !title.includes("10大費目別世帯消費動向指数") ||
    !title.includes(source.titleMarker.replace(/\s/g, ""))
  )
    throw new Error(`${kind}: current monthly title mismatch`);
  if (String(rows[4]?.[8] ?? "").replace(/\s/g, "") !== source.tableTitle.replace(/\s/g, ""))
    throw new Error(`${kind}: current monthly table identity mismatch`);
  if (
    String(rows[6]?.[7] ?? "").trim() !== "総世帯" ||
    !String(rows[7]?.[7] ?? "").includes("2025年消費支出平均月額=100")
  )
    throw new Error(`${kind}: current monthly household/baseline mismatch`);
  const header = rows[8] ?? [];
  const names = header.slice(9, 31).map((value) => String(value).trim());
  const expectedNames = [
    ...currentCategories.map((value) => `${value}（名目）`),
    ...currentCategories.map((value) => `${value}（実質）`),
  ];
  if (names.length !== 22 || names.some((name, index) => !name || name !== expectedNames[index]))
    throw new Error(`${kind}: current monthly series identity/order mismatch`);
  for (const codeRow of [0, 1]) {
    for (let index = 0; index < 22; index += 1) {
      if (String(rows[codeRow]?.[9 + index] ?? "").trim() !== String(index + 1))
        throw new Error(`${kind}: current monthly series code/order mismatch`);
    }
  }
  const dataRows = rows.filter((row) => String(row[0] ?? "").trim() === source.tableCode);
  if (!dataRows.length) throw new Error(`${kind}: current monthly table code is missing`);
  const periodLikeRows = rows.filter(
    (row) =>
      /^\d{6}B\s*$/.test(String(row[1] ?? "")) ||
      /^\d{4}年\d{1,2}月$/.test(String(row[8] ?? "").trim()),
  );
  if (
    periodLikeRows.length !== dataRows.length ||
    periodLikeRows.some((row) => String(row[0] ?? "").trim() !== source.tableCode)
  )
    throw new Error(`${kind}: unexpected current monthly observation rows`);
  const observations = [];
  for (const row of dataRows) {
    const eStatPeriod = String(row[1] ?? "").trim();
    const periodMatch = eStatPeriod.match(/^(\d{4})(0[1-9]|1[0-2])B$/);
    const label = String(row[8] ?? "").trim();
    const labelMatch = label.match(/^(\d{4})年([0-9]{1,2})月$/);
    if (
      !periodMatch ||
      !labelMatch ||
      periodMatch[1] !== labelMatch[1] ||
      Number(periodMatch[2]) !== Number(labelMatch[2])
    )
      throw new Error(`${kind}: current monthly period identity mismatch`);
    const year = Number(periodMatch[1]),
      month = Number(periodMatch[2]);
    const timeCode = String(row[7] ?? "").trim();
    const expectedTimeCode = `${year}00${String(month).padStart(2, "0")}${String(month).padStart(2, "0")}`;
    if (timeCode !== expectedTimeCode)
      throw new Error(`${kind}: current monthly time code mismatch at ${label}`);
    const values = row.slice(9, 31).map((value) => {
      const text = String(value ?? "").trim();
      if (missing.has(text.toLowerCase())) return "-";
      const number = Number(text.replace(/,/g, ""));
      if (!Number.isFinite(number))
        throw new Error(`${kind}: current monthly value is not numeric at ${label}`);
      return text.replace(/,/g, "");
    });
    if (values.length !== 22)
      throw new Error(`${kind}: current monthly row must contain 22 series at ${label}`);
    observations.push({ year, month, label, eStatPeriod, timeCode, values });
  }
  observations.sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  if (observations[0]?.label !== "2017年1月")
    throw new Error(`${kind}: current monthly source must start in 2017年1月`);
  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1],
      current = observations[index];
    if (current.year * 12 + current.month !== previous.year * 12 + previous.month + 1)
      throw new Error(`${kind}: current monthly periods are not continuous at ${current.label}`);
  }
  const last = observations.at(-1);
  if (last.year * 12 + last.month < 2026 * 12 + 7)
    throw new Error(`${kind}: current monthly source coverage regressed before 2026年7月`);
  if (last.year * 12 + last.month > now.getFullYear() * 12 + now.getMonth())
    throw new Error(`${kind}: current monthly source contains a future period`);
  return {
    statInfId: source.statInfId,
    tableCode: source.tableCode,
    sheetName,
    title: String(rows[5][8]).trim(),
    classification: source.classification,
    series: names,
    observations,
  };
}

const currentCsvCell = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const currentHeader = [
  "時間軸コード",
  "月",
  ...currentCategories.map((value) => `${value}（名目）`),
  ...currentCategories.map((value) => `${value}（実質）`),
];
function currentMonthlyCsv(parsed) {
  return [
    currentHeader,
    ...parsed.observations.map((item) => [item.timeCode, item.label, ...item.values]),
  ]
    .map((row) => row.map(currentCsvCell).join(","))
    .join("\n");
}
function currentSeriesMapCsv(parsed) {
  const lines = [
    "official_code,official_name,source_stat_inf_id,source_variant,dashboard_key,value_type,transform,coverage_start,missing_policy,evidence",
  ];
  parsed.series.forEach((name, index) => {
    const valueType = index < 11 ? "名目" : "実質";
    lines.push(
      [
        `00401-${String(index + 1).padStart(2, "0")}`,
        name,
        parsed.statInfId,
        "基本系列・原数値・総世帯",
        name,
        valueType,
        "direct",
        parsed.observations[0].label,
        "preserve_missing",
        `公式Excel「総・月(原)」表コード00401・列コード${index + 1}`,
      ]
        .map(currentCsvCell)
        .join(","),
    );
  });
  return `${lines.join("\n")}\n`;
}
function currentOfficialSnapshotCsv(parsed) {
  const representative = parsed.observations.find(({ label }) => label === "2025年1月");
  if (!representative)
    throw new Error("current monthly source lacks representative month 2025年1月");
  const lines = [
    "official_code,official_name,table_code,series_code,representative_month,representative_value",
  ];
  parsed.series.forEach((name, index) =>
    lines.push(
      [
        `00401-${String(index + 1).padStart(2, "0")}`,
        name,
        "00401",
        String(index + 1),
        representative.label,
        representative.values[index],
      ]
        .map(currentCsvCell)
        .join(","),
    ),
  );
  return `${lines.join("\n")}\n`;
}

/** Build the current all-households monthly outputs from explicit source bytes. */
export function buildCtiCurrentMonthlyArtifacts(
  sourceBytes,
  {
    stageRoot,
    retrievedAt = new Date().toISOString(),
    now = new Date(retrievedAt),
    revisionAudit = {},
    sourceIdentities = {},
  } = {},
) {
  if (typeof stageRoot !== "string" || !stageRoot)
    throw new Error("explicit CTI staging root is required");
  const basicBytes = Buffer.from(sourceBytes?.["000040499069"] ?? []);
  const adjustedBytes = Buffer.from(sourceBytes?.["000040499087"] ?? []);
  if (!basicBytes.length || !adjustedBytes.length)
    throw new Error("missing current CTI monthly workbook bytes for 000040499069 or 000040499087");
  const basic = parseCtiCurrentHouseholdMonthly(basicBytes, { kind: "basic", now });
  const adjusted = parseCtiCurrentHouseholdMonthly(adjustedBytes, {
    kind: "distributionAdjusted",
    now,
  });
  if (
    basic.observations.length !== adjusted.observations.length ||
    basic.observations.some((row, index) => row.label !== adjusted.observations[index].label)
  )
    throw new Error("basic and distribution-adjusted CTI monthly periods differ");
  const basicCsv = Buffer.from(currentMonthlyCsv(basic));
  const mapCsv = Buffer.from(currentSeriesMapCsv(basic));
  const snapshotCsv = Buffer.from(currentOfficialSnapshotCsv(basic));
  const adjustedCsv = Buffer.from(currentMonthlyCsv(adjusted));
  const basicMetadata = {
    status: "ready",
    baseYear: 2025,
    outputFile: "cti_data2025.csv",
    statInfId: basic.statInfId,
    sourceIdentity: sourceIdentityMetadata(
      basic.statInfId,
      sourceIdentities[basic.statInfId],
      sourceIdentities[basic.statInfId]?.semantic,
    ),
    retrievedAt: retrievedAt.slice(0, 10),
    sourceFile: "official-cti-2025/cti-basic-000040499069.xlsx",
    sourceFileSha256: digest(basicBytes),
    csvSha256: digest(basicCsv),
    officialSeriesMapFile: "cti-2025-series-map.csv",
    officialSeriesMapSha256: digest(mapCsv),
    officialSeriesSnapshotFile: "cti-2025-official-series.csv",
    officialSeriesSnapshotSha256: digest(snapshotCsv),
    officialSeriesSnapshotSourceStatInfId: basic.statInfId,
    officialSeriesSnapshotSourceSha256: digest(basicBytes),
    revisionAudit: revisionAudit[basic.statInfId] ?? null,
    sourceBasis: "2025年消費支出平均月額=100の公式基本系列（原数値・総世帯）",
    comparisonNormalization: "なし。cti_data2025.csvは公式指数値をそのまま保持する。",
    officialSeriesSnapshot: {
      sourceSheet: "総・月(原)",
      tableCode: basic.tableCode,
      seriesCount: 22,
      representativeMonth: "2025年1月",
      identifier:
        "official_code is the official table code and column code joined as 00401-01 through 00401-22",
    },
    seriesClassification: "基本系列（原数値）",
    tableTitle: `${basic.title.replace(/\s+/g, " ")} 総世帯`,
    householdScope: "総世帯",
    frequency: "月次",
    valueType: "指数",
    period: {
      start: basic.observations[0].label,
      end: basic.observations.at(-1).label,
      monthlyRows: basic.observations.length,
    },
    extraction:
      "公式Excelの「総・月(原)」シートから、総世帯の月次指数列（時間軸コード・月・10大費目別の名目値/実質値）を列順・値表記を保持して抽出。",
  };
  const adjustedMetadata = {
    status: "ready",
    baseYear: 2025,
    outputFile: "cti_data2025_distribution_adjusted.csv",
    statInfId: adjusted.statInfId,
    sourceIdentity: sourceIdentityMetadata(
      adjusted.statInfId,
      sourceIdentities[adjusted.statInfId],
      sourceIdentities[adjusted.statInfId]?.semantic,
    ),
    retrievedAt: retrievedAt.slice(0, 10),
    sourceFile: "official-cti-2025/cti-distribution-adjusted-000040499087.xlsx",
    sourceFileSha256: digest(adjustedBytes),
    csvSha256: digest(adjustedCsv),
    revisionAudit: revisionAudit[adjusted.statInfId] ?? null,
    seriesClassification: adjusted.classification,
    tableTitle: `${adjusted.title.replace(/\s+/g, " ")} 総世帯`,
    householdScope: "総世帯",
    frequency: "月次",
    valueType: "指数",
    period: {
      start: adjusted.observations[0].label,
      end: adjusted.observations.at(-1).label,
      monthlyRows: adjusted.observations.length,
    },
    extraction:
      "公式Excelの「総・月(原)」シートから、総世帯の分布調整値の月次指数列（時間軸コード・月・10大費目別の名目値/実質値）を列順・値表記を保持して抽出。",
  };
  const outputs = [
    ["data/source/cti_data2025.csv", basicCsv],
    [
      "data/source/cti_data2025.metadata.json",
      Buffer.from(`${JSON.stringify(basicMetadata, null, 2)}\n`),
    ],
    ["data/source/cti-2025-series-map.csv", mapCsv],
    ["data/source/cti-2025-official-series.csv", snapshotCsv],
    ["data/source/cti_data2025_distribution_adjusted.csv", adjustedCsv],
    [
      "data/source/cti_data2025_distribution_adjusted.metadata.json",
      Buffer.from(`${JSON.stringify(adjustedMetadata, null, 2)}\n`),
    ],
  ].map(([outputPath, bytes]) => ({ path: outputPath, bytes }));
  return {
    artifacts: outputs,
    parsed: { basic, adjusted },
    semanticValue: {
      basicCsvSha256: digest(basicCsv),
      adjustedCsvSha256: digest(adjustedCsv),
      period: basicMetadata.period,
    },
    rawSourceLineage: {
      basic: { statInfId: basic.statInfId, sha256: digest(basicBytes) },
      adjusted: { statInfId: adjusted.statInfId, sha256: digest(adjustedBytes) },
    },
    coverage: basicMetadata.period,
  };
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
  const adopted = parsed.records.filter((record) => record.month >= series.requestedStart);
  return {
    status: "ready",
    statisticName: "2025年基準 消費動向指数",
    governmentStatisticsCode: "00200567",
    baseYear: 2025,
    unit: "指数",
    statInfId: series.statInfId,
    logicalSourceStatInfId: series.statInfId,
    legacyStatInfId: response.sourceIdentity?.legacyStatInfId ?? null,
    sourceIdentity: sourceIdentityMetadata(
      series.statInfId,
      response.sourceIdentity,
      response.sourceIdentity?.semantic,
    ),
    seriesKind: series.kind,
    seriesLabel: series.label,
    householdScope: series.householdScope ?? "二人以上の世帯",
    valueType: series.label,
    sourceTitle: parsed.title,
    frequency: "monthly",
    sourceStart: series.sourceStart ?? "2002-01",
    requestedStart: series.requestedStart ?? "2005-01",
    availabilityStart: series.sourceStart ?? "2002-01",
    retrieval: { retrievedAt, updatedAt: response.lastModified },
    downloadUrlHash: response.sourceIdentity?.url
      ? digest(Buffer.from(response.sourceIdentity.url))
      : digest(Buffer.from(`${endpoint}&statInfId=${series.statInfId}`)),
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

/** Build long-term CTI artifacts without writing or publishing files. */
export function buildCtiBasicArtifacts(
  sourceBytes,
  {
    stageRoot,
    retrievedAt = new Date().toISOString(),
    responseMetadata = {},
    revisionAudit = {},
  } = {},
) {
  if (typeof stageRoot !== "string" || !stageRoot)
    throw new Error("explicit CTI staging root is required");
  const allRecords = [];
  const artifacts = [];
  const files = [];
  for (const series of SERIES) {
    const bytes = sourceBytes[series.statInfId];
    if (!bytes) throw new Error(`missing CTI source bytes for ${series.statInfId}`);
    const raw = Buffer.from(bytes);
    const parsed = parseOfficialFile(raw, series);
    allRecords.push(...parsed.records);
    const normalized = normalizedCsv(parsed.records, series);
    const meta = metadataFor(series, raw, normalized, retrievedAt, parsed, {
      contentType: responseMetadata[series.statInfId]?.contentType ?? "application/octet-stream",
      contentDisposition: responseMetadata[series.statInfId]?.contentDisposition ?? null,
      lastModified: responseMetadata[series.statInfId]?.lastModified ?? null,
      sourceIdentity: responseMetadata[series.statInfId]?.sourceIdentity,
    });
    meta.revisionAudit = revisionAudit[series.statInfId] ?? null;
    const metadata = Buffer.from(`${JSON.stringify(meta, null, 2)}\n`);
    const rawPath = `data/source/official-cti-2025-long-term/${meta.rawFile}`;
    const normalizedPath = `data/source/official-cti-2025-long-term/${meta.normalizedFile}`;
    const metadataPath = `data/source/official-cti-2025-long-term/${meta.metadataFile}`;
    artifacts.push(
      { path: rawPath, bytes: raw },
      { path: normalizedPath, bytes: Buffer.from(normalized) },
      { path: metadataPath, bytes: metadata },
    );
    files.push({
      statInfId: series.statInfId,
      seriesKind: series.kind,
      rawFile: meta.rawFile,
      normalizedFile: meta.normalizedFile,
      metadataFile: meta.metadataFile,
      rawSha256: digest(raw),
      normalizedSha256: digest(Buffer.from(normalized)),
      metadataSha256: digest(metadata),
    });
  }
  const derivedFiles = [];
  for (const [file, content] of [
    ["series-map.csv", seriesMapCsv(allRecords)],
    ["representative-snapshot.csv", representativeSnapshotCsv(allRecords)],
  ]) {
    const bytes = Buffer.from(content);
    artifacts.push({ path: `data/source/official-cti-2025-long-term/${file}`, bytes });
    derivedFiles.push({
      file,
      sha256: digest(bytes),
      sourceIdentities: files.map(({ statInfId, rawSha256 }) => ({
        statInfId,
        sourceSha256: rawSha256,
      })),
    });
  }
  const auditSummary = Object.fromEntries(
    Object.entries(revisionAudit).map(([id, audit]) => [
      id,
      {
        changedObservationCount: audit.changedObservationCount,
        changedValueCount: audit.changedValueCount,
        changedSample: audit.changedSample,
        sha256: audit.sha256,
        previousSha256: audit.previousSha256,
        sourceSha256: audit.sourceSha256,
      },
    ]),
  );
  const manifest = Buffer.from(
    `${JSON.stringify({ schemaVersion: 1, generatedAt: retrievedAt, files, derivedFiles, revisionAudit: auditSummary }, null, 2)}\n`,
  );
  artifacts.push({
    path: "data/source/official-cti-2025-long-term/manifest.json",
    bytes: manifest,
  });
  return {
    artifacts,
    manifest,
    files,
    derivedFiles,
    semanticValue: {
      files: files.map(({ statInfId, normalizedSha256 }) => ({ statInfId, normalizedSha256 })),
    },
    rawSourceLineage: files.map(({ statInfId, rawSha256 }) => ({ statInfId, rawSha256 })),
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
      const normalized = normalizedCsv(parsed.records, series);
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
