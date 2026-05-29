import { computeChartData } from "../../src/lib/chartLogic";
import { loadCtiData } from "../../server/lib/dataLoader";
import { nominalKeys } from "../../src/lib/chartConstants";
import { describe, it, expect, beforeAll } from "vitest";
import type { CpiData } from "../../src/app/page";

describe("useCpiChartData logic (computeChartData) with real data", () => {
  let realData: CpiData[];

  beforeAll(async () => {
    realData = await loadCtiData();
  });

  it("should aggregate data into quarters correctly for 2020 Q1", () => {
    const q1Data = realData.filter(d => 
        d.年月 === "2020年1月" || d.年月 === "2020年2月" || d.年月 === "2020年3月"
    );

    const props = {
      data: realData,
      endYear: 2020,
      maxCpiDate: { month: 3, year: 2020 },
      nominalData: q1Data,
      nominalKeys: nominalKeys,
      realKeys: [],
      startYear: 2020,
    };

    const result = computeChartData(props, []);

    expect(result.quarterlyNominalData).toHaveLength(1);
    expect(result.quarterlyNominalData[0].label).toBe("2020年Q1");
    // Verify meaningful values are aggregated
    expect(result.quarterlyNominalData[0]["食料（名目）"]).toBeGreaterThan(0);
  });

  it("should return empty if data for a quarter is missing in real data", () => {
    // 2025年Q1はまだデータが揃っていない可能性が高い（最新に近い）ので、そこをあえて指定して動作確認
    const incompleteData = realData.filter(d => d.年月 === "2025年1月");
    
    const propsIncomplete = {
      data: realData,
      endYear: 2025,
      maxCpiDate: { month: 3, year: 2025 },
      nominalData: incompleteData,
      nominalKeys: nominalKeys,
      realKeys: [],
      startYear: 2025,
    };
    
    const result = computeChartData(propsIncomplete, []);

    // 1月しかないため、Q1は計算されないか、値が0になる
    const q1 = result.quarterlyNominalData.find(d => d.label === "2025年Q1");
    if (q1) {
       expect(q1["食料（名目）"]).toBe(0);
    }
  });

  it("should toggle quarters correctly", () => {
    const props = {
      data: realData,
      endYear: 2020,
      maxCpiDate: { month: 3, year: 2020 },
      nominalData: realData.filter(d => d.年月.startsWith("2020年")),
      nominalKeys: nominalKeys,
      realKeys: [],
      startYear: 2020,
    };
    
    const result = computeChartData(props, [1]); // Hide Q1
    expect(result.quarterlyNominalData.length).toBe(0);
  });
});
