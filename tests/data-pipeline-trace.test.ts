import { describe, it, expect } from "vitest";
import { loadCtiData } from "../src/lib/cpiData";
import { computeChartData } from "../src/lib/chartLogic";
import { nominalKeys } from "../src/lib/chartConstants";

describe("Data Pipeline Trace", () => {
  it("should trace nominal expenditure data values before rendering", async () => {
    const data = await loadCtiData();
    const chartData = computeChartData({
      data: [], // not used for nominal calculation
      nominalData: data,
      startYear: 2025,
      endYear: 2026,
      nominalKeys: nominalKeys,
      realKeys: [],
      maxCpiDate: { year: 2026, month: 1 }
    }, []);

    const quarterlyNominal = chartData.quarterlyNominalData;
    const lastRow = quarterlyNominal[quarterlyNominal.length - 1];

    console.log("--- FINAL DATA ROW FOR RENDERING ---");
    console.log("Row Object:", JSON.stringify(lastRow, null, 2));
    
    // 特定のキーが含まれているか直接確認
    const targetKey = "その他の消費支出（名目）";
    console.log(`Value of '${targetKey}':`, lastRow[targetKey]);
    
    expect(lastRow).toHaveProperty(targetKey);
  });
});
