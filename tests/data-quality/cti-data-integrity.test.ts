import { expect, it, describe, beforeAll } from "bun:test";
import { loadCtiData } from "../../server/lib/dataLoader";
import { nominalKeys, realKeys, SUPPORT_SERIES_KEY_NOMINAL, SUPPORT_SERIES_KEY_REAL } from "../../src/lib/chartConstants";
import type { CpiData } from "../../src/types";
import { computeChartData } from "../../src/lib/clientCalculations";

describe("CTI Data Integrity", () => {
  let ctiData: CpiData[];

  beforeAll(async () => {
    ctiData = await loadCtiData();
  });

  describe("Basic Integrity", () => {
    it("should have loaded data", () => {
      expect(ctiData.length).toBeGreaterThan(0);
    });
    it.each([...nominalKeys, ...realKeys])("series '%s' should have non-zero values", (key) => {
      if (key.includes('その他の消費支出')) return;
      const nonZeroCount = ctiData.filter((d) => (d[key] as number) > 0).length;
      expect(nonZeroCount, `Series '${key}' should have non-zero values in the dataset`).toBeGreaterThan(0);
    });
  });

  describe("Consumption Data Integrity", () => {
    it("should verify all consumption categories (except support) have positive values for 2017 onwards", () => {
      const recentCtiRows = ctiData.filter(d => 
        d.年月 && typeof d.年月 === 'string' && parseInt(d.年月.substring(0, 4), 10) >= 2017
      );
      
      expect(recentCtiRows.length).toBeGreaterThan(0);

      const allKeys = Object.keys(ctiData[0]);
      const targetKeys = allKeys.filter(key => 
        key !== "民間最終消費支出" && 
        key !== SUPPORT_SERIES_KEY_NOMINAL &&
        key !== SUPPORT_SERIES_KEY_REAL &&
        key !== "年月" && 
        key !== "月" &&
        key !== ""
      );

      expect(targetKeys.length).toBeGreaterThan(0);

      recentCtiRows.forEach(row => {
        targetKeys.forEach(key => {
          const val = Number(row[key]);
          expect(val, `${key} in ${row.年月} should be > 0 (2017 onwards)`).toBeGreaterThan(0);
        });
      });
    });

    it("should verify normalization of support series (50-150 range)", async () => {
      const props = {
        data: ctiData,
        endYear: 2026,
        maxCpiDate: { month: 12, year: 2026 },
        nominalData: ctiData,
        nominalKeys: nominalKeys,
        realKeys: realKeys,
        startYear: 2005,
      };

      const result = computeChartData(props, []);
      const { quarterlyNominalData, quarterlyRealData } = result;

      [SUPPORT_SERIES_KEY_NOMINAL, SUPPORT_SERIES_KEY_REAL].forEach(supportKey => {
        const isNominal = supportKey === SUPPORT_SERIES_KEY_NOMINAL;
        const targetData = isNominal ? quarterlyNominalData : quarterlyRealData;

        const pre2017Data = targetData.filter(d => (d.年 as number) <= 2016);
        pre2017Data.forEach(d => {
          const val = d[supportKey] as number;
          expect(val, `${d.label} support value should be 50-150`).toBeGreaterThanOrEqual(50);
          expect(val, `${d.label} support value should be 50-150`).toBeLessThanOrEqual(150);
        });
      });
    });
  });
});
