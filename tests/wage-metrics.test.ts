import { loadTotalEarningData } from "../src/lib/cpiData";
import path from "path";
import process from "process";

describe("wage Metrics Calculation", () => {
  it("should calculate hourly and per-employee wages correctly", async () => {
    console.log("Current working directory:", process.cwd());
    console.log("Resolved path:", path.join(process.cwd(), "public/total_earning.csv"));

    // Note: Since loadTotalEarningData relies on file system,
    // This test depends on the existence of the CSV files in the 'public' directory.
    const data = await loadTotalEarningData();

    // Ensure we have data
    expect(data.length).toBeGreaterThan(0);

    // Check if the keys exist in the first data point (after filtering/sorting)
    const firstMonth = data[0];
    expect(firstMonth).toHaveProperty("時間当たり給与");
    expect(firstMonth).toHaveProperty("15歳以上国民当たり給与");

    // Verify calculation for a specific entry if possible, or at least that they are numbers
    if (data.length > 0) {
      const entry = data[data.length - 1]; // Check latest data
      expectTypeOf(entry["時間当たり給与"]).toBeNumber();
      expectTypeOf(entry["15歳以上国民当たり給与"]).toBeNumber();
      expect(entry["時間当たり給与"]).toBeGreaterThan(0);
      expect(entry["15歳以上国民当たり給与"]).toBeGreaterThan(0);
    }
  });
});
