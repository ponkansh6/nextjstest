import { describe, it, expect } from "vitest";
import { computeChartData } from "../../src/lib/clientCalculations";
import { createCpiDataList } from "../factories/cpiDataFactory";
import { CONSUMPTION_NOMINAL_KEYS, CONSUMPTION_REAL_KEYS, SUPPORT_SERIES_KEY_NOMINAL, SUPPORT_SERIES_KEY_REAL } from "../../src/lib/chartConstants";
import { loadCtiData } from "../../server/lib/dataLoader";
import type { CpiData } from "../../src/types";

// データから最新の年月を計算するヘルパー関数
const calculateMaxCpiDate = (data: CpiData[]) => {
  let maxYear = 0;
  let maxMonth = 0;
  data.forEach((item) => {
    const m = item.年月.match(/^(\d{4})年(\d{1,2})月/);
    if (m) {
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10);
      if (y > maxYear || (y === maxYear && mo > maxMonth)) {
        maxYear = y;
        maxMonth = mo;
      }
    }
  });
  return { month: maxMonth, year: maxYear };
};

describe("Client Data Structure Integrity", () => {
  const mockNominalData: CpiData[] = createCpiDataList([
    { 年月: "2020年1月", "食料（名目）": 10 },
  ]);
  const props = {
    data: [],
    endYear: 2020,
    maxCpiDate: { month: 1, year: 2020 },
    nominalData: mockNominalData,
    CONSUMPTION_NOMINAL_KEYS: CONSUMPTION_NOMINAL_KEYS,
    realKeys: CONSUMPTION_REAL_KEYS,
    startYear: 2020,
  };

  it("should have keys ending with '（名目）' to match CSV data structure", () => {
    CONSUMPTION_NOMINAL_KEYS.forEach((key) => {
      expect(key).toMatch(/（名目）$/);
    });
  });

  it("quarterlyNominalData should contain all keys from CONSUMPTION_NOMINAL_KEYS", () => {
    const result = computeChartData(props, []);
    expect(result.quarterlyNominalData).toHaveLength(1);
    const sampleData = result.quarterlyNominalData[0];
    
    CONSUMPTION_NOMINAL_KEYS.forEach((key) => {
      expect(sampleData).toHaveProperty(key);
      expect(typeof sampleData[key]).toBe("number");
    });
  });

  it("should correctly calculate quarterly average", () => {
    // 2020年1月, 2月, 3月 のデータを作成
    const mockNominalData: CpiData[] = createCpiDataList([
      { 年月: "2020年1月", "食料（名目）": 30, [SUPPORT_SERIES_KEY_NOMINAL]: 100 },
      { 年月: "2020年2月", "食料（名目）": 60, [SUPPORT_SERIES_KEY_NOMINAL]: 100 },
      { 年月: "2020年3月", "食料（名目）": 90, [SUPPORT_SERIES_KEY_NOMINAL]: 100 },
    ]);
    const props = {
      data: [],
      endYear: 2020,
      maxCpiDate: { month: 3, year: 2020 },
      nominalData: mockNominalData,
      CONSUMPTION_NOMINAL_KEYS: CONSUMPTION_NOMINAL_KEYS,
      realKeys: CONSUMPTION_REAL_KEYS,
      startYear: 2020,
    };
    const result = computeChartData(props, []);
    // 2020年Q1の食料（名目）は (30+60+90)/3 = 60
    const q1Data = result.quarterlyNominalData.find(d => d.label === "2020年Q1");
    expect(q1Data?.["食料（名目）"]).toBe(60);
  });

  it("should correctly calculate quarterly average with real data", async () => {
    const realData = await loadCtiData();
    const props = {
      data: realData,
      endYear: 2026,
      maxCpiDate: calculateMaxCpiDate(realData),
      nominalData: realData,
      CONSUMPTION_NOMINAL_KEYS: CONSUMPTION_NOMINAL_KEYS,
      realKeys: CONSUMPTION_REAL_KEYS,
      startYear: 2005,
    };
    const result = computeChartData(props, []);
    expect(result.quarterlyNominalData.length).toBeGreaterThan(0);
    // データの妥当性をチェックする（例：すべての値が0以上であること）
    result.quarterlyNominalData.forEach(row => {
      CONSUMPTION_NOMINAL_KEYS.forEach(key => {
        expect(row[key]).toBeGreaterThanOrEqual(0);
      });
    });
  });

  it("should verify all consumption categories (except support) have positive values for 2017 onwards in quarterly data", async () => {
    const realData = await loadCtiData();
    const props = {
      data: realData,
      endYear: 2026,
      maxCpiDate: calculateMaxCpiDate(realData),
      nominalData: realData,
      CONSUMPTION_NOMINAL_KEYS: CONSUMPTION_NOMINAL_KEYS,
      realKeys: CONSUMPTION_REAL_KEYS,
      startYear: 2005,
    };
    const result = computeChartData(props, []);
    
    const allQuarterlyData = [...result.quarterlyNominalData, ...result.quarterlyRealData];
    
    // 2017年以降のデータをフィルタリング
    const recentData = allQuarterlyData.filter(d => d.年 >= 2017);
    
    expect(recentData.length).toBeGreaterThan(0);
    
    recentData.forEach(row => {
      // 民間消費以外のキーを特定
      const keysToCheck = Object.keys(row).filter(k => 
        k !== "年" && 
        k !== "quarter" && 
        k !== "label" &&
        k !== SUPPORT_SERIES_KEY_NOMINAL &&
        k !== SUPPORT_SERIES_KEY_REAL
      );
      
      keysToCheck.forEach(key => {
        const val = row[key] as number;
        expect(val, `${key} in ${row.label} should be > 0 (2017 onwards)`).toBeGreaterThan(0);
      });
    });
  });
});
