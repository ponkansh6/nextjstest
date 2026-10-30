import type { SeriesMeasurement } from "@/types/chart";
import { QUARTERLY_PUBLIC_NOMINAL_KEYS } from "../../lib/quarterlyPublicProjection";

export interface QuarterlyDataPoint {
  label: string;
  年: number;
  quarter: number;
  年月: string;
  measurements?: Record<string, SeriesMeasurement>;
  [key: string]: string | number | null | Record<string, SeriesMeasurement> | undefined;
}

export function normalizeSpendingChartData(
  data: QuarterlyDataPoint[],
  keys: string[],
): QuarterlyDataPoint[] {
  const quarterlyExpenseKeys = keys.filter((key) =>
    (QUARTERLY_PUBLIC_NOMINAL_KEYS as readonly string[]).includes(key),
  );
  return data.map((row) => {
    const next = { ...row };
    const hasCompositionAdjustedExpense = quarterlyExpenseKeys.some(
      (key) =>
        typeof row[key] === "number" &&
        Number.isFinite(row[key]) &&
        row.measurements?.[key] !== undefined,
    );
    if (row.年 < 2018) {
      // Composition-adjusted measurements supply the pre-2018 expense stack;
      // otherwise hide the unavailable expense values.
      if (!hasCompositionAdjustedExpense) quarterlyExpenseKeys.forEach((key) => (next[key] = null));
    }
    return next;
  });
}
