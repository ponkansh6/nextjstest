import { describe, it, expect } from "vitest";
import { calculateCategorySum, computeChartData } from "../../src/lib/clientCalculations";
import { loadCtiData } from "../../server/lib/dataLoader";
import { nominalKeys } from "../../src/lib/chartConstants";

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
    it("should compute quarterly nominal data correctly using real data", async () => {
      const realData = await loadCtiData();
      
      // Select a subset of real data (e.g., 2020 Q1)
      const q1Data = realData.filter(d => 
          d.年月 === "2020年1月" || d.年月 === "2020年2月" || d.年月 === "2020年3月"
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
      
      const { quarterlyNominalData } = computeChartData(props, []);
      
      expect(quarterlyNominalData.length).toBe(1);
      expect(quarterlyNominalData[0].label).toBe("2020年Q1");
      
      // Verify that data was actually processed
      expect(typeof quarterlyNominalData[0]["食料（名目）"]).toBe("number");
      expect(quarterlyNominalData[0]["食料（名目）"]).toBeGreaterThan(0);
    });
  });
});
