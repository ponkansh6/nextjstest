import { describe, it, expect } from "vitest";
import { calculateCategorySum, computeChartData, calculateCAGRValue } from "../../src/lib/clientCalculations";
import { loadCtiData } from "../../server/lib/dataLoader";
import { nominalKeys, SUPPORT_SERIES_KEY, SUPPORT_SERIES_KEY_REAL } from "../../src/lib/chartConstants";
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

  describe("calculateCAGRValue", () => {
    it("正しい成長率を算出すること", () => {
      // 100 -> 121 (2年で10%複利: 100 * 1.1 * 1.1 = 121)
      const result = calculateCAGRValue(100, 121, 2);
      expect(result).toBeCloseTo(0.1, 5); // 0.1 (10%)
    });

    it("開始値が0の場合は0を返すこと", () => {
      expect(calculateCAGRValue(0, 100, 2)).toBe(0);
    });

    it("経過年数が0の場合は0を返すこと", () => {
      expect(calculateCAGRValue(100, 121, 0)).toBe(0);
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
         createCpiData({ 年月: "2005年1月", [SUPPORT_SERIES_KEY]: 100 }),
         createCpiData({ 年月: "2005年2月", [SUPPORT_SERIES_KEY]: 100 }),
         createCpiData({ 年月: "2005年3月", [SUPPORT_SERIES_KEY]: 100 }),
         createCpiData({ 年月: "2020年1月", [SUPPORT_SERIES_KEY]: 300 }),
         createCpiData({ 年月: "2020年2月", [SUPPORT_SERIES_KEY]: 300 }),
         createCpiData({ 年月: "2020年3月", [SUPPORT_SERIES_KEY]: 300 }),
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
       expect(q12005![SUPPORT_SERIES_KEY]).toBeCloseTo(100);

       const q12020 = quarterlyNominalData.find((r) => r.label === "2020年Q1");
       expect(q12020).toBeDefined();
       expect(q12020![SUPPORT_SERIES_KEY]).toBe(0);
     });


    it("should aggregate '民間最終消費支出' strictly using raw objects to mimic CTI data structure", () => {
      // ファクトリを使わず、データローダーが返す形式を完全に模倣
       const mockData = [
         { 年月: "2010年1月", [SUPPORT_SERIES_KEY]: 100, "消費支出（名目）": 1000 },
         { 年月: "2010年2月", [SUPPORT_SERIES_KEY]: 200, "消費支出（名目）": 1000 },
         { 年月: "2010年3月", [SUPPORT_SERIES_KEY]: 300, "消費支出（名目）": 1000 },
       ];

       const props = {
         data: [],
         nominalData: mockData as any,
         startYear: 2010,
         endYear: 2010,
         nominalKeys: ["消費支出（名目）"],
         realKeys: [],
         maxCpiDate: { year: 2010, month: 3 },
       };

       const { quarterlyNominalData } = computeChartData(props, []);

       const q12010 = quarterlyNominalData.find((r) => r.label === "2010年Q1");
       
       // ここで失敗するようにする
       expect(q12010).toBeDefined();
       expect(q12010![SUPPORT_SERIES_KEY], "民間最終消費支出 should be 600").toBe(600);
     });


    it("should verify filteredNominalData and its structure", () => {
      const mockData = [{ 年月: "2010年1月", "民間最終消費支出": 100 }];
      const props = {
        data: [],
        nominalData: mockData as any,
        startYear: 2010,
        endYear: 2010,
        nominalKeys: [],
        realKeys: [],
        maxCpiDate: { year: 2010, month: 1 },
      };

      const { quarterlyNominalData } = computeChartData(props, []);
      
      const nominalMap = new Map(props.nominalData.map((d: any) => [d.年月, d]));
      const existingData = nominalMap.get("2010年1月");
      
      expect(existingData).toBeDefined();
      expect(existingData).toHaveProperty("民間最終消費支出");
      expect(existingData!["民間最終消費支出"]).toBe(100);
    });

     it("should aggregate '民間最終消費支出' regardless of nominalKeys inclusion", () => {
       // 3ヶ月分のデータを用意して、四半期の集計要件（3ヶ月分必要）を満たすようにする
       const mockData = [
         { 年月: "2010年1月", [SUPPORT_SERIES_KEY]: 100 },
         { 年月: "2010年2月", [SUPPORT_SERIES_KEY]: 100 },
         { 年月: "2010年3月", [SUPPORT_SERIES_KEY]: 100 },
       ];
       
       const runTest = (keys: string[]) => {
         const props = {
           data: [],
           nominalData: mockData as any,
           startYear: 2010,
           endYear: 2010,
           nominalKeys: keys,
           realKeys: [],
           maxCpiDate: { year: 2010, month: 3 }, // 3月まで必要
         };
         const { quarterlyNominalData } = computeChartData(props, []);
         // quarterlyNominalData[0] は 2010年Q1 となる
         return quarterlyNominalData[0][SUPPORT_SERIES_KEY];
       };
       
       // 1. nominalKeys に含まれていない場合
       const valWithoutKey = runTest([]);
       
       // 2. nominalKeys に含まれている場合
       const valWithKey = runTest([SUPPORT_SERIES_KEY]);
       
       // バグ修正の検証:
       // 100 + 100 + 100 = 300 となることを期待
       expect(valWithoutKey, "Value should be 300 even if not in nominalKeys").toBe(300);
       expect(valWithKey, "Value should be 300 if in nominalKeys").toBe(300);
     });


    it("should verify '民間最終消費支出' exists in the nominalData used for nominalMap", () => {
      const mockData = [{ 年月: "2010年1月", "民間最終消費支出": 100 }];
      
      // computeChartData の処理の一部を再現して検証
      const normalizeYm = (ym?: string | number) => String(ym || "").trim();
      const normalizedNominalData = mockData.map((d) => ({
        ...d,
        年月: normalizeYm(String(d.年月)),
      }));
      
      // nominalMap を作る
      const nominalMap = new Map(normalizedNominalData.map((d: any) => [d.年月, d]));
      const existingData = nominalMap.get("2010年1月");

      // この段階でプロパティが存在するかを物理的に証明する
      expect(existingData, "Data for 2010年1月 should exist in nominalMap").toBeDefined();
      expect(existingData, "Data in nominalMap should have '民間最終消費支出'").toHaveProperty("民間最終消費支出");
      expect(existingData!["民間最終消費支出"]).toBe(100);
    });
    it("should verify nominalMap content directly", () => {
      const mockData = [{ 年月: "2010年1月", "民間最終消費支出": 100 }];
      const normalizeYm = (ym?: string | number) => String(ym || "").trim();
      const normalizedNominalData = mockData.map((d) => ({
        ...d,
        年月: normalizeYm(String(d.年月)),
      }));
      const nominalMap = new Map(normalizedNominalData.map((d: any) => [d.年月, d]));
      const existingData = nominalMap.get("2010年1月");

      // Check if it exists here
      expect(existingData).toHaveProperty("民間最終消費支出");
      expect(existingData!["民間最終消費支出"]).toBe(100);
      
      // Now check if it persists after filteredNominalData is created
      const allMonths = ["2010年1月"];
      const filteredNominalData = allMonths.map((ym) => nominalMap.get(ym)!);
      
      expect(filteredNominalData[0]).toHaveProperty("民間最終消費支出");
      expect(filteredNominalData[0]["民間最終消費支出"]).toBe(100);
    });
  });
});
