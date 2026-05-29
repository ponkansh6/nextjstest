import { describe, it, expect } from "vitest";
import { computeChartData } from "../../../../src/lib/chartLogic";
import type { CpiData } from "../../../../src/app/page";

describe("src/lib/chartLogic", () => {
  it("should compute quarterly nominal data correctly", () => {
    const mockData: CpiData[] = [
      { 年月: "2020年1月", 総合: 100, "食料（名目）": 10 },
      { 年月: "2020年2月", 総合: 100, "食料（名目）": 20 },
      { 年月: "2020年3月", 総合: 100, "食料（名目）": 30 },
    ];
    
    const props = {
      data: [],
      nominalData: mockData,
      startYear: 2020,
      endYear: 2020,
      nominalKeys: ["食料（名目）"],
      realKeys: ["食料（実質）"],
      maxCpiDate: { year: 2020, month: 3 },
    };

    const { quarterlyNominalData } = computeChartData(props, []);
    
    expect(quarterlyNominalData.length).toBe(1);
    expect(quarterlyNominalData[0].label).toBe("2020年Q1");
    expect(quarterlyNominalData[0]["食料（名目）"]).toBe(60);
  });
});
