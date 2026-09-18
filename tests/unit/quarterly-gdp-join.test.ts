import { describe, expect, it } from "vitest";
import { buildQuarterlyPublicViews } from "../../server/lib/view-models/quarterlyProjection";
import {
  mergeQuarterlyGdpRows,
  type QuarterlyRow,
} from "../../server/lib/view-models/quarterlyAggregation";
import { SUPPORT_SERIES_KEY_NOMINAL, SUPPORT_SERIES_KEY_REAL } from "../../src/lib/chartConstants";

const row = (year: number, quarter: number): QuarterlyRow => ({
  年: year,
  quarter,
  label: `${year}Q${quarter}`,
  年月: `${year}年${(quarter - 1) * 3 + 1}月`,
});

describe("quarterly public projection boundary", () => {
  it("joins only the legacy real comparison by exact year-quarter key", () => {
    const real = [row(2024, 4), row(2025, 1)];
    const joined = mergeQuarterlyGdpRows([], real, {
      comparisonReady: true,
      rows: [
        {
          period: "2024-Q4",
          nominalRaw: 1,
          realRaw: 1,
          nominalComparison: 101,
          realComparison: 99,
        },
        {
          period: "2025-Q1",
          nominalRaw: 1,
          realRaw: 1,
          nominalComparison: 102,
          realComparison: 98,
        },
      ],
    });

    expect(joined.real.map((item) => item[SUPPORT_SERIES_KEY_REAL])).toEqual([99, 98]);
    expect(joined.nominal).toEqual([]);
  });

  it("keeps nominal CTI projection independent from GDP raw/comparison fields", () => {
    const nominal = [
      {
        ...row(2005, 1),
        [SUPPORT_SERIES_KEY_NOMINAL]: 101.25,
        GDP名目原値: 400,
        GDP名目比較指数: 120,
      },
    ];
    const projected = buildQuarterlyPublicViews(nominal, [], {
      comparisonReady: true,
      rows: [
        {
          period: "2005-Q1",
          nominalRaw: 400,
          realRaw: 300,
          nominalComparison: 120,
          realComparison: 110,
        },
      ],
    });

    expect(projected.nominal[0][SUPPORT_SERIES_KEY_NOMINAL]).toBe(101.25);
    expect(projected.nominal[0]).not.toHaveProperty("GDP名目原値");
    expect(projected.nominal[0]).not.toHaveProperty("GDP名目比較指数");
    expect(projected.nominal[0]).not.toHaveProperty(SUPPORT_SERIES_KEY_REAL);
  });

  it("retains shared rows and publishes null real support when the GDP dataset is unready", () => {
    const real = [row(2025, 1)];
    const projected = buildQuarterlyPublicViews([], real, { comparisonReady: false, rows: [] });
    expect(projected.real).toHaveLength(1);
    expect(projected.real[0][SUPPORT_SERIES_KEY_REAL]).toBeNull();
    expect(projected.nominal).toHaveLength(0);
  });

  it("does not mutate source rows while clearing stale support fields", () => {
    const source = [{ ...row(2025, 1), [SUPPORT_SERIES_KEY_REAL]: 999 }];
    const joined = mergeQuarterlyGdpRows([], source, { comparisonReady: false, rows: [] });
    expect(source[0][SUPPORT_SERIES_KEY_REAL]).toBe(999);
    expect(joined.real[0]).not.toHaveProperty(SUPPORT_SERIES_KEY_REAL);
  });
});
