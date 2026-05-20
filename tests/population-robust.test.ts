/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadPopulationData } from "../src/lib/cpiData";
import fs from "fs";
import path from "path";

vi.mock("fs");
vi.mock("path");

describe("loadPopulationData robust tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse correctly with mock csv content", async () => {
    // The parser expects row[0] for "年　月", row[1] for month, row[4] for population
    // Real code uses headerIndex + 2
    const csvContent = `
年　月,Month,Other,Col3,TotalPop
,Empty
2026,1月,Jan.,,10953
`;
    vi.mocked(fs.existsSync).mockReturnValue(true as any);
    vi.mocked(fs.readFileSync).mockReturnValue(csvContent as any);
    vi.mocked(path.join).mockReturnValue("mocked/path" as any);

    const result = await loadPopulationData();
    expect(result.has("2026年1月")).toBe(true);
    // Real code should multiply by 10000, so check 109530000.
    // If it is 10953, it means the multiplication is missing!
    expect(result.get("2026年1月")?.total).toBe(109530000);
  });
});
