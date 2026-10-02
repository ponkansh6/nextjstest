import { describe, it, expect } from "vitest";
import {
  computeConsumptionTotal12Ma,
  summarizeConsumptionTotal12MaStatus,
} from "../../../../server/lib/consumptionTotal12Ma";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("consumptionTotal12Ma (Plan49 Lane C)", () => {
  it("computes core monthly series and strict MA12 successfully with real repository fixtures", () => {
    const result = computeConsumptionTotal12Ma();
    expect(result.status).toBe("available");
    expect(typeof result.baseYearB).toBe("number");
    expect(result.baseYearB!).toBeGreaterThan(0);
    expect(result.points.length).toBeGreaterThan(0);

    // Verify 2014-01 window = 2013-02..2014-01
    const p201401 = result.points.find((p: any) => p.yearMonth === "2014-01");
    expect(p201401).toBeDefined();
    expect(p201401?.ma12Provenance?.windowStart).toBe("2013-02");
    expect(p201401?.ma12Provenance?.windowEnd).toBe("2014-01");

    // Verify mixing provenance for 2017-01 MA12 (2016-02..2016-12 historical + 2017-01 official)
    const p201701 = result.points.find((p: any) => p.yearMonth === "2017-01");
    expect(p201701).toBeDefined();
    expect(p201701?.ma12Provenance?.sources).toContain("000040499070");
    expect(p201701?.ma12Provenance?.sources).toContain("000040499028");
    expect(p201701?.ma12Provenance?.statuses).toContain("historical_estimate");
    expect(p201701?.ma12Provenance?.statuses).toContain("official_monthly_observed");

    // Verify pure official MA12 for 2017-12 (2017-01..2017-12)
    const p201712 = result.points.find((p: any) => p.yearMonth === "2017-12");
    expect(p201712).toBeDefined();
    expect(p201712?.ma12Provenance?.sources).toEqual(["000040499028"]);
    expect(p201712?.ma12Provenance?.statuses).toEqual(["official_monthly_observed"]);
  });

  it("throws or returns invalid when explicit source root does not exist", () => {
    expect(() => computeConsumptionTotal12Ma("/non/existent/path")).toThrow();
  });

  it("keeps raw monthly points unavailable when no complete 12-month window exists", () => {
    const status = summarizeConsumptionTotal12MaStatus(true, [
      { rawLevel: 100, ma12: null, status: "unavailable" },
      { rawLevel: 105, ma12: null, status: "unavailable" },
      { rawLevel: null, ma12: null, status: "invalid" },
    ]);
    expect(status).toEqual({
      status: "invalid",
      reason: "insufficient_complete_12_month_window",
    });
  });

  it("handles missing 2025 base values in fixture root by returning invalid status", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cti-test-"));
    try {
      // Create minimal cti-adjusted and official-cti-2025-long-term dirs with 2025-01 missing in 000040499028
      fs.mkdirSync(path.join(tmpDir, "cti-adjusted"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "official-cti-2025-long-term"), { recursive: true });

      fs.writeFileSync(
        path.join(tmpDir, "cti-adjusted", "B.json"),
        JSON.stringify({ rows: [{ year: 2025, values: { 総合: 100 } }] }),
      );

      // Write csv for 000040499028 missing 2025-01
      const csvLines = ["series_index,series_name,month,raw_value,is_missing"];
      for (let m = 2; m <= 12; m++) {
        csvLines.push(`1,消費支出（名目）,2025-${String(m).padStart(2, "0")},100,false`);
      }
      fs.writeFileSync(
        path.join(tmpDir, "official-cti-2025-long-term", "000040499028.normalized.csv"),
        csvLines.join("\n"),
      );
      fs.writeFileSync(
        path.join(tmpDir, "official-cti-2025-long-term", "000040499070.normalized.csv"),
        "series_index,series_name,month,raw_value,is_missing\n",
      );

      const res = computeConsumptionTotal12Ma(tmpDir);
      expect(res.status).toBe("invalid");
      expect(res.baseYearB).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
