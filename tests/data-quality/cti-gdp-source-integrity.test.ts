import { createHash } from "node:crypto";
import * as fs from "node:fs";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { buildCtiFilePaths } from "../../server/lib/dataIo";
import { getGdpSupportStatus, loadCtiDataInternal } from "../../server/lib/data-loader/cpi";

type CtiMetadata = {
  statInfId: string;
  tableTitle: string;
  csvSha256: string;
  period: { start: string; end: string; monthlyRows: number };
};
type GdpMetadata = {
  status: string;
  seriesCode: string;
  seriesName: string;
  csvSha256: string;
  sourceFrequency: string;
  rawValuePreserved: boolean;
  period: { start: string; end: string; annualRows: number };
};

const paths = buildCtiFilePaths();
const sha256 = (content: string) => createHash("sha256").update(content).digest("hex");

function expectContinuousYears(years: string[]) {
  expect(years).toHaveLength(32);
  years.forEach((year, index) => {
    expect(year).toMatch(/^\d{4}$/);
    if (index > 0) expect(Number(year)).toBe(Number(years[index - 1]) + 1);
  });
}

describe("Plan 20 source artifacts", () => {
  it("validates the CTI 2025 map and official snapshot row by row", () => {
    const map = Papa.parse<Record<string, string>>(fs.readFileSync(paths.seriesMap, "utf8"), {
      header: true,
      skipEmptyLines: true,
    }).data;
    const official = Papa.parse<Record<string, string>>(
      fs.readFileSync(paths.officialSnapshot, "utf8"),
      { header: true, skipEmptyLines: true },
    ).data;
    expect(Object.keys(map[0])).toEqual([
      "official_code",
      "official_name",
      "source_stat_inf_id",
      "source_variant",
      "dashboard_key",
      "value_type",
      "transform",
      "coverage_start",
      "missing_policy",
      "evidence",
    ]);
    expect(Object.keys(official[0])).toEqual([
      "official_code",
      "official_name",
      "table_code",
      "series_code",
      "representative_month",
      "representative_value",
    ]);
    expect(map).toHaveLength(22);
    expect(official).toHaveLength(22);
    for (const rows of [map, official]) {
      expect(new Set(rows.map((row) => row.official_code)).size).toBe(rows.length);
      for (const row of rows) {
        expect(Object.values(row).every((value) => value.trim() !== "")).toBe(true);
        expect(Object.values(row).every((value) => !/未検証|unverified/i.test(value))).toBe(true);
      }
    }
    const mapByCode = new Map(map.map((row) => [row.official_code, row]));
    for (const row of official) {
      const mapped = mapByCode.get(row.official_code);
      expect(mapped).toBeDefined();
      expect(mapped?.official_name).toBe(row.official_name);
      expect(Number(row.representative_value)).toBeGreaterThanOrEqual(0);
    }
    const cti = Papa.parse<Record<string, string>>(fs.readFileSync(paths.candidateMain, "utf8"), {
      header: true,
      skipEmptyLines: true,
    }).data.find((row) => row.月 === "2025年1月");
    expect(cti).toBeDefined();
    for (const row of official) {
      const mapped = mapByCode.get(row.official_code)!;
      expect(cti?.[mapped.dashboard_key]).toBe(row.representative_value);
    }
  });

  it("validates the present CTI 2025 candidate identity, hash, period, and monthly continuity", () => {
    const content = fs.readFileSync(paths.candidateMain, "utf8");
    const metadata = JSON.parse(fs.readFileSync(paths.metadata, "utf8")) as CtiMetadata;
    const rows = Papa.parse<string[]>(content, { header: false, skipEmptyLines: true }).data;
    const months = rows.slice(1).map((row) => row[rows[0].indexOf("月")]);

    expect(metadata.statInfId).toBe("000040499069");
    expect(metadata.tableTitle).toBe("10大費目別 世帯消費動向指数（原数値） 総世帯");
    expect(sha256(content)).toBe(metadata.csvSha256);
    expect(months).toHaveLength(metadata.period.monthlyRows);
    expect(months[0]).toBe(metadata.period.start);
    expect(months.at(-1)).toBe(metadata.period.end);
  });

  it("validates the annual GDP pair, 2025 values, and independent ready normalization", async () => {
    const read = (csvPath: string, metadataPath: string) => {
      const content = fs.readFileSync(csvPath, "utf8");
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as GdpMetadata;
      const rows = Papa.parse<string[]>(content, { header: false, skipEmptyLines: true }).data;
      return {
        content,
        metadata,
        rows,
        years: rows.slice(1).map((row) => row[rows[0].indexOf("時間軸（暦年）")]),
      };
    };
    const nominal = read(paths.candidateSupportNominal, paths.supportNominalMetadata);
    const real = read(paths.candidateSupportReal, paths.supportRealMetadata);
    const normalization = JSON.parse(fs.readFileSync(paths.gdpDisplayNormalization, "utf8")) as {
      status: string;
      nominal: { value2025: number; factor: number };
      real: { value2025: number; factor: number };
      validation: { allSeriesReady: boolean };
    };

    for (const source of [nominal, real]) {
      expect(source.metadata).toMatchObject({
        status: "ready",
        seriesCode: "12",
        seriesName: "民間最終消費支出",
        sourceFrequency: "annual",
        rawValuePreserved: true,
      });
      expect(sha256(source.content)).toBe(source.metadata.csvSha256);
      expect(source.years[0]).toBe(source.metadata.period.start);
      expect(source.years.at(-1)).toBe(source.metadata.period.end);
      expectContinuousYears(source.years);
    }
    expect(normalization).toMatchObject({
      status: "ready",
      nominal: { value2025: 350910.7 },
      real: { value2025: 308122.2 },
      validation: { allSeriesReady: true },
    });
    expect(normalization.nominal.factor).toBe(100 / 350910.7);
    expect(normalization.real.factor).toBe(100 / 308122.2);
    await expect(getGdpSupportStatus()).resolves.toMatchObject({ valid: true });
  });

  it("aliases 2025 GDP comparison indexes to the existing display keys across regular and long-term rows", async () => {
    const rows = await loadCtiDataInternal();
    const regular = rows.find((row) => row.年月 === "2025年1月");
    const longTerm = rows.find((row) => row.年月 === "2016年1月");
    expect(regular).toBeDefined();
    expect(longTerm).toBeDefined();
    const supportRows = Papa.parse<string[]>(
      fs.readFileSync(paths.candidateSupportNominal, "utf8"),
      {
        skipEmptyLines: true,
      },
    ).data;
    const supportHeaderIndex = supportRows.findIndex((row) => row.includes("時間軸（暦年）"));
    const supportHeader = supportRows[supportHeaderIndex];
    const supportRow = supportRows.find(
      (row) => row[supportHeader.indexOf("時間軸（暦年）")] === "2016",
    );
    const normalization = JSON.parse(fs.readFileSync(paths.gdpDisplayNormalization, "utf8")) as {
      nominal: { factor: number };
      real: { factor: number };
    };
    const raw = Number(supportRow?.[supportHeader.indexOf("民間最終消費支出")]?.replace(/,/g, ""));
    expect(Number.isFinite(raw)).toBe(true);
    expect(raw).toBeGreaterThan(0);
    for (const row of [regular!, longTerm!]) {
      const nominalRaw = row["民間最終消費支出（名目・原値）" as keyof typeof row];
      const nominalComparison = row["民間最終消費支出（名目・比較指数）" as keyof typeof row];
      expect(Number.isFinite(nominalRaw)).toBe(true);
      expect(nominalRaw).toBeGreaterThan(0);
      expect(nominalComparison).toBeCloseTo(Number(nominalRaw) * normalization.nominal.factor, 10);
      const realRaw = row["民間最終消費支出（実質・原値）" as keyof typeof row];
      const realComparison = row["民間最終消費支出（実質・比較指数）" as keyof typeof row];
      expect(Number.isFinite(realRaw)).toBe(true);
      expect(realRaw).toBeGreaterThan(0);
      expect(realComparison).toBeCloseTo(Number(realRaw) * normalization.real.factor, 10);
      expect(row["民間最終消費支出（名目）" as keyof typeof row]).toBe(
        row["民間最終消費支出（名目・比較指数）" as keyof typeof row],
      );
      expect(row["民間最終消費支出（実質）" as keyof typeof row]).toBe(
        row["民間最終消費支出（実質・比較指数）" as keyof typeof row],
      );
    }
  });
});
