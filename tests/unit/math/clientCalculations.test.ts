import { describe, expect, it } from "vitest";
import {
  calculateCAGRValue,
  calculateCategorySum,
  computeChartData,
  sumCategoryValues,
  type ChartCalculationProps,
  type ClientCalculationConfig,
} from "../../../src/lib/math/clientCalculations";
import { createCpiData } from "../../factories/cpiDataFactory";

const config: ClientCalculationConfig = {
  nominalKeys: ["食料（名目）", "住居（名目）"],
  realKeys: ["食料（実質）"],
  ctiKeys: new Set(["食料（名目）", "住居（名目）", "食料（実質）"]),
  supportNominalKey: "支出（名目）",
  supportRealKey: "支出（実質）",
};

const props = (
  nominalData: ChartCalculationProps["nominalData"],
  overrides: Partial<ChartCalculationProps> = {},
): ChartCalculationProps => ({
  nominalData,
  startYear: 2020,
  endYear: 2020,
  maxCpiDate: { year: 2020, month: 12 },
  ...overrides,
});

const completeRow = (month: number, overrides: Partial<ReturnType<typeof createCpiData>> = {}) =>
  createCpiData({
    年月: `2020年${month}月`,
    ...Object.fromEntries([...config.nominalKeys, ...config.realKeys].map((key) => [key, 0])),
    ...overrides,
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

  it("normalizes months and averages a complete quarter, retaining valid zeroes", () => {
    const data = [
      completeRow(1, { "食料（名目）": 9, "支出（名目）": 90 }),
      completeRow(2, { "食料（名目）": 0 }),
      completeRow(3, { "食料（名目）": 15, "支出（名目）": 150 }),
    ];
    const result = computeChartData(props(data), [], {
      ...config,
      ctiKeys: new Set([...config.ctiKeys, "食料（名目）"]),
    });
    expect(result.quarterlyNominalData[0]).toMatchObject({ label: "2020Q1", "食料（名目）": 8 });
    expect(result.quarterlyNominalData[0]["支出（名目）"]).toBe(90);
  });

  it("omits incomplete quarters and still omits hidden complete quarters", () => {
    const data = [
      completeRow(1, { "食料（名目）": 9 }),
      completeRow(2, { "食料（名目）": 12 }),
      completeRow(4, { "食料（名目）": 30 }),
      completeRow(5, { "食料（名目）": 30 }),
      completeRow(6, { "食料（名目）": 30 }),
    ];
    const result = computeChartData(props(data), [2], config);
    expect(result.quarterlyNominalData).toHaveLength(0);
    expect(result.quarterlyNominalData.some((row) => row.label === "2020Q1")).toBe(false);
    expect(result.quarterlyNominalData.some((row) => row.label === "2020Q2")).toBe(false);
  });

  it("omits a partial latest quarter", () => {
    const data = [completeRow(1, { "食料（名目）": 9 }), completeRow(2, { "食料（名目）": 12 })];
    const result = computeChartData(
      props(data, { maxCpiDate: { year: 2020, month: 2 } }),
      [],
      config,
    );
    expect(result.quarterlyNominalData).toEqual([]);
  });

  it("uses custom nominal and real keys and is deterministic", () => {
    const custom = props(
      [
        createCpiData({ 年月: "2020年1月", customNominal: 3, customReal: 6 }),
        createCpiData({ 年月: "2020年2月", customNominal: 6, customReal: 9 }),
        createCpiData({ 年月: "2020年3月", customNominal: 9, customReal: 12 }),
      ],
      { nominalKeys: ["customNominal"], realKeys: ["customReal"] },
    );
    const first = computeChartData(custom, [], {
      ...config,
      ctiKeys: new Set(["customNominal", "customReal"]),
    });
    const second = computeChartData(custom, [], {
      ...config,
      ctiKeys: new Set(["customNominal", "customReal"]),
    });
    expect(first.quarterlyNominalData[0].customNominal).toBe(6);
    expect(first.quarterlyRealData[0].customReal).toBe(9);
    expect(first).toEqual(second);
  });
});
