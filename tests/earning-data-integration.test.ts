import { calculateAdjustedMetric, loadTotalEarningData } from "../src/lib/cpiData";

describe("wage Calculation Logic", () => {
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

    const metrics = ["時間当たり給与", "15歳以上国民当たり給与"];

    data.forEach((row) => {
      metrics.forEach((metric) => {
        const val = row[metric as keyof typeof row];
        expect(
          typeof val === "number" && !isNaN(val) && val > 0,
          `Invalid metric "${metric}" at ${row.年月}: expected positive number, got ${val}`,
        ).toBeTruthy();
      });
    });
  });

  it("should have no gaps in month continuity", async () => {
    const data = await loadTotalEarningData();
    if (data.length < 2) {
      return;
    }

    const ymToMonths = (ym: string) => {
      const m = ym.match(/^(\d{4})年(\d{1,2})月/);
      if (!m) {
        return 0;
      }
      return parseInt(m[1], 10) * 12 + parseInt(m[2], 10);
    };

    for (let i = 1; i < data.length; i++) {
      const prev = ymToMonths(data[i - 1].年月);
      const curr = ymToMonths(data[i].年月);
      expect(curr, `Data gap found between ${data[i - 1].年月} and ${data[i].年月}`).toBe(prev + 1);
    }
  });

  it("should contain valid data for the range visible in the app (2005-latest)", async () => {
    const data = await loadTotalEarningData();
    // アプリ側のロジック：2005年以降をデフォルト表示とする
    const filteredData = data.filter((item) => {
      const year = parseInt(item.年月.substring(0, 4), 10);
      return year >= 2005;
    });

    expect(filteredData.length).toBeGreaterThan(0);

    // 最も古い月と最新月を特定
    const getVal = (ym: string) => {
      const m = ym.match(/^(\d{4})年(\d{1,2})月/);
      return m ? parseInt(m[1], 10) * 100 + parseInt(m[2], 10) : 0;
    };

    const earliestMonthItem = filteredData.reduce((earliest, current) => 
      getVal(current.年月) < getVal(earliest.年月) ? current : earliest
    , filteredData[0]);

    const latestMonthItem = filteredData.reduce((latest, current) => 
      getVal(current.年月) > getVal(latest.年月) ? current : latest
    , filteredData[0]);

    console.log(`Earliest visible month: ${earliestMonthItem.年月}`);
    console.log(`Latest visible month: ${latestMonthItem.年月}`);

    // 検証: 最古月が2005年以降であること
    expect(earliestMonthItem.年月.startsWith("2005年")).toBeTruthy();

    // 妥当な値を持っているか
    const metrics = ["所定内給与", "所定外給与", "特別給与", "時間当たり給与", "15歳以上国民当たり給与"];
    // 各指標ごとに妥当な範囲を定義
    const metricRanges: Record<string, { min: number; max: number }> = {
      所定内給与: { min: 50, max: 150 },
      所定外給与: { min: 0, max: 50 },
      特別給与: { min: 0, max: 100 },
      時間当たり給与: { min: 50, max: 150 },
      "15歳以上国民当たり給与": { min: 50, max: 150 },
    };
    
    [earliestMonthItem, latestMonthItem].forEach((item) => {
      metrics.forEach((metric) => {
        const val = item[metric as keyof typeof item] as number;
        expect(typeof val, `Metric ${metric} should be a number`).toBe("number");
        expect(val, `Metric ${metric} at ${item.年月} should be positive`).toBeGreaterThan(0);
        
        const range = metricRanges[metric] || { min: 0, max: 200 };
        expect(val, `Metric ${metric} at ${item.年月} is out of range (${val})`).toBeGreaterThan(range.min);
        expect(val, `Metric ${metric} at ${item.年月} is out of range (${val})`).toBeLessThan(range.max);
      });
    });
  });

  it("should maintain 2020 average near 100 for all adjusted metrics", async () => {
    const data = await loadTotalEarningData();
    const year2020Items = data.filter((item) => item.年月.startsWith("2020年"));

    expect(year2020Items.length, "Expected 12 months of data for 2020").toBeGreaterThanOrEqual(12);

    const metrics = ["時間当たり給与", "15歳以上国民当たり給与"];

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

  it("should have 2020 average of Cash Earnings Total (総合) equal to 100", async () => {
    const data = await loadTotalEarningData();
    const year2020Items = data.filter((item) => item.年月.startsWith("2020年"));

    expect(year2020Items.length, "Expected 12 months of data for 2020").toBeGreaterThanOrEqual(12);

    const avg2020Total =
      year2020Items.reduce((sum, item) => sum + (item["総合"] || 0), 0) / year2020Items.length;

    console.log(`2020 base average for 総合:`, avg2020Total);

    // 総合の2020年平均は100に非常に近いはず（スケーリング係数の基点）
    expect(avg2020Total).toBeCloseTo(100, 1);
  });
});
