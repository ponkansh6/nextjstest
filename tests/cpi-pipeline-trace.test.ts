import { describe, it, expect } from "vitest";
import { loadCpiData } from "../src/lib/cpiData";

describe("CPI Pipeline Trace", () => {
  it("should trace values for CPI categories through the pipeline", async () => {
    // 1. Load Stage
    const rawData = await loadCpiData();
    const targetKey = "食料";
    const rawSample = rawData[rawData.length - 1];
    
    console.log(`--- CPI PIPELINE TRACE (${targetKey}) ---`);
    console.log("Stage 1: Load (Raw Data):", rawSample[targetKey]);
    expect(rawSample).toHaveProperty(targetKey);
    expect(typeof rawSample[targetKey]).toBe("number");

    // 2. Data Cleaning/Processing Stage
    // CPIデータはロード時にクリーニング・ウエイト計算済み
    const cleanedSample = rawSample; // rawData is already cleaned by loadCpiData
    console.log("Stage 2: Process (Cleaned Data):", cleanedSample[targetKey]);
    expect(cleanedSample[targetKey]).toBeGreaterThan(0);
  });
});
