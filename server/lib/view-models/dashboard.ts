import type { CpiData } from "@/types";
import type { QuarterlyRow } from "./quarterlyAggregation";

const round2 = (v: number): number => Math.round(v * 100) / 100;

export interface CpiView {
  年月: string;
  [key: string]: string | number;
}

export interface CtiView {
  年月: string;
  [key: string]: string | number;
}

export interface EarningsView {
  年月: string;
  [key: string]: string | number;
}

export interface QuarterlyView {
  label: string;
  quarter: number;
  年: number;
  [key: string]: number | string;
}

export function toCpiView(rows: CpiData[], selectedKeys: string[]): CpiView[] {
  return rows.map((r) => {
    const out: CpiView = { 年月: r.年月 };
    for (const k of selectedKeys) {
      const v = r[k];
      if (typeof v === "number") {
        out[k] = round2(v);
      }
    }
    return out;
  });
}

export function toCtiView(rows: CpiData[], selectedKeys: string[]): CtiView[] {
  return rows.map((r) => {
    const out: CtiView = { 年月: r.年月 };
    for (const k of selectedKeys) {
      const v = r[k];
      if (typeof v === "number") {
        out[k] = round2(v);
      }
    }
    return out;
  });
}

export function toEarningsView(rows: CpiData[], selectedKeys: string[]): EarningsView[] {
  return rows.map((r) => {
    const out: EarningsView = { 年月: r.年月 };
    for (const k of selectedKeys) {
      const v = r[k];
      if (typeof v === "number") {
        out[k] = round2(v);
      }
    }
    return out;
  });
}

export function toQuarterlyView(rows: QuarterlyRow[], selectedKeys: string[]): QuarterlyView[] {
  return rows.map((r) => {
    const out: QuarterlyView = { label: r.label, quarter: r.quarter, 年: r.年 };
    for (const k of selectedKeys) {
      const v = r[k];
      if (typeof v === "number") {
        out[k] = round2(v);
      }
    }
    return out;
  });
}
