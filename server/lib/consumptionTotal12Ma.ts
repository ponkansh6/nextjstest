import * as fs from "node:fs";
import * as path from "node:path";
import Papa from "papaparse";
import { loadCtiAdjustedV2Estimate } from "./data-loader/ctiAdjusted";

/**
 * Plan49 Lane C Core Consumption Total 12MA Calculation Layer
 *
 * Implements strict rules from shared_plan/49-newgraph-consumption-total-12ma-plan.md:
 * 1. Historical monthly reconstruction (2004-2016):
 *    - m[y, m] = A[y] * r[y, m] / meanRaw[y]
 *    - 2005-2016 anchors are shared with the Plan39 V2 corrected annual rows.
 *    - 2004 is a private one-year extension using the same V2 category gamma and official pi2plus.
 *    - r loaded from 000040499070.normalized.csv (series_index === 1,二人以上世帯).
 *    - Strict check: all 12 months finite and meanRaw[y] > 0. If incomplete, whole year is invalid.
 * 2. Official monthly observation (2017-01 onwards):
 *    - m[t] = official monthly value from 000040499028.normalized.csv (series_index === 1, 総世帯).
 *    - Missing or non-finite -> remains missing (no interpolation/fallback/quarterly filling).
 * 3. Base year normalization (2025):
 *    - B = mean(m[2025-01..2025-12]). Requires all 12 months finite and B > 0. Otherwise whole series is invalid.
 *    - x[t] = 100 * m[t] / B
 * 4. Strict 12-Month Moving Average (MA12):
 *    - MA12[t] = mean(x[t-11..t]) only if all 12 consecutive calendar months are finite. No partial windows.
 *    - 2014-01 window = 2013-02..2014-01.
 *    - 2018 legacy mask NOT applied.
 * 5. Provenance & Status:
 *    - Monthly level provenance: "historical_estimate" (2005-2016) or "official_monthly_observed" (2017+).
 *    - MA window provenance: accumulated set of sources/provenances across the 12 months.
 *    - Status & reason tracking (valid/invalid, failure closing).
 */

export type ConsumptionMonthlyPoint = {
  yearMonth: string; // "YYYY-MM"
  year: number;
  month: number;
  rawLevel: number | null;
  normalizedValue: number | null; // x[t] = 100 * m[t] / B
  ma12: number | null;
  status: "available" | "unavailable" | "invalid";
  reason: string | null;
  provenance: {
    sourceId: string;
    householdScope: "二人以上の世帯" | "総世帯";
    seriesType: "historical_estimate" | "official_monthly_observed" | "unavailable";
    description: string;
  };
  ma12Provenance?: {
    windowStart: string;
    windowEnd: string;
    sources: string[];
    statuses: string[];
  };
};

export type ConsumptionTotal12MaResult = {
  status: "available" | "invalid";
  reason: string | null;
  baseYearB: number | null;
  points: ConsumptionMonthlyPoint[];
  metadata: {
    displayName: string;
    unit: string;
    frequency: "monthly";
    baseYear: 2025;
    calculation: string;
    sources: string[];
  };
};

export function summarizeConsumptionTotal12MaStatus(
  hasValidBase: boolean,
  points: readonly Pick<ConsumptionMonthlyPoint, "rawLevel" | "ma12" | "status">[],
): { status: "available" | "invalid"; reason: string | null } {
  if (!hasValidBase) {
    return { status: "invalid", reason: "insufficient_or_non_finite_2025_base_period_values" };
  }
  const hasCompleteMa12 = points.some(
    (point) =>
      point.status === "available" && typeof point.ma12 === "number" && Number.isFinite(point.ma12),
  );
  return hasCompleteMa12
    ? { status: "available", reason: null }
    : { status: "invalid", reason: "insufficient_complete_12_month_window" };
}

function resolveRoot(customRoot?: string): string {
  if (customRoot !== undefined) {
    if (!fs.existsSync(customRoot)) {
      throw new Error(`source_root_not_found: ${customRoot}`);
    }
    return customRoot;
  }
  let current = path.resolve(__dirname, "../../..");
  while (true) {
    const candidate = path.join(current, "data", "source");
    if (fs.existsSync(candidate) && fs.existsSync(path.join(current, "package.json"))) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve("data", "source");
    current = parent;
  }
}

type CsvRow = {
  series_index?: string;
  series_name?: string;
  is_missing?: string;
  raw_value?: string;
  month?: string;
};

function isCsvRow(row: unknown): row is CsvRow {
  return typeof row === "object" && row !== null;
}

function load2004Pi2Plus(sourceRoot: string): number | undefined {
  const file = path.join(sourceRoot, "cti-size-composition", "lfs-iv4-2004-pi2plus.csv");
  if (!fs.existsSync(file)) return undefined;
  try {
    const parsed = Papa.parse<Record<string, string>>(fs.readFileSync(file, "utf8"), {
      header: true,
      skipEmptyLines: true,
    });
    if (parsed.errors.length > 0) return undefined;
    const rows = parsed.data.filter(
      (row) => row.year?.trim() === "2004" && row.table?.trim() === "IV-4",
    );
    const numeratorRows = rows.filter(
      (row) => row.household_group?.trim() === "二人以上の一般世帯",
    );
    const denominatorRows = rows.filter((row) => row.household_group?.trim() === "総世帯");
    if (numeratorRows.length !== 1 || denominatorRows.length !== 1) return undefined;
    const numeratorText = numeratorRows[0].households_ten_thousand?.trim() ?? "";
    const denominatorText = denominatorRows[0].households_ten_thousand?.trim() ?? "";
    if (!/^\d+$/.test(numeratorText) || !/^\d+$/.test(denominatorText)) return undefined;
    const numerator = Number(numeratorText);
    const denominator = Number(denominatorText);
    if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) return undefined;
    if (numerator <= 0 || denominator <= numerator) return undefined;
    return numerator / denominator;
  } catch {
    return undefined;
  }
}

export function computeConsumptionTotal12Ma(sourceRoot?: string): ConsumptionTotal12MaResult {
  const root = resolveRoot(sourceRoot);

  // Plan49 and the quarterly nominal graph share the same composition-corrected Plan39 V2 anchors.
  // The 2004 extension is computed inside V2 with the same baseCategoryValue/gamma implementation,
  // but remains outside V2's public rows and years.
  const annualMap = new Map<number, number>();
  const pi2Plus2004 = load2004Pi2Plus(root);
  try {
    const estimate = loadCtiAdjustedV2Estimate({
      artifactRoot: path.join(root, "cti-adjusted"),
      contract: "plan39",
      validatePlan40Inputs: true,
      ...(pi2Plus2004 !== undefined
        ? { prehistoryComposition: { year: 2004, pi2Plus: pi2Plus2004 } }
        : {}),
    });
    for (const row of estimate.rows) {
      if (
        row.year >= 2005 &&
        row.year <= 2016 &&
        row.status === "available" &&
        typeof row.values.総合 === "number" &&
        Number.isFinite(row.values.総合)
      ) {
        annualMap.set(row.year, row.values.総合);
      }
    }
    const anchor2004 = estimate.prehistoryAnchors?.[2004];
    if (typeof anchor2004 === "number" && Number.isFinite(anchor2004)) {
      annualMap.set(2004, anchor2004);
    }
  } catch (err) {
    console.error("Failed to load Plan39 V2 annual anchors for consumption series:", err);
  }

  // 2. Load 000040499070 normalized CSV (historical raw monthly index,二人以上世帯)
  const nominalCsvPath = path.join(
    root,
    "official-cti-2025-long-term",
    "000040499070.normalized.csv",
  );
  const nominalMap = new Map<string, number>();
  const prehistoryCsvPath = path.join(
    root,
    "official-cti-2025-long-term",
    "000040499070.2004-prehistory.csv",
  );
  if (fs.existsSync(prehistoryCsvPath)) {
    try {
      const content = fs.readFileSync(prehistoryCsvPath, "utf8");
      const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
      for (const row of parsed.data) {
        if (!isCsvRow(row)) continue;
        const val = Number(String(row.raw_value || "").replace(/,/g, ""));
        if (row.month && Number.isFinite(val)) nominalMap.set(String(row.month).trim(), val);
      }
    } catch (err) {
      console.error(`Failed to read 2004 prehistory CSV at ${prehistoryCsvPath}:`, err);
    }
  }
  if (fs.existsSync(nominalCsvPath)) {
    try {
      const content = fs.readFileSync(nominalCsvPath, "utf8");
      const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
      for (const row of parsed.data) {
        if (!isCsvRow(row)) continue;
        if (
          (String(row.series_index) === "1" || row.series_name === "消費支出（名目）") &&
          row.is_missing !== "true"
        ) {
          const val = Number(String(row.raw_value || "").replace(/,/g, ""));
          if (Number.isFinite(val) && row.month) {
            nominalMap.set(String(row.month).trim(), val);
          }
        }
      }
    } catch (err) {
      console.error(`Failed to read or parse nominal CSV at ${nominalCsvPath}:`, err);
    }
  }

  // 3. Load 000040499028 normalized CSV (official monthly observation,総世帯)
  const officialMonthlyPath = path.join(
    root,
    "official-cti-2025-long-term",
    "000040499028.normalized.csv",
  );
  const officialMap = new Map<string, number>();
  if (fs.existsSync(officialMonthlyPath)) {
    try {
      const content = fs.readFileSync(officialMonthlyPath, "utf8");
      const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
      for (const row of parsed.data) {
        if (!isCsvRow(row)) continue;
        if (
          (String(row.series_index) === "1" || row.series_name === "消費支出（名目）") &&
          row.is_missing !== "true"
        ) {
          const val = Number(String(row.raw_value || "").replace(/,/g, ""));
          if (Number.isFinite(val) && row.month) {
            officialMap.set(String(row.month).trim(), val);
          }
        }
      }
    } catch (err) {
      console.error(`Failed to read or parse official monthly CSV at ${officialMonthlyPath}:`, err);
    }
  }

  // Determine span: 2005-01 to latest available official month or 2025-12
  const points: ConsumptionMonthlyPoint[] = [];
  const rawLevels = new Map<
    string,
    { value: number; provenance: ConsumptionMonthlyPoint["provenance"] }
  >();

  // Historical years: 2004 - 2016. The 2004 values are calculation-only prehistory.
  for (let y = 2004; y <= 2016; y++) {
    const A_y = annualMap.get(y);
    if (typeof A_y !== "number" || !Number.isFinite(A_y)) {
      for (let m = 1; m <= 12; m++) {
        const ym = `${y}-${String(m).padStart(2, "0")}`;
        rawLevels.set(ym, {
          value: NaN,
          provenance: {
            sourceId: "000040499070",
            householdScope: "二人以上の世帯",
            seriesType: "historical_estimate",
            description: "Missing composition-corrected Plan39 V2 annual anchor A[y]",
          },
        });
      }
      continue;
    }

    const yearRawValues: number[] = [];
    let yearComplete = true;
    for (let m = 1; m <= 12; m++) {
      const ym = `${y}-${String(m).padStart(2, "0")}`;
      const val = nominalMap.get(ym);
      if (val === undefined || !Number.isFinite(val)) {
        yearComplete = false;
        break;
      }
      yearRawValues.push(val);
    }

    if (!yearComplete) {
      for (let m = 1; m <= 12; m++) {
        const ym = `${y}-${String(m).padStart(2, "0")}`;
        rawLevels.set(ym, {
          value: NaN,
          provenance: {
            sourceId: "000040499070",
            householdScope: "二人以上の世帯",
            seriesType: "historical_estimate",
            description: "Incomplete raw monthly data in year",
          },
        });
      }
      continue;
    }

    const meanRaw = yearRawValues.reduce((s, v) => s + v, 0) / 12;
    if (meanRaw <= 0 || !Number.isFinite(meanRaw)) {
      for (let m = 1; m <= 12; m++) {
        const ym = `${y}-${String(m).padStart(2, "0")}`;
        rawLevels.set(ym, {
          value: NaN,
          provenance: {
            sourceId: "000040499070",
            householdScope: "二人以上の世帯",
            seriesType: "historical_estimate",
            description: "Non-positive or non-finite meanRaw",
          },
        });
      }
      continue;
    }

    for (let m = 1; m <= 12; m++) {
      const ym = `${y}-${String(m).padStart(2, "0")}`;
      const r_ym = nominalMap.get(ym)!;
      const m_ym = (A_y * r_ym) / meanRaw;
      rawLevels.set(ym, {
        value: m_ym,
        provenance: {
          sourceId: "000040499070",
          householdScope: "二人以上の世帯",
          seriesType: "historical_estimate",
          description:
            y === 2004
              ? "Private 2004 V2 composition-corrected anchor extension + official two-plus raw monthly seasonal weights"
              : "Plan39 V2 composition-corrected annual anchor +二人以上世帯 raw monthly seasonal weights",
        },
      });
    }
  }

  // Official observation years: 2017-01 onwards
  // Let's find latest year/month in officialMap or up to 2026-12 / current data
  let maxYear = 2025;
  for (const ym of officialMap.keys()) {
    const mMatch = ym.match(/^(\d{4})-(\d{2})$/);
    if (mMatch) {
      maxYear = Math.max(maxYear, Number(mMatch[1]));
    }
  }

  for (let y = 2017; y <= maxYear; y++) {
    for (let m = 1; m <= 12; m++) {
      const ym = `${y}-${String(m).padStart(2, "0")}`;
      const val = officialMap.get(ym);
      if (val !== undefined && Number.isFinite(val)) {
        rawLevels.set(ym, {
          value: val,
          provenance: {
            sourceId: "000040499028",
            householdScope: "総世帯",
            seriesType: "official_monthly_observed",
            description:
              "Official total households monthly distribution adjusted nominal observation",
          },
        });
      } else {
        rawLevels.set(ym, {
          value: NaN,
          provenance: {
            sourceId: "000040499028",
            householdScope: "総世帯",
            seriesType: "unavailable",
            description: "Official monthly observation missing or unavailable",
          },
        });
      }
    }
  }

  // 4. Compute Base Year B = mean(m[2025-01..2025-12])
  let sum2025 = 0;
  let count2025 = 0;
  for (let m = 1; m <= 12; m++) {
    const ym = `2025-${String(m).padStart(2, "0")}`;
    const entry = rawLevels.get(ym);
    if (entry && Number.isFinite(entry.value) && entry.value > 0) {
      sum2025 += entry.value;
      count2025++;
    }
  }

  const baseYearB = count2025 === 12 ? sum2025 / 12 : null;
  if (baseYearB === null || baseYearB <= 0 || !Number.isFinite(baseYearB)) {
    return {
      status: "invalid",
      reason: "insufficient_or_non_finite_2025_base_period_values",
      baseYearB: null,
      points: [],
      metadata: {
        displayName: "消費(総合)",
        unit: "指数",
        frequency: "monthly",
        baseYear: 2025,
        calculation: "12-month moving average of normalized monthly nominal consumption",
        sources: ["000040499070", "000040499028", "B.json", "A.json", "LFS IV-4 2004"],
      },
    };
  }

  // Sort all available year-months chronologically
  const sortedYms = Array.from(rawLevels.keys()).sort();

  // Build normalized values x[t] = 100 * m[t] / B
  const normalizedMap = new Map<string, number>();
  for (const ym of sortedYms) {
    const entry = rawLevels.get(ym)!;
    if (Number.isFinite(entry.value)) {
      normalizedMap.set(ym, (100 * entry.value) / baseYearB);
    }
  }

  // Helper to get 12 consecutive calendar months ending at target ym
  function getConsecutiveWindow(targetYm: string): string[] {
    const match = targetYm.match(/^(\d{4})-(\d{2})$/);
    if (!match) return [];
    let y = Number(match[1]);
    let m = Number(match[2]);
    const window: string[] = [];
    for (let i = 0; i < 12; i++) {
      window.unshift(`${y}-${String(m).padStart(2, "0")}`);
      m--;
      if (m < 1) {
        m = 12;
        y--;
      }
    }
    return window;
  }

  // 5. Build final points with strict MA12 calculation
  for (const ym of sortedYms.filter((month) => month >= "2005-01")) {
    const entry = rawLevels.get(ym)!;
    const rawVal = Number.isFinite(entry.value) ? entry.value : null;
    const normVal = rawVal !== null ? (100 * rawVal) / baseYearB : null;

    const windowMonths = getConsecutiveWindow(ym);
    let windowComplete = windowMonths.length === 12;
    let windowSum = 0;
    const windowSources = new Set<string>();
    const windowStatuses = new Set<string>();

    if (windowComplete) {
      for (const wm of windowMonths) {
        const nVal = normalizedMap.get(wm);
        const wEntry = rawLevels.get(wm);
        if (
          nVal === undefined ||
          !Number.isFinite(nVal) ||
          !wEntry ||
          !Number.isFinite(wEntry.value)
        ) {
          windowComplete = false;
          break;
        }
        windowSum += nVal;
        windowSources.add(wEntry.provenance.sourceId);
        windowStatuses.add(wEntry.provenance.seriesType);
      }
    }

    const ma12 = windowComplete ? windowSum / 12 : null;
    const status = ma12 !== null ? "available" : rawVal !== null ? "unavailable" : "invalid";
    const reason =
      ma12 !== null
        ? null
        : rawVal !== null
          ? "insufficient_window_months_for_ma12"
          : "raw_monthly_value_unavailable";

    points.push({
      yearMonth: ym,
      year: Number(ym.split("-")[0]),
      month: Number(ym.split("-")[1]),
      rawLevel: rawVal,
      normalizedValue: normVal,
      ma12,
      status,
      reason,
      provenance: entry.provenance,
      ma12Provenance: windowComplete
        ? {
            windowStart: windowMonths[0],
            windowEnd: windowMonths[windowMonths.length - 1],
            sources: Array.from(windowSources),
            statuses: Array.from(windowStatuses),
          }
        : undefined,
    });
  }

  // 6. A series is available only if at least one complete MA12 value exists.
  const hasBValid = baseYearB !== null && Number.isFinite(baseYearB) && baseYearB > 0;
  const { status: seriesStatus, reason: seriesReason } = summarizeConsumptionTotal12MaStatus(
    hasBValid,
    points,
  );

  return {
    status: seriesStatus,
    reason: seriesReason,
    baseYearB,
    points,
    metadata: {
      displayName: "消費(総合)",
      unit: "指数",
      frequency: "monthly",
      baseYear: 2025,
      calculation:
        "Strict 12-month moving average of normalized monthly nominal consumption (2004-2016 private historical reconstruction using composition-corrected Plan39 V2 anchors and official two-plus raw seasonal weights; 2005-2016 anchors match the quarterly V2 series; 2017+ official total-household monthly observation)",
      sources: ["000040499070", "000040499028", "B.json", "A.json", "LFS IV-4 2004"],
    },
  };
}

/**
 * Connect to existing data-loader/earnings.ts or export as standard NewGraph monthly consumption adapter.
 * This satisfies the Lane C requirement to provide the core calculation layer and connect to earnings loader path if needed.
 */
export function loadConsumptionTotal12MaSeries(sourceRoot?: string) {
  return computeConsumptionTotal12Ma(sourceRoot);
}
