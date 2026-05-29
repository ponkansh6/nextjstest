import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCpiChartData } from "../../../src/hooks/useCpiChartData";
import type { CpiData } from "../../../src/app/page";

describe("useCpiChartData hook output", () => {
  it("should produce the expected output structure for the UI", () => {
    const mockNominalData: CpiData[] = [
      { 年月: "2020年1月", "食料（名目）": 10 },
      { 年月: "2020年2月", "食料（名目）": 20 },
      { 年月: "2020年3月", "食料（名目）": 30 },
    ] as any;

    const props = {
      data: [],
      endYear: 2020,
      maxCpiDate: { month: 3, year: 2020 },
      nominalData: mockNominalData,
      nominalKeys: ["食料（名目）"],
      realKeys: [],
      startYear: 2020,
    };

    const { result } = renderHook(() => useCpiChartData(props));

    // Verify the hook returns the required structure
    expect(result.current).toHaveProperty("quarterlyNominalData");
    expect(result.current).toHaveProperty("quarterlyRealData");
    expect(result.current).toHaveProperty("toggleQuarter");
    
    // Check aggregated values
    const q1 = result.current.quarterlyNominalData[0];
    expect(q1.label).toBe("2020年Q1");
    expect(q1["食料（名目）"]).toBe(60);
  });
});
