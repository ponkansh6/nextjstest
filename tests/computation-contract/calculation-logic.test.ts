import { describe, it, expect, beforeAll } from 'vitest';
import { computeChartData } from '../../src/lib/clientCalculations';
import { filterDataByYear, mergeChartData } from '../../src/lib/chartUtils';
import { loadCtiData, loadCpiData, loadTotalEarningData } from '../../server/lib/dataLoader';
import { nominalKeys, realKeys } from '../../src/lib/chartConstants';

describe('Calculation Logic Tests', () => {
  let rawCtiData: any[];
  let rawCpiData: any[];
  let rawEarningData: any[];

  beforeAll(async () => {
    rawCtiData = await loadCtiData();
    rawCpiData = await loadCpiData();
    rawEarningData = await loadTotalEarningData();
  });

  it('should compute chart data (Nominal) correctly', () => {
    const startYear = 2020;
    const endYear = 2025;
    const maxCpiDate = { year: 2025, month: 3 };
    const realKeys_ = nominalKeys.map(k => k.replace("名目", "実質"));

    const processed = computeChartData({
        data: rawCpiData,
        nominalData: rawCtiData,
        startYear,
        endYear,
        nominalKeys,
        realKeys: realKeys_,
        maxCpiDate
      }, []);
      
    expect(processed.quarterlyNominalData.length).toBeGreaterThan(0);
  });

  it('should filter data by year correctly', () => {
    const filteredData = filterDataByYear(rawCpiData, 2020, 2025);
    expect(filteredData.length).toBeGreaterThan(0);
  });

  it('should merge chart data correctly', () => {
    const mergedData = mergeChartData(rawEarningData, rawCpiData, 2020, 2025);
    expect(mergedData.length).toBeGreaterThan(0);
  });
});
