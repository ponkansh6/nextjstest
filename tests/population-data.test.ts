import { describe, it, expect, vi } from "vitest";
import { loadPopulationData } from "../src/lib/cpiData";
import fs from "fs";

// Mock fs to control csv data
vi.mock("fs");

describe("loadPopulationData", () => {
  it("should process population csv correctly for 15+ population", async () => {
    // The parser skips index 0 (header) and index 1, then starts at headerIndex + 2
    // mockCsv needs rows such that rows[2] is our data row
    const mockCsv = `年　月,dummy,dummy,dummy,総数
,,,,,
2020年,1月,,,100000`;

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(mockCsv);

    const result = await loadPopulationData();
    console.log("Keys in result:", Array.from(result.keys()));

    expect(result.size).toBeGreaterThan(0);
    expect(result.get("2020年1月")?.total).toBe(1000000000);
  });

  it("should calculate index and moving average within reasonable range, with 2020 index near 100", async () => {
    const mockCsv = `年,dummy,Month,dummy,総数
2020,,01,,100000
2020,,06,,100000
2021,,01,,110000`;

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(mockCsv);

    const result = await loadPopulationData();

    result.forEach((data, ym) => {
      // 指数は通常正の値
      expect(data.index).toBeGreaterThanOrEqual(0);
      // 移動平均も同様
      expect(data.ma).toBeGreaterThanOrEqual(0);
      expect(data.ma).toBeLessThan(200);

      // 2020年は基準年なので指数は100
      if (ym.startsWith("2020年")) {
        expect(data.index).toBeCloseTo(100, 2);
      }
    });
  });

  it("should handle missing file gracefully", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = await loadPopulationData();
    expect(result.size).toBe(0);
  });
});
