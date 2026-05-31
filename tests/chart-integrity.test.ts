import { computeChartData } from "../src/lib/chartLogic";
import type { CpiData } from "../src/types";
import { createCpiDataList } from "./factories/cpiDataFactory";
import { nominalKeys } from "../src/lib/chartConstants";

describe("CpiChart data integrity logic", () => {
  const mockNominalData: CpiData[] = createCpiDataList([
    { 年月: "2020年1月", 住居: 10, "家具・家事用品": 10, "被服及び履物": 10, "保健医療": 10, "教育": 10, "交通・通信": 10, "光熱・水道": 10, "教養娯楽": 10, "食料": 10, "諸雑費・CPI外支出等": 10 },
  ]);
  const props = {
    data: [],
    endYear: 2020,
    maxCpiDate: { month: 1, year: 2020 },
    nominalData: mockNominalData,
    nominalKeys: nominalKeys,
    realKeys: nominalKeys.map(k => k + "（実質）"),
    startYear: 2020,
  };

  it("should have keys ending with '（名目）' to match CSV data structure", () => {
    nominalKeys.forEach((key) => {
      expect(key).toMatch(/（名目）$/);
    });
  });

  it("quarterlyNominalData should contain all keys from nominalKeys", () => {
    const result = computeChartData(props, []);
    expect(result.quarterlyNominalData).toHaveLength(1);
    const sampleData = result.quarterlyNominalData[0];
    
    nominalKeys.forEach((key) => {
      expect(sampleData).toHaveProperty(key);
      expect(typeof sampleData[key]).toBe("number");
    });
  });

  it("should calculate and aggregate values correctly for a full quarter", () => {
    const mockData = [
      { 年月: "2020年1月", "住居（名目）": 10, "食料（名目）": 20, "その他の消費支出（名目）": 5 },
      { 年月: "2020年2月", "住居（名目）": 10, "食料（名目）": 20, "その他の消費支出（名目）": 5 },
      { 年月: "2020年3月", "住居（名目）": 10, "食料（名目）": 20, "その他の消費支出（名目）": 5 },
    ];
    const testProps = {
      ...props,
      nominalData: mockData,
    };

    const result = computeChartData(testProps, []);
    const row = result.quarterlyNominalData[0];

    nominalKeys.forEach((key) => {
      expect(row, `Key ${key} missing or undefined in render data`).toHaveProperty(key);
      expect(typeof row[key]).toBe("number");
    });

    const total = nominalKeys.reduce((acc, k) => acc + (row[k] as number || 0), 0);
    expect(total).toBeGreaterThan(0);
    // Provided per-month sum = 10 + 20 + 5 = 35. For a full quarter, expected 35 * 3 = 105
    expect(total).toBe(105);
  });
});
