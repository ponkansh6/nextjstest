import { describe, it, expect } from "vitest";
import {
  loadTotalEarningData,
  calculateAdjustedMetric,
} from "../src/lib/cpiData";

describe("Wage Calculation Logic", () => {
  it("calculateAdjustedMetric should scale correctly", () => {
    // 基準年（2020年）を想定したテスト
    // (給与100 / 分母10) * (スケーリング係数 1) = 10
    expect(calculateAdjustedMetric(100, 10, 1)).toBe(10);

    // スケーリング係数を使って100にする
    // (給与100 / 分母10) * (スケーリング係数 10) = 100
    expect(calculateAdjustedMetric(100, 10, 10)).toBe(100);

    // 分母が0の場合は0を返す
    expect(calculateAdjustedMetric(100, 0, 10)).toBe(0);
  });
});

describe("loadTotalEarningData integration test", () => {
  it("should return data with populated metrics", async () => {
    const data = await loadTotalEarningData();
    expect(data.length).toBeGreaterThan(0);

    // Check the latest entry
    const latest = data[data.length - 1];
    console.log("Latest entry:", latest);

    expect(latest).toHaveProperty("調整済み15歳以上国民一人当たり給与");
    expect(latest["調整済み15歳以上国民一人当たり給与"]).toBeGreaterThan(0);
  });

  it("should calculate 15+ population wage index relative to 2020 base", async () => {
    const data = await loadTotalEarningData();
    console.log("Latest 3 entries:", data.slice(-3));

    // 2020年のデータポイントを探す
    const year2020Items = data.filter((item) => item.年月.startsWith("2020年"));
    if (year2020Items.length > 0) {
      const avg2020 =
        year2020Items.reduce(
          (acc, item) =>
            acc + (item["調整済み15歳以上国民一人当たり給与"] as number),
          0,
        ) / year2020Items.length;
      console.log("2020 base average index:", avg2020);
      
      // 2020年平均がほぼ100であることを確認
      expect(avg2020).toBeGreaterThan(95);
      expect(avg2020).toBeLessThan(105);
    }
  });
});
