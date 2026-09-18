import { describe, it, expect, beforeAll } from "vitest";
import { computeChartData } from "../../src/lib/clientCalculations";
import { filterDataByYear, mergeChartData } from "../../src/lib/chartUtils";
import { loadCtiData, loadCpiData, loadTotalEarningData } from "../../server/lib/dataLoader";
import { CONSUMPTION_NOMINAL_KEYS, CONSUMPTION_REAL_KEYS } from "../../src/lib/chartConstants";

describe("Calculation Logic Tests", () => {
  let rawCtiData: any[];
  let rawCpiData: any[];
  let rawEarningData: any[];

  beforeAll(async () => {
    rawCtiData = await loadCtiData();
    rawCpiData = await loadCpiData();
    rawEarningData = await loadTotalEarningData();
  });

  it("should compute chart data (Nominal) correctly", () => {
    const startYear = 2020;
    const endYear = 2025;
    const maxCpiDate = { year: 2025, month: 3 };
    const processed = computeChartData(
      {
        data: rawCpiData,
        nominalData: rawCtiData,
        startYear,
        endYear,
        nominalKeys: CONSUMPTION_NOMINAL_KEYS,
        realKeys: CONSUMPTION_REAL_KEYS,
        maxCpiDate,
        quarterlyNominalData: [
          { label: "2020Q1", quarter: 1, 年: 2020, 年月: "2020Q1", "食料（名目）": 12 },
        ],
        quarterlyRealData: [
          { label: "2020Q1", quarter: 1, 年: 2020, 年月: "2020Q1", "食料（実質）": 11 },
        ],
      },
      [],
    );

    expect(processed.quarterlyNominalData.length).toBeGreaterThan(0);
    expect(processed.quarterlyNominalData[0]).toMatchObject({
      label: "2020Q1",
      "食料（名目）": 12,
    });
    expect(processed.quarterlyRealData[0]).toMatchObject({ label: "2020Q1", "食料（実質）": 11 });
  });

  it("should filter data by year correctly", () => {
    const filteredData = filterDataByYear(rawCpiData, 2020, 2025);
    expect(filteredData.length).toBeGreaterThan(0);
  });

  it("should merge chart data correctly", () => {
    const mergedData = mergeChartData(rawEarningData, rawCpiData, 2020, 2025);
    expect(mergedData.length).toBeGreaterThan(0);
  });
});
