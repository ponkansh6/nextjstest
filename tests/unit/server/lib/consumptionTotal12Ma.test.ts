import { describe, it, expect } from "vitest";
import {
  computeConsumptionTotal12Ma,
  summarizeConsumptionTotal12MaStatus,
} from "../../../../server/lib/consumptionTotal12Ma";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadCtiAdjustedV2Estimate } from "../../../../server/lib/data-loader/ctiAdjusted";
import { parseOfficialFile, SERIES } from "../../../../scripts/fetch-cti-basic-series-2025.mjs";
import XLSX from "xlsx";

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

  it("uses the quarterly V2 anchors and keeps 2004 private for the first 2005-01 MA12", () => {
    const result = computeConsumptionTotal12Ma();
    const quarterly = loadCtiAdjustedV2Estimate({
      artifactRoot: path.resolve("data/source/cti-adjusted"),
      contract: "plan39",
      validatePlan40Inputs: true,
    });
    const shareRows = fs
      .readFileSync("data/source/cti-size-composition/lfs-iv4-2004-pi2plus.csv", "utf8")
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.split(","));
    const numerator = Number(
      shareRows.find((row) => row[1] === "IV-4" && row[2] === "二人以上の一般世帯")?.[3],
    );
    const denominator = Number(
      shareRows.find((row) => row[1] === "IV-4" && row[2] === "総世帯")?.[3],
    );
    const pi2Plus2004 = numerator / denominator;
    expect([numerator, denominator]).toEqual([3459, 4915]);
    expect(pi2Plus2004).toBeCloseTo(3459 / 4915, 15);
    const privatePrehistory = loadCtiAdjustedV2Estimate({
      artifactRoot: path.resolve("data/source/cti-adjusted"),
      contract: "plan39",
      validatePlan40Inputs: true,
      prehistoryComposition: { year: 2004, pi2Plus: pi2Plus2004 },
    });
    const historicalRows = new Map(
      quarterly.rows
        .filter((row) => row.year >= 2005 && row.year <= 2016)
        .map((row) => [row.year, row]),
    );
    const rawCsv = fs.readFileSync(
      "data/source/official-cti-2025-long-term/000040499070.normalized.csv",
      "utf8",
    );
    const rawRows = rawCsv
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.split(","))
      .filter((row) => row[0] === "nominal" && row[1] === "1" && row[6] === "false");
    for (let year = 2005; year <= 2016; year += 1) {
      const annualRow = historicalRows.get(year);
      expect(annualRow?.status).toBe("available");
      const values = rawRows
        .filter((row) => row[4]?.startsWith(`${year}-`))
        .map((row) => Number(row[5]));
      expect(values).toHaveLength(12);
      const meanRaw = values.reduce((sum, value) => sum + value, 0) / 12;
      for (let month = 1; month <= 12; month += 1) {
        const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
        const point = result.points.find((item) => item.yearMonth === yearMonth);
        const raw = values[month - 1];
        expect(point?.rawLevel).toBeCloseTo((annualRow!.values.総合! * raw) / meanRaw, 10);
      }
    }

    const firstPoint = result.points[0];
    expect(firstPoint.yearMonth).toBe("2005-01");
    expect(result.points.some((point) => point.year === 2004)).toBe(false);
    expect(firstPoint.ma12).toEqual(expect.any(Number));
    expect(firstPoint.ma12Provenance).toMatchObject({
      windowStart: "2004-02",
      windowEnd: "2005-01",
    });
    const private2004 = fs
      .readFileSync(
        "data/source/official-cti-2025-long-term/000040499070.2004-prehistory.csv",
        "utf8",
      )
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.split(","))
      .map((row) => Number(row[4]));
    const anchor2004 = privatePrehistory.prehistoryAnchors?.[2004];
    expect(anchor2004).toEqual(expect.any(Number));
    const mean2004Raw = private2004.reduce((sum, value) => sum + value, 0) / 12;
    const private2004FebruaryToDecember = private2004
      .slice(1)
      .map((value) => (anchor2004! * value) / mean2004Raw);
    const january2005 = result.points.find((point) => point.yearMonth === "2005-01")!.rawLevel!;
    const expectedMa12 =
      (100 * (private2004FebruaryToDecember.reduce((sum, value) => sum + value, 0) + january2005)) /
      (12 * result.baseYearB!);
    expect(firstPoint.ma12).toBeCloseTo(expectedMa12, 10);
  });

  it("matches every 2004 private month to the official source workbook series", () => {
    const source = fs.readFileSync("data/source/official-cti-2025-long-term/000040499070.raw");
    const rawWorkbook = XLSX.read(source, { type: "buffer", raw: true, cellDates: false });
    const rawRows = XLSX.utils.sheet_to_json(rawWorkbook.Sheets[SERIES[0].sheet], {
      header: 1,
      raw: true,
      defval: "",
    }) as unknown[][];
    const rawWorkbook2004 = rawRows.slice(SERIES[0].dataRow - 1).flatMap((row) => {
      const monthCell = String(row[SERIES[0].monthColumn] ?? "").trim();
      const match = monthCell.match(/^(\d{4})年(\d{1,2})月$/);
      if (!match || match[1] !== "2004") return [];
      return [
        [`${match[1]}-${String(Number(match[2])).padStart(2, "0")}`, row[SERIES[0].valueStart]],
      ];
    });
    const official = parseOfficialFile(source, SERIES[0])
      .records.filter((record) => record.seriesIndex === 1 && record.month.startsWith("2004-"))
      .sort((left, right) => left.month.localeCompare(right.month));
    const privateRows = fs
      .readFileSync(
        "data/source/official-cti-2025-long-term/000040499070.2004-prehistory.csv",
        "utf8",
      )
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.split(","));
    expect(official).toHaveLength(12);
    expect(rawWorkbook2004).toHaveLength(12);
    expect(privateRows).toHaveLength(12);
    expect(privateRows.map((row) => [row[3], Number(row[4])])).toEqual(rawWorkbook2004);
    expect(official.map((record) => record.rawValue)).toEqual(
      rawWorkbook2004.map(([, value]) => Math.round(Number(value) * 10) / 10),
    );
  });

  it("keeps 2005-2016 anchors when the IV-4 prehistory share CSV is missing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cti-prehistory-test-"));
    try {
      const fixtureRoot = path.join(tmpDir, "data", "source");
      fs.mkdirSync(fixtureRoot, { recursive: true });
      for (const directory of [
        "cti-adjusted",
        "official-cti-2025-long-term",
        "cti-size-composition",
      ]) {
        fs.cpSync(path.resolve("data/source", directory), path.join(fixtureRoot, directory), {
          recursive: true,
        });
      }
      fs.rmSync(path.join(fixtureRoot, "cti-size-composition", "lfs-iv4-2004-pi2plus.csv"));

      const result = computeConsumptionTotal12Ma(fixtureRoot);
      const firstPoint = result.points.find((point) => point.yearMonth === "2005-01");
      const laterHistoricalPoint = result.points.find((point) => point.yearMonth === "2014-01");
      expect(firstPoint?.rawLevel).toEqual(expect.any(Number));
      expect(firstPoint?.ma12).toBeNull();
      expect(laterHistoricalPoint?.ma12).toEqual(expect.any(Number));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
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
