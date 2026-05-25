import { loadTotalEarningData } from "../src/lib/cpiData";

describe("smoothing scope", () => {
  it("applies 12-month MA only to 特別給与", async () => {
    const data = await loadTotalEarningData();
    expect(data.length).toBeGreaterThan(12);

    const absMean = (arr: number[]) => (arr.reduce((a, b) => a + b, 0) || 0) / (arr.length || 1);
    const schedDiffs: number[] = [];
    const outDiffs: number[] = [];
    const specDiffs: number[] = [];

    for (let i = 1; i < data.length; i++) {
      schedDiffs.push(Math.abs((data[i]["所定内給与"] as number) - (data[i - 1]["所定内給与"] as number)));
      outDiffs.push(Math.abs((data[i]["所定外給与"] as number) - (data[i - 1]["所定外給与"] as number)));
      specDiffs.push(Math.abs((data[i]["特別給与"] as number) - (data[i - 1]["特別給与"] as number)));
    }

    const meanSched = absMean(schedDiffs);
    const meanOut = absMean(outDiffs);
    const meanSpec = absMean(specDiffs);

    // Smoothed series should be less volatile than raw ones
    expect(meanSpec).toBeLessThan(meanSched);
    expect(meanSpec).toBeLessThan(meanOut);
  }, 20000);
});
