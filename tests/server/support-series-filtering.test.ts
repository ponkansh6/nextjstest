import { describe, it, expect } from "vitest";
import {
  applySupportSeriesScaling,
  calculateGdp2025NormalizationFactor,
} from "../../server/lib/math/supportSeries";

describe("2020 rollback support-series compatibility", () => {
  const SUPPORT_SERIES_KEY_REAL = "民間最終消費支出（実質）";
  const SUPPORT_SERIES_KEY_NOMINAL = "民間最終消費支出（名目）";

  describe("2005-2016年の期間", () => {
    it("keeps both nominal and real values normalized to the 2020 average", () => {
      const realRows = [
        { 年: 2020, [SUPPORT_SERIES_KEY_REAL]: 100 },
        { 年: 2020, [SUPPORT_SERIES_KEY_REAL]: 102 },
        { 年: 2020, [SUPPORT_SERIES_KEY_REAL]: 98 },
        { 年: 2005, [SUPPORT_SERIES_KEY_REAL]: 85 },
      ];
      const nominalRows = [
        { 年: 2020, [SUPPORT_SERIES_KEY_NOMINAL]: 150 },
        { 年: 2010, [SUPPORT_SERIES_KEY_NOMINAL]: 140 },
      ];

      applySupportSeriesScaling(realRows, SUPPORT_SERIES_KEY_REAL);
      applySupportSeriesScaling(nominalRows, SUPPORT_SERIES_KEY_NOMINAL);

      expect(realRows[3][SUPPORT_SERIES_KEY_REAL]).toBe(85);
      expect(nominalRows[1][SUPPORT_SERIES_KEY_NOMINAL]).toBeCloseTo(93.3333333333);
    });
  });

  describe("2017年以降の期間", () => {
    it("zeros 2017 and later support observations", () => {
      const rows = [
        { 年: 2016, [SUPPORT_SERIES_KEY_REAL]: 100 },
        { 年: 2017, [SUPPORT_SERIES_KEY_REAL]: 110 },
        { 年: 2020, [SUPPORT_SERIES_KEY_REAL]: 99 },
      ];

      applySupportSeriesScaling(rows, SUPPORT_SERIES_KEY_REAL);

      expect(rows.map((row) => row[SUPPORT_SERIES_KEY_REAL])).toEqual([(100 / 99) * 100, 0, 0]);
    });
  });

  describe("Edge cases", () => {
    it("handles empty rows and a zero 2020 average", () => {
      const emptyRows: { 年: number; [SUPPORT_SERIES_KEY_REAL]: number }[] = [];
      const zeroAverageRows = [
        { 年: 2020, [SUPPORT_SERIES_KEY_REAL]: 0 },
        { 年: 2010, [SUPPORT_SERIES_KEY_REAL]: 100 },
      ];

      applySupportSeriesScaling(emptyRows, SUPPORT_SERIES_KEY_REAL);
      applySupportSeriesScaling(zeroAverageRows, SUPPORT_SERIES_KEY_REAL);

      expect(emptyRows).toEqual([]);
      expect(zeroAverageRows[1][SUPPORT_SERIES_KEY_REAL]).toBe(100);
    });
  });
});

describe("2025 GDP comparison normalization", () => {
  it("derives an independent factor from exactly one raw annual value", () => {
    expect(calculateGdp2025NormalizationFactor([230])).toBeCloseTo(100 / 230);
    expect(calculateGdp2025NormalizationFactor([100])).toBe(1);
  });

  it("fails closed for missing, multiple, zero, or non-finite annual inputs", () => {
    expect(calculateGdp2025NormalizationFactor([])).toBeUndefined();
    expect(calculateGdp2025NormalizationFactor([100, 100])).toBeUndefined();
    expect(calculateGdp2025NormalizationFactor([0])).toBeUndefined();
    expect(calculateGdp2025NormalizationFactor([Number.NaN])).toBeUndefined();
  });
});
