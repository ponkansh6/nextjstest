import { filterDataByYear, mergeChartData } from "../src/lib/chartUtils";
import { CpiData } from "../src/app/page";
import { createCpiDataList } from "./factories/cpiDataFactory";

describe("chartUtils", () => {
  it("should filter data by year range", () => {
    const data = createCpiDataList([
      { 年月: "2024年1月" },
      { 年月: "2025年1月" },
      { 年月: "2026年1月" },
    ]);
    const filtered = filterDataByYear(data, 2025, 2026);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].年月).toBe("2025年1月");
    expect(filtered[1].年月).toBe("2026年1月");
  });

  it("should filter data by year range correctly at boundaries", () => {
    const data = [
      { 年月: "2019年12月" },
      { 年月: "2020年01月" },
      { 年月: "2020年12月" },
      { 年月: "2021年01月" },
    ];
    const filtered = filterDataByYear(data, 2020, 2020);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].年月).toBe("2020年01月");
    expect(filtered[1].年月).toBe("2020年12月");
  });

  it("should return empty array if no data matches range", () => {
    const data = [{ 年月: "2020年01月" }];
    const filtered = filterDataByYear(data, 2021, 2022);
    expect(filtered).toHaveLength(0);
  });

  it("should handle empty input data", () => {
    const filtered = filterDataByYear([], 2020, 2021);
    expect(filtered).toHaveLength(0);
  });

  it("should handle invalid date formats gracefully", () => {
    const data = [{ 年月: "invalid-date" }, { 年月: "2020年" }];
    const filtered = filterDataByYear(data, 2020, 2020);
    // extractYear should return 0 for "invalid-date" and 2020 for "2020年"
    expect(filtered).toHaveLength(1);
    expect(filtered[0].年月).toBe("2020年");
  });

  it("should merge wage and CPI data correctly", () => {
    const wageData = createCpiDataList([
      {
        年月: "2025年1月",
        所定内給与: 100,
      },
    ]);
    const cpiData = createCpiDataList([
      {
        年月: "2025年1月",
        総合: 105,
      },
    ]);

    const merged = mergeChartData(wageData, cpiData, 2025, 2025);

    expect(merged).toHaveLength(1);
    expect(merged[0].所定内給与).toBe(100);
    expect(merged[0].総合).toBe(105);
  });
});
