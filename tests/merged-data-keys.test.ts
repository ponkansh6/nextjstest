import { describe, it, expect, beforeAll } from "vitest";
import { loadTotalEarningData, loadCpiData } from "../src/lib/cpiData";
import { mergeChartData } from "../src/lib/chartUtils";

describe("Chart Data Regression Tests", () => {
  let totalEarningData: any[] = [];
  let cpiData: any[] = [];
  let mergedData: any[] = [];

  beforeAll(async () => {
    totalEarningData = await loadTotalEarningData();
    cpiData = await loadCpiData();
    mergedData = mergeChartData(totalEarningData, cpiData, 2020, 2026);
  });

  it("should preserve all wage metric keys in merged data (prevent regression)", () => {
    const requiredWageKeys = [
      "所定内給与",
      "所定外給与",
      "特別給与",
      "時間当たり給与",
      "15歳以上国民一人当たり給与",
      "総合",
      "残差",
    ];

    const sampleRow = mergedData[mergedData.length - 1];
    expect(sampleRow).toBeDefined();

    requiredWageKeys.forEach((key) => {
      expect(
        sampleRow[key],
        `Key "${key}" must be present to prevent chart rendering issues`,
      ).toBeDefined();
    });
  });

  it("should maintain consistent keys across all rows", () => {
    const getNumericKeys = (row: any) =>
      Object.keys(row)
        .filter((k) => typeof row[k] === "number" && k !== "年月")
        .sort();

    const firstRowKeys = getNumericKeys(mergedData[0]);
    const lastRowKeys = getNumericKeys(mergedData[mergedData.length - 1]);
    const middleRowKeys = getNumericKeys(
      mergedData[Math.floor(mergedData.length / 2)],
    );

    expect(firstRowKeys).toEqual(lastRowKeys);
    expect(middleRowKeys).toEqual(lastRowKeys);
  });

  it("should have CPI data (総合) in all rows with wage data", () => {
    mergedData.forEach((row) => {
      expect(row.総合).toBeDefined();
      expect(typeof row.総合).toBe("number");
    });
  });

  it("should have all wage components sum near total earnings", () => {
    mergedData.forEach((row) => {
      const earningSumComponents =
        (row.所定内給与 || 0) + (row.所定外給与 || 0) + (row.特別給与 || 0);
      expect(earningSumComponents).toBeGreaterThan(0);
    });
  });

  it("should not include CPI-only dates (prevent data loss)", () => {
    // 元データの給与データの最後の日付を確認
    const lastWageDate = totalEarningData[totalEarningData.length - 1].年月;
    expect(lastWageDate).toBeDefined();

    // マージされたデータに給与データの最後の日付が含まれていることを確認
    const hasLastWageDate = mergedData.some((r) => r.年月 === lastWageDate);
    expect(hasLastWageDate).toBe(true);

    // マージされたデータが給与データの範囲を超えないことを確認
    const mergedMaxDate = mergedData[mergedData.length - 1].年月;
    expect(mergedMaxDate).toBe(lastWageDate);
  });
});
