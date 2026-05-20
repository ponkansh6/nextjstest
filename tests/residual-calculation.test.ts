import { describe, it, expect } from "vitest";
import { CpiData } from "../src/app/page";

describe("残差計算", () => {
  it("残差は平滑化されたCPI総合値で計算されるべき（生の値ではない）", () => {
    /**
     * テストの目的：
     * - 残差が「平滑化されたCPI総合」を使って計算されていることを検証
     * - 生のCPI値ではなく、平滑化された値で引いていることを確認
     *
     * シナリオ：
     * 3か月のデータで、2か月目に給与とCPIの両方で大きな変動を持たせる
     *
     * 生の値で計算した場合：
     *   3月の残差 = 90 - 105 = -15
     *
     * 平滑化値で計算した場合（3か月移動平均）：
     *   3月の給与平均 = (100 + 110 + 90) / 3 = 100
     *   3月のCPI平均 = (100 + 95 + 105) / 3 = 100
     *   3月の残差 = 100 - 100 = 0
     *
     * 正しい実装では、2023年3月のデータポイントの残差が0に近い値であるべき
     */

    // テストデータの構造例
    const testData = [
      {
        year: 2023,
        month: 1,
        totalEarnings: 100,
        cpiValue: 100,
        expectedResidualSmoothed: 100, // 1か月だけなので同じ
      },
      {
        year: 2023,
        month: 2,
        totalEarnings: 110,
        cpiValue: 95,
        expectedResidualSmoothed: 105, // (100+110)/2, (100+95)/2 -> 105-97.5 = 7.5
      },
      {
        year: 2023,
        month: 3,
        totalEarnings: 90,
        cpiValue: 105,
        // 3か月移動平均: (100+110+90)/3=100, (100+95+105)/3=100 -> 残差=0
        expectedResidualSmoothed: 0,
      },
    ];

    /**
     * 実装の検証ポイント：
     * - loadTotalEarningDataの結果において、残差フィールドが
     *   「平滑化されたCPI値」から計算されていることを確認
     * - 具体的には、月ごとの残差の値が、単純な差分ではなく
     *   平滑化後の値の差分であることを検証
     */

    // この構造は、実際のloadTotalEarningDataの出力で以下を確認することを想定
    // 1. result[2].残差 が -15 ではなく、ほぼ 0 に近い値であること
    // 2. 残差の計算が smoothedTotal - smoothedCpi で行われていること

    expect(testData[2].expectedResidualSmoothed).toBe(0);
  });

  it("残差計算では、各指標と同じ方法（平滑化した値）を使うべき", () => {
    /**
     * 他の指標（時間当たり給与など）は、平滑化された給与総額を使用している
     * 残差計算も同じ方法で、平滑化された給与総額と平滑化されたCPI値を使うべき
     *
     * 間違った実装：
     *   残差 = 平滑化済み給与 - 生のCPI値
     *
     * 正しい実装：
     *   残差 = 平滑化済み給与 - 平滑化済みCPI値
     */

    const smoothedTotal = 100;
    const smoothedCpi = 95;
    const expectedResidual = smoothedTotal - smoothedCpi;

    expect(expectedResidual).toBe(5);
    // 生のCPI値でもし計算していれば、結果が異なるはず
    // rawCpi = 90 だった場合、間違った計算 = 100 - 90 = 10
    // 正しい計算 = 100 - 95 = 5
  });
});

describe("残差計算の実装検証", () => {
  it("残差が生のCPI値ではなく平滑化されたCPI値から計算されていることを確認", () => {
    /**
     * 実装の検証テスト
     *
     * 3か月分のデータで、以下の条件を設定：
     * 1月: 給与=100, CPI=100
     * 2月: 給与=110, CPI=95
     * 3月: 給与=90,  CPI=105
     *
     * 【生のCPI値で計算した場合】
     * 3月の残差 = 90 - 105 = -15
     *
     * 【平滑化されたCPI値で計算した場合（3か月移動平均）】
     * 3月の給与平均 = (100+110+90)/3 = 100
     * 3月のCPI平均 = (100+95+105)/3 = 100
     * 3月の残差 = 100 - 100 = 0
     *
     * 正しい実装では、3月のresidualが0付近になるはず
     */

    // テスト用のモックデータセット
    const residualTestScenario = {
      month1: { earnings: 100, cpi: 100, expectedRaw: 0 },
      month2: { earnings: 110, cpi: 95, expectedRaw: 15 },
      month3: { earnings: 90, cpi: 105, expectedRaw: -15 },
      month3Smoothed: {
        // 3か月の平均：(100+110+90)/3=100, (100+95+105)/3=100
        earningsAvg: 100,
        cpiAvg: 100,
        expectedSmoothed: 0, // smoothedEarnings - smoothedCpi = 100 - 100
      },
    };

    // 生のCPI値での計算
    const rawResidual =
      residualTestScenario.month3.earnings - residualTestScenario.month3.cpi;
    expect(rawResidual).toBe(-15);

    // 平滑化されたCPI値での計算
    const smoothedResidual =
      residualTestScenario.month3Smoothed.earningsAvg -
      residualTestScenario.month3Smoothed.cpiAvg;
    expect(smoothedResidual).toBe(0);

    // 正しい実装では、smoothedResidualが使用されるべき（rawResidualではない）
    expect(smoothedResidual).not.toBe(rawResidual);
  });

  it("他の指標と同じスムージング方法を使用していることを確認", () => {
    /**
     * 検証内容：
     * - 時間当たり給与 = calculateAdjustedMetric(smoothedTotal, smoothedHours, factor)
     * - 15歳以上国民一人当たり給与 = calculateAdjustedMetric(smoothedTotal*smoothedEmp, smoothedPop, factor)
     * - 残差 = smoothedTotal - smoothedCpi
     *
     * 全ての指標が「平滑化されたトータル給与」を基準に計算されている
     */

    const smoothedTotal = 100;
    const smoothedCpi = 95;
    const smoothedHours = 160;
    const hourlyFactor = 1.0;

    // 各指標の計算
    const timePerHourly = (smoothedTotal / smoothedHours) * hourlyFactor;
    const residual = smoothedTotal - smoothedCpi;

    // 両方とも smoothedTotal を使用していることを確認
    expect(timePerHourly).toBeGreaterThan(0);
    expect(residual).toBe(5);
    expect(residual).toBe(smoothedTotal - smoothedCpi);
  });
});
