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
  it("should have valid metrics for all rows (no join failures)", async () => {
    const data = await loadTotalEarningData();
    expect(data.length).toBeGreaterThan(0);

    const metrics = ["時間当たり給与", "15歳以上国民一人当たり給与"];

    data.forEach((row) => {
      metrics.forEach((metric) => {
        const val = row[metric as keyof typeof row];
        expect(
          typeof val === "number" && !isNaN(val) && val > 0,
          `Invalid metric "${metric}" at ${row.年月}: expected positive number, got ${val}`,
        ).toBe(true);
      });
    });
  });

  it("should have no gaps in month continuity", async () => {
    const data = await loadTotalEarningData();
    if (data.length < 2) return;

    const ymToMonths = (ym: string) => {
      const m = ym.match(/^(\d{4})年(\d{1,2})月/);
      if (!m) return 0;
      return parseInt(m[1], 10) * 12 + parseInt(m[2], 10);
    };

    for (let i = 1; i < data.length; i++) {
      const prev = ymToMonths(data[i - 1].年月);
      const curr = ymToMonths(data[i].年月);
      expect(
        curr,
        `Data gap found between ${data[i - 1].年月} and ${data[i].年月}`,
      ).toBe(prev + 1);
    }
  });

  it("should maintain 2020 average near 100 for all adjusted metrics", async () => {
    const data = await loadTotalEarningData();
    const year2020Items = data.filter((item) => item.年月.startsWith("2020年"));

    expect(
      year2020Items.length,
      "Expected 12 months of data for 2020",
    ).toBeGreaterThanOrEqual(12);

    const metrics = ["時間当たり給与", "15歳以上国民一人当たり給与"];

    metrics.forEach((metric) => {
      const avg2020 =
        year2020Items.reduce(
          (acc, item) => acc + (item[metric as keyof typeof item] as number),
          0,
        ) / year2020Items.length;

      console.log(`2020 base average for ${metric}:`, avg2020);

      // Verify that 2020 average is near 100 (within 2% tolerance)
      expect(avg2020).toBeGreaterThan(98);
      expect(avg2020).toBeLessThan(102);
    });
  });
});
