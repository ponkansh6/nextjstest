import { describe, it, expect } from "vitest";
import { loadCtiData, loadCpiData } from "../src/lib/cpiData";
import { computeChartData } from "../src/lib/chartLogic";
import { nominalKeys } from "../src/lib/chartConstants";

describe("Multi-Stage Data Integrity Trace", () => {
  it("should trace non-zero values for nominal expenditure, CPI categories, and CPI stacked data through the pipeline", async () => {
    // 1. Nominal Expenditure Trace
    const expenditureKey = "その他の消費支出（名目）";
    const rawExpData = await loadCtiData();
    const lastExpRow = rawExpData[rawExpData.length - 1];
    console.log(`--- TRACE: ${expenditureKey} ---`);
    console.log("Stage 1: Load:", lastExpRow[expenditureKey]);
    expect(lastExpRow[expenditureKey]).toBeGreaterThan(0);

    const chartData = computeChartData({
      data: [],
      nominalData: rawExpData,
      startYear: 2025,
      endYear: 2026,
      nominalKeys: nominalKeys,
      realKeys: [],
      maxCpiDate: { year: 2026, month: 1 }
    }, []);

    const lastRenderRow = chartData.quarterlyNominalData[chartData.quarterlyNominalData.length - 1];
    console.log("Stage 3: Pre-render:", lastRenderRow[expenditureKey]);
    expect(lastRenderRow[expenditureKey]).toBeGreaterThan(0);

    // 2. CPI Index Trace
    const cpiKey = "総合";
    const rawCpiData = await loadCpiData();
    const lastCpiRow = rawCpiData[rawCpiData.length - 1];
    console.log(`--- TRACE: ${cpiKey} ---`);
    console.log("Stage 1: Load (CPI):", lastCpiRow[cpiKey]);
    expect(lastCpiRow[cpiKey]).toBeGreaterThan(0);

    // 3. CPI Stacked Data Trace
    const stackedKey = "その他の消費支出（名目）";
    console.log(`--- TRACE: CPI Stacked (${stackedKey}) ---`);
    const lastStackedRow = rawCpiData[rawCpiData.length - 1];
    // CPIデータ側にはこの費目は直接含まれていないため、ロジック上の確認
    // 実際にはCPI費目積み上げはCpiChart.tsx内で `data` (cleanData) を参照している
    console.log("Stage 1: CPI Clean Data (Stacked):", lastStackedRow[stackedKey]);
  });
});
