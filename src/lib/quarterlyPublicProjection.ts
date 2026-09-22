import {
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
  CTI_ADJUSTED_V2_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY,
  CTI_ADJUSTED_V2_PUBLIC_REGISTRY,
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
} from "./chartConstants";
import type { QuarterlyRow, QuarterlyRowKind, QuarterlyView } from "@/types/chart";

const CTI_ADJUSTED_V2_QUARTERLY_EXPENSE_KEYS = CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.filter(
  (category) => category !== "総合",
).map((category) => CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY[category]);

// The registry is the public ordering contract for the ten Plan40 expenses.
// Keep the assertion close to the projection so a registry/key drift cannot silently
// expose the total or a v1/internal key on the quarterly route.
if (
  CTI_ADJUSTED_V2_QUARTERLY_EXPENSE_KEYS.join("\u0000") !==
  CTI_ADJUSTED_V2_PUBLIC_REGISTRY.filter((entry) => entry.category !== "総合")
    .map((entry) => entry.key)
    .join("\u0000")
) {
  throw new Error("Plan40 quarterly public registry/key order mismatch");
}

/** The established legacy contract remains 22 keys; v2 keys are conditional row fields. */
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
export type QuarterlyPublicMode = "nominal" | "real";

export const QUARTERLY_PLAN40_V2_EXPENSE_KEYS = [
  ...CTI_ADJUSTED_V2_QUARTERLY_EXPENSE_KEYS,
] as const;
export const QUARTERLY_PLAN40_V2_NOMINAL_KEYS = [
  ...QUARTERLY_PLAN40_V2_EXPENSE_KEYS,
  ...QUARTERLY_PUBLIC_NOMINAL_KEYS,
] as const;

function publicKeysForRow(mode: QuarterlyPublicMode, kind: QuarterlyRowKind): readonly string[] {
  if (mode === "nominal" && kind === "plan40-v2-cost-stack") {
    return QUARTERLY_PLAN40_V2_NOMINAL_KEYS;
  }
  return mode === "nominal" ? QUARTERLY_PUBLIC_NOMINAL_KEYS : QUARTERLY_PUBLIC_REAL_KEYS;
}

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

export function projectQuarterlyPublicView(
  rows: QuarterlyRow[],
  mode: QuarterlyPublicMode = "nominal",
  kind?: QuarterlyRowKind,
): QuarterlyView[] {
  return rows.filter(isQuarterlyRow).map((row) => {
    const publicKeys = publicKeysForRow(mode, kind ?? row.kind ?? "legacy-cti");
    const publicKeySet = new Set<string>(publicKeys);
    const out: QuarterlyView = {
      label: row.label,
      quarter: row.quarter,
      年: row.年,
      // The established public period contract is YYYYQn on every surface.
      年月: publicQuarterLabel(row),
    };
    const measurements = row.measurements
      ? Object.fromEntries(
          Object.entries(row.measurements).filter(([key]) => publicKeySet.has(key)),
        )
      : undefined;
    if (measurements && Object.keys(measurements).length > 0) out.measurements = measurements;
    for (const key of publicKeys) {
      const measurement = row.measurements?.[key];
      if (measurement) {
        out[key] = measurement.value;
        continue;
      }
      const value = row[key];
      out[key] = typeof value === "number" ? Math.round(value * 100) / 100 : null;
    }
    return out;
  });
}
