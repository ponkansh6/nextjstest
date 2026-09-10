import {
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
} from "./chartConstants";
import type { QuarterlyView } from "@/types/chart";
import type { QuarterlyRow } from "../../server/lib/view-models/quarterlyAggregation";

/** Public quarterly surfaces intentionally exclude all internal GDP raw/index keys. */
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

export function projectQuarterlyPublicView(rows: QuarterlyRow[]): QuarterlyView[] {
  return rows.map((row) => {
    const out: QuarterlyView = {
      label: row.label,
      quarter: row.quarter,
      年: row.年,
      // Public quarterly surfaces use the same human-readable period key.
      年月: row.label,
    };
    for (const key of QUARTERLY_PUBLIC_KEYS) {
      const value = row[key];
      if (typeof value === "number") out[key] = Math.round(value * 100) / 100;
    }
    return out;
  });
}
