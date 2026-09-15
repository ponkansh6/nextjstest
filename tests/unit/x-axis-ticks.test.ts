import { describe, expect, it } from "vitest";
import { computePeriodXAxisTicks, computeXAxisTicks } from "@/app/components/charts/xAxisTicks";

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

  it("retains milestone candidates for the mobile coordinate-based filter", () => {
    expect(
      computeXAxisTicks(data, "年月", {
        includeBoundaryTicks: false,
        preserveAllMilestones: true,
      }),
    ).toEqual(["2005年1月", "2010年1月", "2015年1月", "2020年1月", "2025年1月", "2026年1月"]);
  });

  it("shares the same core for quarterly ticks with a 12-quarter endpoint gap", () => {
    const quarterly = Array.from({ length: 84 }, (_, index) => {
      const year = 2005 + Math.floor(index / 4);
      const quarter = (index % 4) + 1;
      return { label: `${year}Q${quarter}`, 年月: `${year}Q${quarter}`, 年: year, quarter };
    });
    const ticks = computePeriodXAxisTicks(quarterly, "label", {
      periodIndex: (value) => {
        const match = value.match(/^(\d{4})Q([1-4])$/);
        return match ? Number(match[1]) * 4 + Number(match[2]) - 1 : null;
      },
      endpointGapPeriods: 12,
      includeBoundaryTicks: false,
      milestonePredicate: (row) =>
        row.quarter === 1 && [2010, 2015, 2020, 2025].includes(row.年 as number),
    });
    expect(ticks).toEqual(["2005Q1", "2010Q1", "2015Q1", "2020Q1", "2025Q4"]);
    expect(new Set(ticks).size).toBe(ticks.length);
  });

  it("keeps endpoints and removes duplicate labels for both period granularities", () => {
    const quarterly = [
      { label: "2020Q2", 年月: "2020Q2", 年: 2020, quarter: 2 },
      { label: "2020Q1", 年月: "2020Q1", 年: 2020, quarter: 1 },
      { label: "2020Q2", 年月: "2020Q2", 年: 2020, quarter: 2 },
    ];
    expect(
      computePeriodXAxisTicks(quarterly, "label", {
        periodIndex: (value) => {
          const match = value.match(/^(\d{4})Q([1-4])$/);
          return match ? Number(match[1]) * 4 + Number(match[2]) - 1 : null;
        },
        endpointGapPeriods: 12,
        milestonePredicate: (row) => row.quarter === 1,
      }),
    ).toEqual(["2020Q2"]);
    expect(computeXAxisTicks([{ 年月: "2020年1月" }])).toEqual(["2020年1月"]);
  });
});
