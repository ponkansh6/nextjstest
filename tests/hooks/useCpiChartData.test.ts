import { computeChartData } from "../../src/lib/chartLogic";
import type { CpiData } from "../../src/app/page";
import { createCpiDataList } from "../factories/cpiDataFactory";

describe("useCpiChartData logic (computeChartData)", () => {
  const mockData: CpiData[] = [];
  const mockNominalData: CpiData[] = createCpiDataList([
    { 年月: "2020年1月", 総合: 100, 項目A: 50 },
    { 年月: "2020年2月", 総合: 101, 項目A: 51 },
    { 年月: "2020年3月", 総合: 102, 項目A: 52 },
  ]);
  const props = {
    data: mockData,
    endYear: 2020,
    maxCpiDate: { month: 3, year: 2020 },
    nominalData: mockNominalData,
    nominalKeys: ["総合", "項目A"],
    realKeys: [],
    startYear: 2020,
  };

  it("should aggregate data into quarters correctly", () => {
    const result = computeChartData(props, []);

    expect(result.quarterlyNominalData).toHaveLength(1);
    expect(result.quarterlyNominalData[0]).toMatchObject({
      quarter: 1,
      年: 2020,
      総合: 303,
      項目A: 153,
    });
  });

  it("should set values to 0 if data for a quarter is incomplete (missing months)", () => {
    // 2月と3月がないデータ
    const incompleteData: CpiData[] = createCpiDataList([
      { 年月: "2020年1月", 総合: 100, 項目A: 50 },
    ]);

    const propsIncomplete = { ...props, nominalData: incompleteData };
    const result = computeChartData(propsIncomplete, []);

    expect(result.quarterlyNominalData[0]).toMatchObject({
      quarter: 1,
      年: 2020,
      総合: 0,
      項目A: 0,
    });
  });

  it("should truncate data based on maxCpiDate", () => {
    const propsBeyondMax = {
      ...props,
      endYear: 2021,
      maxCpiDate: { month: 3, year: 2020 }, // 2020年Q1までしかデータがない
    };

    const result = computeChartData(propsBeyondMax, []);

    // 2020年Q1のみが計算されるべき
    expect(result.quarterlyNominalData).toHaveLength(1);
    expect(result.quarterlyNominalData[0].年).toBe(2020);
  });

  it("should calculate correct data range (first and last quarters)", () => {
    const props = {
      data: [],
      endYear: 2021,
      maxCpiDate: { month: 12, year: 2021 },
      nominalData: createCpiDataList([
        { 年月: "2020年1月", 総合: 100 },
        { 年月: "2021年12月", 総合: 100 },
      ]),
      nominalKeys: ["総合"],
      realKeys: [],
      startYear: 2020,
    };

    const result = computeChartData(props, []);

    // 最古四半期 (2020年Q1) と 最新四半期 (2021年Q4) が存在することを確認
    const data = result.quarterlyNominalData;
    expect(data.length).toBeGreaterThan(0);
    
    const oldest = data[0];
    const latest = data[data.length - 1];

    expect(oldest.label).toBe("2020年Q1");
    expect(latest.label).toBe("2021年Q4");
  });

  it("should toggle quarters correctly", () => {
    const hiddenQuarters = [1];
    const result = computeChartData(props, hiddenQuarters);

    expect(result.quarterlyNominalData).toHaveLength(0);
  });
});
