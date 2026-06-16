import { expect, it, describe, beforeAll } from "bun:test";
import { loadTotalEarningData, loadCpiData } from "../../server/lib/dataLoader";
import type { CpiData } from "../../src/types";

describe("Earnings Data Integrity", () => {
  let earningData: CpiData[];
  let cpiData: CpiData[];

  beforeAll(async () => {
    earningData = await loadTotalEarningData();
    cpiData = await loadCpiData();
  });

  describe("Basic Integrity", () => {
    it("should have non-zero values for key earnings series", async () => {
      expect(earningData.length).toBeGreaterThan(0);
      
      const keySeries = ["総合", "所定内給与", "所定外給与", "特別給与"];
      keySeries.forEach(key => {
        const nonZeroCount = earningData.filter((d) => (d[key] as number) > 0).length;
        expect(nonZeroCount, `Earnings series '${key}' should have non-zero values`).toBeGreaterThan(0);
      });
    });

    it("should verify all wage series have positive values", () => {
      const wageKeys = ["総合", "所定内給与", "所定外給与", "特別給与", "時間当たり給与", "15歳以上国民当たり給与"];
      
      wageKeys.forEach(key => {
        const hasData = earningData.some(d => typeof d[key] === 'number' && d[key] > 0);
        expect(hasData, `Wage Series ${key} should have positive values`).toBe(true);
      });
    });

    it("should verify month continuity and valid ranges", () => {
      const ymToMonths = (ym: string) => {
        const m = ym.match(/^(\d{4})年(\d{1,2})月/);
        return m ? parseInt(m[1], 10) * 12 + parseInt(m[2], 10) : 0;
      };

      for (let i = 1; i < earningData.length; i++) {
        const prev = ymToMonths(earningData[i - 1].年月);
        const curr = ymToMonths(earningData[i].年月);
        expect(curr, `Data gap found between ${earningData[i - 1].年月} and ${earningData[i].年月}`).toBe(prev + 1);
      }

      const recentData = earningData.filter(d => parseInt(d.年月.substring(0, 4), 10) >= 2005);
      expect(recentData.length).toBeGreaterThan(0);

      const year2020Items = earningData.filter((item) => item.年月.startsWith("2020年"));
      const avg2020Total = year2020Items.reduce((sum, item) => sum + (item["総合"] || 0), 0) / year2020Items.length;
      expect(avg2020Total).toBeCloseTo(100, 1);
    });

    it("should ensure all required wage keys are present in the merged dataset", () => {
      const requiredWageKeys = ["所定内給与", "所定外給与", "特別給与", "時間当たり給与", "15歳以上国民当たり給与", "総合"];
      const lastRow = earningData[earningData.length - 1];
      requiredWageKeys.forEach(key => {
        expect(lastRow[key], `Key "${key}" must be present and positive`).toBeGreaterThan(0);
      });
    });
  });

  describe("Validation", () => {
    it("should verify monthly stacked totals of key earnings series are within 50-150", async () => {
      expect(earningData.length).toBeGreaterThan(0);

      const targetKeys = ["所定内給与", "所定外給与", "特別給与"];
      
      earningData.forEach(d => {
        if (!d.年月 || typeof d.年月 !== 'string') return;

        let sum = 0;
        targetKeys.forEach(key => {
          sum += Number(d[key as keyof CpiData] || 0);
        });

        if (sum > 0) {
          expect(sum, `Sum of keys at ${d.年月} should be 50-150`).toBeGreaterThanOrEqual(50);
          expect(sum, `Sum of keys at ${d.年月} should be 50-150`).toBeLessThanOrEqual(150);
        }
      });
    });

    it("should verify mathematical integrity of residuals and smoothing", () => {
      const testData = earningData.slice(-24); 
      const cpiMap = new Map(cpiData.map((d) => [d.年月, d.総合]));

      testData.forEach((row) => {
        if (row.年月 === "2005年1月" || row.年月.startsWith("2004年")) return;

        expect(row["残差"]).toBeDefined();
        expect(typeof row["残差"]).toBe("number");
      });

      const specialEarnings = earningData.map(d => d["特別給与"] as number);
      const recentSpecial = specialEarnings.slice(-12);
      const diffs = [];
      for (let i = 1; i < recentSpecial.length; i++) {
        diffs.push(Math.abs(recentSpecial[i] - recentSpecial[i-1]));
      }
      const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      expect(meanDiff).toBeLessThan(500);
    });
  });
});
