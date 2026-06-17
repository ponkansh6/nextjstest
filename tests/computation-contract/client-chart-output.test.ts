import { describe, it, expect } from "vitest";
import { computeChartData } from "../../src/lib/clientCalculations";
import { createCpiDataList } from "../factories/cpiDataFactory";
import { nominalKeys } from "../../src/lib/chartConstants";
import type { CpiData } from "../../src/types";

describe("Client Data Structure Integrity", () => {
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
});
