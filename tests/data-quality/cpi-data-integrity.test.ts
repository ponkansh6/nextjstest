import { expect, it, describe, beforeAll } from "bun:test";
import { loadCpiData } from "../../server/lib/dataLoader";
import { CPI_CATEGORIES } from "../../src/lib/clientCalculations";
import type { CpiData } from "../../src/types";

describe("CPI Data Integrity", () => {
  let cpiData: CpiData[];

  beforeAll(async () => {
    cpiData = await loadCpiData();
  });

  describe("Basic Integrity", () => {
    it("should have non-zero values for core CPI series", async () => {
      expect(cpiData.length).toBeGreaterThan(0);
      // Verify '総合' (General index) as the most critical series
      const nonZeroCount = cpiData.filter((d) => (d["総合"] as number) > 0).length;
      expect(nonZeroCount, "CPI '総合' series should have non-zero values").toBeGreaterThan(0);
    });
  });

  describe("Validation", () => {
    it("should verify monthly stacked totals of CPI categories (2025 onwards) are within 50-150", async () => {
      const targetData = cpiData.filter(d => {
        if (!d.年月 || typeof d.年月 !== 'string') return false;
        const m = d.年月.match(/^(\d{4})年/);
        return m ? parseInt(m[1], 10) >= 2025 : false;
      });

      expect(targetData.length).toBeGreaterThan(0);

      targetData.forEach(d => {
        let sum = 0;
        CPI_CATEGORIES.forEach(key => {
          sum += Number(d[key as keyof CpiData] || 0);
        });

        expect(sum, `Sum of CPI categories at ${d.年月} should be 50-150`).toBeGreaterThanOrEqual(50);
        expect(sum, `Sum of CPI categories at ${d.年月} should be 50-150`).toBeLessThanOrEqual(150);
      });
    });
  });
});
