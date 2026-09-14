import * as fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import Papa from "papaparse";
import { buildCtiFilePaths } from "../dataIo";
import { parseYearMonth } from "@/lib/yearMonth";
import { calculateQuarterLabel } from "@/lib/math/quarter";

export type CtiLoadOptions = { source?: "auto" | "rollback-2020" };
export type CtiPair = {
  baseYear: 2020 | 2025;
  pair: "2020" | "2025";
  mainPath: string;
  supportNominalPath: string;
  supportRealPath: string;
};
export type CtiDataStatus = {
  baseYear: 2020 | 2025 | null;
  pair: "2020" | "2025" | null;
  valid: boolean;
  reason?: string;
};

export function isContinuousMonths(months: string[]): boolean {
  return months.every((month, index) => {
    const first = parseYearMonth(month);
    if (index === 0) return Boolean(first && first.month >= 1 && first.month <= 12);
    const previous = parseYearMonth(months[index - 1]);
    const current = parseYearMonth(month);
    return Boolean(
      previous &&
      current &&
      current.month >= 1 &&
      current.month <= 12 &&
      current.year * 12 + current.month === previous.year * 12 + previous.month + 1,
    );
  });
}

export function validateCtiLegacySupport(content: string): string | Map<string, number> {
  const rows = Papa.parse<string[]>(content, { header: false, skipEmptyLines: true }).data;
  const headerIndex = rows.findIndex(
    (row) => row.includes("時間軸（四半期）") && row.includes("民間最終消費支出"),
  );
  if (headerIndex < 0) return "missing CTI support period or series header";
  const header = rows[headerIndex].map((cell) => cell.trim());
  const periodIndex = header.indexOf("時間軸（四半期）");
  const valueIndex = header.indexOf("民間最終消費支出");
  const values = new Map<string, number>();
  for (const row of rows.slice(headerIndex + 1)) {
    const rawPeriod = row[periodIndex]?.trim();
    if (!rawPeriod) return "invalid or duplicate CTI support period";
    const periodMatch = rawPeriod.match(/^(\d{4})年(1～3|4～6|7～9|10～12)月期$/);
    if (!periodMatch) return "invalid or duplicate CTI support period";
    const period = calculateQuarterLabel(
      Number(periodMatch[1]),
      ["1～3", "4～6", "7～9", "10～12"].indexOf(periodMatch[2]) + 1,
    );
    if (values.has(period)) return "invalid or duplicate CTI support period";
    const rawValue = row[valueIndex]?.trim();
    const value = Number(rawValue?.replace(/,/g, ""));
    if (!rawValue || rawValue === "-" || !Number.isFinite(value))
      return "invalid CTI support value";
    values.set(period, value);
  }
  if (values.size === 0) return "CTI support contains no values";
  const supportPeriods = [...values.keys()];
  if (
    supportPeriods.some((period, index) => {
      if (index === 0) return false;
      const previous = supportPeriods[index - 1].match(/^(\d{4})年(\d+)～/);
      const current = period.match(/^(\d{4})年(\d+)～/);
      return (
        !previous ||
        !current ||
        Number(current[1]) * 4 + Math.ceil(Number(current[2]) / 3) !==
          Number(previous[1]) * 4 + Math.ceil(Number(previous[2]) / 3) + 1
      );
    })
  )
    return "CTI support periods are not continuous";
  return values;
}

export function validateCtiLegacySupportPair(
  nominalContent: string,
  realContent: string,
): string | { nominal: Map<string, number>; real: Map<string, number> } {
  const nominal = validateCtiLegacySupport(nominalContent);
  const real = validateCtiLegacySupport(realContent);
  if (typeof nominal === "string") return nominal;
  if (typeof real === "string") return real;
  if (nominal.size !== real.size || [...nominal.keys()].some((period) => !real.has(period)))
    return "CTI nominal/real support period set mismatch";
  return { nominal, real };
}

export function validateCtiMetadata(
  metadataPath: string,
  expectedFile: string,
): string | Record<string, unknown> {
  if (!fs.existsSync(metadataPath)) return "missing metadata";
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Record<string, unknown>;
    const declaredFile = metadata.indexFile ?? metadata.outputFile ?? metadata.file;
    if (metadata.status !== "ready" || metadata.baseYear !== 2025)
      return "metadata is not ready for 2025";
    if (declaredFile !== expectedFile) return "metadata file pairing mismatch";
    if (typeof metadata.csvSha256 !== "string" || !/^[a-f0-9]{64}$/.test(metadata.csvSha256))
      return "metadata SHA-256 is missing or invalid";
    return metadata;
  } catch {
    return "invalid metadata";
  }
}

export function validateCtiPair(
  pair: CtiPair,
  paths: ReturnType<typeof buildCtiFilePaths>,
): string | CtiPair {
  const required =
    pair.baseYear === 2020
      ? [pair.mainPath, pair.supportNominalPath, pair.supportRealPath]
      : [pair.mainPath];
  if (pair.baseYear === 2025)
    required.push(
      paths.seriesMap,
      paths.officialSnapshot,
      paths.metadata,
      paths.candidateDistributionAdjusted,
      paths.candidateDistributionAdjustedMetadata,
    );
  if (required.some((filePath) => !fs.existsSync(filePath))) return "missing required CTI set file";
  const content = fs.readFileSync(pair.mainPath, "utf8");
  const parsed = Papa.parse<string[]>(content, { header: false, skipEmptyLines: true }).data;
  const headerIndex = parsed.findIndex((row) =>
    row.some((cell) => cell?.trim() === "年月" || cell?.trim() === "月"),
  );
  if (headerIndex < 0) return "missing CTI 年月 header";
  const header = parsed[headerIndex].map((cell) => cell.trim());
  if (!header.includes("消費支出（名目）") || !header.includes("消費支出（実質）"))
    return "missing required CTI total headers";
  const monthIndex = header.indexOf(header.includes("年月") ? "年月" : "月");
  const dataRows = parsed.slice(headerIndex + 1);
  const months = dataRows.map((row) => row[monthIndex]?.trim() ?? "");
  if (months.length === 0 || !isContinuousMonths(months))
    return "invalid or discontinuous CTI 年月";
  if (new Set(months).size !== months.length) return "invalid or duplicate CTI 年月";
  const requiredValueIndexes = [
    header.indexOf("消費支出（名目）"),
    header.indexOf("消費支出（実質）"),
  ];
  if (
    requiredValueIndexes.some((index) => index < 0) ||
    dataRows.some((row) =>
      requiredValueIndexes.some((index) => {
        const rawValue = row[index]?.trim();
        return (
          !rawValue || rawValue === "-" || !Number.isFinite(Number(rawValue.replace(/,/g, "")))
        );
      }),
    )
  )
    return "invalid CTI required numeric value";
  if (pair.baseYear === 2020) {
    const support = validateCtiLegacySupportPair(
      fs.readFileSync(pair.supportNominalPath, "utf8"),
      fs.readFileSync(pair.supportRealPath, "utf8"),
    );
    if (typeof support === "string") return support;
    return pair;
  }
  if (pair.baseYear !== 2025) return pair;
  const readHeaders = (filePath: string) =>
    Papa.parse<string[]>(fs.readFileSync(filePath, "utf8"), {
      header: false,
      skipEmptyLines: true,
    }).data[0]?.map((cell) => cell.trim()) ?? [];
  if (
    !["official_code", "official_name", "dashboard_key", "value_type"].every((key) =>
      readHeaders(paths.seriesMap).includes(key),
    )
  )
    return "invalid 2025 series map headers";
  if (
    !["official_code", "official_name"].every((key) =>
      readHeaders(paths.officialSnapshot).includes(key),
    )
  )
    return "invalid 2025 official snapshot headers";
  const metadata = validateCtiMetadata(paths.metadata, path.basename(pair.mainPath));
  if (typeof metadata === "string") return metadata;
  if (
    typeof metadata.sourceBasis !== "string" ||
    typeof metadata.comparisonNormalization !== "string"
  )
    return "2025 CTI metadata basis fields are missing";
  const period = metadata.period as Record<string, unknown> | undefined;
  if (
    !period ||
    period.start !== months[0] ||
    period.end !== months.at(-1) ||
    period.monthlyRows !== months.length
  )
    return "2025 CTI metadata period mismatch";
  for (const [metadataPath, expected, csv] of [
    [paths.metadata, path.basename(pair.mainPath), content],
    [
      paths.candidateDistributionAdjustedMetadata,
      path.basename(paths.candidateDistributionAdjusted),
      fs.readFileSync(paths.candidateDistributionAdjusted, "utf8"),
    ],
  ] as const) {
    const checked = validateCtiMetadata(metadataPath, expected);
    if (typeof checked === "string") return checked;
    if (createHash("sha256").update(csv).digest("hex") !== checked.csvSha256)
      return "metadata SHA-256 mismatch";
  }
  const records = (filePath: string) =>
    Papa.parse<Record<string, string>>(fs.readFileSync(filePath, "utf8"), {
      header: true,
      skipEmptyLines: true,
    }).data.map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim(), value?.trim()])),
    );
  const map = records(paths.seriesMap),
    snapshot = records(paths.officialSnapshot);
  const mapByCode = new Map<string, Record<string, string>>(),
    officialByCode = new Map<string, Record<string, string>>();
  for (const row of map) {
    const code = row.official_code;
    if (!code || mapByCode.has(code) || !row.official_name || !row.dashboard_key)
      return "invalid or duplicate 2025 series map rows";
    if (!header.includes(row.dashboard_key))
      return `2025 series map column missing: ${row.dashboard_key}`;
    mapByCode.set(code, row);
  }
  for (const row of snapshot) {
    const code = row.official_code;
    if (!code || officialByCode.has(code) || !row.official_name)
      return "invalid or duplicate 2025 official snapshot rows";
    officialByCode.set(code, row);
  }
  if (
    mapByCode.size === 0 ||
    mapByCode.size !== officialByCode.size ||
    [...mapByCode.keys()].some((code) => !officialByCode.has(code))
  )
    return "2025 series map and official snapshot code set mismatch";
  for (const [code, mapped] of mapByCode) {
    const official = officialByCode.get(code)!;
    if (mapped.official_name !== official.official_name)
      return `2025 official name mismatch: ${code}`;
    const month = official.representative_month,
      expected = official.representative_value;
    if (!month || !expected) return `2025 official representative value missing: ${code}`;
    const row = parsed
      .slice(headerIndex + 1)
      .find((candidate) => candidate[monthIndex]?.trim() === month);
    if (!row) return `2025 official representative month missing: ${month}`;
    if (
      !row[header.indexOf(mapped.dashboard_key)]?.trim() ||
      row[header.indexOf(mapped.dashboard_key)]?.trim() !== expected
    )
      return `2025 official representative value mismatch: ${code}`;
  }
  const values2025 = parsed
    .slice(headerIndex + 1)
    .filter((row) => parseYearMonth(row[monthIndex]?.trim() ?? "")?.year === 2025)
    .map((row) => Number(row[header.indexOf("消費支出（名目）")]?.replace(/,/g, "")))
    .filter(Number.isFinite);
  return values2025.length === 12 ? pair : "incomplete 2025 CTI calendar year";
}

export function selectCtiPair(options: CtiLoadOptions = {}): { pair: CtiPair } | CtiDataStatus {
  const paths = buildCtiFilePaths();
  const pairs: CtiPair[] = [
    {
      baseYear: 2025,
      pair: "2025",
      mainPath: paths.candidateMain,
      supportNominalPath: paths.candidateSupportNominal,
      supportRealPath: paths.candidateSupportReal,
    },
    {
      baseYear: 2020,
      pair: "2020",
      mainPath: paths.main,
      supportNominalPath: paths.supportNominal,
      supportRealPath: paths.supportReal,
    },
  ].filter((pair) => options.source !== "rollback-2020" || pair.baseYear === 2020) as CtiPair[];
  let lastReason = "no complete CTI set";
  for (const pair of pairs) {
    const validation = validateCtiPair(pair, paths);
    if (typeof validation !== "string") return { pair };
    lastReason = `${pair.pair} pair: ${validation}`;
    console.error(`CTI data pair validation failed (${lastReason})`);
  }
  return { baseYear: null, pair: null, valid: false, reason: lastReason };
}
