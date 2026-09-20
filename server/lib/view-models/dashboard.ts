import type { CpiData } from "@/types";
import type { QuarterlyRow } from "./quarterlyAggregation";

const round2 = (v: number): number => Math.round(v * 100) / 100;

export interface CpiView {
  年月: string;
  [key: string]: string | number | null;
}

export interface CtiView {
  年月: string;
  [key: string]: string | number | null;
}

export interface EarningsView {
  年月: string;
  [key: string]: string | number | null;
}

const PLAN37_FORBIDDEN_KEYS = new Set([
  "民間最終消費支出（名目・原値）",
  "民間最終消費支出（名目・比較指数）",
]);

export interface QuarterlyView {
  label: string;
  quarter: number;
  年: number;
  年月: string;
  [key: string]: number | string;
}

export function toCpiView(rows: CpiData[], selectedKeys: string[]): CpiView[] {
  return rows.map((r) => {
    const out: CpiView = { 年月: r.年月 };
    for (const k of selectedKeys) {
      const v = r[k];
      out[k] = typeof v === "number" && Number.isFinite(v) ? round2(v) : null;
    }
    return out;
  });
}

export function toCtiView(rows: CpiData[], selectedKeys: string[]): CtiView[] {
  return rows.map((r) => {
    const out: CtiView = { 年月: r.年月 };
    for (const k of selectedKeys) {
      const v = r[k];
      out[k] = typeof v === "number" && Number.isFinite(v) ? round2(v) : null;
    }
    return out;
  });
}

export function toEarningsView(rows: CpiData[], selectedKeys: string[]): EarningsView[] {
  const forbidden = selectedKeys.filter((key) => PLAN37_FORBIDDEN_KEYS.has(key));
  if (forbidden.length > 0) {
    throw new Error(`Plan37 public projection contains legacy keys: ${forbidden.join(", ")}`);
  }
  const selectedKeySet = new Set(selectedKeys);
  return rows.map((r) => {
    const out: EarningsView = { 年月: r.年月 };
    const measurements = (r as CpiData & { measurements?: Record<string, unknown> }).measurements;
    Object.defineProperty(out, "measurements", {
      value: measurements
        ? Object.fromEntries(
            Object.entries(measurements).filter(([key]) => selectedKeySet.has(key)),
          )
        : undefined,
      enumerable: true,
    });
    for (const k of selectedKeys) {
      if (k === "年月") continue;
      const v = r[k];
      out[k] = typeof v === "number" && Number.isFinite(v) ? round2(v) : null;
    }
    return out;
  });
}

/** Explicit compatibility projection for GDP/2020 rollback consumers. */
export function toLegacyEarningsView(rows: CpiData[], selectedKeys: string[]): EarningsView[] {
  return rows.map((r) => {
    const out: EarningsView = { 年月: r.年月 };
    for (const key of selectedKeys) {
      const value = r[key];
      out[key] = typeof value === "number" && Number.isFinite(value) ? round2(value) : null;
    }
    return out;
  });
}

export function toQuarterlyView(rows: QuarterlyRow[], selectedKeys: string[]): QuarterlyView[] {
  return rows.map((r) => {
    const out: QuarterlyView = { label: r.label, quarter: r.quarter, 年: r.年, 年月: r.年月 };
    for (const k of selectedKeys) {
      const v = r[k];
      if (typeof v === "number") {
        out[k] = round2(v);
      }
    }
    return out;
  });
}

export function mergeQuarterlyGdpView(
  rows: QuarterlyView[],
  gdpRows: Array<{
    period: string;
    nominalRaw: number;
    realRaw: number;
    nominalComparison?: number;
    realComparison?: number;
  }>,
): QuarterlyView[] {
  // GDP raw/comparison values remain an internal loader contract and never
  // cross the public quarterly view boundary.
  void gdpRows;
  return rows;
}
