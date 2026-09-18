import { describe, expect, it } from "vitest";
import {
  calculateCAGRValue,
  calculateCategorySum,
  computeChartData,
  sumCategoryValues,
  type ChartCalculationProps,
} from "../../../src/lib/math/clientCalculations";
import type { QuarterlyView } from "../../../src/types/chart";
import { createCpiData } from "../../factories/cpiDataFactory";

const props = (
  quarterlyNominalData: QuarterlyView[] = [],
  quarterlyRealData: QuarterlyView[] = [],
): ChartCalculationProps => ({
  nominalData: [],
  startYear: 2005,
  endYear: 2018,
  maxCpiDate: { year: 2018, month: 12 },
  quarterlyNominalData,
  quarterlyRealData,
});

describe("src/lib/math/clientCalculations", () => {
  it("sums only numeric, visible category values", () => {
    const row = createCpiData({ 年月: "2020年1月", 食料: 10, 住居: 5, 欠損: null, 文字: "1" });
    expect(sumCategoryValues(row, ["食料", "住居", "欠損", "文字"])).toBe(15);
    expect(sumCategoryValues(row, ["食料", "住居"], ["住居"])).toBe(10);
  });

  it("calculates a category sum and reports a missing year-month", () => {
    const data = [createCpiData({ 年月: "2020年1月", 食料: 10, 住居: 5 })];
    expect(calculateCategorySum(data, 2020, 1, [], ["食料", "住居"])).toBe(15);
    expect(() => calculateCategorySum(data, 2020, 2, [], ["食料"])).toThrow("2020年02月");
  });

  it("returns zero for non-positive CAGR inputs and calculates normal CAGR", () => {
    expect(calculateCAGRValue(0, 100, 2)).toBe(0);
    expect(calculateCAGRValue(-1, 100, 2)).toBe(0);
    expect(calculateCAGRValue(100, 121, 2)).toBeCloseTo(0.1);
  });

  it("forwards server quarterly projections without CTI aggregation or zero fill", () => {
    const nominal = [
      {
        label: "2005Q1",
        quarter: 1,
        年: 2005,
        年月: "2005Q1",
        "CTIミクロ四半期系列（名目）": null,
      },
      { label: "2018Q1", quarter: 1, 年: 2018, 年月: "2018Q1", "食料（名目）": 10 },
    ] as QuarterlyView[];
    const result = computeChartData(props(nominal), []);
    expect(result.quarterlyNominalData).toEqual(nominal);
    expect(result.quarterlyNominalData[0]["CTIミクロ四半期系列（名目）"]).toBeNull();
  });

  it("filters already-projected rows without deleting incomplete CTI rows", () => {
    const nominal = [
      {
        label: "2005Q1",
        quarter: 1,
        年: 2005,
        年月: "2005Q1",
        "CTIミクロ四半期系列（名目）": null,
      },
      { label: "2005Q2", quarter: 2, 年: 2005, 年月: "2005Q2", "CTIミクロ四半期系列（名目）": 0 },
    ] as QuarterlyView[];
    const result = computeChartData(props(nominal), [2]);
    expect(result.quarterlyNominalData.map((row) => row.label)).toEqual(["2005Q1"]);
    expect(result.quarterlyNominalData[0]["CTIミクロ四半期系列（名目）"]).toBeNull();
  });
});
