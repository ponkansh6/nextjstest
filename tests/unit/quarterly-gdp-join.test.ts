import { describe, expect, it } from "vitest";
import {
  mergeQuarterlyGdpRows,
  type QuarterlyRow,
} from "../../server/lib/view-models/quarterlyAggregation";
import { buildQuarterlyPublicViews } from "../../server/lib/view-models/quarterlyProjection";

const rows = (): [QuarterlyRow[], QuarterlyRow[]] => [
  [
    { 年: 2024, quarter: 4, label: "2024Q4", 年月: "2024年10月", "民間最終消費支出（名目）": 0 },
    { 年: 2025, quarter: 1, label: "2025Q1", 年月: "2025年1月", "民間最終消費支出（名目）": 0 },
  ],
  [
    { 年: 2024, quarter: 4, label: "2024Q4", 年月: "2024年10月", "民間最終消費支出（実質）": 0 },
    { 年: 2025, quarter: 1, label: "2025Q1", 年月: "2025年1月", "民間最終消費支出（実質）": 0 },
  ],
];

describe("quarterly GDP join", () => {
  it("joins exact year-quarter keys across the 2024-Q4/2025-Q1 boundary and drops invalid values", () => {
    const [nominal, real] = rows();
    const joined = mergeQuarterlyGdpRows(nominal, real, {
      comparisonReady: true,
      rows: [
        {
          period: "2025-Q1",
          nominalRaw: 1,
          realRaw: 1,
          nominalComparison: 101,
          realComparison: 99,
        },
        {
          period: "2024-Q4",
          nominalRaw: 1,
          realRaw: 1,
          nominalComparison: Number.NaN,
          realComparison: Infinity,
        },
        { period: "2025-Q2", nominalRaw: 1, realRaw: 1, nominalComparison: 77, realComparison: 78 },
      ],
    });
    expect(joined.nominal[1]["民間最終消費支出（名目）"]).toBe(101);
    expect(joined.real[1]["民間最終消費支出（実質）"]).toBe(99);
    expect(joined.nominal[0]).not.toHaveProperty("民間最終消費支出（名目）");
    expect(joined.real[0]).not.toHaveProperty("民間最終消費支出（実質）");
  });

  it("does not join malformed, out-of-range, missing, or non-finite GDP periods", () => {
    const [nominal, real] = rows();
    const joined = mergeQuarterlyGdpRows(nominal, real, {
      comparisonReady: true,
      rows: [
        { period: "2025-Q0", nominalRaw: 1, realRaw: 1, nominalComparison: 1, realComparison: 1 },
        { period: "2025-Q5", nominalRaw: 1, realRaw: 1, nominalComparison: 2, realComparison: 2 },
        { period: "2026-Q1", nominalRaw: 1, realRaw: 1, nominalComparison: 3, realComparison: 3 },
        {
          period: "2025-Q1",
          nominalRaw: 1,
          realRaw: 1,
          nominalComparison: Number.NaN,
          realComparison: Infinity,
        },
      ],
    });
    expect(joined.nominal.every((row) => !("民間最終消費支出（名目）" in row))).toBe(true);
    expect(joined.real.every((row) => !("民間最終消費支出（実質）" in row))).toBe(true);
  });

  it("treats an unready GDP dataset as missing while retaining CTI rows", () => {
    const [nominal, real] = rows();
    const joined = mergeQuarterlyGdpRows(nominal, real, { comparisonReady: false, rows: [] });
    expect(nominal).toHaveLength(2);
    expect(real).toHaveLength(2);
    expect(joined.nominal[1]).not.toHaveProperty("民間最終消費支出（名目）");
  });

  it("clears GDP keys from duplicate input rows and sets only the first indexed row", () => {
    const [nominal, real] = rows();
    nominal.push({ ...nominal[1], "民間最終消費支出（名目）": 999 });
    real.push({ ...real[1], "民間最終消費支出（実質）": 999 });
    const joined = mergeQuarterlyGdpRows(nominal, real, {
      comparisonReady: true,
      rows: [
        {
          period: "2025-Q1",
          nominalRaw: 1,
          realRaw: 1,
          nominalComparison: 101,
          realComparison: 99,
        },
      ],
    });
    expect(joined.nominal[1]["民間最終消費支出（名目）"]).toBe(101);
    expect(joined.nominal[2]).not.toHaveProperty("民間最終消費支出（名目）");
    expect(joined.real[1]["民間最終消費支出（実質）"]).toBe(99);
    expect(joined.real[2]).not.toHaveProperty("民間最終消費支出（実質）");
    expect(joined.nominal[2]).toMatchObject({ 年: 2025, quarter: 1, label: "2025Q1" });
    expect(joined.real[2]).toMatchObject({ 年: 2025, quarter: 1, label: "2025Q1" });
  });

  it("keeps CTI rows and omits GDP keys across the unready join-to-public path", () => {
    const [nominal, real] = rows();
    const projected = buildQuarterlyPublicViews(nominal, real, {
      comparisonReady: false,
      rows: [],
    });

    expect(projected.nominal).toHaveLength(2);
    expect(projected.real).toHaveLength(2);
    expect(projected.nominal[1]).toMatchObject({ label: "2025Q1", 年: 2025, quarter: 1 });
    expect(projected.nominal[1]).not.toHaveProperty("民間最終消費支出（名目）");
    expect(projected.nominal[1]).not.toHaveProperty("nominalRaw");
    expect(projected.real[1]).not.toHaveProperty("民間最終消費支出（実質・比較指数）");
  });

  it("publishes only rounded nominal/real comparisons without raw or internal keys", () => {
    const [nominal, real] = rows();
    const projected = buildQuarterlyPublicViews(nominal, real, {
      comparisonReady: true,
      rows: [
        {
          period: "2025-Q1",
          nominalRaw: 111,
          realRaw: 222,
          nominalComparison: 101.236,
          realComparison: 98.764,
        },
      ],
    });

    expect(projected.nominal[1]["民間最終消費支出（名目）"]).toBe(101.24);
    expect(projected.real[1]["民間最終消費支出（実質）"]).toBe(98.76);
    expect(projected.nominal[1]).not.toHaveProperty("nominalRaw");
    expect(projected.nominal[1]).not.toHaveProperty("nominalComparison");
    expect(projected.real[1]).not.toHaveProperty("realRaw");
    expect(projected.real[1]).not.toHaveProperty("realComparison");
  });
});
