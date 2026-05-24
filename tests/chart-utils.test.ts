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
