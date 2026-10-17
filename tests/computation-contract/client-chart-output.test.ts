import { describe, expect, it } from "vitest";
import { computeChartData } from "../../src/lib/clientCalculations";
import { CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY } from "../../src/lib/chartConstants";
import type { QuarterlyAggregationRow } from "../../src/lib/math/clientCalculations";

describe("client chart output contract", () => {
  const plan40Key = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料;
  const nominal = {
    label: "2005Q1",
    quarter: 1,
    年: 2005,
    年月: "2005Q1",
    [plan40Key]: 101.25,
  };

  const props = (
    quarterlyNominalData: QuarterlyAggregationRow[],
    quarterlyRealData: QuarterlyAggregationRow[] = [],
  ) => ({
    data: [],
    nominalData: [],
    startYear: 2005,
    endYear: 2018,
    maxCpiDate: { year: 2018, month: 3 },
    quarterlyNominalData,
    quarterlyRealData,
  });

  it("forwards the server-projected Plan40 row without recomputing it", () => {
    const result = computeChartData(props([nominal]), []);
    expect(result.quarterlyNominalData).toEqual([nominal]);
    expect(result.quarterlyNominalData[0]?.[plan40Key]).toBe(101.25);
  });

  it("preserves null and zero values from the public projection", () => {
    const rows = [
      { ...nominal, label: "2005Q1", [plan40Key]: null },
      { ...nominal, label: "2005Q2", [plan40Key]: 0 },
    ];
    const result = computeChartData(props(rows), []);
    expect(result.quarterlyNominalData.map((row) => row[plan40Key])).toEqual([null, 0]);
  });

  it("filters hidden quarters and keeps nominal data out of real output", () => {
    const real = { label: "2018Q1", quarter: 1, 年: 2018, 年月: "2018Q1" };
    const hiddenNominal = { ...nominal, label: "2005Q2", quarter: 2, 年月: "2005Q2" };
    const result = computeChartData(props([hiddenNominal], [real]), [2]);
    expect(result.quarterlyNominalData).toHaveLength(0);
    expect(result.quarterlyRealData).toEqual([real]);
  });
});
