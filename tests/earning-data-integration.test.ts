import { describe, it, expect } from "vitest";
import { loadTotalEarningData } from "../src/lib/cpiData";

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
    // 2020年のデータポイントを探す（複数ある場合は平均などを確認）
    const year2020Items = data.filter((item) => item.年月.startsWith("2020年"));
    if (year2020Items.length > 0) {
      const avg2020 =
        year2020Items.reduce(
          (acc, item) =>
            acc + (item["調整済み15歳以上国民一人当たり給与"] as number),
          0,
        ) / year2020Items.length;
      // 2020年平均がほぼ100であることを確認
      expect(avg2020).toBeGreaterThan(95);
      expect(avg2020).toBeLessThan(105);
    }
  });
});
