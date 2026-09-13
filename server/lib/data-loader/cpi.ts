import * as fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import Papa from "papaparse";
import type { CpiData } from "@/types";
import { buildCpiFilePaths, buildCtiFilePaths, parseContributionWeights } from "../dataIo";
import { parseYearMonth, compareYearMonth } from "@/lib/yearMonth";
import { calculateQuarter, calculateQuarterLabel } from "@/lib/math/quarter";
import { calculateGdp2025NormalizationFactor } from "../math/supportSeries";

const CPI_MAJOR_CATEGORIES = [
  "食料",
  "住居",
  "光熱・水道",
  "家具・家事用品",
  "被服及び履物",
  "保健医療",
  "交通・通信",
  "教育",
  "教養娯楽",
  "諸雑費",
] as const;

// These are the mutually exclusive source series behind the stacked display.
// Their parent 10-major-category weights sum to 10002 in the published 2025
// table because of rounding, so normalize only this comparison set by its
// actual total rather than altering the published weights.
const CPI_COMPARISON_COMPONENTS = new Set([
  "住居",
  "家具・家事用品",
  "被服及び履物",
  "保健医療",
  "教育",
  "光熱・水道",
  "教養娯楽",
  "交通",
  "自動車等関係費",
  "通信",
  "食料",
  "外食",
  "諸雑費",
]);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export type CpiDataStatus = {
  baseYear: 2020 | 2025 | null;
  pair: "2020" | "2025" | null;
  valid: boolean;
  reason?: string;
};

/** Explicit source selection for compatibility tests and controlled rollback callers. */
export type CtiLoadOptions = {
  source?: "auto" | "rollback-2020";
};

export type GdpSupportStatus = {
  valid: boolean;
  reason?: string;
  normalizationFactors?: { nominal: number; real: number };
};

export type QuarterlyGdpSupportStatus = {
  valid: boolean;
  comparisonReady: boolean;
  independentConfirmation: "pending-independent-confirmation" | "ready" | "failed";
  reason?: string;
  normalizationFactors?: { nominal: number; real: number };
};

export type QuarterlyGdpRow = {
  period: string;
  nominalRaw: number;
  realRaw: number;
  nominalComparison?: number;
  realComparison?: number;
};

export type QuarterlyGdpData = {
  rows: QuarterlyGdpRow[];
  comparisonReady: boolean;
};

type QuarterlySeries = { period: string; value: number; series: string; priceMeasure: string };

type GdpSupportMetadata = {
  status: string;
  seriesConcept: string;
  priceMeasure: "current-prices" | "previous-year-chain-linked";
  referenceYear: number | null;
  displayNormalizationYear: number;
  unit: string;
  rawValuePreserved: boolean;
  csvSha256: string;
  sourceFrequency: "annual";
  period: { start: string; end: string; annualRows: number };
};

type ValidatedGdpSupport = {
  nominal: Map<number, number>;
  real: Map<number, number>;
  factors: { nominal: number; real: number };
};

type CpiPair = {
  baseYear: 2020 | 2025;
  pair: "2020" | "2025";
  mainPath: string;
  contributionPath: string;
};

type Cpi2025Metadata = {
  status: string;
  baseYear: number;
  indexFile: string;
  contributionFile: string;
  csvSha256: string;
  period: { start: string; end: string; monthlyRows: number };
  seriesCount: number;
};

type ValidatedCpiPair = {
  weights: Record<string, number>;
  data: CpiData[];
};

const CPI_DATE_HEADER = "年月";

function validateContribution(
  content: string,
): { weights: Record<string, number>; headers: string[] } | string {
  const rows = Papa.parse<string[]>(content, {
    header: false,
    skipEmptyLines: false,
  }).data;
  const categories = rows.find((row) => row[0]?.trim() === "類・品目");
  const weightRow = rows.find((row) => row[0]?.trim().startsWith("ウエイト"));
  if (!categories || !weightRow) return "missing 類・品目 or ウエイト header";

  const headers = categories
    .slice(1)
    .map((value) => value?.trim())
    .filter(Boolean) as string[];
  if (!headers.includes("総合")) return "missing required contribution header: 総合";
  if (new Set(headers).size !== headers.length) return "duplicate contribution headers";

  const weights = parseContributionWeights(content);
  const missingWeights = headers.filter((header) => !isFiniteNumber(weights[header]));
  if (missingWeights.length > 0) return `missing or invalid weights: ${missingWeights.join(", ")}`;
  return { weights, headers };
}

function validate2025Metadata(metadataPath: string): Cpi2025Metadata | string {
  if (!fs.existsSync(metadataPath)) return "missing 2025 metadata";
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Cpi2025Metadata;
    if (metadata.status !== "ready") return "2025 metadata is not ready";
    if (metadata.baseYear !== 2025) return "2025 metadata baseYear mismatch";
    if (metadata.indexFile !== "cpi_data2025_long.csv") return "2025 metadata indexFile mismatch";
    if (metadata.contributionFile !== "contribution2025.csv")
      return "2025 metadata contributionFile mismatch";
    if (metadata.period?.monthlyRows !== 679) return "2025 metadata monthlyRows mismatch";
    if (metadata.period?.start !== "1970年1月" || metadata.period?.end !== "2026年7月") {
      return "2025 metadata period mismatch";
    }
    if (metadata.seriesCount !== 78) return "2025 metadata seriesCount mismatch";
    if (!/^[a-f0-9]{64}$/.test(metadata.csvSha256 ?? ""))
      return "2025 metadata CSV SHA-256 mismatch";
    return metadata;
  } catch {
    return "invalid 2025 metadata";
  }
}

function validateCpiPair(pair: CpiPair, metadataPath: string): ValidatedCpiPair | string {
  if (!fs.existsSync(pair.mainPath) || !fs.existsSync(pair.contributionPath)) {
    return "missing index or contribution file";
  }
  const contribution = validateContribution(fs.readFileSync(pair.contributionPath, "utf8"));
  if (typeof contribution === "string") return contribution;
  const cpiContent = fs.readFileSync(pair.mainPath, "utf8");
  const { data, meta } = Papa.parse<CpiData>(cpiContent, {
    dynamicTyping: true,
    header: true,
    skipEmptyLines: true,
  });
  const headers = (meta.fields ?? []).map((header) => header.trim());
  if (!headers.includes(CPI_DATE_HEADER))
    return `missing required index header: ${CPI_DATE_HEADER}`;
  if (
    !(data as CpiData[]).some((row) => {
      if (!row[CPI_DATE_HEADER]) return false;
      const parsed = parseYearMonth(row[CPI_DATE_HEADER] as string);
      return parsed ? parsed.year >= 2004 : false;
    })
  ) {
    return "index contains no valid 年月 rows";
  }
  const missingIndexHeaders = contribution.headers.filter((header) => !headers.includes(header));
  if (missingIndexHeaders.length > 0) {
    return `missing required index headers: ${missingIndexHeaders.join(", ")}`;
  }
  if (pair.baseYear === 2025) {
    const metadata = validate2025Metadata(metadataPath);
    if (typeof metadata === "string") return metadata;
    if (
      path.basename(pair.mainPath) !== metadata.indexFile ||
      path.basename(pair.contributionPath) !== metadata.contributionFile
    ) {
      return "2025 metadata file pairing mismatch";
    }
    if (createHash("sha256").update(cpiContent).digest("hex") !== metadata.csvSha256) {
      return "2025 CSV SHA-256 mismatch";
    }
    const rows = data as CpiData[];
    const months = rows
      .map((row) => row[CPI_DATE_HEADER])
      .filter((month): month is string => typeof month === "string");
    if (rows.length !== metadata.period.monthlyRows || months.length !== rows.length)
      return "2025 CSV monthly row count mismatch";
    if ((meta.fields?.length ?? 0) !== metadata.seriesCount + 1)
      return "2025 CSV series count mismatch";
    if (months[0] !== metadata.period.start || months.at(-1) !== metadata.period.end)
      return "2025 CSV period mismatch";
    if (new Set(months).size !== months.length) return "2025 CSV contains duplicate months";
    for (let index = 1; index < months.length; index += 1) {
      const previous = parseYearMonth(months[index - 1]);
      const current = parseYearMonth(months[index]);
      if (
        !previous ||
        !current ||
        current.year * 12 + current.month !== previous.year * 12 + previous.month + 1
      ) {
        return "2025 CSV monthly series is not continuous";
      }
    }
    const baseYearValues = rows
      .filter((row) => parseYearMonth(row[CPI_DATE_HEADER] as string)?.year === 2025)
      .map((row) => row.総合)
      .filter(isFiniteNumber);
    const average = baseYearValues.reduce((sum, value) => sum + value, 0) / baseYearValues.length;
    // Official monthly values are rounded; accept the documented 99.9–100.1 range.
    if (baseYearValues.length !== 12 || average < 99.9 || average > 100.1)
      return "2025 CSV general-index average mismatch";
  }
  return { weights: contribution.weights, data: data as CpiData[] };
}

function selectCpiPair(): { pair: CpiPair; validated: ValidatedCpiPair } | CpiDataStatus {
  const paths = buildCpiFilePaths();
  const pairs: CpiPair[] = [
    {
      baseYear: 2025,
      pair: "2025",
      mainPath: paths.main,
      contributionPath: paths.contribution,
    },
    {
      baseYear: 2020,
      pair: "2020",
      mainPath: paths.fallbackMain,
      contributionPath: paths.fallbackContribution,
    },
  ];
  let lastReason = "no complete CPI pair";
  for (const pair of pairs) {
    const validation = validateCpiPair(pair, paths.metadata);
    if (typeof validation !== "string") return { pair, validated: validation };
    lastReason = `${pair.pair} pair: ${validation}`;
    console.error(`CPI data pair validation failed (${lastReason})`);
  }
  return { baseYear: null, pair: null, valid: false, reason: lastReason };
}

export async function getCpiDataStatus(): Promise<CpiDataStatus> {
  const selected = selectCpiPair();
  if ("baseYear" in selected) return selected;
  return {
    baseYear: selected.pair.baseYear,
    pair: selected.pair.pair,
    valid: true,
  };
}

export function getCpiMajorWeightTotal(weights: Record<string, number>): number {
  const total = CPI_MAJOR_CATEGORIES.reduce((sum, key) => sum + weights[key], 0);
  return Number.isFinite(total) && total > 0 ? total : 10_000;
}

export async function loadCpiDataInternal(): Promise<CpiData[]> {
  const selected = selectCpiPair();
  if ("baseYear" in selected) {
    console.error(`CPI data unavailable: ${selected.reason}`);
    return [];
  }
  const weights = selected.validated.weights;
  const comparisonWeightTotal = getCpiMajorWeightTotal(weights);
  return selected.validated.data
    .filter((row) => {
      if (!row["年月"]) return false;
      const parsed = parseYearMonth(row["年月"] as string);
      return parsed ? parsed.year >= 2004 : false;
    })
    .map((row) => {
      const newRow: CpiData = { ...row };
      Object.keys(weights).forEach((key) => {
        const value = row[key];
        if (isFiniteNumber(value)) {
          const denominator = CPI_COMPARISON_COMPONENTS.has(key) ? comparisonWeightTotal : 10_000;
          newRow[key] = (value * weights[key]) / denominator;
        } else {
          // A missing official series must remain missing; zero would fabricate
          // a contribution and corrupt dependent derived values.
          newRow[key] = undefined;
        }
      });
      const foodTotal = newRow.食料;
      const dinedOut = newRow.外食;
      newRow["外食以外食料"] =
        isFiniteNumber(foodTotal) && isFiniteNumber(dinedOut) ? foodTotal - dinedOut : undefined;
      const transport = newRow.交通;
      const autoRelated = newRow["自動車等関係費"];
      newRow["交通・自動車等関係費"] =
        isFiniteNumber(transport) && isFiniteNumber(autoRelated)
          ? transport + autoRelated
          : undefined;
      delete newRow["教養娯楽サービス"];
      delete newRow["教養娯楽用品"];
      delete newRow["交通"];
      delete newRow["自動車等関係費"];
      return newRow;
    });
}

type CtiPair = {
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

function isContinuousMonths(months: string[]): boolean {
  return months.every((month, index) => {
    if (index === 0) return Boolean(parseYearMonth(month));
    const previous = parseYearMonth(months[index - 1]);
    const current = parseYearMonth(month);
    return Boolean(
      previous &&
      current &&
      current.year * 12 + current.month === previous.year * 12 + previous.month + 1,
    );
  });
}

function parseGdpYear(value: string): number | undefined {
  const match = value.trim().match(/^(\d{4})(?:年)?$/);
  return match ? Number(match[1]) : undefined;
}

function validateGdpMetadata(
  metadataPath: string,
  content: string,
  expectedPriceMeasure: GdpSupportMetadata["priceMeasure"],
): GdpSupportMetadata | string {
  if (!fs.existsSync(metadataPath)) return "missing GDP metadata";
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as GdpSupportMetadata;
    if (
      metadata.status !== "ready" ||
      metadata.seriesConcept !== "private-final-consumption-expenditure"
    )
      return "GDP metadata is not ready";
    if (
      metadata.priceMeasure !== expectedPriceMeasure ||
      metadata.displayNormalizationYear !== 2025
    )
      return "GDP metadata measure or normalization year mismatch";
    if (!metadata.unit || metadata.rawValuePreserved !== true || !metadata.period)
      return "GDP metadata unit, raw-value, or period is missing";
    if (!/^[a-f0-9]{64}$/.test(metadata.csvSha256 ?? "")) return "GDP metadata SHA-256 is invalid";
    if (createHash("sha256").update(content).digest("hex") !== metadata.csvSha256)
      return "GDP metadata SHA-256 mismatch";
    return metadata;
  } catch {
    return "invalid GDP metadata";
  }
}

function parseGdpSupport(content: string): Map<number, number> | string {
  const rows = Papa.parse<string[]>(content, {
    header: false,
    skipEmptyLines: false,
  }).data;
  const header = rows.find(
    (row) => row.includes("時間軸（暦年）") && row.includes("民間最終消費支出"),
  );
  if (!header) return "missing GDP year or private-consumption header";
  const yearIndex = header.indexOf("時間軸（暦年）");
  const valueIndex = header.indexOf("民間最終消費支出");
  const values = new Map<number, number>();
  for (const row of rows.slice(rows.indexOf(header) + 1)) {
    const sourceYear = row[yearIndex]?.trim();
    if (!sourceYear) continue;
    const year = parseGdpYear(sourceYear);
    const value = Number(row[valueIndex]?.replace(/,/g, "").trim());
    if (!year || !Number.isFinite(value)) return "invalid GDP year or value";
    if (values.has(year)) return "duplicate GDP year";
    values.set(year, value);
  }
  return values.size > 0 ? values : "GDP support contains no values";
}

function validateGdpSupport(): ValidatedGdpSupport | string {
  const paths = buildCtiFilePaths();
  const required = [
    paths.candidateSupportNominal,
    paths.candidateSupportReal,
    paths.supportNominalMetadata,
    paths.supportRealMetadata,
    paths.gdpDisplayNormalization,
  ];
  if (required.some((filePath) => !fs.existsSync(filePath))) return "missing GDP display set file";
  const nominalContent = fs.readFileSync(paths.candidateSupportNominal, "utf8");
  const realContent = fs.readFileSync(paths.candidateSupportReal, "utf8");
  const nominalMetadata = validateGdpMetadata(
    paths.supportNominalMetadata,
    nominalContent,
    "current-prices",
  );
  const realMetadata = validateGdpMetadata(
    paths.supportRealMetadata,
    realContent,
    "previous-year-chain-linked",
  );
  if (typeof nominalMetadata === "string") return nominalMetadata;
  if (typeof realMetadata === "string") return realMetadata;
  const nominal = parseGdpSupport(nominalContent);
  const real = parseGdpSupport(realContent);
  if (typeof nominal === "string") return nominal;
  if (typeof real === "string") return real;
  const validatePeriod = (metadata: GdpSupportMetadata, values: Map<number, number>) => {
    if (
      metadata.sourceFrequency !== "annual" ||
      metadata.period.annualRows !== values.size ||
      !metadata.period.start ||
      !metadata.period.end
    )
      return false;
    const start = parseGdpYear(metadata.period.start);
    const end = parseGdpYear(metadata.period.end);
    return Boolean(start && end && values.has(start) && values.has(end));
  };
  if (!validatePeriod(nominalMetadata, nominal) || !validatePeriod(realMetadata, real))
    return "GDP metadata period mismatch";
  for (const values of [nominal, real]) {
    const years = [...values.keys()].sort((a, b) => a - b);
    if (
      years.length !== 32 ||
      years[0] !== 1994 ||
      years[years.length - 1] !== 2025 ||
      years.some((year, index) => index > 0 && year !== years[index - 1] + 1)
    ) {
      return "GDP support years must be continuous from 1994 through 2025";
    }
  }
  const nominalFactor = calculateGdp2025NormalizationFactor([nominal.get(2025) ?? NaN]);
  const realFactor = calculateGdp2025NormalizationFactor([real.get(2025) ?? NaN]);
  if (!nominalFactor || !realFactor) return "missing or invalid 2025 annual GDP value";
  try {
    const normalization = JSON.parse(
      fs.readFileSync(paths.gdpDisplayNormalization, "utf8"),
    ) as Record<string, unknown>;
    if (normalization.displayNormalizationYear !== 2025) return "GDP normalization year mismatch";
    for (const [kind, content, expectedPath] of [
      ["nominal", nominalContent, paths.candidateSupportNominal],
      ["real", realContent, paths.candidateSupportReal],
    ] as const) {
      const record = normalization[kind] as Record<string, unknown> | undefined;
      if (
        !record ||
        record.csv !== path.basename(expectedPath) ||
        record.csvSha256 !== createHash("sha256").update(content).digest("hex")
      ) {
        return `GDP normalization ${kind} CSV reference mismatch`;
      }
    }
    const factors = (normalization.factors ?? normalization) as Record<string, unknown>;
    const readFactor = (key: "nominal" | "real") => {
      const value = factors[key];
      return typeof value === "number"
        ? value
        : typeof value === "object" && value !== null
          ? (value as Record<string, unknown>).factor
          : undefined;
    };
    if (readFactor("nominal") !== nominalFactor || readFactor("real") !== realFactor)
      return "GDP normalization factors mismatch";
  } catch {
    return "invalid GDP normalization record";
  }
  return {
    nominal,
    real,
    factors: { nominal: nominalFactor, real: realFactor },
  };
}

export async function getGdpSupportStatus(): Promise<GdpSupportStatus> {
  const validated = validateGdpSupport();
  return typeof validated === "string"
    ? { valid: false, reason: validated }
    : { valid: true, normalizationFactors: validated.factors };
}

function validateQuarterlyGdpSeries(
  csvPath: string,
  metadataPath: string,
  officialPath: string,
  estatPath: string,
  expectedStatsDataId: string,
  expectedPriceMeasure: QuarterlySeries["priceMeasure"],
): { values: Map<string, number>; factor: number; status: string } | string {
  if (![csvPath, metadataPath, officialPath, estatPath].every(fs.existsSync))
    return "missing quarterly GDP artifact";
  const content = fs.readFileSync(csvPath, "utf8");
  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Record<string, unknown>;
  } catch {
    return "invalid quarterly metadata";
  }
  if (metadata.csvSha256 !== createHash("sha256").update(content).digest("hex"))
    return "quarterly CSV SHA-256 mismatch";
  if (
    metadata.frequency !== "quarterly" ||
    (metadata.period as Record<string, unknown> | undefined)?.start !== "2005-Q1" ||
    (metadata.period as Record<string, unknown> | undefined)?.end !== "2025-Q4" ||
    (metadata.period as Record<string, unknown> | undefined)?.rows !== 84
  )
    return "quarterly metadata contract mismatch";
  const estatSource = metadata.estatSource as Record<string, unknown> | undefined;
  if (
    metadata.status !== "ready" ||
    metadata.seriesConcept !== "private-final-consumption-expenditure" ||
    metadata.priceMeasure !== expectedPriceMeasure ||
    metadata.unit !== "billion-yen" ||
    metadata.seasonalAdjustment !== "original" ||
    estatSource?.provider !== "e-Stat" ||
    estatSource.statsDataId !== expectedStatsDataId ||
    typeof estatSource.seriesCode !== "string" ||
    typeof estatSource.seriesName !== "string" ||
    typeof estatSource.unit !== "string" ||
    typeof estatSource.retrievedAt !== "string" ||
    !/^[a-f0-9]{64}$/.test(String(estatSource.jsonSha256))
  )
    return "invalid e-Stat source identity";
  const rows = Papa.parse<QuarterlySeries>(content, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  }).data;
  if (rows.length !== 84) return "quarterly row count mismatch";
  const values = new Map<string, number>();
  for (const row of rows) {
    if (
      !/^\d{4}-Q[1-4]$/.test(row.period) ||
      !Number.isFinite(row.value) ||
      row.value === 0 ||
      values.has(row.period)
    )
      return "invalid quarterly period/value";
    values.set(row.period, row.value);
  }
  const parseSnapshot = (snapshotPath: string) =>
    Papa.parse<QuarterlySeries>(fs.readFileSync(snapshotPath, "utf8"), {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    }).data;
  if (
    estatSource.snapshotFile !== path.basename(estatPath) ||
    estatSource.snapshotCsvSha256 !==
      createHash("sha256").update(fs.readFileSync(estatPath)).digest("hex")
  )
    return "e-Stat snapshot SHA-256 mismatch";
  const officialRows = parseSnapshot(officialPath);
  const estatRows = parseSnapshot(estatPath);
  if (officialRows.length !== 84 || estatRows.length !== 84)
    return "quarterly snapshot row count mismatch";
  for (let index = 0; index < 84; index += 1) {
    const row = rows[index];
    for (const snapshot of [officialRows[index], estatRows[index]]) {
      if (
        snapshot.period !== row.period ||
        snapshot.value !== row.value ||
        snapshot.series !== "private-final-consumption-expenditure" ||
        snapshot.priceMeasure !== expectedPriceMeasure
      )
        return "quarterly snapshot comparison failed";
    }
  }
  const periods = [...values.keys()];
  for (let i = 0; i < periods.length; i++) {
    const year = 2005 + Math.floor(i / 4);
    const quarter = (i % 4) + 1;
    if (periods[i] !== `${year}-Q${quarter}`) return "quarterly series is not continuous";
  }
  const base = ["2025-Q1", "2025-Q2", "2025-Q3", "2025-Q4"].map(
    (period) => values.get(period) ?? NaN,
  );
  const mean = base.reduce((sum, value) => sum + value, 0) / 4;
  if (!Number.isFinite(mean) || mean === 0) return "invalid quarterly normalization base";
  const independentStatus = metadata.independentConfirmation;
  return {
    values,
    factor: 100 / mean,
    status: typeof independentStatus === "string" ? independentStatus : "failed",
  };
}

export function validateQuarterlyGdpSupport(): QuarterlyGdpSupportStatus {
  const paths = buildCtiFilePaths();
  const nominal = validateQuarterlyGdpSeries(
    paths.quarterlySupportNominal,
    paths.quarterlySupportNominalMetadata,
    paths.quarterlyOfficialNominal,
    paths.quarterlyEstatNominal,
    "0003113633",
    "current-prices",
  );
  const real = validateQuarterlyGdpSeries(
    paths.quarterlySupportReal,
    paths.quarterlySupportRealMetadata,
    paths.quarterlyOfficialReal,
    paths.quarterlyEstatReal,
    "0003113612",
    "previous-year-chain-linked",
  );
  if (typeof nominal === "string" || typeof real === "string")
    return {
      valid: false,
      comparisonReady: false,
      independentConfirmation: "failed",
      reason: typeof nominal === "string" ? nominal : (real as string),
    };
  const status =
    nominal.status === "ready" && real.status === "ready"
      ? "ready"
      : "pending-independent-confirmation";
  return {
    valid: true,
    comparisonReady: status === "ready",
    independentConfirmation: status,
    reason: status === "ready" ? undefined : "official values are pending independent confirmation",
    normalizationFactors:
      status === "ready" ? { nominal: nominal.factor, real: real.factor } : undefined,
  };
}

export async function getQuarterlyGdpSupportStatus(): Promise<QuarterlyGdpSupportStatus> {
  return validateQuarterlyGdpSupport();
}

/**
 * Load the independent Plan21 quarterly GDP series.  This deliberately does
 * not derive quarters from the annual GDP path; the raw values come from the
 * validated 84-row artifacts above.
 */
export function loadQuarterlyGdpData(): QuarterlyGdpData {
  const paths = buildCtiFilePaths();
  const nominal = validateQuarterlyGdpSeries(
    paths.quarterlySupportNominal,
    paths.quarterlySupportNominalMetadata,
    paths.quarterlyOfficialNominal,
    paths.quarterlyEstatNominal,
    "0003113633",
    "current-prices",
  );
  const real = validateQuarterlyGdpSeries(
    paths.quarterlySupportReal,
    paths.quarterlySupportRealMetadata,
    paths.quarterlyOfficialReal,
    paths.quarterlyEstatReal,
    "0003113612",
    "previous-year-chain-linked",
  );
  if (typeof nominal === "string" || typeof real === "string") {
    return { rows: [], comparisonReady: false };
  }
  const comparisonReady = nominal.status === "ready" && real.status === "ready";
  const rows = [...nominal.values.keys()].map((period) => {
    const row: QuarterlyGdpRow = {
      period,
      nominalRaw: nominal.values.get(period)!,
      realRaw: real.values.get(period)!,
    };
    if (comparisonReady) {
      row.nominalComparison = row.nominalRaw * nominal.factor;
      row.realComparison = row.realRaw * real.factor;
    }
    return row;
  });
  return { rows, comparisonReady };
}

function validateCtiMetadata(
  metadataPath: string,
  expectedFile: string,
): string | Record<string, unknown> {
  if (!fs.existsSync(metadataPath)) return "missing metadata";
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Record<string, unknown>;
    if (metadata.status !== "ready" || metadata.baseYear !== 2025)
      return "metadata is not ready for 2025";
    const declaredFile = metadata.indexFile ?? metadata.outputFile ?? metadata.file;
    if (declaredFile !== expectedFile) return "metadata file pairing mismatch";
    if (typeof metadata.csvSha256 !== "string" || !/^[a-f0-9]{64}$/.test(metadata.csvSha256))
      return "metadata SHA-256 is missing or invalid";
    return metadata;
  } catch {
    return "invalid metadata";
  }
}

function validateCtiPair(
  pair: CtiPair,
  paths: ReturnType<typeof buildCtiFilePaths>,
): string | CtiPair {
  const requiredPaths =
    pair.baseYear === 2020
      ? [pair.mainPath, pair.supportNominalPath, pair.supportRealPath]
      : [pair.mainPath];
  if (pair.baseYear === 2025) {
    requiredPaths.push(
      paths.seriesMap,
      paths.officialSnapshot,
      paths.metadata,
      paths.candidateDistributionAdjusted,
      paths.candidateDistributionAdjustedMetadata,
    );
  }
  if (requiredPaths.some((filePath) => !fs.existsSync(filePath)))
    return "missing required CTI set file";

  const ctiContent = fs.readFileSync(pair.mainPath, "utf8");
  const parsed = Papa.parse<string[]>(ctiContent, {
    header: false,
    skipEmptyLines: true,
  }).data;
  const headerIndex = parsed.findIndex((row) =>
    row.some((cell) => cell?.trim() === "年月" || cell?.trim() === "月"),
  );
  if (headerIndex < 0) return "missing CTI 年月 header";
  const header = parsed[headerIndex].map((cell) => cell.trim());
  if (!header.includes("消費支出（名目）") || !header.includes("消費支出（実質）"))
    return "missing required CTI total headers";
  const monthIndex = header.indexOf(header.includes("年月") ? "年月" : "月");
  const months = parsed
    .slice(headerIndex + 1)
    .map((row) => row[monthIndex]?.trim())
    .filter((month): month is string => Boolean(month));
  if (months.length === 0 || !isContinuousMonths(months))
    return "invalid or discontinuous CTI 年月";

  if (pair.baseYear === 2025) {
    const readHeaders = (filePath: string) =>
      Papa.parse<string[]>(fs.readFileSync(filePath, "utf8"), {
        header: false,
        skipEmptyLines: true,
      }).data[0]?.map((cell) => cell.trim()) ?? [];
    const seriesMapHeaders = readHeaders(paths.seriesMap);
    if (
      !["official_code", "official_name", "dashboard_key", "value_type"].every((key) =>
        seriesMapHeaders.includes(key),
      )
    )
      return "invalid 2025 series map headers";
    const snapshotHeaders = readHeaders(paths.officialSnapshot);
    if (!["official_code", "official_name"].every((key) => snapshotHeaders.includes(key)))
      return "invalid 2025 official snapshot headers";
    const ctiMetadata = validateCtiMetadata(paths.metadata, path.basename(pair.mainPath));
    if (typeof ctiMetadata === "string") return ctiMetadata;
    if (
      typeof ctiMetadata.sourceBasis !== "string" ||
      typeof ctiMetadata.comparisonNormalization !== "string"
    )
      return "2025 CTI metadata basis fields are missing";
    const period = ctiMetadata.period;
    if (
      !period ||
      typeof period !== "object" ||
      (period as Record<string, unknown>).start !== months[0] ||
      (period as Record<string, unknown>).end !== months.at(-1) ||
      (period as Record<string, unknown>).monthlyRows !== months.length
    )
      return "2025 CTI metadata period mismatch";
    const metadataChecks: [string, string, string][] = [
      [paths.metadata, path.basename(pair.mainPath), ctiContent],
      [
        paths.candidateDistributionAdjustedMetadata,
        path.basename(paths.candidateDistributionAdjusted),
        fs.readFileSync(paths.candidateDistributionAdjusted, "utf8"),
      ],
    ];
    for (const [metadataPath, expectedFile, content] of metadataChecks) {
      const metadata = validateCtiMetadata(metadataPath, expectedFile);
      if (typeof metadata === "string") return metadata;
      if (createHash("sha256").update(content).digest("hex") !== metadata.csvSha256)
        return "metadata SHA-256 mismatch";
    }
    // The map and the independently captured official snapshot are the
    // provenance contract for every adopted CTI column.  Check the snapshot
    // against the actual candidate row, not just the two auxiliary files.
    const parseRecords = (filePath: string) =>
      Papa.parse<Record<string, string>>(fs.readFileSync(filePath, "utf8"), {
        header: true,
        skipEmptyLines: true,
      }).data.map((row) =>
        Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim(), value?.trim()])),
      );
    const seriesMap = parseRecords(paths.seriesMap);
    const officialSnapshot = parseRecords(paths.officialSnapshot);
    const mapByCode = new Map<string, Record<string, string>>();
    for (const row of seriesMap) {
      const code = row.official_code;
      if (!code || mapByCode.has(code) || !row.official_name || !row.dashboard_key)
        return "invalid or duplicate 2025 series map rows";
      mapByCode.set(code, row);
      if (!header.includes(row.dashboard_key))
        return `2025 series map column missing: ${row.dashboard_key}`;
    }
    const officialByCode = new Map<string, Record<string, string>>();
    for (const row of officialSnapshot) {
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
      const representativeMonth = official.representative_month;
      const representativeValue = official.representative_value;
      if (!representativeMonth || !representativeValue)
        return `2025 official representative value missing: ${code}`;
      const representativeRow = parsed
        .slice(headerIndex + 1)
        .find((row) => row[monthIndex]?.trim() === representativeMonth);
      if (!representativeRow)
        return `2025 official representative month missing: ${representativeMonth}`;
      const actualValue = representativeRow[header.indexOf(mapped.dashboard_key)]?.trim();
      if (!actualValue || actualValue !== representativeValue)
        return `2025 official representative value mismatch: ${code}`;
    }
    const values2025 = parsed
      .slice(headerIndex + 1)
      .filter((row) => parseYearMonth(row[monthIndex]?.trim() ?? "")?.year === 2025)
      .map((row) => Number(row[header.indexOf("消費支出（名目）")]?.replace(/,/g, "")))
      .filter(Number.isFinite);
    if (values2025.length !== 12) return "incomplete 2025 CTI calendar year";
  }
  return pair;
}

function selectCtiPair(options: CtiLoadOptions = {}): { pair: CtiPair } | CtiDataStatus {
  const paths = buildCtiFilePaths();
  const automaticPairs: CtiPair[] = [
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
  ];
  const pairs =
    options.source === "rollback-2020"
      ? automaticPairs.filter((pair) => pair.baseYear === 2020)
      : automaticPairs;
  let lastReason = "no complete CTI set";
  for (const pair of pairs) {
    const validation = validateCtiPair(pair, paths);
    if (typeof validation !== "string") return { pair };
    lastReason = `${pair.pair} pair: ${validation}`;
    console.error(`CTI data pair validation failed (${lastReason})`);
  }
  return { baseYear: null, pair: null, valid: false, reason: lastReason };
}

export async function getCtiDataStatus(options: CtiLoadOptions = {}): Promise<CtiDataStatus> {
  const selected = selectCtiPair(options);
  if ("baseYear" in selected) return selected;
  return {
    baseYear: selected.pair.baseYear,
    pair: selected.pair.pair,
    valid: true,
  };
}

export async function loadCtiDataInternal(options: CtiLoadOptions = {}): Promise<CpiData[]> {
  const paths = buildCtiFilePaths();
  const selected = selectCtiPair(options);
  if ("baseYear" in selected) {
    console.error(`CTI data unavailable: ${selected.reason}`);
    return [];
  }
  const { pair } = selected;
  const isLegacy2020 = pair.baseYear === 2020;
  const ctiContent = fs.readFileSync(pair.mainPath, "utf8");
  const nominalSupportContent = isLegacy2020
    ? fs.readFileSync(pair.supportNominalPath, "utf8")
    : "";
  const realSupportContent = isLegacy2020 ? fs.readFileSync(pair.supportRealPath, "utf8") : "";

  const supportMap = new Map<string, number>();
  const supportMapReal = new Map<string, number>();

  const loadSupportMap = (content: string, targetMap: Map<string, number>) => {
    const rows = Papa.parse<string[]>(content, {
      header: false,
      skipEmptyLines: false,
    }).data;
    const headerIndex = rows.findIndex(
      (row) =>
        Array.isArray(row) && row.some((c) => typeof c === "string" && /民間最終消費支出/.test(c)),
    );
    if (headerIndex === -1) return;
    const header = rows[headerIndex].map((c) => (typeof c === "string" ? c.trim() : c));
    const ymIndex = header.indexOf("時間軸（四半期）");
    const valueIndex = header.findIndex((h) => h === "民間最終消費支出");
    rows.slice(headerIndex + 1).forEach((row) => {
      const ym = row[ymIndex];
      const valStr =
        typeof row[valueIndex] === "string"
          ? row[valueIndex].trim().replace(/,/g, "")
          : String(row[valueIndex]);
      const num = parseFloat(valStr);
      if (ym && !isNaN(num)) targetMap.set(ym, num);
    });
  };

  if (isLegacy2020) {
    loadSupportMap(nominalSupportContent, supportMap);
    loadSupportMap(realSupportContent, supportMapReal);
  }

  const rows = Papa.parse<string[]>(ctiContent, {
    header: false,
    skipEmptyLines: false,
  }).data;
  const headerIndex = rows.findIndex(
    (row: (string | undefined)[]) =>
      Array.isArray(row) &&
      row.some(
        (c: string | undefined) =>
          typeof c === "string" && (c.trim() === "月" || c.trim().includes("消費支出（名目）")),
      ),
  );
  if (headerIndex === -1) return [];
  const header = rows[headerIndex].map((c: string | undefined) => (c ?? "").trim());
  const dataRows = rows.slice(headerIndex + 1);
  const mapped = dataRows
    .map((row: (string | undefined)[]) => {
      const obj: Record<string, string | number> = {};
      header.forEach((h: string, i: number) => {
        let val: string | number | undefined = row[i]?.trim();
        if (typeof val === "string") {
          if (h !== "月" && h !== "年月") {
            const numValue = val.replace(/,/g, "");
            if (isLegacy2020) {
              val = numValue === "" || numValue === "-" ? 0 : Number(numValue);
              if (!Number.isFinite(val)) val = 0;
            } else {
              val = numValue === "" || numValue === "-" ? undefined : Number(numValue);
              if (!Number.isFinite(val)) val = undefined;
            }
          }
        }
        if (val !== undefined) obj[h] = val;
      });
      if (typeof obj["月"] === "string" && !obj.年月) obj.年月 = obj["月"];
      const nominalTotal = obj["消費支出（名目）"];
      const realTotal = obj["消費支出（実質）"];
      const nominalKeysList = [
        "食料（名目）",
        "住居（名目）",
        "光熱・水道（名目）",
        "家具・家事用品（名目）",
        "被服及び履物（名目）",
        "保健医療（名目）",
        "交通・通信（名目）",
        "教育（名目）",
        "教養娯楽（名目）",
      ];
      const realKeysList = [
        "食料（実質）",
        "住居（実質）",
        "光熱・水道（実質）",
        "家具・家事用品（実質）",
        "被服及び履物（実質）",
        "保健医療（実質）",
        "交通・通信（実質）",
        "教育（実質）",
        "教養娯楽（実質）",
      ];
      const deriveResidual = (total: unknown, keys: string[]) =>
        typeof total === "number" &&
        Number.isFinite(total) &&
        keys.every((key) => isFiniteNumber(obj[key]))
          ? total - keys.reduce((sum, key) => sum + (obj[key] as number), 0)
          : undefined;
      if (isLegacy2020) {
        const sum = (keys: string[]) =>
          keys.reduce((total, key) => total + (Number(obj[key]) || 0), 0);
        obj["その他の消費支出（名目）"] = Math.max(
          0,
          (Number(nominalTotal) || 0) - sum(nominalKeysList),
        );
        obj["その他の消費支出（実質）"] = Math.max(0, (Number(realTotal) || 0) - sum(realKeysList));
      } else {
        const nominalResidual = deriveResidual(nominalTotal, nominalKeysList);
        const realResidual = deriveResidual(realTotal, realKeysList);
        if (nominalResidual !== undefined) obj["その他の消費支出（名目）"] = nominalResidual;
        if (realResidual !== undefined) obj["その他の消費支出（実質）"] = realResidual;
      }
      const parsed = parseYearMonth(String(obj.年月));
      if (parsed) {
        const q = calculateQuarter(parsed.month);
        const normYm = calculateQuarterLabel(parsed.year, q);
        const nominalSupport = supportMap.get(normYm);
        const realSupport = supportMapReal.get(normYm);
        if (
          obj["民間最終消費支出（名目）"] === undefined &&
          (nominalSupport !== undefined || isLegacy2020)
        ) {
          obj["民間最終消費支出（名目）"] = nominalSupport ?? 0;
        }
        if (
          obj["民間最終消費支出（実質）"] === undefined &&
          (realSupport !== undefined || isLegacy2020)
        ) {
          obj["民間最終消費支出（実質）"] = realSupport ?? 0;
        }
      }
      return obj as unknown as CpiData;
    })
    .filter((row) => {
      if (!row.年月) return false;
      const parsed = parseYearMonth(String(row.年月));
      return parsed ? parsed.year >= 1994 : false;
    });

  const existingMonths = new Set(mapped.map((r) => r.年月));
  for (let y = 1994; y <= 2016; y++) {
    for (let m = 1; m <= 12; m++) {
      const ym = `${y}年${m}月`;
      if (!existingMonths.has(ym)) {
        const q = calculateQuarter(m);
        const normYm = calculateQuarterLabel(y, q);
        const dummyRow: Record<string, string | number> = { 年月: ym };
        if (isLegacy2020) {
          header.forEach((h) => {
            if (h !== "年月" && h !== "月") dummyRow[h] = 0;
          });
        }
        const nominalSupport = supportMap.get(normYm);
        const realSupport = supportMapReal.get(normYm);
        if (isLegacy2020) {
          dummyRow["消費支出（名目）"] = nominalSupport ?? 0;
          dummyRow["消費支出（実質）"] = realSupport ?? 0;
          dummyRow["民間最終消費支出（名目）"] = nominalSupport ?? 0;
          dummyRow["民間最終消費支出（実質）"] = realSupport ?? 0;
          dummyRow["その他の消費支出（名目）"] = 0;
          dummyRow["その他の消費支出（実質）"] = 0;
        }
        mapped.push(dummyRow as unknown as CpiData);
      }
    }
  }

  // Apply validated annual GDP values after recovery rows are present.
  if (!isLegacy2020) {
    const gdpStatus = await getGdpSupportStatus();
    if (gdpStatus.valid && gdpStatus.normalizationFactors) {
      const loadAnnual = (filePath: string) => {
        const rows = Papa.parse<string[]>(fs.readFileSync(filePath, "utf8"), {
          header: false,
          skipEmptyLines: true,
        }).data;
        const header = rows[0] ?? [];
        const yearIndex = header.indexOf("時間軸（暦年）");
        const valueIndex = header.indexOf("民間最終消費支出");
        return new Map(
          rows
            .slice(1)
            .map((row) => [row[yearIndex], Number(row[valueIndex]?.replace(/,/g, ""))] as const)
            .filter(([year, value]) => /^\d{4}$/.test(year ?? "") && Number.isFinite(value)),
        );
      };
      const nominal = loadAnnual(paths.candidateSupportNominal);
      const real = loadAnnual(paths.candidateSupportReal);
      const factors = gdpStatus.normalizationFactors;
      for (const row of mapped) {
        const year = String(parseYearMonth(String(row.年月))?.year ?? "");
        const nominalRaw = nominal.get(year);
        const realRaw = real.get(year);
        if (nominalRaw !== undefined && realRaw !== undefined) {
          row["民間最終消費支出（名目・原値）"] = nominalRaw;
          row["民間最終消費支出（実質・原値）"] = realRaw;
          row["民間最終消費支出（名目・比較指数）"] = nominalRaw * factors.nominal;
          row["民間最終消費支出（実質・比較指数）"] = realRaw * factors.real;
          row["民間最終消費支出（名目）"] = nominalRaw * factors.nominal;
          row["民間最終消費支出（実質）"] = realRaw * factors.real;
        }
      }
    }
  }
  mapped.sort((a, b) => compareYearMonth(String(a.年月), String(b.年月)));
  return mapped;
}
