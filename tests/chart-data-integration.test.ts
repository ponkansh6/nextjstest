import { describe, it, expect } from "vitest";
import { loadCpiData, loadTotalEarningData } from "../src/lib/cpiData";
import { CpiData } from "../src/app/page";

type MergedCpiData = CpiData & { 総合?: number };

describe("CpiChart Data Integration", () => {
  it("should successfully merge CPI and Total Earning data by month", async () => {
    const cpiData = await loadCpiData();
    const earningData = await loadTotalEarningData();

    // マージロジックの再現
    const map = new Map<string, MergedCpiData>();

    earningData.forEach((row) => {
      map.set(row.年月, { ...row });
    });

    cpiData.forEach((row) => {
      if (map.has(row.年月)) {
        const item = map.get(row.年月)!;
        item.総合 = row.総合;
      } else {
        map.set(row.年月, { 年月: row.年月, 総合: row.総合 } as MergedCpiData);
      }
    });

    const mergedData = Array.from(map.values());

    // 少なくとも1件以上のデータがCPI系列（総合）を持っていることを確認
    const hasCpiData = mergedData.some((d) => typeof d.総合 === "number");
    expect(hasCpiData, "Merged data should contain CPI '総合' property").toBe(
      true,
    );

    // 整合性チェック: 2025年以降のデータでCPI総合が存在することを確認
    const recentData = mergedData.find((d) => d.年月.startsWith("2025年"));
    if (recentData) {
      expect(recentData).toHaveProperty("総合");
      expect(typeof recentData.総合).toBe("number");
    }
  });
});
