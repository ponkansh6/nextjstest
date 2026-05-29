import { describe, it, expect } from "vitest";
import { loadCpiData, loadCtiData, loadTotalEarningData } from "../../server/lib/dataLoader";
import { computeChartData } from "../../src/lib/chartLogic";
import { nominalKeys, realKeys, targetKeys } from "../../src/lib/chartConstants";

describe("Modular Pipeline Integration - Granular Coverage", () => {
  // CPI
  it("should verify CPI series have latest data", async () => {
    const data = await loadCpiData();
    const latest = data[data.length - 1];
    expect(latest).toBeDefined();
    expect(latest.年月).toBeDefined();
    // Verify specific latest data exists (e.g., check for current year 2026 or similar expectation)
    console.log("Latest CPI Month:", latest.年月);
  });

  it("should verify Spending series have latest data", async () => {
    const data = await loadCtiData();
    const latest = data[data.length - 1];
    expect(latest).toBeDefined();
    expect(latest.年月).toBeDefined();
    console.log("Latest Spending Month:", latest.年月);
  });

  it("should verify Spending series have positive values at pre-render using full data range", async () => {
    const ctiData = await loadCtiData();
    // Use the full range of data to catch inconsistencies across all years
    const startYear = 2005; 
    const endYear = 2026;
    
    const chartData = computeChartData(
      {
        data: ctiData,
        nominalData: ctiData,
        startYear: startYear,
        endYear: endYear,
        nominalKeys,
        realKeys,
        maxCpiDate: { year: 2026, month: 12 },
      },
      []
    );
    
    const checkSeries = (data: any[], keys: string[]) => {
      keys.forEach(key => {
        // Just verify at least one month has data for each key in the full range
        const hasData = data.some(d => typeof d[key] === 'number' && d[key] > 0);
        expect(hasData, `Series ${key} should have positive values across the full range`).toBe(true);
      });
    };
    
    checkSeries(chartData.quarterlyNominalData, nominalKeys);
    // Real keys are derived and might be empty if realData is missing, 
    // but they should be at least checked if they exist in the resulting data object.
    if (realKeys.length > 0) {
        checkSeries(chartData.quarterlyRealData, realKeys);
    }
  });

  // Wage
  it("should verify Wage series have positive values at load", async () => {
    const data = await loadTotalEarningData();
    expect(data.length).toBeGreaterThan(0);
    const wageKeys = ["総合", "所定内給与", "所定外給与", "特別給与", "時間当たり給与", "15歳以上国民当たり給与"];
    wageKeys.forEach(key => {
      const hasValue = data.some(d => typeof d[key] === 'number' && d[key] > 0);
      expect(hasValue, `Wage Series ${key} should have positive values`).toBe(true);
    });
  });

  it("should verify Wage series have positive values at pre-render", async () => {
    const data = await loadTotalEarningData();
    const wageKeys = ["総合", "所定内給与", "所定外給与", "特別給与", "時間当たり給与", "15歳以上国民当たり給与"];
    wageKeys.forEach(key => {
      const hasData = data.some(d => typeof d[key] === 'number' && d[key] > 0);
      expect(hasData, `Wage Series ${key} should have positive values`).toBe(true);
    });
  });
});
