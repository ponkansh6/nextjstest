import { describe, it, expect } from "vitest";
import { filterDataByYear, mergeChartData } from "../src/lib/chartUtils";
import { CpiData } from "../src/app/page";

describe("chartUtils", () => {
  it("should filter data by year range", () => {
    const data = [
      { 年月: "2024年1月" },
      { 年月: "2025年1月" },
      { 年月: "2026年1月" },
    ] as CpiData[];
    const filtered = filterDataByYear(data, 2025, 2026);
    expect(filtered.length).toBe(2);
    expect(filtered[0].年月).toBe("2025年1月");
    expect(filtered[1].年月).toBe("2026年1月");
  });

  it("should merge wage and CPI data correctly", () => {
    const wageData = [
      {
        年月: "2025年1月",
        所定内給与: 100,
        総合: 0,
        生鮮食品を除く総合: 0,
        持家の帰属家賃を除く総合: 0,
      },
    ] as CpiData[];
    const cpiData = [
      {
        年月: "2025年1月",
        総合: 105,
        生鮮食品を除く総合: 0,
        持家の帰属家賃を除く総合: 0,
      },
    ] as CpiData[];

    const merged = mergeChartData(wageData, cpiData, 2025, 2025);

    expect(merged.length).toBe(1);
    expect(merged[0].所定内給与).toBe(100);
    expect(merged[0].総合).toBe(105);
  });
});
