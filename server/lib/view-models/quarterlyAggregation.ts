import type { CpiData } from "@/types";
import {
  SUPPORT_SERIES_KEY_NOMINAL,
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
} from "@/lib/chartConstants";
import { normalizeYearMonth } from "@/lib/yearMonth";
import { calculateQuarter } from "@/lib/math/quarter";
import type { QuarterlyRow } from "@/types/chart";
import type { QuarterlyGdpData } from "@server/lib/data-loader/cpi";
import { joinQuarterlyGdpRows } from "./quarterlyGdpTransform";
import { isCompleteCtiQuarter } from "@/lib/math/quarterlyCompleteness";
import {
  aggregateCtiBasicNominalQuarterly,
  loadCtiBasicSeries2025,
  type CtiBasicRecord,
  type CtiQuarterlyAggregation,
} from "../ctiBasicSeries2025LongTerm";

export type { QuarterlyRow } from "@/types/chart";

const PLAN38_START_YEAR = 2005;
const PLAN38_END_YEAR = 2017;

function unavailableCtiQuarterly(): CtiQuarterlyAggregation {
  const measurements = new Map<string, NonNullable<QuarterlyRow["measurements"]>[string]>();
  for (let year = PLAN38_START_YEAR; year <= PLAN38_END_YEAR; year += 1) {
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      const label = `${year}Q${quarter}`;
      measurements.set(label, {
        key: SUPPORT_SERIES_KEY_NOMINAL,
        label: "CTIミクロ（名目・四半期平均）",
        unit: "指数",
        source: "e-Stat 公式CTI長期artifact 000040499070",
        valueType: "raw",
        value: null,
        status: "invalid",
        reason: "unavailable",
        frequency: "quarterly",
        aggregation: "simple_mean_of_three_calendar_months",
      });
    }
  }
  return { values: new Map(), measurements, status: "invalid", reason: "unavailable" };
}

/** Build the fixed 52-row Plan38 nominal support projection without GDP or zero-fill. */
export function buildPlan38CtiNominalRows(quarterly: CtiQuarterlyAggregation): QuarterlyRow[] {
  const rows: QuarterlyRow[] = [];
  for (let year = PLAN38_START_YEAR; year <= PLAN38_END_YEAR; year += 1) {
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      const label = `${year}Q${quarter}`;
      const measurement = quarterly.measurements.get(label)!;
      rows.push({
        label,
        quarter,
        年: year,
        年月: `${year}年${(quarter - 1) * 3 + 1}月`,
        [SUPPORT_SERIES_KEY_NOMINAL]: measurement.value,
        measurements: { [SUPPORT_SERIES_KEY_NOMINAL]: measurement },
      } as QuarterlyRow);
    }
  }
  return rows;
}

export function buildPlan38CtiNominalRowsFromRecords(
  records: readonly CtiBasicRecord[],
): QuarterlyRow[] {
  return buildPlan38CtiNominalRows(aggregateCtiBasicNominalQuarterly(records));
}

/** Existing adapter name retained for callers of the aggregation module. */
export function mergeQuarterlyGdpRows(
  nominalRows: QuarterlyRow[],
  realRows: QuarterlyRow[],
  gdp: QuarterlyGdpData,
): { nominal: QuarterlyRow[]; real: QuarterlyRow[] } {
  return joinQuarterlyGdpRows(nominalRows, realRows, gdp);
}

/**
 * Compute quarterly aggregates from monthly CTI data.
 * This is the server-side extraction of computeChartData logic (formerly client-side).
 * @param ctiData Monthly CTI data (388 rows × 30 columns)
 * @param maxCpiDate Latest available date { year, month }
 * @returns { nominal: QuarterlyRow[], real: QuarterlyRow[] }
 */
export function computeQuarterlyAggregates(
  ctiData: CpiData[],
  maxCpiDate: { year: number; month: number },
): { nominal: QuarterlyRow[]; real: QuarterlyRow[] } {
  const nominalKeys = CONSUMPTION_NOMINAL_KEYS;
  const realKeys = CONSUMPTION_REAL_KEYS;

  // Normalize 年月 to canonical form "YYYY年M月"
  const normalizedData: CpiData[] = ctiData.map((d) => ({
    ...d,
    年月: normalizeYearMonth(String(d.年月 || "")),
  }));

  // Determine year range: use all data from 1994 up to maxCpiDate.year
  let minYear = 1994;
  let maxYear = maxCpiDate.year;
  for (const d of normalizedData) {
    const m = String(d.年月).match(/^(\d{4})年/);
    if (m) {
      const y = parseInt(m[1], 10);
      minYear = Math.min(minYear, y);
      maxYear = Math.max(maxYear, y);
    }
  }
  maxYear = Math.min(maxYear, maxCpiDate.year);

  // Create a map of all available months from the data
  const dataMap = new Map(normalizedData.map((d) => [d.年月, d]));
  const allMonths: string[] = [];
  for (let y = minYear; y <= maxYear; y++) {
    for (let m = 1; m <= 12; m++) {
      allMonths.push(`${y}年${m}月`);
    }
  }

  // Fill missing monthly category values for the legacy expense stack only.
  // The pre-2018 CTI nominal support line is built from the dedicated artifact
  // below and must never pass through this compatibility path.
  const filledData: CpiData[] = allMonths.map((yearMonth) => {
    if (dataMap.has(yearMonth)) {
      return dataMap.get(yearMonth)!;
    }
    const emptyItem: CpiData = { 年月: yearMonth } as CpiData;
    [...nominalKeys, ...realKeys].forEach((key) => {
      (emptyItem as Record<string, unknown>)[key] = 0;
    });
    return emptyItem;
  });

  const dataMapFilled = new Map(filledData.map((d) => [d.年月, d]));
  const ctiKeys = [...new Set([...nominalKeys, ...realKeys])];

  // Helper to compute quarterly data
  const getQuarterlyData = (keys: string[]) => {
    const rows: QuarterlyRow[] = [];
    for (let y = minYear; y <= maxYear; y++) {
      const maxQ = y === maxCpiDate.year ? calculateQuarter(maxCpiDate.month) : 4;
      for (let q = 1; q <= maxQ; q++) {
        const months =
          q === 1 ? [1, 2, 3] : q === 2 ? [4, 5, 6] : q === 3 ? [7, 8, 9] : [10, 11, 12];
        const label = `${y}Q${q}`;
        const startMonth = (q - 1) * 3 + 1;
        const item: QuarterlyRow = { label, quarter: q, 年: y, 年月: `${y}年${startMonth}月` };

        keys.forEach((k) => (item[k] = 0));

        months.forEach((m) => {
          const monthStr = `${y}年${m}月`;
          const row = dataMapFilled.get(monthStr);
          if (row) {
            keys.forEach((k) => {
              const v = row[k as keyof CpiData];
              if (typeof v === "number") {
                item[k] = ((item[k] as number) || 0) + v;
              }
            });
          }
        });

        if (keys.length > 0 && !isCompleteCtiQuarter(dataMap, y, q, ctiKeys)) continue;

        // Divide by 3 to get quarterly average
        keys.forEach((k) => {
          item[k] = ((item[k] as number) || 0) / 3;
        });
        rows.push(item);
      }
    }
    return rows;
  };

  const legacyNominalRows = getQuarterlyData(nominalKeys);
  const nominalRows = legacyNominalRows.filter(
    (row) => row.年 < PLAN38_START_YEAR || row.年 > PLAN38_END_YEAR,
  );
  const realRows = getQuarterlyData(realKeys);

  try {
    const records = loadCtiBasicSeries2025("nominal").filter((record) => record.seriesIndex === 1);
    nominalRows.push(...buildPlan38CtiNominalRowsFromRecords(records));
  } catch {
    nominalRows.push(...buildPlan38CtiNominalRows(unavailableCtiQuarterly()));
  }
  nominalRows.sort((left, right) => left.年 - right.年 || left.quarter - right.quarter);

  return {
    nominal: nominalRows,
    real: realRows,
  };
}
