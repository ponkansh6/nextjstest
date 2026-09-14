import * as fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import Papa from "papaparse";
import { buildCtiFilePaths } from "../dataIo";
import { calculateGdp2025NormalizationFactor } from "../../../src/lib/math/supportSeries";
import {
  calculateQuarterlyComparisonFactor,
  convertQuarterlyRawRows,
  hasContinuousQuarterlyPeriods,
  type QuarterlyGdpComparisonRow,
} from "../view-models/quarterlyGdpTransform";

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
export type QuarterlyGdpRow = QuarterlyGdpComparisonRow;
export type QuarterlyGdpData = { rows: QuarterlyGdpRow[]; comparisonReady: boolean };
export type QuarterlyComparisonMetadata = {
  independentConfirmation?: unknown;
  estatSource?: { comparison?: { status?: unknown; rowsCompared?: unknown; mismatches?: unknown } };
};
export type GdpMetadata = {
  status: "ready";
  seriesConcept: "private-final-consumption-expenditure";
  seriesCode: string;
  seriesName: string;
  priceMeasure: "current-prices" | "previous-year-chain-linked";
  displayNormalizationYear: number;
  unit: string;
  rawValuePreserved: true;
  csvSha256: string;
  sourceFrequency: "annual";
  period: { start: string; end: string; annualRows: number };
};
type QuarterlySeries = { period: string; value: number; series: string; priceMeasure: string };

function year(value: string): number | undefined {
  const match = value.trim().match(/^(\d{4})(?:年)?$/);
  return match ? Number(match[1]) : undefined;
}
function metadata(
  file: string,
  content: string,
  measure: GdpMetadata["priceMeasure"],
): GdpMetadata | string {
  if (!fs.existsSync(file)) return "missing GDP metadata";
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<GdpMetadata>;
    if (
      data.status !== "ready" ||
      data.seriesConcept !== "private-final-consumption-expenditure" ||
      typeof data.seriesCode !== "string" ||
      typeof data.seriesName !== "string"
    )
      return "GDP metadata identity is missing";
    if (
      data.priceMeasure !== measure ||
      data.displayNormalizationYear !== 2025 ||
      data.sourceFrequency !== "annual"
    )
      return "GDP metadata measure, frequency, or normalization year mismatch";
    if (
      !data.unit ||
      data.rawValuePreserved !== true ||
      !data.period ||
      typeof data.period.start !== "string" ||
      typeof data.period.end !== "string" ||
      typeof data.period.annualRows !== "number"
    )
      return "GDP metadata unit, raw-value, or period is missing";
    if (!/^[a-f0-9]{64}$/.test(data.csvSha256 ?? "")) return "GDP metadata SHA-256 is invalid";
    if (createHash("sha256").update(content).digest("hex") !== data.csvSha256)
      return "GDP metadata SHA-256 mismatch";
    return data as GdpMetadata;
  } catch {
    return "invalid GDP metadata";
  }
}
function parseAnnual(content: string): Map<number, number> | string {
  const rows = Papa.parse<string[]>(content, { header: false, skipEmptyLines: false }).data;
  const header = rows.find(
    (row) => row.includes("時間軸（暦年）") && row.includes("民間最終消費支出"),
  );
  if (!header) return "missing GDP year or private-consumption header";
  const yi = header.indexOf("時間軸（暦年）"),
    vi = header.indexOf("民間最終消費支出"),
    values = new Map<number, number>();
  for (const row of rows.slice(rows.indexOf(header) + 1)) {
    const y = row[yi]?.trim();
    if (!y) continue;
    const parsed = year(y),
      value = Number(row[vi]?.replace(/,/g, "").trim());
    if (!parsed || !Number.isFinite(value)) return "invalid GDP year or value";
    if (values.has(parsed)) return "duplicate GDP year";
    values.set(parsed, value);
  }
  return values.size ? values : "GDP support contains no values";
}

export function validateGdpSupport():
  | {
      nominal: Map<number, number>;
      real: Map<number, number>;
      factors: { nominal: number; real: number };
    }
  | string {
  const p = buildCtiFilePaths();
  if (
    [
      p.candidateSupportNominal,
      p.candidateSupportReal,
      p.supportNominalMetadata,
      p.supportRealMetadata,
      p.gdpDisplayNormalization,
    ].some((file) => !fs.existsSync(file))
  )
    return "missing GDP display set file";
  const nc = fs.readFileSync(p.candidateSupportNominal, "utf8"),
    rc = fs.readFileSync(p.candidateSupportReal, "utf8");
  const nm = metadata(p.supportNominalMetadata, nc, "current-prices"),
    rm = metadata(p.supportRealMetadata, rc, "previous-year-chain-linked");
  const nominal = parseAnnual(nc),
    real = parseAnnual(rc);
  if (typeof nm === "string") return nm;
  if (typeof rm === "string") return rm;
  if (typeof nominal === "string") return nominal;
  if (typeof real === "string") return real;
  for (const [m, values] of [
    [nm, nominal],
    [rm, real],
  ] as const) {
    const start = year(m.period.start),
      end = year(m.period.end),
      years = [...values.keys()].sort((a, b) => a - b);
    if (
      m.sourceFrequency !== "annual" ||
      m.period.annualRows !== values.size ||
      !start ||
      !end ||
      !values.has(start) ||
      !values.has(end)
    )
      return "GDP metadata period mismatch";
    if (
      years.length !== 32 ||
      years[0] !== 1994 ||
      years.at(-1) !== 2025 ||
      years.some((y, i) => i > 0 && y !== years[i - 1] + 1)
    )
      return "GDP support years must be continuous from 1994 through 2025";
  }
  const nf = calculateGdp2025NormalizationFactor([nominal.get(2025)!]),
    rf = calculateGdp2025NormalizationFactor([real.get(2025)!]);
  if (!nf || !rf) return "missing or invalid 2025 annual GDP value";
  try {
    const normalization = JSON.parse(fs.readFileSync(p.gdpDisplayNormalization, "utf8")) as Record<
      string,
      unknown
    >;
    if (normalization.displayNormalizationYear !== 2025) return "GDP normalization year mismatch";
    for (const [kind, content, expected] of [
      ["nominal", nc, p.candidateSupportNominal],
      ["real", rc, p.candidateSupportReal],
    ] as const) {
      const record = normalization[kind] as Record<string, unknown> | undefined;
      if (
        !record ||
        record.csv !== path.basename(expected) ||
        record.csvSha256 !== createHash("sha256").update(content).digest("hex")
      )
        return `GDP normalization ${kind} CSV reference mismatch`;
    }
    const factors = (normalization.factors ?? normalization) as Record<string, unknown>;
    const factor = (kind: "nominal" | "real") =>
      typeof factors[kind] === "number"
        ? factors[kind]
        : (factors[kind] as Record<string, number> | undefined)?.factor;
    if (factor("nominal") !== nf || factor("real") !== rf)
      return "GDP normalization factors mismatch";
  } catch {
    return "invalid GDP normalization record";
  }
  return { nominal, real, factors: { nominal: nf, real: rf } };
}
export function getGdpSupportStatus(): GdpSupportStatus {
  const result = validateGdpSupport();
  return typeof result === "string"
    ? { valid: false, reason: result }
    : { valid: true, normalizationFactors: result.factors };
}

type QuarterlyValidation = {
  values: Map<string, number>;
  factor: number;
  status: "pending-independent-confirmation" | "ready" | "failed";
};
function haveSameQuarterlyPeriods(
  nominal: Map<string, number>,
  real: Map<string, number>,
): boolean {
  return nominal.size === real.size && [...nominal.keys()].every((period) => real.has(period));
}

/** Metadata-only predicate; it never validates or transforms quarterly rows. */
export function isQuarterlyComparisonReady(metadata: unknown): boolean {
  const record = metadata as QuarterlyComparisonMetadata | null;
  const source = record?.estatSource;
  const comparison = source?.comparison;
  return (
    record?.independentConfirmation === "ready" &&
    comparison?.status === "ready" &&
    comparison.rowsCompared === 84 &&
    comparison.mismatches === 0
  );
}
function validateQuarterlySeries(
  csv: string,
  metaFile: string,
  official: string,
  estat: string,
  id: string,
  measure: string,
): QuarterlyValidation | string {
  if (![csv, metaFile, official, estat].every(fs.existsSync))
    return "missing quarterly GDP artifact";
  const content = fs.readFileSync(csv, "utf8");
  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
  } catch {
    return "invalid quarterly metadata";
  }
  if (meta.csvSha256 !== createHash("sha256").update(content).digest("hex"))
    return "quarterly CSV SHA-256 mismatch";
  const period = meta.period as Record<string, unknown> | undefined,
    source = meta.estatSource as Record<string, unknown> | undefined,
    comparison = source?.comparison as Record<string, unknown> | undefined;
  if (
    meta.frequency !== "quarterly" ||
    period?.start !== "2005-Q1" ||
    period?.end !== "2025-Q4" ||
    period?.rows !== 84
  )
    return "quarterly metadata contract mismatch";
  if (
    meta.status !== "ready" ||
    meta.seriesConcept !== "private-final-consumption-expenditure" ||
    meta.priceMeasure !== measure ||
    meta.unit !== "billion-yen" ||
    meta.seasonalAdjustment !== "original" ||
    source?.provider !== "e-Stat" ||
    source.statsDataId !== id ||
    typeof source.seriesCode !== "string" ||
    typeof source.seriesName !== "string" ||
    typeof source.unit !== "string" ||
    typeof source.retrievedAt !== "string" ||
    !/^[a-f0-9]{64}$/.test(String(source.jsonSha256)) ||
    !comparison ||
    !["pending", "ready", "failed"].includes(String(comparison.status)) ||
    comparison.rowsCompared !== 84 ||
    typeof comparison.mismatches !== "number"
  )
    return "invalid e-Stat source identity or comparison record";
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
  if (
    source.snapshotFile !== path.basename(estat) ||
    source.snapshotCsvSha256 !==
      createHash("sha256").update(fs.readFileSync(estat)).digest("hex") ||
    createHash("sha256").update(fs.readFileSync(official)).digest("hex") !==
      createHash("sha256").update(content).digest("hex")
  )
    return "quarterly snapshot SHA-256 mismatch";
  const parse = (file: string) =>
    Papa.parse<QuarterlySeries>(fs.readFileSync(file, "utf8"), {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    });
  const officialParsed = parse(official),
    estatParsed = parse(estat),
    officialRows = officialParsed.data,
    estatRows = estatParsed.data;
  if (
    ![officialParsed, estatParsed].every((parsed) =>
      ["period", "value", "series", "priceMeasure"].every((header) =>
        parsed.meta.fields?.includes(header),
      ),
    ) ||
    officialRows.length !== 84 ||
    estatRows.length !== 84
  )
    return "quarterly snapshot shape mismatch";
  for (let i = 0; i < 84; i++)
    for (const snap of [officialRows[i], estatRows[i]])
      if (
        snap.period !== rows[i].period ||
        !Number.isFinite(snap.value) ||
        snap.value !== rows[i].value ||
        snap.series !== "private-final-consumption-expenditure" ||
        snap.priceMeasure !== measure
      )
        return "quarterly snapshot comparison failed";
  const periods = [...values.keys()];
  if (!hasContinuousQuarterlyPeriods(periods)) return "quarterly series is not continuous";
  const factor = calculateQuarterlyComparisonFactor(
    ["2025-Q1", "2025-Q2", "2025-Q3", "2025-Q4"].map((period) => values.get(period)!),
  );
  if (factor === undefined) return "invalid quarterly normalization base";
  const confirmation = meta.independentConfirmation;
  if (
    typeof confirmation !== "string" ||
    !["pending-independent-confirmation", "ready", "failed"].includes(confirmation)
  )
    return "invalid independent confirmation status";
  if (comparison.status === "ready" && comparison.mismatches !== 0)
    return "quarterly independent comparison failed";
  const status = isQuarterlyComparisonReady(meta)
    ? "ready"
    : comparison.status === "failed"
      ? "failed"
      : "pending-independent-confirmation";
  return { values, factor, status };
}
export function validateQuarterlyGdpSupport(): QuarterlyGdpSupportStatus {
  const p = buildCtiFilePaths(),
    n = validateQuarterlySeries(
      p.quarterlySupportNominal,
      p.quarterlySupportNominalMetadata,
      p.quarterlyOfficialNominal,
      p.quarterlyEstatNominal,
      "0003113633",
      "current-prices",
    ),
    r = validateQuarterlySeries(
      p.quarterlySupportReal,
      p.quarterlySupportRealMetadata,
      p.quarterlyOfficialReal,
      p.quarterlyEstatReal,
      "0003113612",
      "previous-year-chain-linked",
    );
  if (typeof n === "string" || typeof r === "string")
    return {
      valid: false,
      comparisonReady: false,
      independentConfirmation: "failed",
      reason:
        typeof n === "string" ? n : typeof r === "string" ? r : "quarterly GDP validation failed",
    };
  if (!haveSameQuarterlyPeriods(n.values, r.values))
    return {
      valid: false,
      comparisonReady: false,
      independentConfirmation: "failed",
      reason: "nominal and real quarterly GDP periods mismatch",
    };
  const status =
    n.status === "ready" && r.status === "ready"
      ? "ready"
      : n.status === "failed" || r.status === "failed"
        ? "failed"
        : "pending-independent-confirmation";
  return {
    valid: true,
    comparisonReady: status === "ready",
    independentConfirmation: status,
    reason: status === "ready" ? undefined : "official values are pending independent confirmation",
    normalizationFactors: status === "ready" ? { nominal: n.factor, real: r.factor } : undefined,
  };
}
export function loadQuarterlyGdpData(): QuarterlyGdpData {
  const p = buildCtiFilePaths(),
    n = validateQuarterlySeries(
      p.quarterlySupportNominal,
      p.quarterlySupportNominalMetadata,
      p.quarterlyOfficialNominal,
      p.quarterlyEstatNominal,
      "0003113633",
      "current-prices",
    ),
    r = validateQuarterlySeries(
      p.quarterlySupportReal,
      p.quarterlySupportRealMetadata,
      p.quarterlyOfficialReal,
      p.quarterlyEstatReal,
      "0003113612",
      "previous-year-chain-linked",
    );
  if (
    typeof n === "string" ||
    typeof r === "string" ||
    !haveSameQuarterlyPeriods(n.values, r.values)
  )
    return { rows: [], comparisonReady: false };
  const ready = n.status === "ready" && r.status === "ready";
  const rows = [...n.values.keys()].map((period) => ({
    period,
    nominalRaw: n.values.get(period)!,
    realRaw: r.values.get(period)!,
  }));
  return {
    comparisonReady: ready,
    rows: ready ? convertQuarterlyRawRows(rows, { nominal: n.factor, real: r.factor }) : rows,
  };
}
export async function getQuarterlyGdpSupportStatus(): Promise<QuarterlyGdpSupportStatus> {
  return validateQuarterlyGdpSupport();
}
