import { describe, expect, it } from "vitest";
import { computeXAxisTicks } from "@/app/components/charts/xAxisTicks";

const data = [
  "2005年1月",
  "2010年1月",
  "2015年1月",
  "2017年12月",
  "2018年1月",
  "2020年1月",
  "2025年1月",
  "2026年1月",
].map((年月) => ({ 年月 }));

describe("computeXAxisTicks", () => {
  it("keeps desktop milestone and boundary ticks", () => {
    expect(computeXAxisTicks(data)).toEqual([
      "2005年1月",
      "2010年1月",
      "2015年1月",
      "2020年1月",
      "2017年12月",
      "2018年1月",
      "2026年1月",
    ]);
  });

  it("removes boundary ticks and limits narrow layouts to five ticks", () => {
    expect(
      computeXAxisTicks(data, "年月", {
        includeBoundaryTicks: false,
        maxTicks: 5,
      }),
    ).toEqual(["2005年1月", "2010年1月", "2015年1月", "2020年1月", "2026年1月"]);
  });
});
