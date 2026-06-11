import { expect, it, describe, beforeAll } from "vitest";
import { loadCtiData, loadCpiData, loadPopulationData, loadTotalEarningData } from "../../server/lib/dataLoader";
import { nominalKeys, realKeys } from "../../src/lib/chartConstants";
import type { CpiData } from "../../src/types";

describe("Data Integrity", () => {
  
  describe("CTI Data", () => {
    let data: CpiData[];
    beforeAll(async () => {
      data = await loadCtiData();
    });
    it("should have loaded data", () => {
      expect(data.length).toBeGreaterThan(0);
    });
    it.each([...nominalKeys, ...realKeys])("series '%s' should have non-zero values", (key) => {
      // その他の消費支出系は0が含まれるため除外
      if (key.includes('その他の消費支出')) return;
      const nonZeroCount = data.filter((d) => (d[key] as number) > 0).length;
      expect(nonZeroCount, `Series '${key}' should have non-zero values in the dataset`).toBeGreaterThan(0);
    });
  });

  describe("CPI Data", () => {
    it("should have non-zero values for core CPI series", async () => {
      const data = await loadCpiData();
      expect(data.length).toBeGreaterThan(0);
      // Verify '総合' (General index) as the most critical series
      const nonZeroCount = data.filter((d) => (d["総合"] as number) > 0).length;
      expect(nonZeroCount, "CPI '総合' series should have non-zero values").toBeGreaterThan(0);
    });
  });

  describe("Population Data", () => {
    it("should have non-zero population totals", async () => {
      const data = await loadPopulationData();
      expect(data.size).toBeGreaterThan(0);
      // Check that at least some entries have a positive total
      const positiveTotals = Array.from(data.values()).filter(v => v.total > 0).length;
      expect(positiveTotals, "Population data should have positive total values").toBeGreaterThan(0);
    });
  });

  describe("Earnings Data", () => {
    it("should have non-zero values for key earnings series", async () => {
      const data = await loadTotalEarningData();
      expect(data.length).toBeGreaterThan(0);
      
      const keySeries = ["総合", "所定内給与", "所定外給与", "特別給与"];
      keySeries.forEach(key => {
        const nonZeroCount = data.filter((d) => (d[key] as number) > 0).length;
        expect(nonZeroCount, `Earnings series '${key}' should have non-zero values`).toBeGreaterThan(0);
      });
    });
  });
});
