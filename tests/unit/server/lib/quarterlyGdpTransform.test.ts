import { describe, expect, it } from "vitest";
import {
  calculateQuarterlyComparisonFactor,
  convertQuarterlyRawRows,
  hasContinuousQuarterlyPeriods,
  isQuarterlyPeriod,
  joinQuarterlyGdpRows,
} from "../../../../server/lib/view-models/quarterlyGdpTransform";
import {
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
} from "../../../../src/lib/chartConstants";

describe("quarterly GDP pure transformations", () => {
  it("accepts exact quarter keys and validates year-boundary continuity", () => {
    expect(isQuarterlyPeriod("2024-Q4")).toBe(true);
    expect(isQuarterlyPeriod("2024-Q0")).toBe(false);
    expect(hasContinuousQuarterlyPeriods(["2024-Q4", "2025-Q1"], "2024-Q4", "2025-Q1")).toBe(true);
    expect(hasContinuousQuarterlyPeriods(["2024-Q4", "2025-Q2"], "2024-Q4", "2025-Q1")).toBe(false);
  });

  it("rejects duplicate, missing, out-of-range, and reverse-ordered periods", () => {
    expect(hasContinuousQuarterlyPeriods(["2024-Q4", "2024-Q4"], "2024-Q4", "2025-Q1")).toBe(false);
    expect(hasContinuousQuarterlyPeriods(["2024-Q4", "2025-Q2"], "2024-Q4", "2025-Q2")).toBe(false);
    expect(hasContinuousQuarterlyPeriods(["2024-Q3", "2024-Q4"], "2024-Q4", "2025-Q1")).toBe(false);
    expect(
      hasContinuousQuarterlyPeriods(["2024-Q4", "2025-Q1", "2025-Q2"], "2024-Q4", "2025-Q1"),
    ).toBe(false);
    expect(hasContinuousQuarterlyPeriods(["2025-Q1", "2024-Q4"], "2024-Q4", "2025-Q1")).toBe(false);
  });

  it("computes and applies independent nominal and real comparison factors", () => {
    const nominal = calculateQuarterlyComparisonFactor([10, 20, 30, 40]);
    const real = calculateQuarterlyComparisonFactor([20, 20, 20, 20]);
    expect(nominal).toBe(4);
    expect(real).toBe(5);
    expect(calculateQuarterlyComparisonFactor([1, 2, 3])).toBeUndefined();
    expect(
      convertQuarterlyRawRows([{ period: "2025-Q1", nominalRaw: 10, realRaw: 20 }], {
        nominal: nominal!,
        real: real!,
      }),
    ).toEqual([
      {
        period: "2025-Q1",
        nominalRaw: 10,
        realRaw: 20,
        nominalComparison: 40,
        realComparison: 100,
      },
    ]);
  });

  it("preserves nominal and real raw inputs while converting both series", () => {
    const input = [
      { period: "2025-Q1", nominalRaw: 10, realRaw: 20 },
      { period: "2025-Q2", nominalRaw: 30, realRaw: 40 },
    ];
    const before = structuredClone(input);

    expect(convertQuarterlyRawRows(input, { nominal: 2, real: 3 })).toEqual([
      { period: "2025-Q1", nominalRaw: 10, realRaw: 20, nominalComparison: 20, realComparison: 60 },
      {
        period: "2025-Q2",
        nominalRaw: 30,
        realRaw: 40,
        nominalComparison: 60,
        realComparison: 120,
      },
    ]);
    expect(input).toEqual(before);
  });

  it("fails closed for non-finite raw observations", () => {
    const [row] = convertQuarterlyRawRows(
      [{ period: "2025-Q1", nominalRaw: Number.NaN, realRaw: Infinity }],
      { nominal: 1, real: 1 },
    );
    expect(row.nominalComparison).toBeUndefined();
    expect(row.realComparison).toBeUndefined();
  });

  it("joins exact keys without mutating inputs and fails closed for invalid comparisons", () => {
    const nominal = [
      { 年: 2025, quarter: 1, label: "2025Q1", 年月: "2025年1月", "民間最終消費支出（名目）": 9 },
    ];
    const real = [
      { 年: 2025, quarter: 1, label: "2025Q1", 年月: "2025年1月", "民間最終消費支出（実質）": 9 },
    ];
    const joined = joinQuarterlyGdpRows(nominal, real, {
      comparisonReady: true,
      rows: [
        {
          period: "2025-Q1",
          nominalRaw: 1,
          realRaw: 1,
          nominalComparison: 101,
          realComparison: Number.NaN,
        },
        {
          period: "2025-Q2",
          nominalRaw: 1,
          realRaw: 1,
          nominalComparison: 202,
          realComparison: 202,
        },
      ],
    });
    expect(joined.nominal[0]["民間最終消費支出（名目）"]).toBe(101);
    expect(joined.real[0]).not.toHaveProperty("民間最終消費支出（実質）");
    expect(nominal[0]["民間最終消費支出（名目）"]).toBe(9);
  });

  it("handles ready and unready inputs for both series and removes existing support keys", () => {
    const nominal = [
      {
        年: 2025,
        quarter: 1,
        label: "2025Q1",
        年月: "2025年1月",
        [SUPPORT_SERIES_KEY_NOMINAL]: 1,
        [SUPPORT_SERIES_KEY_REAL]: 2,
      },
    ];
    const real = [
      {
        年: 2025,
        quarter: 1,
        label: "2025Q1",
        年月: "2025年1月",
        [SUPPORT_SERIES_KEY_NOMINAL]: 3,
        [SUPPORT_SERIES_KEY_REAL]: 4,
      },
    ];
    const gdp = {
      rows: [
        {
          period: "2025-Q1",
          nominalRaw: 10,
          realRaw: 20,
          nominalComparison: 110,
          realComparison: 120,
        },
      ],
      comparisonReady: true,
    };
    const beforeNominal = structuredClone(nominal);
    const beforeReal = structuredClone(real);

    const ready = joinQuarterlyGdpRows(nominal, real, gdp);
    expect(ready.nominal[0][SUPPORT_SERIES_KEY_NOMINAL]).toBe(110);
    expect(ready.real[0][SUPPORT_SERIES_KEY_REAL]).toBe(120);
    expect(nominal).toEqual(beforeNominal);
    expect(real).toEqual(beforeReal);

    const unready = joinQuarterlyGdpRows(nominal, real, { ...gdp, comparisonReady: false });
    expect(unready.nominal[0]).not.toHaveProperty(SUPPORT_SERIES_KEY_NOMINAL);
    expect(unready.nominal[0]).not.toHaveProperty(SUPPORT_SERIES_KEY_REAL);
    expect(unready.real[0]).not.toHaveProperty(SUPPORT_SERIES_KEY_NOMINAL);
    expect(unready.real[0]).not.toHaveProperty(SUPPORT_SERIES_KEY_REAL);
  });

  it("does not index CTI rows with invalid year or quarter values", () => {
    const nominal = [
      { 年: Number.NaN, quarter: 1, label: "invalid", 年月: "invalid" },
      { 年: 2025, quarter: 0, label: "invalid", 年月: "invalid" },
      { 年: 2025, quarter: 1, label: "2025Q1", 年月: "2025年1月" },
    ];
    const real = nominal.map((row) => ({ ...row }));
    const joined = joinQuarterlyGdpRows(nominal, real, {
      comparisonReady: true,
      rows: [
        { period: "2025-Q1", nominalRaw: 1, realRaw: 1, nominalComparison: 10, realComparison: 20 },
      ],
    });
    expect(joined.nominal[0]).not.toHaveProperty("民間最終消費支出（名目）");
    expect(joined.nominal[1]).not.toHaveProperty("民間最終消費支出（名目）");
    expect(joined.nominal[2]["民間最終消費支出（名目）"]).toBe(10);
  });
});
