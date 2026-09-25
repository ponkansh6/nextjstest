import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCpiChartDisplayData } from "../../src/hooks/useCpiChartDisplayData";
import type { QuarterlyView } from "../../src/types/chart";

const quarterlyNominalData: QuarterlyView[] = [2005, 2006].flatMap((year) =>
  [1, 2, 3, 4].map((quarter) => ({
    label: `${year}Q${quarter}`,
    quarter,
    年: year,
    年月: `${year}Q${quarter}`,
  })),
);

describe("useCpiChartDisplayData", () => {
  it("filters nominal quarterly rows by the inclusive start and end years", () => {
    const { result, rerender } = renderHook(
      ({ startYear }: { startYear: number }) =>
        useCpiChartDisplayData({
          data: [],
          quarterlyNominalData,
          quarterlyRealData: [],
          totalEarningData: [],
          startYear,
          endYear: 2006,
          hiddenQuarters: [],
        }),
      { initialProps: { startYear: 2005 } },
    );

    expect(result.current.filteredQuarterlyNominalData).toHaveLength(8);

    rerender({ startYear: 2006 });

    expect(result.current.filteredQuarterlyNominalData).toHaveLength(4);
    expect(result.current.filteredQuarterlyNominalData.map((row) => row.label)).toEqual([
      "2006Q1",
      "2006Q2",
      "2006Q3",
      "2006Q4",
    ]);
  });

  it("filters nominal and real quarterly rows by both inclusive year bounds", () => {
    const { result, rerender } = renderHook(
      ({ startYear, endYear }: { startYear: number; endYear: number }) =>
        useCpiChartDisplayData({
          data: [],
          quarterlyNominalData,
          quarterlyRealData: quarterlyNominalData,
          totalEarningData: [],
          startYear,
          endYear,
          hiddenQuarters: [],
        }),
      { initialProps: { startYear: 2005, endYear: 2006 } },
    );

    const labelsFor = (rows: QuarterlyView[]) => rows.map((row) => row.label);
    const labels2005 = ["2005Q1", "2005Q2", "2005Q3", "2005Q4"];
    const labels2006 = ["2006Q1", "2006Q2", "2006Q3", "2006Q4"];

    expect(result.current.filteredQuarterlyNominalData).toHaveLength(8);
    expect(result.current.filteredQuarterlyRealData).toHaveLength(8);

    rerender({ startYear: 2006, endYear: 2006 });

    expect(labelsFor(result.current.filteredQuarterlyNominalData)).toEqual(labels2006);
    expect(labelsFor(result.current.filteredQuarterlyRealData)).toEqual(labels2006);

    rerender({ startYear: 2005, endYear: 2005 });

    expect(labelsFor(result.current.filteredQuarterlyNominalData)).toEqual(labels2005);
    expect(labelsFor(result.current.filteredQuarterlyRealData)).toEqual(labels2005);
  });
});
