import { test, expect } from "@playwright/test";
import { loadTotalEarningData } from "../src/lib/cpiData";

test.describe("Wage Metrics Calculation", () => {
  test("should calculate hourly and per-employee wages correctly", async () => {
    // Note: Since loadTotalEarningData relies on file system,
    // this test depends on the existence of the CSV files in the 'public' directory.
    const data = await loadTotalEarningData();

    // Ensure we have data
    expect(data.length).toBeGreaterThan(0);

    // Check if the keys exist in the first data point (after filtering/sorting)
    const firstMonth = data[0];
    expect(firstMonth).toHaveProperty("調整済み時間当たり給与");
    expect(firstMonth).toHaveProperty("調整済み一人当たり給与");

    // Verify calculation for a specific entry if possible, or at least that they are numbers
    if (data.length > 0) {
      const entry = data[data.length - 1]; // Check latest data
      console.log(`Latest entry (${entry.年月}):`, {
        調整済み時間当たり給与: entry["調整済み時間当たり給与"],
        調整済み一人当たり給与: entry["調整済み一人当たり給与"],
        特別給与: entry["特別給与"],
        調整済み特別給与: entry["調整済み特別給与"],
      });
      expect(typeof entry["調整済み時間当たり給与"]).toBe("number");
      expect(typeof entry["調整済み一人当たり給与"]).toBe("number");
      expect(entry["調整済み時間当たり給与"]).toBeGreaterThan(0);
      expect(entry["調整済み一人当たり給与"]).toBeGreaterThan(0);
    }
  });
});
