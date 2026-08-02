import type { CpiData } from "@/types";
import {
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
} from "@/lib/chartConstants";
import { applySupportSeriesScaling } from "@server/lib/math/supportSeries";
import { normalizeYearMonth } from "@/lib/yearMonth";
import { calculateQuarter } from "@/lib/math/quarter";

export interface QuarterlyRow {
  年: number;
  quarter: number;
  label: string;
  年月: string;
  [key: string]: number | string;
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

  // Fill in missing months with zero-filled entries
  const filledData: CpiData[] = allMonths.map((yearMonth) => {
    if (dataMap.has(yearMonth)) {
      return dataMap.get(yearMonth)!;
    }
    const emptyItem: CpiData = { 年月: yearMonth } as CpiData;
    [...nominalKeys, ...realKeys, SUPPORT_SERIES_KEY_NOMINAL, SUPPORT_SERIES_KEY_REAL].forEach(
      (key) => {
        (emptyItem as Record<string, unknown>)[key] = 0;
      },
    );
    return emptyItem;
  });

  const dataMapFilled = new Map(filledData.map((d) => [d.年月, d]));
  const nominalMonthsSet = new Set(normalizedData.map((d) => d.年月));

  // Helper to compute quarterly data
  const getQuarterlyData = (keys: string[]) => {
    const rows: QuarterlyRow[] = [];
    for (let y = minYear; y <= maxYear; y++) {
      const maxQ = y === maxCpiDate.year ? calculateQuarter(maxCpiDate.month) : 4;
      for (let q = 1; q <= maxQ; q++) {
        const months =
          q === 1 ? [1, 2, 3] : q === 2 ? [4, 5, 6] : q === 3 ? [7, 8, 9] : [10, 11, 12];
        const label = `${y}年Q${q}`;
        const startMonth = (q - 1) * 3 + 1;
        const item: QuarterlyRow = { label, quarter: q, 年: y, 年月: `${y}年${startMonth}月` };

        // Initialize all keys
        item[SUPPORT_SERIES_KEY_NOMINAL] = 0;
        item[SUPPORT_SERIES_KEY_REAL] = 0;
        keys.forEach((k) => (item[k] = 0));

        let validMonthsCount = 0;
        months.forEach((m) => {
          const monthStr = `${y}年${m}月`;
          const row = dataMapFilled.get(monthStr);
          if (row) {
            if (nominalMonthsSet.has(monthStr)) {
              validMonthsCount++;
            }

            const allKeys = [
              ...new Set([...keys, SUPPORT_SERIES_KEY_NOMINAL, SUPPORT_SERIES_KEY_REAL]),
            ];
            allKeys.forEach((k) => {
              if (k === SUPPORT_SERIES_KEY_NOMINAL || k === SUPPORT_SERIES_KEY_REAL) {
                if (typeof item[k] === "number" && (item[k] as number) > 0) return;
                const v = row[k as keyof CpiData];
                if (typeof v === "number") {
                  item[k] = v;
                }
              } else if (keys.includes(k)) {
                const v = row[k as keyof CpiData];
                if (typeof v === "number") {
                  item[k] = ((item[k] as number) || 0) + v;
                }
              }
            });
          }
        });

        const needsValidation = keys.some(
          (k) => k !== SUPPORT_SERIES_KEY_NOMINAL && k !== SUPPORT_SERIES_KEY_REAL,
        );
        if (needsValidation && validMonthsCount !== 3) {
          keys.forEach((k) => {
            if (k !== SUPPORT_SERIES_KEY_NOMINAL && k !== SUPPORT_SERIES_KEY_REAL) {
              item[k] = 0;
            }
          });
        }

        // Divide by 3 to get quarterly average
        keys.forEach((k) => {
          if (k !== SUPPORT_SERIES_KEY_NOMINAL && k !== SUPPORT_SERIES_KEY_REAL) {
            item[k] = ((item[k] as number) || 0) / 3;
          }
        });
        rows.push(item);
      }
    }
    return rows;
  };

  const nominalRows = getQuarterlyData(nominalKeys);
  const realRows = getQuarterlyData(realKeys);

  applySupportSeriesScaling(nominalRows, SUPPORT_SERIES_KEY_NOMINAL);
  applySupportSeriesScaling(realRows, SUPPORT_SERIES_KEY_REAL);

  return {
    nominal: nominalRows,
    real: realRows,
  };
}
