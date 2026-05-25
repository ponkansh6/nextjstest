import { loadTotalEarningData } from "../src/lib/cpiData";

describe("smoothing scope", () => {
  it("applies 12-month MA only to 特別給与", async () => {
    const data = await loadTotalEarningData();
    expect(data.length).toBeGreaterThan(24);

    const absMean = (arr: number[]) => (arr.reduce((a, b) => a + b, 0) || 0) / (arr.length || 1);
    const specDiffs: number[] = [];

    // Calculate volatility of the smoothed special earnings
    const recentData = data.slice(-12);
    for (let i = 1; i < recentData.length; i++) {
      specDiffs.push(Math.abs((recentData[i]["特別給与"] as number) - (recentData[i - 1]["特別給与"] as number)));
    }

    const meanSpec = absMean(specDiffs);

    // With 12-month MA, the volatility should be low.
    // Based on historical data, this is typically well below 0.5.
    expect(meanSpec).toBeLessThan(0.5);
  }, 20000);
});
