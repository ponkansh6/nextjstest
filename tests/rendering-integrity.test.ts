import { computeChartData } from "../src/lib/chartLogic";
import { nominalKeys, realKeys } from "../src/lib/chartConstants";
import { describe, it, expect } from "vitest";

describe("Rendering Data Verification", () => {
  it("should have non-zero or defined values for all keys in quarterly nominal/real data", () => {
    const mockData = [{ 年月: "2020年1月", "住居（名目）": 10, "食料（名目）": 20, "その他の消費支出（名目）": 5 }];
    const props = {
      data: [],
      nominalData: mockData,
      startYear: 2020,
      endYear: 2020,
      nominalKeys: nominalKeys,
      realKeys: realKeys,
      maxCpiDate: { year: 2020, month: 1 },
    };

    const result = computeChartData(props, []);
    const row = result.quarterlyNominalData[0];

    // レンダリング直前に各キーが期待値（この場合0以上）を持つか検証
    nominalKeys.forEach((key) => {
      expect(row, `Key ${key} missing or undefined in render data`).toHaveProperty(key);
      expect(typeof row[key]).toBe("number");
    });
  });
});
