import { computeChartData } from "../src/lib/chartLogic";
import { nominalKeys, realKeys } from "../src/lib/chartConstants";
import { describe, it, expect } from "vitest";

describe("Rendering Data Verification", () => {
  it("should have non-zero or defined values for all keys in quarterly nominal/real data", () => {
    // Provide full quarter data so quarterly aggregation is valid and mapping issues are detectable
    const mockData = [
      { 年月: "2020年1月", "住居（名目）": 10, "食料（名目）": 20, "その他の消費支出（名目）": 5 },
      { 年月: "2020年2月", "住居（名目）": 10, "食料（名目）": 20, "その他の消費支出（名目）": 5 },
      { 年月: "2020年3月", "住居（名目）": 10, "食料（名目）": 20, "その他の消費支出（名目）": 5 },
    ];
    const props = {
      data: [],
      nominalData: mockData,
      startYear: 2020,
      endYear: 2020,
      nominalKeys: nominalKeys,
      realKeys: realKeys,
      maxCpiDate: { year: 2020, month: 3 },
    };

    const result = computeChartData(props, []);
    const row = result.quarterlyNominalData[0];

    // レンダリング直前に各キーが期待値（この場合合計が35*3=105）を持つか検証
    nominalKeys.forEach((key) => {
      expect(row, `Key ${key} missing or undefined in render data`).toHaveProperty(key);
      expect(typeof row[key]).toBe("number");
    });

    const total = nominalKeys.reduce((acc, k) => acc + (row[k] as number || 0), 0);
    expect(total).toBeGreaterThan(0);
    // Provided per-month sum = 10 + 20 + 5 = 35. For a full quarter, expected 35 * 3
    expect(total).toBe(35 * 3);
  });
});
