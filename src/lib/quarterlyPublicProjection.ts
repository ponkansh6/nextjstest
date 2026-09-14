import {
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
} from "./chartConstants";
import type { QuarterlyRow, QuarterlyView } from "@/types/chart";

/** Public quarterly surfaces expose comparison keys while excluding internal GDP raw/index keys. */
export const QUARTERLY_PUBLIC_NOMINAL_KEYS = [
  ...CONSUMPTION_NOMINAL_KEYS,
  SUPPORT_SERIES_KEY_NOMINAL,
] as const;
export const QUARTERLY_PUBLIC_REAL_KEYS = [
  ...CONSUMPTION_REAL_KEYS,
  SUPPORT_SERIES_KEY_REAL,
] as const;
export const QUARTERLY_PUBLIC_KEYS = [
  ...QUARTERLY_PUBLIC_NOMINAL_KEYS,
  ...QUARTERLY_PUBLIC_REAL_KEYS,
] as const;

export type QuarterlyPublicKey = (typeof QUARTERLY_PUBLIC_KEYS)[number];

function publicQuarterLabel(row: QuarterlyRow): string {
  return `${row.年}Q${row.quarter}`;
}

function isQuarterlyRow(row: QuarterlyRow): boolean {
  return (
    Number.isInteger(row.年) &&
    Number.isInteger(row.quarter) &&
    row.quarter >= 1 &&
    row.quarter <= 4 &&
    /^\d{4}Q[1-4]$/.test(row.label)
  );
}

export function projectQuarterlyPublicView(rows: QuarterlyRow[]): QuarterlyView[] {
  return rows.filter(isQuarterlyRow).map((row) => {
    const out: QuarterlyView = {
      label: row.label,
      quarter: row.quarter,
      年: row.年,
      // The established public period contract is YYYYQn on every surface.
      年月: publicQuarterLabel(row),
    };
    for (const key of QUARTERLY_PUBLIC_KEYS) {
      const value = row[key];
      out[key] = typeof value === "number" ? Math.round(value * 100) / 100 : null;
    }
    return out;
  });
}
