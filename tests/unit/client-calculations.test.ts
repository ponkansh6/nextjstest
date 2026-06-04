import { describe, it, expect } from "vitest";
import { calculateCategorySum, computeChartData } from "../../src/lib/clientCalculations";
import { loadCtiData } from "../../server/lib/dataLoader";
import { nominalKeys } from "../../src/lib/chartConstants";
import type { CpiData } from "../../src/types";
import { createCpiData } from "../factories/cpiDataFactory";

describe("src/lib/clientCalculations", () => {
  describe("calculateCategorySum", () => {
    it("データが見つかる場合、正常に合計を計算する", () => {
      const mockCpiData = [{ 年月: "2020年1月", 食料: 100, 外食: 50 }];
      const sum = calculateCategorySum(mockCpiData as any, 2020, 1, [], ["食料", "外食"]);
      expect(sum).toBe(150);
    });

    it("指定された年月にデータがない場合、エラーを投げる", () => {
      const mockCpiData = [{ 年月: "2020年1月", 食料: 100 }];
      expect(() => {
        calculateCategorySum(mockCpiData as any, 2021, 1);
      }).toThrow();
    });
  });

  describe("computeChartData", () => {
    const baseProps = {
      data: [],
      endYear: 2020,
      maxCpiDate: { month: 1, year: 2020 },
      nominalData: [] as CpiData[],
      nominalKeys: nominalKeys,
      realKeys: nominalKeys.map((k) => k + "（実質）"),
      startYear: 2020,
    };

    it("should calculate and aggregate values correctly for a full quarter", () => {
      const mockData = [
        { 年月: "2020年1月", "住居（名目）": 10, "食料（名目）": 20, "その他の消費支出（名目）": 5 },
        { 年月: "2020年2月", "住居（名目）": 10, "食料（名目）": 20, "その他の消費支出（名目）": 5 },
        { 年月: "2020年3月", "住居（名目）": 10, "食料（名目）": 20, "その他の消費支出（名目）": 5 },
      ];
      const testProps = {
        ...baseProps,
        nominalData: mockData as any,
      };

      const result = computeChartData(testProps, []);
      const row = result.quarterlyNominalData[0];

      nominalKeys.forEach((key) => {
        expect(row, `Key ${key} missing or undefined in render data`).toHaveProperty(key);
        expect(typeof row[key]).toBe("number");
      });

      const total = nominalKeys.reduce((acc, k) => acc + ((row[k] as number) || 0), 0);
      expect(total).toBeGreaterThan(0);
      expect(total).toBe(105);
    });

    it("should compute quarterly nominal data correctly using real data", async () => {
      const realData = await loadCtiData();
      const q1Data = realData.filter(
        (d) => d.年月 === "2020年1月" || d.年月 === "2020年2月" || d.年月 === "2020年3月"
      );

      const props = {
        data: realData,
        nominalData: q1Data,
        startYear: 2020,
        endYear: 2020,
        nominalKeys: nominalKeys,
        realKeys: [],
        maxCpiDate: { year: 2020, month: 3 },
      };

      const { quarterlyNominalData } = computeChartData(props as any, []);

      expect(quarterlyNominalData.length).toBe(1);
      expect(quarterlyNominalData[0].label).toBe("2020年Q1");
      expect(typeof quarterlyNominalData[0]["食料（名目）"]).toBe("number");
      expect(quarterlyNominalData[0]["食料（名目）"]).toBeGreaterThan(0);
    });
    
    it("should compute scaled support series correctly for 2005-2017", async () => {
      const mockNominalData = [
        createCpiData({ 年月: "2005年1月", 民間最終消費支出: 100 }),
        createCpiData({ 年月: "2005年2月", 民間最終消費支出: 100 }),
        createCpiData({ 年月: "2005年3月", 民間最終消費支出: 100 }),
        createCpiData({ 年月: "2020年1月", 民間最終消費支出: 300 }),
        createCpiData({ 年月: "2020年2月", 民間最終消費支出: 300 }),
        createCpiData({ 年月: "2020年3月", 民間最終消費支出: 300 }),
      ];

      const props = {
        data: [], 
        nominalData: mockNominalData,
        startYear: 2005,
        endYear: 2020,
        nominalKeys: nominalKeys,
        realKeys: [],
        maxCpiDate: { year: 2020, month: 3 },
      };

      const { quarterlyNominalData } = computeChartData(props as any, []);

      const q12005 = quarterlyNominalData.find((r) => r.label === "2005年Q1");
      expect(q12005).toBeDefined();
      expect(q12005!["民間最終消費支出_scaled"]).toBeCloseTo(100);

      const q12020 = quarterlyNominalData.find((r) => r.label === "2020年Q1");
      expect(q12020).toBeDefined();
      expect(q12020!["民間最終消費支出_scaled"]).toBe(0);
    });
  });
});
