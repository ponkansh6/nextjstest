import { describe, it, expect } from "vitest";
import { computeChartData } from "../src/lib/chartLogic";
import { CpiData } from "../src/app/page";

describe("useCpiChartData logic (computeChartData)", () => {
  const mockData: CpiData[] = [];
  const mockNominalData: CpiData[] = [
    { 年月: "2020年1月", 総合: 100, 項目A: 50 },
    { 年月: "2020年2月", 総合: 101, 項目A: 51 },
    { 年月: "2020年3月", 総合: 102, 項目A: 52 },
  ] as unknown as CpiData[];
  const props = {
    data: mockData,
    nominalData: mockNominalData,
    startYear: 2020,
    endYear: 2020,
    nominalKeys: ["総合", "項目A"],
    realKeys: [],
    maxCpiDate: { year: 2020, month: 3 },
  };

  it("should aggregate data into quarters correctly", () => {
    const result = computeChartData(props, []);

    expect(result.quarterlyNominalData).toHaveLength(1);
    expect(result.quarterlyNominalData[0]).toMatchObject({
      年: 2020,
      quarter: 1,
      総合: 303,
      項目A: 153,
    });
  });

  it("should set values to 0 if data for a quarter is incomplete (missing months)", () => {
    // 2月と3月がないデータ
    const incompleteData: CpiData[] = [
      { 年月: "2020年1月", 総合: 100, 項目A: 50 },
    ] as unknown as CpiData[];

    const propsIncomplete = { ...props, nominalData: incompleteData };
    const result = computeChartData(propsIncomplete, []);

    expect(result.quarterlyNominalData[0]).toMatchObject({
      年: 2020,
      quarter: 1,
      総合: 0,
      項目A: 0,
    });
  });

  it("should truncate data based on maxCpiDate", () => {
    const propsBeyondMax = {
      ...props,
      endYear: 2021,
      maxCpiDate: { year: 2020, month: 3 }, // 2020年Q1までしかデータがない
    };

    const result = computeChartData(propsBeyondMax, []);

    // 2020年Q1のみが計算されるべき
    expect(result.quarterlyNominalData).toHaveLength(1);
    expect(result.quarterlyNominalData[0].年).toBe(2020);
  });

  it("should toggle quarters correctly", () => {
    const hiddenQuarters = [1];
    const result = computeChartData(props, hiddenQuarters);

    expect(result.quarterlyNominalData).toHaveLength(0);
  });
});
