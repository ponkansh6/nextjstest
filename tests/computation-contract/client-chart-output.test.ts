import { describe, expect, it } from "vitest";
import { computeChartData } from "../../src/lib/clientCalculations";
import { SUPPORT_SERIES_KEY_NOMINAL } from "../../src/lib/chartConstants";

describe("client chart output contract", () => {
  const nominal = {
    label: "2005Q1",
    quarter: 1,
    年: 2005,
    年月: "2005Q1",
    [SUPPORT_SERIES_KEY_NOMINAL]: 101.25,
    "民間最終消費支出（名目）": 999,
    "民間最終消費支出（名目・原値）": 888,
    "民間最終消費支出（名目・比較指数）": 777,
  };

  const props = (quarterlyNominalData: any[], quarterlyRealData: any[] = []) => ({
    data: [],
    nominalData: [],
    startYear: 2005,
    endYear: 2018,
    maxCpiDate: { year: 2018, month: 3 },
    quarterlyNominalData,
    quarterlyRealData,
  });

  it("forwards the server-projected nominal CTI row without recomputing it", () => {
    const result = computeChartData(props([nominal]), []);
    expect(result.quarterlyNominalData).toEqual([nominal]);
    expect(result.quarterlyNominalData[0][SUPPORT_SERIES_KEY_NOMINAL]).toBe(101.25);
    expect(result.quarterlyNominalData[0]).toHaveProperty("民間最終消費支出（名目）", 999);
    expect(result.quarterlyNominalData[0]).toHaveProperty("民間最終消費支出（名目・原値）", 888);
  });

  it("preserves null and zero values from the public projection", () => {
    const rows = [
      { ...nominal, label: "2005Q1", [SUPPORT_SERIES_KEY_NOMINAL]: null },
      { ...nominal, label: "2005Q2", [SUPPORT_SERIES_KEY_NOMINAL]: 0 },
    ];
    const result = computeChartData(props(rows), []);
    expect(result.quarterlyNominalData.map((row) => row[SUPPORT_SERIES_KEY_NOMINAL])).toEqual([
      null,
      0,
    ]);
  });

  it("filters hidden quarters and keeps nominal CTI out of real output", () => {
    const real = { label: "2018Q1", quarter: 1, 年: 2018, 年月: "2018Q1" };
    const hiddenNominal = { ...nominal, label: "2005Q2", quarter: 2, 年月: "2005Q2" };
    const result = computeChartData(props([hiddenNominal], [real]), [2]);
    expect(result.quarterlyNominalData).toHaveLength(0);
    expect(result.quarterlyRealData).toEqual([real]);
  });
});
