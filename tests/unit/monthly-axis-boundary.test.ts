import { describe, expect, it } from "vitest";
import { computeXAxisTicks } from "@/app/components/charts/xAxisTicks";

const monthlyData = [
  "2005年1月",
  "2010年1月",
  "2015年1月",
  "2017年12月",
  "2018年1月",
  "2020年1月",
  "2025年1月",
  "2026年1月",
].map((年月) => ({ 年月 }));

describe("monthly axis boundary ticks", () => {
  it("omits the adjacent-series hand-off months while retaining ordinary ticks", () => {
    const ticks = computeXAxisTicks(monthlyData, "年月", {
      includeBoundaryTicks: false,
    });

    expect(ticks).toEqual(["2005年1月", "2010年1月", "2015年1月", "2020年1月", "2026年1月"]);
    expect(ticks).not.toContain("2017年12月");
    expect(ticks).not.toContain("2018年1月");
    expect(ticks.length).toBeGreaterThanOrEqual(2);
  });
});
