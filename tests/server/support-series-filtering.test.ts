import { describe, it, expect } from "vitest";
import { applySupportSeriesScaling } from "../../server/lib/math/supportSeries";
import { scaleSupportSeries, scaleSupportSeriesLegacy } from "../../src/lib/math/supportSeries";

describe("2020 rollback support-series compatibility", () => {
  const TEST_SUPPORT_REAL_KEY = "民間最終消費支出（実質）";
  const TEST_SUPPORT_NOMINAL_KEY = "民間最終消費支出（名目）";

  describe("2005-2016年の期間", () => {
    it("keeps both nominal and real values normalized to the 2020 average", () => {
      const realRows = [
        { 年: 2020, [TEST_SUPPORT_REAL_KEY]: 100 },
        { 年: 2020, [TEST_SUPPORT_REAL_KEY]: 102 },
        { 年: 2020, [TEST_SUPPORT_REAL_KEY]: 98 },
        { 年: 2005, [TEST_SUPPORT_REAL_KEY]: 85 },
      ];
      const nominalRows = [
        { 年: 2020, [TEST_SUPPORT_NOMINAL_KEY]: 150 },
        { 年: 2010, [TEST_SUPPORT_NOMINAL_KEY]: 140 },
      ];

      applySupportSeriesScaling(realRows, TEST_SUPPORT_REAL_KEY);
      applySupportSeriesScaling(nominalRows, TEST_SUPPORT_NOMINAL_KEY);

      expect(realRows[3][TEST_SUPPORT_REAL_KEY]).toBe(85);
      expect(nominalRows[1][TEST_SUPPORT_NOMINAL_KEY]).toBeCloseTo(93.3333333333);
    });
  });

  describe("2017年以降の期間", () => {
    it("zeros 2017 and later support observations", () => {
      const rows = [
        { 年: 2016, [TEST_SUPPORT_REAL_KEY]: 100 },
        { 年: 2017, [TEST_SUPPORT_REAL_KEY]: 110 },
        { 年: 2020, [TEST_SUPPORT_REAL_KEY]: 99 },
      ];

      applySupportSeriesScaling(rows, TEST_SUPPORT_REAL_KEY);

      expect(rows.map((row) => row[TEST_SUPPORT_REAL_KEY])).toEqual([(100 / 99) * 100, 0, 0]);
    });
  });

  describe("Edge cases", () => {
    it("handles empty rows and a zero 2020 average", () => {
      const emptyRows: { 年: number; [TEST_SUPPORT_REAL_KEY]: number }[] = [];
      const zeroAverageRows = [
        { 年: 2020, [TEST_SUPPORT_REAL_KEY]: 0 },
        { 年: 2010, [TEST_SUPPORT_REAL_KEY]: 100 },
      ];

      applySupportSeriesScaling(emptyRows, TEST_SUPPORT_REAL_KEY);
      applySupportSeriesScaling(zeroAverageRows, TEST_SUPPORT_REAL_KEY);

      expect(emptyRows).toEqual([]);
      expect(zeroAverageRows[1][TEST_SUPPORT_REAL_KEY]).toBe(100);
    });
  });
});

describe("domain support-series calculations", () => {
  const key = "民間最終消費支出（実質）";

  it("returns new rows without mutating the input", () => {
    const rows = [
      { 年: 2005, [key]: 85 },
      { 年: 2020, [key]: 100 },
    ];
    const before = structuredClone(rows);

    const scaled = scaleSupportSeries(rows, key);

    expect(scaled).not.toBe(rows);
    expect(scaled[0]).not.toBe(rows[0]);
    expect(rows).toEqual(before);
    expect(scaled[0][key]).toBe(85);
  });

  it.each([
    [Number.NaN, Number.NaN],
    [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    [0, 0],
    [-10, -10],
    [null, null],
    [undefined, undefined],
  ])("preserves domain edge-case values for target value %s", (value, expected) => {
    const rows = [
      { 年: 2010, [key]: value },
      { 年: 2020, [key]: 100 },
    ];
    expect(scaleSupportSeries(rows, key)[0][key]).toBe(expected);
  });

  it("does not let non-finite 2020 observations alter the established calculation", () => {
    const rows = [
      { 年: 2010, [key]: 100 },
      { 年: 2020, [key]: Number.POSITIVE_INFINITY },
    ];
    expect(scaleSupportSeries(rows, key)[0][key]).toBe(100);
  });

  it("uses only 2020 values for the scale while preserving the outside-year value", () => {
    const rows = [
      { 年: 2010, [key]: 1_000_000 },
      { 年: 2017, [key]: 300 },
      { 年: 2020, [key]: 200 },
    ];

    expect(scaleSupportSeries(rows, key).map((row) => row[key])).toEqual([500_000, 300, 200]);
  });

  it("keeps missing and non-finite values, and preserves years outside the domain", () => {
    const rows = [
      { 年: 2004, [key]: 11 },
      { 年: 2005, [key]: null },
      { 年: 2010, [key]: Number.NaN },
      { 年: 2016, [key]: Number.POSITIVE_INFINITY },
      { 年: 2017, [key]: -7 },
      { 年: 2020, [key]: 200 },
    ];

    const scaled = scaleSupportSeries(rows, key);

    expect(scaled.map((row) => row[key])).toEqual([
      11,
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -7,
      200,
    ]);
    expect(rows).toEqual([
      { 年: 2004, [key]: 11 },
      { 年: 2005, [key]: null },
      { 年: 2010, [key]: Number.NaN },
      { 年: 2016, [key]: Number.POSITIVE_INFINITY },
      { 年: 2017, [key]: -7 },
      { 年: 2020, [key]: 200 },
    ]);
  });

  it.each([
    [2004, undefined, 0],
    [2005, null, 0],
    [2005, Number.NaN, 0],
    [2005, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    [2005, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
    [2005, 0, 0],
    [2005, 10, 10],
    [2005, -10, -10],
    [2016, 10, 10],
    [2017, 10, 0],
  ])(
    "legacy adapter preserves the old representative value matrix (%s, %s)",
    (year, value, expected) => {
      const rows = [
        { 年: 2020, [key]: 100 },
        { 年: year, [key]: value },
      ];
      expect(scaleSupportSeriesLegacy(rows, key)[1][key]).toBe(expected);
    },
  );

  it("legacy adapter uses the established 2020 positive-value average", () => {
    const rows = [
      { 年: 2020, [key]: 100 },
      { 年: 2020, [key]: 200 },
      { 年: 2010, [key]: 150 },
    ];
    expect(scaleSupportSeriesLegacy(rows, key)[2][key]).toBe(100);
  });

  it("server legacy adapter mutates rows using the same compatibility matrix", () => {
    const rows = [
      { 年: 2004, [key]: 10 },
      { 年: 2005, [key]: null },
      { 年: 2010, [key]: Number.NaN },
      { 年: 2016, [key]: Number.POSITIVE_INFINITY },
      { 年: 2017, [key]: -10 },
      { 年: 2020, [key]: 100 },
    ];

    applySupportSeriesScaling(rows, key);

    expect(rows.map((row) => row[key])).toEqual([0, 0, 0, Number.POSITIVE_INFINITY, 0, 0]);
  });
});
