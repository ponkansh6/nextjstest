import { expect, it, describe, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import Papa from "papaparse";
import { loadCpiData } from "../../server/lib/dataLoader";
import { CPI_CATEGORIES } from "../../src/lib/clientCalculations";
import type { CpiData } from "../../src/types";

const CPI_LONG_CSV_PATH = "data/source/cpi_data2025_long.csv";
const CPI_METADATA_PATH = "data/source/cpi_data2025_long.metadata.json";
const CPI_SERIES_MAP_PATH = "data/source/cpi-2025-series-map.csv";
const CPI_OFFICIAL_SERIES_SNAPSHOT_PATH = "data/source/cpi-2025-official-series.csv";

type CpiMetadata = {
  statsDataId: string;
  statInfId: string;
  apiEndpoint: string;
  apiRetrievalConditions: Record<string, unknown>;
  sourceFileUrl: string;
  artifactUpdatedAt: string;
  csvSha256: string;
  officialSeriesMapFile: string;
  officialSeriesMapSha256: string;
  officialSeriesSnapshotFile: string;
  officialSeriesSnapshotSha256: string;
  officialSeriesSnapshotSourceStatInfId: string;
  officialSeriesSnapshotSourceSha256: string;
  period: { start: string; end: string; monthlyRows: number };
  seriesCount: number;
};

const readMetadata = (): CpiMetadata =>
  JSON.parse(fs.readFileSync(CPI_METADATA_PATH, "utf8")) as CpiMetadata;

const parseJapaneseMonth = (value: string): number => {
  const match = value.match(/^(\d{4})年(\d{1,2})月$/);
  if (!match) throw new Error(`Invalid CPI month: ${value}`);
  return Number(match[1]) * 12 + Number(match[2]) - 1;
};

describe("CPI Data Integrity", () => {
  let cpiData: CpiData[];

  beforeAll(async () => {
    cpiData = await loadCpiData();
  });

  describe("Basic Integrity", () => {
    it("should have non-zero values for core CPI series", async () => {
      expect(cpiData.length).toBeGreaterThan(0);
      // Verify '総合' (General index) as the most critical series
      const nonZeroCount = cpiData.filter((d) => (d["総合"] as number) > 0).length;
      expect(nonZeroCount, "CPI '総合' series should have non-zero values").toBeGreaterThan(0);
    });
  });

  it("keeps the published 2025 major-category weights unchanged, including their 10002 rounding total", () => {
    const rows = Papa.parse<string[]>(fs.readFileSync("data/source/contribution2025.csv", "utf8"), {
      skipEmptyLines: false,
    }).data;
    const categories = rows.find((row) => row[0] === "類・品目");
    const weights = rows.find((row) => row[0]?.startsWith("ウエイト"));
    expect(categories).toBeDefined();
    expect(weights).toBeDefined();

    const values = Object.fromEntries(
      categories!.map((category, index) => [category, weights![index]]),
    );
    const majorCategories = [
      "食料",
      "住居",
      "光熱・水道",
      "家具・家事用品",
      "被服及び履物",
      "保健医療",
      "交通・通信",
      "教育",
      "教養娯楽",
      "諸雑費",
    ];
    expect(majorCategories.reduce((sum, key) => sum + Number(values[key]), 0)).toBe(10002);
    expect(Number(values.総合)).toBe(10000);
  });

  describe("2025 long-series provenance and quality", () => {
    it("records distinct API and file-distribution identifiers with retrieval provenance", () => {
      const metadata = readMetadata();

      expect(metadata.statsDataId).toBe("0004052037");
      expect(metadata.statInfId).toBe("000040482945");
      expect(metadata.statsDataId).not.toBe(metadata.statInfId);
      expect(metadata.apiEndpoint).toBe("https://api.e-stat.go.jp/rest/3.0/app/getSimpleStatsData");
      expect(metadata.apiRetrievalConditions).toMatchObject({
        statsDataId: metadata.statsDataId,
        format: "CSV",
        cdArea: "00000",
        cdTab: "1",
        startTime: "197001",
        endTime: "202607",
      });
      expect(metadata.sourceFileUrl).toContain(`statInfId=${metadata.statInfId}`);
      expect(metadata.artifactUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("has continuous, unique monthly rows and all 78 published series", () => {
      const metadata = readMetadata();
      const parsed = Papa.parse<Record<string, string>>(
        fs.readFileSync(CPI_LONG_CSV_PATH, "utf8"),
        { header: true, skipEmptyLines: true },
      );
      const rows = parsed.data;
      const months = rows.map((row) => row.年月);

      expect(rows).toHaveLength(metadata.period.monthlyRows);
      expect(parsed.meta.fields).toHaveLength(metadata.seriesCount + 1);
      expect(new Set(months).size).toBe(months.length);
      expect(months[0]).toBe(metadata.period.start);
      expect(months.at(-1)).toBe(metadata.period.end);

      for (let index = 1; index < months.length; index += 1) {
        expect(parseJapaneseMonth(months[index])).toBe(parseJapaneseMonth(months[index - 1]) + 1);
      }
    });

    it("keeps the 2025 monthly general-index average approximately 100", () => {
      const rows = Papa.parse<Record<string, string>>(fs.readFileSync(CPI_LONG_CSV_PATH, "utf8"), {
        header: true,
        skipEmptyLines: true,
      }).data;
      const values = rows
        .filter((row) => row.年月.startsWith("2025年"))
        .map((row) => Number(row.総合));
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;

      expect(values).toHaveLength(12);
      // Published monthly values are rounded; the recorded average is 100.0083.
      expect(average).toBeGreaterThanOrEqual(99.9);
      expect(average).toBeLessThanOrEqual(100.1);
    });

    it("matches the recorded CSV SHA-256", () => {
      const metadata = readMetadata();
      const actual = createHash("sha256").update(fs.readFileSync(CPI_LONG_CSV_PATH)).digest("hex");

      expect(actual).toBe(metadata.csvSha256);
    });

    const seriesMap = Papa.parse<Record<string, string>>(
      fs.readFileSync(CPI_SERIES_MAP_PATH, "utf8"),
      { header: true, skipEmptyLines: true },
    ).data;
    it("validates the complete, verified 78-series mapping against the official offline snapshot and converted CSV", () => {
      const metadata = readMetadata();
      const officialSnapshot = Papa.parse<Record<string, string>>(
        fs.readFileSync(CPI_OFFICIAL_SERIES_SNAPSHOT_PATH, "utf8"),
        { header: true, skipEmptyLines: true },
      ).data;
      const parsed = Papa.parse<Record<string, string>>(
        fs.readFileSync(CPI_LONG_CSV_PATH, "utf8"),
        { header: true, skipEmptyLines: true },
      );
      const officialCodes = seriesMap.map((row) => row.official_code?.trim());
      const existingKeys = seriesMap.map((row) => row.existing_key?.trim());
      const convertedKeys = (parsed.meta.fields ?? []).filter((field) => field !== "年月");

      expect(seriesMap).toHaveLength(78);
      // This checked-in map is the minimal offline snapshot of the 78 code/name
      // rows extracted from statInfId=000040482945; the raw 2MB source is not
      // duplicated in the repository. Its hash pins the reviewed snapshot.
      expect(metadata.officialSeriesMapFile).toBe("cpi-2025-series-map.csv");
      expect(createHash("sha256").update(fs.readFileSync(CPI_SERIES_MAP_PATH)).digest("hex")).toBe(
        metadata.officialSeriesMapSha256,
      );
      expect(metadata.officialSeriesSnapshotFile).toBe("cpi-2025-official-series.csv");
      expect(metadata.officialSeriesSnapshotSourceStatInfId).toBe("000040482945");
      expect(metadata.officialSeriesSnapshotSourceSha256).toBe(
        "2e6335c191b459f3446e7f93cf38f4df9814c90371c794aac9d58efa337ee51b",
      );
      expect(
        createHash("sha256")
          .update(fs.readFileSync(CPI_OFFICIAL_SERIES_SNAPSHOT_PATH))
          .digest("hex"),
      ).toBe(metadata.officialSeriesSnapshotSha256);
      expect(officialSnapshot).toHaveLength(78);
      expect(new Set(officialSnapshot.map((row) => row.code)).size).toBe(78);
      expect(new Set(officialSnapshot.map((row) => `${row.code}\u0000${row.name}`))).toEqual(
        new Set(seriesMap.map((row) => `${row.official_code}\u0000${row.display_name}`)),
      );
      expect(officialCodes.every(Boolean)).toBe(true);
      expect(new Set(officialCodes).size).toBe(78);
      expect(seriesMap.every((row) => row.classification?.trim() !== "unverified")).toBe(true);
      expect(seriesMap.every((row) => Boolean(row.source?.trim()))).toBe(true);
      expect(seriesMap.every((row) => Boolean(row.start_month?.trim()))).toBe(true);
      expect(seriesMap.every((row) => Boolean(row.missing_policy?.trim()))).toBe(true);
      expect(new Set(existingKeys).size).toBe(78);
      expect(convertedKeys).toHaveLength(78);
      expect(new Set(convertedKeys).size).toBe(78);
      expect(new Set(existingKeys)).toEqual(new Set(convertedKeys));
      expect(seriesMap.every((row) => row.display_name?.trim() === row.existing_key?.trim())).toBe(
        true,
      );
    });
  });

  describe("Validation", () => {
    it("should verify monthly stacked totals of CPI categories (2025 onwards) are within 50-150", async () => {
      const targetData = cpiData.filter((d) => {
        if (!d.年月 || typeof d.年月 !== "string") return false;
        const m = d.年月.match(/^(\d{4})年/);
        return m ? parseInt(m[1], 10) >= 2005 : false;
      });

      expect(targetData.length).toBeGreaterThan(0);

      targetData.forEach((d) => {
        let sum = 0;
        CPI_CATEGORIES.forEach((key) => {
          sum += Number(d[key as keyof CpiData] || 0);
        });

        expect(sum, `Sum of CPI categories at ${d.年月} should be 50-150`).toBeGreaterThanOrEqual(
          50,
        );
        expect(sum, `Sum of CPI categories at ${d.年月} should be 50-150`).toBeLessThanOrEqual(150);
      });
    });

    it("should have non-zero values for every individual CPI category (each stacked-area key must exist in the loaded data)", async () => {
      const targetData = cpiData.filter((d) => {
        if (!d.年月 || typeof d.年月 !== "string") return false;
        const m = d.年月.match(/^(\d{4})年/);
        return m ? parseInt(m[1], 10) >= 2005 : false;
      });

      expect(targetData.length).toBeGreaterThan(0);

      CPI_CATEGORIES.forEach((key) => {
        const nonZeroCount = targetData.filter(
          (d) => Number(d[key as keyof CpiData] || 0) !== 0,
        ).length;
        expect(
          nonZeroCount,
          `CPI category "${key}" has no non-zero values in the loaded data — the key likely does not match the field name produced by the data loader, so its stacked-area layer renders as an empty (invisible) series.`,
        ).toBeGreaterThan(0);
      });
    });
  });
});
