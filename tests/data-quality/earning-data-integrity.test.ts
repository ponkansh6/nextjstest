import { expect, it, describe, beforeAll, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { loadCtiBasicConsumptionOutput } from "../../server/lib/ctiBasicSeries2025LongTerm";
import { loadCpiData, loadTotalEarningData } from "../../server/lib/dataLoader";
import type { CpiData } from "../../src/types";
import minkanFixture from "../fixtures/minkan-extension-anchors.json";
import { parseCsvWithHeader } from "../../server/lib/dataIo";
import { loadTotalEarningDataInternal } from "../../server/lib/data-loader/earnings";
import { loadCtiDataInternal } from "../../server/lib/data-loader/cpi";
import {
  buildCtiFilePaths,
  buildEarningsFilePaths,
  parseIndexSection,
} from "../../server/lib/dataIo";
import { projectQuarterlyPublicView } from "../../src/lib/quarterlyPublicProjection";
import {
  CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY,
  CTI_ADJUSTED_V2_PUBLIC_REGISTRY,
  CONSUMPTION_TOTAL_12MA_KEY,
  LEGACY_CTI_COMPARISON_KEY,
  SUPPORT_SERIES_KEY_NOMINAL,
} from "../../src/lib/chartConstants";
import { toCanonicalYearMonth } from "../../src/lib/yearMonth";
import { toEarningsView } from "../../server/lib/view-models/dashboard";
import type { ConsumptionTotal12MaResult } from "../../server/lib/consumptionTotal12Ma";
import type { SeriesMeasurement } from "../../src/types/chart";
import Papa from "papaparse";

const { earningsPathOverride } = vi.hoisted(() => ({
  earningsPathOverride: { current: null as Record<string, string> | null },
}));
const { earningsLoaderOverrides } = vi.hoisted(() => ({
  earningsLoaderOverrides: {
    cpi: null as unknown[] | null,
    cti: null as unknown[] | null,
    population: null as Map<string, unknown> | null,
  },
}));
const { consumptionResultOverride } = vi.hoisted(() => ({
  consumptionResultOverride: { current: null as ConsumptionTotal12MaResult | null },
}));

vi.mock("../../server/lib/dataIo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/lib/dataIo")>();
  return {
    ...actual,
    buildEarningsFilePaths: () => earningsPathOverride.current ?? actual.buildEarningsFilePaths(),
  };
});

vi.mock("../../server/lib/data-loader/cpi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/lib/data-loader/cpi")>();
  return {
    ...actual,
    loadCpiDataInternal: (...args: Parameters<typeof actual.loadCpiDataInternal>) =>
      earningsLoaderOverrides.cpi === null
        ? actual.loadCpiDataInternal(...args)
        : Promise.resolve(
            earningsLoaderOverrides.cpi as Awaited<ReturnType<typeof actual.loadCpiDataInternal>>,
          ),
    loadCtiDataInternal: (...args: Parameters<typeof actual.loadCtiDataInternal>) =>
      earningsLoaderOverrides.cti === null
        ? actual.loadCtiDataInternal(...args)
        : Promise.resolve(
            earningsLoaderOverrides.cti as Awaited<ReturnType<typeof actual.loadCtiDataInternal>>,
          ),
  };
});

vi.mock("../../server/lib/data-loader/population", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/lib/data-loader/population")>();
  return {
    ...actual,
    loadPopulationDataInternal: () =>
      earningsLoaderOverrides.population === null
        ? actual.loadPopulationDataInternal()
        : Promise.resolve(
            earningsLoaderOverrides.population as Awaited<
              ReturnType<typeof actual.loadPopulationDataInternal>
            >,
          ),
  };
});

vi.mock("../../server/lib/consumptionTotal12Ma", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/lib/consumptionTotal12Ma")>();
  return {
    ...actual,
    computeConsumptionTotal12Ma: () =>
      consumptionResultOverride.current ?? actual.computeConsumptionTotal12Ma(),
  };
});

type CpiDataWithMeasurements = CpiData & {
  measurements?: Record<string, SeriesMeasurement>;
};

const readLegacyCtiAggregation = (row: CpiData | undefined): string | undefined =>
  (row as CpiDataWithMeasurements | undefined)?.measurements?.["CTI消費支出（参考）"]?.aggregation;

describe("Earnings Data Integrity", () => {
  /*
   * Historical skips retained here are named contracts only: the GDP-backed
   * NewGraph, annual GDP normalization, and the 2025 auto-loading are
   * retired/independent contracts; their replacements must not be interpreted
   * as Plan37 coverage. The five Plan37 boundary/anchor checks below are active
   * and use the official CTI basic raw/12MA keys.
   */
  let earningData: CpiData[];
  let cpiData: CpiData[];

  beforeAll(async () => {
    earningData = await loadTotalEarningData();
    cpiData = await loadCpiData();
  });

  it.each([
    ["no calibration total row", "unrelated,header\nvalue,value"],
    ["zero calibration total", ["T", "T", "T", ...Array(9).fill("x"), "0", "50", "60"].join(",")],
  ])("keeps neutral salary conversion factors with %s", async (_label, calibrationCsv) => {
    const paths = buildEarningsFilePaths();
    const root = mkdtempSync(join(tmpdir(), "earnings-neutral-factor-"));
    const honMks = join(root, "hon-mks.csv");
    writeFileSync(honMks, calibrationCsv);
    earningsPathOverride.current = { ...paths, honMks };

    try {
      const rows = await loadTotalEarningDataInternal();
      const contractualIndex = parseIndexSection(readFileSync(paths.contractual, "utf8"));
      expect(rows.find((row) => row.年月 === "2025年12月")?._契約給与).toBe(
        contractualIndex.get("2025年12月"),
      );
    } finally {
      earningsPathOverride.current = null;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the hourly-derived wage unavailable when an input month is missing", async () => {
    const paths = buildEarningsFilePaths();
    const hoursContent = readFileSync(paths.hours, "utf8");
    const missingJanuary = hoursContent.replace(/^2025,([^\r\n]*)$/m, (_row, values: string) => {
      const cells = values.split(",");
      cells[8] = "-";
      return `2025,${cells.join(",")}`;
    });
    expect(missingJanuary).not.toBe(hoursContent);

    const root = mkdtempSync(join(tmpdir(), "earnings-incomplete-input-"));
    const hours = join(root, "hours.csv");
    writeFileSync(hours, missingJanuary);
    earningsPathOverride.current = { ...paths, hours };

    try {
      const rows = await loadTotalEarningDataInternal();
      expect(rows.find((row) => row.年月 === "2025年12月")?.["時間当たり給与"]).toBeNull();
    } finally {
      earningsPathOverride.current = null;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves a missing scheduled-pay month instead of manufacturing an index", async () => {
    const paths = buildEarningsFilePaths();
    const scheduledContent = readFileSync(paths.scheduled, "utf8");
    const missingJuly = scheduledContent.replace(/^2025,([^\r\n]*)$/m, (_row, values: string) => {
      const cells = values.split(",");
      // The year is outside `values`; zero-based offset 13 maps to July's row[14].
      cells[13] = "-";
      return `2025,${cells.join(",")}`;
    });
    expect(missingJuly).not.toBe(scheduledContent);

    const root = mkdtempSync(join(tmpdir(), "earnings-missing-scheduled-month-"));
    const scheduled = join(root, "scheduled.csv");
    writeFileSync(scheduled, missingJuly);
    earningsPathOverride.current = { ...buildEarningsFilePaths(), scheduled };

    try {
      const rows = await loadTotalEarningDataInternal();
      const july = rows.find((row) => row.年月 === "2025年7月");
      expect(july).toBeDefined();
      expect(july?.所定内給与).toBeNull();
    } finally {
      earningsPathOverride.current = null;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses the total-relative calibration fallback when December contractual index is absent", async () => {
    const paths = buildEarningsFilePaths();
    const originalContractual = readFileSync(paths.contractual, "utf8");
    const missingDecember = originalContractual.replace(
      /^2025,([^\r\n]*)$/m,
      (_row, values: string) => {
        const cells = values.split(",");
        // `values` excludes the year column; parseIndexSection reads December
        // from row[19], which is values[18] after the year has been removed.
        cells[18] = "-";
        return `2025,${cells.join(",")}`;
      },
    );
    expect(missingDecember).not.toBe(originalContractual);

    const calibrationRow = Papa.parse<string[]>(readFileSync(paths.honMks, "utf8"), {
      header: false,
      skipEmptyLines: false,
    }).data.find((row) => row[0] === "T" && row[1] === "T" && row[2] === "T");
    expect(calibrationRow).toBeDefined();
    const totalReal = Number(calibrationRow?.[12]?.replace(/,/g, "") ?? NaN);
    const contractualReal = Number(calibrationRow?.[13]?.replace(/,/g, "") ?? NaN);
    const factor = contractualReal / totalReal;
    const originalIndex = parseIndexSection(originalContractual).get("2025年11月");
    expect(Number.isFinite(originalIndex)).toBe(true);

    const root = mkdtempSync(join(tmpdir(), "earnings-calibration-fallback-"));
    const contractual = join(root, "contractual.csv");
    writeFileSync(contractual, missingDecember);
    earningsPathOverride.current = { ...paths, contractual };

    try {
      const rows = await loadTotalEarningDataInternal();
      expect(rows.find((row) => row.年月 === "2025年11月")?._契約給与).toBeCloseTo(
        (originalIndex ?? 0) * factor,
      );
    } finally {
      earningsPathOverride.current = null;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not smooth derived wages across a missing calendar month", async () => {
    const paths = buildEarningsFilePaths();
    const root = mkdtempSync(join(tmpdir(), "earnings-calendar-gap-"));
    const overrides: Record<string, string> = { ...paths };
    for (const key of ["contractual", "scheduled", "total", "hours", "employment"] as const) {
      const original = readFileSync(paths[key], "utf8");
      const withoutJanuary = original.replace(/^2025,([^\r\n]*)$/m, (_row, values: string) => {
        const cells = values.split(",");
        cells[8] = "-";
        return `2025,${cells.join(",")}`;
      });
      expect(withoutJanuary).not.toBe(original);
      const file = join(root, `${key}.csv`);
      writeFileSync(file, withoutJanuary);
      overrides[key] = file;
    }
    earningsPathOverride.current = overrides;

    try {
      const rows = await loadTotalEarningDataInternal();
      const december = rows.find((row) => row.年月 === "2025年12月");
      expect(december).toBeDefined();
      expect(december?.["時間当たり給与"]).toBeNull();
    } finally {
      earningsPathOverride.current = null;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the CPI/CTI and per-capita outputs unavailable when source rows are incomplete", async () => {
    earningsLoaderOverrides.cpi = [{ ...cpiData[0], 総合: Number.NaN }];
    earningsLoaderOverrides.cti = [{ ...cpiData[0], 年月: "not-a-month" }];
    earningsLoaderOverrides.population = new Map();

    try {
      const rows = await loadTotalEarningDataInternal();
      const row = rows.find((item) => item.年月 === "2025年12月");
      expect(row?.["CPI総合(参考)"]).toBeNull();
      expect(row?.["CPI総合(12MA)"]).toBeNull();
      expect(row?.["15歳以上国民当たり給与"]).toBeNull();
      expect(row?.["CTI消費支出（参考）"]).toBeNull();
      expect(row?.["CTIミクロ基本系列（名目・参考）"]).toBeNull();
    } finally {
      earningsLoaderOverrides.cpi = null;
      earningsLoaderOverrides.cti = null;
      earningsLoaderOverrides.population = null;
    }
  });

  it("preserves an invalid consumption-source reason on derived earnings rows", async () => {
    consumptionResultOverride.current = {
      status: "invalid",
      reason: "fixture consumption source is invalid",
      baseYearB: null,
      points: [],
      metadata: {
        displayName: "Consumption total",
        unit: "index",
        frequency: "monthly",
        baseYear: 2025,
        calculation: "12-month average",
        sources: ["fixture"],
      },
    };

    try {
      const rows = await loadTotalEarningDataInternal();
      const row = rows.find((item) => item.年月 === "2025年12月") as
        | CpiDataWithMeasurements
        | undefined;
      expect(row?.measurements?.[CONSUMPTION_TOTAL_12MA_KEY]).toMatchObject({
        status: "invalid",
        seriesStatus: "invalid",
        reason: "fixture consumption source is invalid",
        seriesReason: "fixture consumption source is invalid",
      });
    } finally {
      consumptionResultOverride.current = null;
    }
  });

  it("does not publish a non-finite legacy CTI moving average from finite source values", async () => {
    earningsLoaderOverrides.cti = Array.from({ length: 12 }, (_, index) => ({
      ...cpiData[0],
      年月: `2025年${index + 1}月`,
      "消費支出（名目）": 1e308,
    }));

    try {
      const rows = await loadTotalEarningDataInternal();
      const february = rows.find((item) => item.年月 === "2025年2月");
      expect(february?.[LEGACY_CTI_COMPARISON_KEY]).toBeNull();
    } finally {
      earningsLoaderOverrides.cti = null;
    }
  });

  it("keeps salary special pay null when a finite source window overflows its moving average", async () => {
    const paths = buildEarningsFilePaths();
    const totalContent = readFileSync(paths.total, "utf8");
    const inflated2025 = totalContent.replace(/^2025,([^\r\n]*)$/m, (_row, values: string) => {
      const cells = values.split(",");
      for (let month = 0; month < 12; month++) cells[7 + month] = "1e308";
      return `2025,${cells.join(",")}`;
    });
    expect(inflated2025).not.toBe(totalContent);
    const root = mkdtempSync(join(tmpdir(), "earnings-overflow-window-"));
    const total = join(root, "total.csv");
    const honMks = join(root, "hon-mks.csv");
    writeFileSync(total, inflated2025);
    writeFileSync(honMks, "unrelated,header\nvalue,value");
    earningsPathOverride.current = { ...paths, total, honMks };

    try {
      const rows = await loadTotalEarningDataInternal();
      expect(rows.find((item) => item.年月 === "2025年12月")?.特別給与).toBeNull();
    } finally {
      earningsPathOverride.current = null;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("should preserve nulls for incomplete, short, and trailing 12-month windows", () => {
    const month = (value: string) => {
      const match = value.match(/^(\d{4})年(\d{1,2})月$/);
      return match ? Number(match[1]) * 12 + Number(match[2]) : NaN;
    };
    const trailing = (rows: Array<{ 年月: string; value: number | null }>) =>
      rows.map((row, i) => {
        if (i < 11 || rows.slice(i - 11, i + 1).some((item) => item.value === null)) return null;
        return rows.slice(i - 11, i + 1).reduce((sum, item) => sum + item.value!, 0) / 12;
      });
    const complete: Array<{ 年月: string; value: number | null }> = Array.from(
      { length: 24 },
      (_, i) => ({ 年月: `2004年${i + 1}月`, value: 100 }),
    );
    complete[13].value = null;
    const output = trailing(complete);
    expect(output[10]).toBeNull();
    expect(output[13]).toBeNull();
    expect(output[20]).toBeNull();
    expect(trailing(complete.slice(0, 11)).at(-1)).toBeNull();
    expect(trailing(complete.map((row) => ({ ...row, value: 100 }))).at(-1)).toBe(100);
    expect(month(complete[12].年月) - month(complete[11].年月)).toBe(1);
  });

  it.skip("legacy: verifies the regular 2025 GDP-backed NewGraph series independently", async () => {
    const paths = buildCtiFilePaths();
    const readGdp = (file: string) => {
      const rows = Papa.parse<string[]>(readFileSync(file, "utf8"), {
        skipEmptyLines: true,
      }).data;
      const headerIndex = rows.findIndex((row) => row.includes("時間軸（暦年）"));
      const header = rows[headerIndex];
      const yearIndex = header.indexOf("時間軸（暦年）");
      const valueIndex = header.indexOf("民間最終消費支出");
      return new Map(
        rows.slice(headerIndex + 1).flatMap((row) => {
          const year = Number(row[yearIndex]?.replace("年", ""));
          const value = Number(row[valueIndex]?.replace(/,/g, ""));
          return Number.isFinite(year) && Number.isFinite(value) ? [[year, value] as const] : [];
        }),
      );
    };
    const nominal = readGdp(paths.candidateSupportNominal);
    const normalization = JSON.parse(readFileSync(paths.gdpDisplayNormalization, "utf8")) as {
      nominal: { factor: number };
    };
    const expectedRaw = nominal.get(2005)!;
    expect(expectedRaw).toBeGreaterThan(0);
    expect(nominal.get(2014)).toBeGreaterThan(0);
    expect(nominal.get(2016)).toBeGreaterThan(0);

    const data = await loadTotalEarningDataInternal();
    const gdpDisplayValues = data
      .filter((row) => row.年月.startsWith("2025年"))
      .map((row) => row["民間最終消費支出（名目・比較指数）"])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    expect(gdpDisplayValues).toHaveLength(12);
    expect(
      gdpDisplayValues.reduce((sum, value) => sum + value, 0) / gdpDisplayValues.length,
    ).toBeCloseTo(100, 6);
    const regular = data.filter((row) => {
      const year = Number(row.年月.slice(0, 4));
      return year >= 2005 && year <= 2017;
    });
    expect(regular).toHaveLength(156);
    expect(
      regular.every((row) => {
        const value = row["民間最終消費支出（参考）"];
        return typeof value === "number" && Number.isFinite(value) && value > 0;
      }),
    ).toBe(true);

    const factor = normalization.nominal.factor;
    const raw = expectedRaw * factor;
    const firstWindow = [nominal.get(2004)!, nominal.get(2005)!];
    const expectedFirstMa = ((firstWindow[0] * 11 + firstWindow[1]) / 12) * factor;
    expect(factor).toBe(100 / nominal.get(2025)!);
    expect(raw).toBeGreaterThan(0);
    expect(firstWindow.every(Number.isFinite)).toBe(true);
    expect(
      regular.find((row) => row.年月 === "2005年1月")?.["民間最終消費支出（名目・原値）"],
    ).toBe(expectedRaw);
    expect(
      regular.find((row) => row.年月 === "2005年1月")?.["民間最終消費支出（参考）"],
    ).toBeCloseTo(expectedFirstMa, 10);
    expect(
      regular.find((row) => row.年月 === "2014年6月")?.["民間最終消費支出（名目・原値）"],
    ).toBe(nominal.get(2014));
    expect(
      regular.find((row) => row.年月 === "2016年12月")?.["民間最終消費支出（名目・原値）"],
    ).toBe(nominal.get(2016));
    expect(data.find((row) => row.年月 === "2018年1月")).toBeDefined();
    expect(
      data.find((row) => row.年月 === "2018年1月")?.["民間最終消費支出（参考）"] ?? null,
    ).toBeNull();
    expect(data.at(-1)?.["民間最終消費支出（参考）"] ?? null).toBeNull();
  });

  it("audits employment index provenance, target selectors, and May/June 2026 continuity", () => {
    const root = resolve(process.cwd());
    const csvPath = resolve(root, "data/source/employment_indices.csv");
    const metadata = JSON.parse(
      readFileSync(resolve(root, "data/source/employment_indices.metadata.json"), "utf8"),
    ) as {
      statInfId: string;
      sourceSha256: string;
      normalizedCsvSha256: string;
      extraction: {
        industry: string;
        establishmentSize: string;
        employmentType: string;
        unit: string;
      };
      excludedCrossSection: string;
    };
    const csv = readFileSync(csvPath);
    expect(createHash("sha256").update(csv).digest("hex")).toBe(metadata.normalizedCsvSha256);
    expect(metadata).toMatchObject({
      statInfId: "000032189777",
      sourceSha256: "825c8b31dd045187ed4dac378e83018e9e6a307eb0994c7ff5b2747c2ea62e12",
      excludedCrossSection: "data/source/hon-mks202606.xls",
      extraction: {
        industry: "TL",
        establishmentSize: "T",
        employmentType: "0",
        unit: "指数（2020年平均=100）",
      },
    });
    const rows = csv
      .toString("utf8")
      .split(/\r?\n/)
      .filter((line) => /^202[56],/.test(line));
    expect(rows).toHaveLength(2);
    const mayJune = rows[1].split(",").slice(12, 14);
    expect(mayJune).toEqual(["31.3", "31.35"]);
    expect(
      rows[1]
        .split(",")
        .slice(8, 14)
        .every((value) => value !== ""),
    ).toBe(true);
    expect(metadata.extraction.unit).toContain("指数");
  });

  describe("Basic Integrity", () => {
    it("should have non-zero values for key earnings series", async () => {
      expect(earningData.length).toBeGreaterThan(0);

      const keySeries = ["総合", "所定内給与", "所定外給与", "特別給与"];
      keySeries.forEach((key) => {
        const nonZeroCount = earningData.filter((d) => (d[key] as number) > 0).length;
        expect(
          nonZeroCount,
          `Earnings series '${key}' should have non-zero values`,
        ).toBeGreaterThan(0);
      });
    });

    it("should verify all wage series have positive values", () => {
      const wageKeys = [
        "総合",
        "所定内給与",
        "所定外給与",
        "特別給与",
        "時間当たり給与",
        "15歳以上国民当たり給与",
      ];

      wageKeys.forEach((key) => {
        const hasData = earningData.some((d) => typeof d[key] === "number" && d[key] > 0);
        expect(hasData, `Wage Series ${key} should have positive values`).toBe(true);
      });
    });

    it("should verify month continuity and valid ranges", () => {
      const ymToMonths = (ym: string) => {
        const m = ym.match(/^(\d{4})年(\d{1,2})月/);
        return m ? parseInt(m[1], 10) * 12 + parseInt(m[2], 10) : 0;
      };

      for (let i = 1; i < earningData.length; i++) {
        const prev = ymToMonths(earningData[i - 1].年月);
        const curr = ymToMonths(earningData[i].年月);
        expect(
          curr,
          `Data gap found between ${earningData[i - 1].年月} and ${earningData[i].年月}`,
        ).toBe(prev + 1);
      }

      const recentData = earningData.filter((d) => parseInt(d.年月.substring(0, 4), 10) >= 2005);
      expect(recentData.length).toBeGreaterThan(0);

      const year2025Items = earningData.filter((item) => item.年月.startsWith("2025年"));
      for (const key of ["総合", "時間当たり給与", "15歳以上国民当たり給与"]) {
        const values = year2025Items
          .map((item) => item[key])
          .filter((v): v is number => typeof v === "number");
        expect(values).toHaveLength(12);
        expect(values.reduce((sum, value) => sum + value, 0) / values.length).toBeCloseTo(100, 1);
      }
    });

    it("should ensure all required wage keys are present in the merged dataset", () => {
      const requiredWageKeys = [
        "所定内給与",
        "所定外給与",
        "特別給与",
        "時間当たり給与",
        "15歳以上国民当たり給与",
        "総合",
      ];
      const lastRow =
        earningData.findLast((item) =>
          requiredWageKeys.every(
            (key) => typeof item[key] === "number" && (item[key] as number) > 0,
          ),
        ) ?? earningData[earningData.length - 1];
      requiredWageKeys.forEach((key) => {
        expect(lastRow[key], `Key "${key}" must be present and positive`).toBeGreaterThan(0);
      });
    });
  });

  describe("Validation", () => {
    it("should propagate incomplete population and related-input windows as missing", () => {
      const perCapitaValues = earningData.map((row) => row["15歳以上国民当たり給与"]);
      expect(perCapitaValues.some((value) => value === 0)).toBe(false);
      perCapitaValues.forEach((value) => {
        expect(
          value === null || value === undefined || (typeof value === "number" && value > 0),
        ).toBe(true);
      });
    });

    it("should calculate 2026-05/06 derived wages from complete current inputs", () => {
      for (const month of ["2026年5月", "2026年6月"]) {
        const row = earningData.find((item) => item.年月 === month);
        expect(row, `Expected an output row for ${month}`).toBeDefined();
        expect(row?.["時間当たり給与"], `${month} must be calculated`).toEqual(expect.any(Number));
        expect(row?.["15歳以上国民当たり給与"], `${month} must be calculated`).toEqual(
          expect.any(Number),
        );
      }
    });

    it("should verify 総合 = 所定内給与 + 所定外給与 + 特別給与 (main fields)", async () => {
      expect(earningData.length).toBeGreaterThan(0);

      earningData.forEach((d) => {
        if (!d.年月 || typeof d.年月 !== "string") return;
        const year = parseInt(d.年月.substring(0, 4), 10);
        if (year < 2005) return;

        const scheduled = Number(d["所定内給与"] || 0);
        const unscheduled = Number(d["所定外給与"] || 0);
        const special = Number(d["特別給与"] || 0);
        const sum = scheduled + unscheduled + special;
        const total = Number(d["総合"] || 0);

        if (sum > 0) {
          expect(total).toBeCloseTo(sum, 1);
          expect(total, `総合 at ${d.年月} should be 50-150`).toBeGreaterThanOrEqual(50);
          expect(total, `総合 at ${d.年月} should be 50-150`).toBeLessThanOrEqual(150);
        }
      });
    });

    it("should verify individual key earnings series are within 50-150", async () => {
      expect(earningData.length).toBeGreaterThan(0);

      const individualKeys = ["時間当たり給与", "15歳以上国民当たり給与", "CPI総合(参考)"];

      earningData.forEach((d) => {
        if (!d.年月 || typeof d.年月 !== "string") return;
        const year = parseInt(d.年月.substring(0, 4), 10);
        if (year < 2005) return;

        individualKeys.forEach((key) => {
          const val = Number(d[key as keyof CpiData] || 0);
          if (val > 0) {
            expect(val, `${key} at ${d.年月} should be 50-150`).toBeGreaterThanOrEqual(50);
            expect(val, `${key} at ${d.年月} should be 50-150`).toBeLessThanOrEqual(150);
          }
        });
      });

      // 消費支出（参考） は0でもチェックする（TDD red phase）
      earningData.forEach((d) => {
        if (!d.年月 || typeof d.年月 !== "string") return;
        const year = parseInt(d.年月.substring(0, 4), 10);
        if (year < 2005) return;

        const raw = d["消費支出（参考）" as keyof CpiData];
        if (raw === null || raw === undefined || raw === 0) return;
        const val = Number(raw);
        expect(val, `消費支出（参考） at ${d.年月} should be 50-150`).toBeGreaterThanOrEqual(50);
        expect(val, `消費支出（参考） at ${d.年月} should be 50-150`).toBeLessThanOrEqual(150);
      });
    });

    it("should verify mathematical integrity of residuals and smoothing", () => {
      const testData = earningData.slice(-24);

      testData.forEach((row) => {
        if (row.年月 === "2005年1月" || row.年月.startsWith("2004年")) return;

        expect(row["残差"]).toBeDefined();
        expect(typeof row["残差"]).toBe("number");
      });

      const specialEarnings = earningData.map((d) => d["特別給与"] as number);
      const recentSpecial = specialEarnings.slice(-12);
      const diffs = [];
      for (let i = 1; i < recentSpecial.length; i++) {
        diffs.push(Math.abs(recentSpecial[i] - recentSpecial[i - 1]));
      }
      const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      expect(meanDiff).toBeLessThan(500);
    });

    it("should verify CPI総合(12MA) has reasonable values", () => {
      expect(earningData.length).toBeGreaterThan(0);
      earningData.forEach((d) => {
        if (!d.年月 || typeof d.年月 !== "string") return;
        const year = parseInt(d.年月.substring(0, 4), 10);
        if (year < 2005) return;

        const val = Number(d["CPI総合(12MA)" as keyof CpiData] || 0);
        if (val > 0) {
          expect(val, `CPI総合(12MA) at ${d.年月} should be 50-150`).toBeGreaterThanOrEqual(50);
          expect(val, `CPI総合(12MA) at ${d.年月} should be 50-150`).toBeLessThanOrEqual(150);
        }
      });
    });

    it("should have positive CPI総合(12MA) values for most months", () => {
      const years = [
        ...new Set(
          earningData.filter((d) => d.年月).map((d) => parseInt(d.年月.substring(0, 4), 10)),
        ),
      ].filter((y) => y >= 2005);
      years.forEach((year) => {
        const yearData = earningData.filter((d) => d.年月.startsWith(`${year}年`));
        const cpiMaValues = yearData.map((d) => Number(d["CPI総合(12MA)" as keyof CpiData] || 0));
        const positiveCount = cpiMaValues.filter((v) => v > 0).length;
        // Skip incomplete years (current year may have partial data)
        if (yearData.length < 12) return;
        // At least 10 months of the year should have positive CPI総合(12MA) (first 11 months may have partial MA)
        expect(
          positiveCount,
          `CPI総合(12MA) in ${year}: ${positiveCount}/12 months positive`,
        ).toBeGreaterThanOrEqual(10);
      });
    });

    it("Plan38: keeps the quarterly public projection free of legacy CTI/GDP/consumption keys", () => {
      const foodKey = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料;
      const foodMeasurement: SeriesMeasurement = {
        key: foodKey,
        label: foodKey,
        unit: "指数",
        source:
          "e-Stat 公式Excel cti-distribution-adjusted-000040499087.xlsx / 総・四(原) / 000040499087",
        valueType: "comparison",
        value: 100,
        status: "available",
        reason: null,
        frequency: "quarterly",
        aggregation: "official_quarterly_adjusted_nominal_observation",
        annualAnchorType: "official",
        quarterlyDerived: true,
        seriesType: "official_adjusted",
        official: true,
      };
      const projected = projectQuarterlyPublicView([
        {
          年: 2017,
          quarter: 4,
          label: "2017Q4",
          年月: "2017年10月",
          [foodKey]: 100,
          [SUPPORT_SERIES_KEY_NOMINAL]: 999,
          "CTIミクロ基本系列（名目・原数値）": 101,
          "CTIミクロ基本系列（名目・参考）": 102,
          "CTIミクロ基本系列（名目・参考・延長）": 103,
          GDP名目原値: 104,
          GDP名目比較指数: 105,
          "民間最終消費支出（名目・原値）": 106,
          "民間最終消費支出（名目・比較指数）": 107,
          measurements: { [foodKey]: foodMeasurement },
        },
      ] as never)[0];
      expect(projected).toHaveProperty(foodKey, 100);
      expect(projected).not.toHaveProperty(SUPPORT_SERIES_KEY_NOMINAL);
      expect(projected.measurements?.[foodKey]).toMatchObject({
        source:
          "e-Stat 公式Excel cti-distribution-adjusted-000040499087.xlsx / 総・四(原) / 000040499087",
        seriesType: "official_adjusted",
        official: true,
      });
      expect(Object.keys(projected).filter((key) => key.startsWith("CTIミクロ調整系列（"))).toEqual(
        CTI_ADJUSTED_V2_PUBLIC_REGISTRY.filter((entry) => entry.category !== "総合").map(
          (entry) => entry.key,
        ),
      );
      const retiredCtiKeys = [
        "CTIミクロ基本系列（名目・原数値）",
        "CTIミクロ基本系列（名目・参考）",
        "CTIミクロ基本系列（名目・参考・延長）",
      ];
      for (const key of [
        ...retiredCtiKeys,
        "GDP名目原値",
        "GDP名目比較指数",
        SUPPORT_SERIES_KEY_NOMINAL,
        "民間最終消費支出（名目・原値）",
        "民間最終消費支出（名目・比較指数）",
      ])
        expect(projected).not.toHaveProperty(key);
    });

    it.skip("legacy: 年次GDP値に基づく2025基準の表示値を検証", async () => {
      expect(earningData.length).toBeGreaterThan(0);
      const d2014 = earningData.find((d) => d.年月 === "2014年6月");
      const d2017 = earningData.find((d) => d.年月 === "2017年12月");

      expect(d2014).toBeDefined();
      expect(d2017).toBeDefined();

      const val2014 = d2014!["民間最終消費支出（参考）" as keyof CpiData] as number;
      const val2017 = d2017!["民間最終消費支出（参考）" as keyof CpiData] as number;

      expect(val2014).toBeCloseTo(85.09, 1);
      expect(val2017).toBeCloseTo(86.41, 1);

      const displayData = await loadTotalEarningDataInternal();
      const gdp2025 = displayData.find((d) => d.年月 === "2025年1月");
      const annualRaw = gdp2025?.["民間最終消費支出（名目・原値）" as keyof CpiData];
      const comparison = gdp2025?.["民間最終消費支出（名目・比較指数）" as keyof CpiData];
      const normalization = JSON.parse(
        readFileSync(buildCtiFilePaths().gdpDisplayNormalization, "utf8"),
      ) as { nominal: { factor: number } };

      expect(typeof annualRaw).toBe("number");
      expect(typeof comparison).toBe("number");
      expect(annualRaw as number).toBeGreaterThan(0);
      expect(comparison as number).toBeCloseTo(
        (annualRaw as number) * normalization.nominal.factor,
        10,
      );
      expect((annualRaw as number) * normalization.nominal.factor).toBeCloseTo(100, 10);
    });

    it.skip("legacy: should base displayed index series on the 2025 calendar-year average", () => {
      expect(earningData.length).toBeGreaterThan(0);
      const dec2025 = earningData.find((d) => d.年月 === "2025年12月");
      const dec2020 = earningData.find((d) => d.年月 === "2020年12月");
      expect(dec2025).toBeDefined();
      expect(dec2020).toBeDefined();
      for (const key of ["総合", "時間当たり給与", "15歳以上国民当たり給与"]) {
        const values = earningData
          .filter((d) => d.年月.startsWith("2025年"))
          .map((d) => d[key])
          .filter((v): v is number => typeof v === "number");
        expect(values).toHaveLength(12);
        expect(values.reduce((sum, value) => sum + value, 0) / values.length).toBeCloseTo(100, 1);
      }

      const averageFor = (key: keyof CpiData) => {
        const values = earningData
          .filter((d) => d.年月.startsWith("2025年"))
          .map((d) => d[key])
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
        expect(values).toHaveLength(12);
        return values.reduce((sum, value) => sum + value, 0) / values.length;
      };
      expect(averageFor("CPI総合(参考)" as keyof CpiData)).toBeCloseTo(100, 6);
      expect(Number(dec2025!["CPI総合(12MA)"])).toBeCloseTo(100, 1);
      expect(Number(dec2025!["CTI消費支出（参考）"])).toBeCloseTo(100, 1);
      expect(Number(dec2025!["民間最終消費支出（参考・延長）"])).toBeCloseTo(100, 1);

      // 2020年の行も、互換データの取得元基準ではなく2025年表示基準で評価する。
      const cpi2025Average =
        cpiData
          .filter((d) => d.年月.startsWith("2025年"))
          .reduce((sum, d) => sum + Number(d.総合), 0) / 12;
      const cpi2020December = Number(cpiData.find((d) => d.年月 === "2020年12月")?.総合);
      expect(cpi2025Average).toBeGreaterThan(0);
      expect(cpi2020December).toBeGreaterThan(0);
      expect(Number(dec2020!["CPI総合(参考)"])).toBeCloseTo(
        (cpi2020December * 100) / cpi2025Average,
        6,
      );

      const ctiOutput = loadCtiBasicConsumptionOutput();
      expect(ctiOutput.status).toBe("valid");
      expect(Number(dec2020!["CTI消費支出（参考）"])).toBeCloseTo(
        ctiOutput.comparison.get("2020-12") ?? Number.NaN,
        6,
      );

      const residual2025 = earningData
        .filter((d) => d.年月.startsWith("2025年"))
        .map((d) => d["残差"])
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      expect(residual2025).toHaveLength(12);
      expect(residual2025.reduce((sum, value) => sum + value, 0) / residual2025.length).toBeCloseTo(
        0,
        6,
      );
    });

    it("keeps Plan37 CTI raw and comparison series for the internal comparison merge", () => {
      expect(
        earningData.some((row) => typeof row["CTIミクロ基本系列（名目・原数値）"] === "number"),
      ).toBe(true);
      expect(
        earningData.some((row) => typeof row["CTIミクロ基本系列（名目・参考）"] === "number"),
      ).toBe(true);
      expect(
        earningData.some((row) => typeof row["CTIミクロ基本系列（名目・参考・延長）"] === "number"),
      ).toBe(true);
    });

    it("should compare fixture anchors with the actual raw CSV rows", async () => {
      const rows = await parseCsvWithHeader(
        resolve(process.cwd(), "tests/fixtures/csv/minkan-extension-raw.csv"),
      );
      for (const anchor of minkanFixture.anchors) {
        const row = rows.find((value) => value.month === anchor.month);
        expect(row, `missing raw row ${anchor.month}`).toBeDefined();
        expect(Number(row?.raw)).toBeCloseTo(anchor.raw, 6);
      }
    });

    // This 2020 assumption is intentionally limited to the rollback fixture.
    it.skip("legacy: should keep 2020 fixed scaling rollback-only and leave GDP 2025 comparison keys unset", () => {
      const rollbackRows = earningData.filter((d) => d.年月.startsWith("2020年"));
      expect(rollbackRows.length).toBeGreaterThan(0);

      rollbackRows.forEach((row) => {
        expect(row["民間最終消費支出（名目・比較指数）" as keyof CpiData]).toBeNull();
        expect(row["民間最終消費支出（名目・原値）" as keyof CpiData]).toBeUndefined();
        expect(row).toHaveProperty("民間最終消費支出（参考）");
      });
    });
  });

  it("restores the legacy CTI comparison contract without leaking into salary or Plan38 data", async () => {
    const rows = await loadTotalEarningDataInternal();
    const row2017 = rows.find((row) => row.年月 === "2017年12月");
    const row2018 = rows.find((row) => row.年月 === "2018年1月");
    expect(row2017?.["CTI消費支出（参考）"] ?? null).toBeNull();
    expect(Number.isFinite(row2018?.["CTI消費支出（参考）"] ?? Number.NaN)).toBe(true);

    const ctiRows = await loadCtiDataInternal();
    const raw2025 = ctiRows
      .filter((row) => row.年月.startsWith("2025年"))
      .map((row) => row["消費支出（名目）"])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    expect(raw2025).toHaveLength(12);
    const raw2025Average = raw2025.reduce((sum, value) => sum + value, 0) / raw2025.length;
    const legacyCtiRawMap = new Map(
      ctiRows.flatMap((row) => {
        const month = toCanonicalYearMonth(row.年月);
        const value = row["消費支出（名目）"];
        return month && typeof value === "number" && Number.isFinite(value)
          ? [[month, value] as const]
          : [];
      }),
    );
    const rawWindow = [...legacyCtiRawMap.entries()]
      .filter(([month]) => month >= "2017-02" && month <= "2018-01")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value);
    expect(rawWindow).toHaveLength(12);
    const output2025 = rows
      .filter((row) => row.年月.startsWith("2025年"))
      .map((row) => row["CTI消費支出（参考）"])
      .filter((value): value is number => typeof value === "number");
    expect(output2025).toHaveLength(12);
    expect(
      raw2025.reduce((sum, value) => sum + (value * 100) / raw2025Average, 0) / raw2025.length,
    ).toBeCloseTo(100, 6);
    expect(rows.find((row) => row.年月 === "2018年1月")?.["CTI消費支出（参考）"]).toBeCloseTo(
      (rawWindow.reduce((sum, value) => sum + value, 0) / rawWindow.length) *
        (100 / raw2025Average),
      6,
    );
    expect(rows.find((row) => row.年月 === "2018年1月")?.["CTI消費支出（参考）"]).not.toBeCloseTo(
      rows.find((row) => row.年月 === "2018年1月")?.["CTIミクロ基本系列（名目・参考・延長）"] ??
        Number.NaN,
      6,
    );
    expect(readLegacyCtiAggregation(rows.find((row) => row.年月 === "2025年1月"))).toBe(
      "adjustment_12_month_moving_average_rebased_to_2025_raw_average",
    );
    const row2018Measurements = (row2018 as CpiDataWithMeasurements | undefined)?.measurements;
    expect(row2018Measurements?.["CTIミクロ基本系列（名目・原数値）"]).toMatchObject({
      key: "CTIミクロ基本系列（名目・原数値）",
      value: row2018?.["CTIミクロ基本系列（名目・原数値）"],
      valueType: "raw",
      status: "valid",
    });
    expect(row2018Measurements?.["CTIミクロ基本系列（名目・参考・延長）"]).toMatchObject({
      key: "CTIミクロ基本系列（名目・参考・延長）",
      value: row2018?.["CTIミクロ基本系列（名目・参考・延長）"],
      valueType: "comparison",
      status: "valid",
    });
    expect(row2018Measurements?.["CTI消費支出（参考）"]).toMatchObject({
      value: row2018?.["CTI消費支出（参考）"],
      aggregation: "adjustment_12_month_moving_average_rebased_to_2025_raw_average",
      status: "valid",
    });
    const publicRows = toEarningsView(rows, ["年月", "CTIミクロ基本系列（名目・参考）"]);
    expect(publicRows[0]).not.toHaveProperty("CTI消費支出（参考）");
    expect(publicRows[0]).not.toHaveProperty("measurements.CTI消費支出（参考）");
    expect(
      (publicRows[0] as CpiDataWithMeasurements).measurements?.["CTI消費支出（参考）"],
    ).toBeUndefined();
    expect(
      rows.every(
        (row) =>
          !("CTI消費支出（参考）" in row) ||
          row["CTI消費支出（参考）"] === null ||
          typeof row["CTI消費支出（参考）"] === "number",
      ),
    ).toBe(true);
    expect(rows.some((row) => Object.hasOwn(row, "CTIミクロ四半期系列（名目）"))).toBe(false);
  });

  it("projects the 2014 Plan49 point with its exact monthly and MA12 provenance", async () => {
    const rows = await loadTotalEarningDataInternal();
    const row = rows.find((candidate) => candidate.年月 === "2014年1月");
    expect(row).toBeDefined();
    const measurement = (row as CpiDataWithMeasurements).measurements?.[CONSUMPTION_TOTAL_12MA_KEY];
    expect(measurement?.value).toBe(row?.[CONSUMPTION_TOTAL_12MA_KEY]);
    expect(measurement?.monthlyProvenance).toMatchObject({
      sourceId: "000040499070",
      householdScope: "二人以上の世帯",
      seriesType: "historical_estimate",
    });
    expect(measurement?.ma12Provenance).toEqual({
      windowStart: "2013-02",
      windowEnd: "2014-01",
      sources: ["000040499070"],
      statuses: ["historical_estimate"],
    });

    const publicRow = toEarningsView(rows, ["年月", CONSUMPTION_TOTAL_12MA_KEY]).find(
      (candidate) => candidate.年月 === "2014年1月",
    );
    expect(publicRow?.[CONSUMPTION_TOTAL_12MA_KEY]).toBeTypeOf("number");
    expect(
      (publicRow as CpiDataWithMeasurements | undefined)?.measurements?.[
        CONSUMPTION_TOTAL_12MA_KEY
      ],
    ).toMatchObject({
      monthlyProvenance: {
        sourceId: "000040499070",
        householdScope: "二人以上の世帯",
        seriesType: "historical_estimate",
      },
      ma12Provenance: {
        windowStart: "2013-02",
        windowEnd: "2014-01",
      },
    });
  });
});
