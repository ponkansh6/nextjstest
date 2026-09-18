import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  calculateCategorySum,
  calculateCAGRValue,
  computeChartData,
} from "../../src/lib/clientCalculations";
import type { QuarterlyView } from "../../src/types/chart";

describe("src/lib/clientCalculations", () => {
  it("has no CTI support-series or server-only calculation dependency", () => {
    const source = readFileSync(resolve("src/lib/clientCalculations.ts"), "utf8");
    expect(source).not.toContain("SUPPORT_SERIES_KEY_NOMINAL");
    expect(source).not.toContain("SUPPORT_SERIES_KEY_REAL");
    expect(source).not.toContain("scaleSupportSeries");
    expect(source).not.toContain('from "./math/supportSeries"');
    expect(source).not.toContain('from "@server/');
  });

  it("forwards the server public projection, preserving null and valid zero", () => {
    const nominal = [
      {
        label: "2005Q1",
        quarter: 1,
        年: 2005,
        年月: "2005Q1",
        "CTIミクロ四半期系列（名目）": null,
      },
      { label: "2005Q2", quarter: 2, 年: 2005, 年月: "2005Q2", "CTIミクロ四半期系列（名目）": 0 },
    ] as QuarterlyView[];
    const result = computeChartData(
      {
        data: [],
        nominalData: [],
        startYear: 2005,
        endYear: 2005,
        maxCpiDate: { year: 2005, month: 6 },
        quarterlyNominalData: nominal,
      },
      [],
    );
    expect(result.quarterlyNominalData).toEqual(nominal);
  });

  it("keeps unrelated category and CAGR helpers available", () => {
    expect(
      calculateCategorySum(
        [{ 年月: "2020年1月", 食料: 10, 外食: 5 }] as any,
        2020,
        1,
        [],
        ["食料", "外食"],
      ),
    ).toBe(15);
    expect(calculateCAGRValue(100, 121, 2)).toBeCloseTo(0.1);
  });
});
