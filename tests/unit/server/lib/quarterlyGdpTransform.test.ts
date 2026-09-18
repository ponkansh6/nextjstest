import { describe, expect, it } from "vitest";
import {
  calculateQuarterlyComparisonFactor,
  convertQuarterlyRawRows,
  hasContinuousQuarterlyPeriods,
  isQuarterlyPeriod,
  joinQuarterlyGdpRows,
} from "../../../../server/lib/view-models/quarterlyGdpTransform";
import { SUPPORT_SERIES_KEY_REAL } from "../../../../src/lib/chartConstants";

describe("quarterly GDP compatibility transformations", () => {
  it("validates canonical quarter keys and continuity", () => {
    expect(isQuarterlyPeriod("2024-Q4")).toBe(true);
    expect(isQuarterlyPeriod("2024-Q0")).toBe(false);
    expect(hasContinuousQuarterlyPeriods(["2024-Q4", "2025-Q1"], "2024-Q4", "2025-Q1")).toBe(true);
    expect(hasContinuousQuarterlyPeriods(["2024-Q4", "2025-Q2"], "2024-Q4", "2025-Q1")).toBe(false);
  });

  it("keeps independent raw-to-comparison calculations fail-closed", () => {
    expect(calculateQuarterlyComparisonFactor([10, 20, 30, 40])).toBe(4);
    expect(calculateQuarterlyComparisonFactor([1, 2, 3])).toBeUndefined();
    expect(
      convertQuarterlyRawRows([{ period: "2025-Q1", nominalRaw: 10, realRaw: 20 }], {
        nominal: 2,
        real: 3,
      }),
    ).toEqual([
      { period: "2025-Q1", nominalRaw: 10, realRaw: 20, nominalComparison: 20, realComparison: 60 },
    ]);
    expect(
      convertQuarterlyRawRows([{ period: "2025-Q1", nominalRaw: Number.NaN, realRaw: Infinity }], {
        nominal: 1,
        real: 1,
      })[0],
    ).toEqual({
      period: "2025-Q1",
      nominalRaw: Number.NaN,
      realRaw: Infinity,
    });
  });

  it("joins only real GDP compatibility values and leaves nominal CTI untouched", () => {
    const nominal = [
      {
        年: 2025,
        quarter: 1,
        label: "2025Q1",
        年月: "2025年1月",
        ["CTIミクロ四半期系列（名目）"]: 101,
      },
    ];
    const real = [
      { 年: 2025, quarter: 1, label: "2025Q1", 年月: "2025年1月", [SUPPORT_SERIES_KEY_REAL]: 9 },
    ];
    const joined = joinQuarterlyGdpRows(nominal, real, {
      comparisonReady: true,
      rows: [
        {
          period: "2025-Q1",
          nominalRaw: 1,
          realRaw: 1,
          nominalComparison: 110,
          realComparison: 120,
        },
      ],
    });

    expect(joined.nominal[0]["CTIミクロ四半期系列（名目）"]).toBe(101);
    expect(joined.nominal[0]).not.toHaveProperty("GDP名目比較指数");
    expect(joined.real[0][SUPPORT_SERIES_KEY_REAL]).toBe(120);
  });

  it("removes stale real support when compatibility data is unavailable", () => {
    const real = [
      { 年: 2025, quarter: 1, label: "2025Q1", 年月: "2025年1月", [SUPPORT_SERIES_KEY_REAL]: 9 },
    ];
    const joined = joinQuarterlyGdpRows([], real, { comparisonReady: false, rows: [] });
    expect(joined.real[0]).not.toHaveProperty(SUPPORT_SERIES_KEY_REAL);
  });
});
