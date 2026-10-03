import { describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  computeConsumptionTotal12Ma,
  summarizeConsumptionTotal12MaStatus,
  loadConsumptionTotal12MaSeries,
  type ConsumptionMonthlyPoint,
} from "../../server/lib/consumptionTotal12Ma";
import {
  aggregateCtiBasicNominalQuarterly,
  buildCtiBasicConsumptionOutput,
  CTI_BASIC_2025_SERIES,
  ctiBasicSeriesPaths,
  getCtiBasicConsumptionStatus,
  normalizeCtiMonth,
  normalizeCtiBasicSeriesCsv,
  recordsToNormalizedCsv,
  sha256Hex,
  validateCtiBasicManifest,
  validateCtiBasicSeriesArtifact,
  type CtiBasicManifest,
  type CtiBasicRecord,
  type OfficialCtiMetadata,
} from "../../server/lib/ctiBasicSeries2025LongTerm";
import { processPopulationData } from "../../server/lib/dataProcessor";
import {
  calculateAdjustedMetric,
  calculateRawResidual,
  calculateSmoothedTotal,
  applyResidualMovingAverage,
  rebaseResidualToYearAverage,
} from "../../server/lib/serverCalculations";
import type { CpiData } from "../../src/types";

function point(
  status: ConsumptionMonthlyPoint["status"],
  ma12: number | null,
): Pick<ConsumptionMonthlyPoint, "rawLevel" | "ma12" | "status"> {
  return { rawLevel: 100, ma12, status };
}

function cpiDataRow(年月: string, overrides: Partial<CpiData> = {}): CpiData {
  return {
    年月,
    総合: 0,
    生鮮食品を除く総合: 0,
    持家の帰属家賃を除く総合: 0,
    "消費支出（参考）": null,
    "CPI総合(参考)": null,
    ...overrides,
  };
}

function nominalRecord(month: string, overrides: Partial<CtiBasicRecord> = {}): CtiBasicRecord {
  return {
    variant: "nominal",
    seriesIndex: 1,
    officialSeriesCode: "1",
    seriesName: "消費支出（名目）",
    month: month as CtiBasicRecord["month"],
    rawValue: 120,
    isMissing: false,
    ...overrides,
  };
}

function validManifestFixture(root: string): CtiBasicManifest {
  const files: CtiBasicManifest["files"] = [];
  const kinds = Object.keys(CTI_BASIC_2025_SERIES) as Array<keyof typeof CTI_BASIC_2025_SERIES>;
  for (const kind of kinds) {
    const descriptor = CTI_BASIC_2025_SERIES[kind];
    const requestedStart = kind === "distributionAdjustedNominal" ? "2017-01" : "2005-01";
    const sourceStart = kind === "distributionAdjustedNominal" ? "2017-01" : "2002-01";
    const records = Array.from({ length: 22 }, (_, index) => ({
      variant: kind,
      seriesIndex: index + 1,
      officialSeriesCode: kind === "seasonallyAdjusted" ? null : String(index + 1),
      seriesName: index === 0 ? "消費支出（名目）" : `系列${index + 1}`,
      month: requestedStart,
      rawValue: index + 1,
      isMissing: false,
    })) as CtiBasicRecord[];
    const normalized = recordsToNormalizedCsv(records);
    const raw = Buffer.from(`official raw ${descriptor.statInfId}`);
    const fileBase = descriptor.statInfId;
    const rawFile = `${fileBase}.raw`;
    const normalizedFile = `${fileBase}.normalized.csv`;
    const metadataFile = `${fileBase}.metadata.json`;
    const normalizedSha256 = sha256Hex(normalized);
    const rawSha256 = sha256Hex(raw);
    const sourceTitle =
      kind === "nominal"
        ? "10大費目別 世帯消費動向指数（原数値）"
        : kind === "seasonallyAdjusted"
          ? "10大費目別 世帯消費動向指数（季節調整値）"
          : "10大費目別 世帯消費動向指数 分布調整値（原数値）";
    const metadata: OfficialCtiMetadata = {
      status: "ready",
      statisticName: sourceTitle,
      governmentStatisticsCode: "00200567",
      baseYear: 2025,
      unit: "指数",
      statInfId: descriptor.statInfId,
      seriesKind: kind,
      seriesLabel: descriptor.label,
      householdScope: kind === "distributionAdjustedNominal" ? "総世帯" : "二人以上の世帯",
      valueType: descriptor.label,
      sourceTitle,
      frequency: "monthly",
      sourceStart,
      requestedStart,
      availabilityStart: sourceStart,
      retrieval: { retrievedAt: "2026-01-01T00:00:00Z", updatedAt: null },
      officialUrl: `https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=${descriptor.statInfId}`,
      encoding: "binary/official",
      rawFile,
      normalizedFile,
      metadataFile,
      rawBytes: raw.byteLength,
      normalizedBytes: Buffer.byteLength(normalized),
      parserVersion: "xlsx-0.20.3",
      transformVersion: "cti-basic-2025-long-term-v2",
      sourceHeaders: {
        contentType: "application/octet-stream",
        contentDisposition: null,
        lastModified: null,
      },
      rawSha256,
      normalizedSha256,
      latestPublishedMonth: requestedStart,
      rowCount: records.length,
      seriesCount: 22,
      series: records.map(({ seriesIndex, officialSeriesCode, seriesName }) => ({
        seriesIndex,
        officialSeriesCode,
        seriesName,
      })),
      validation: { ok: true, checks: [] },
      unavailable: { periods: [], reason: null },
    };
    const metadataBytes = Buffer.from(JSON.stringify(metadata));
    fs.writeFileSync(path.join(root, rawFile), raw);
    fs.writeFileSync(path.join(root, normalizedFile), normalized);
    fs.writeFileSync(path.join(root, metadataFile), metadataBytes);
    files.push({
      statInfId: descriptor.statInfId,
      seriesKind: kind,
      rawFile,
      normalizedFile,
      metadataFile,
      rawSha256,
      normalizedSha256,
      metadataSha256: sha256Hex(metadataBytes),
    });
  }
  return { schemaVersion: 1, generatedAt: "2026-01-01T00:00:00Z", files };
}

function makeConsumptionSource(root: string, compositionCsv?: string): void {
  const officialDir = path.join(root, "official-cti-2025-long-term");
  if (compositionCsv !== undefined) {
    const compositionDir = path.join(root, "cti-size-composition");
    fs.mkdirSync(compositionDir, { recursive: true });
    fs.writeFileSync(path.join(compositionDir, "lfs-iv4-2004-pi2plus.csv"), compositionCsv);
  }
  fs.mkdirSync(officialDir, { recursive: true });
  const nominalRows = [
    "series_index,series_name,month,raw_value,is_missing",
    "2,別系列,2005-01,10,false",
    "1,別名称,2005-02,20,false",
    "1,消費支出（名目）,2005-03,30,true",
    "1,消費支出（名目）,2005-04,not-a-number,false",
    '1,消費支出（名目）,2005-05,"1,000",false',
    "1,消費支出（名目）,2005-06,,false",
    "1,消費支出（名目）,,5,false",
  ];
  fs.writeFileSync(
    path.join(officialDir, "000040499070.normalized.csv"),
    `${nominalRows.join("\n")}\n`,
  );
  const prehistoryRows = ["month,raw_value"];
  for (let month = 1; month <= 12; month += 1) {
    prehistoryRows.push(`2004-${String(month).padStart(2, "0")},"1,000"`);
  }
  prehistoryRows.push("2004-13,not-a-number", ",12", "2004-14,", "2004-15");
  fs.writeFileSync(
    path.join(officialDir, "000040499070.2004-prehistory.csv"),
    `${prehistoryRows.join("\n")}\n`,
  );
  const officialRows = ["series_index,series_name,month,raw_value,is_missing"];
  for (let month = 1; month <= 12; month += 1) {
    const ym = `2025-${String(month).padStart(2, "0")}`;
    officialRows.push(
      month === 1 ? `2,消費支出（名目）,${ym},100,false` : `1,消費支出（名目）,${ym},100,false`,
    );
  }
  officialRows.push("1,消費支出（名目）,2025-99,100,false");
  officialRows.push("1,消費支出（名目）,not-a-month,100,false");
  officialRows.push("1,消費支出（名目）,2025-98,100,true");
  officialRows.push("1,消費支出（名目）,2025-97,,false");
  officialRows.push("1,消費支出（名目）,2025-96,not-a-number,false");
  officialRows.push("1,消費支出（名目）,,100,false");
  fs.writeFileSync(
    path.join(officialDir, "000040499028.normalized.csv"),
    `${officialRows.join("\n")}\n`,
  );
}

describe("core aggregation edge contracts", () => {
  it("resolves configured CTI artifact roots only when the directory exists", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cti-root-"));
    try {
      vi.stubEnv("CTI_BASIC_ARTIFACT_ROOT", root);
      vi.resetModules();
      const ready = await import("../../server/lib/ctiBasicSeries2025LongTerm");
      expect(ready.CTI_BASIC_ARTIFACT_RESOLUTION).toMatchObject({
        root,
        status: "ready",
        reason: null,
      });

      vi.stubEnv("CTI_BASIC_ARTIFACT_ROOT", path.join(root, "does-not-exist"));
      vi.resetModules();
      const unavailable = await import("../../server/lib/ctiBasicSeries2025LongTerm");
      expect(unavailable.CTI_BASIC_ARTIFACT_RESOLUTION.status).toBe("unavailable");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports only a finite available MA12 as a usable consumption series", () => {
    expect(summarizeConsumptionTotal12MaStatus(false, [point("available", 1)])).toEqual({
      status: "invalid",
      reason: "insufficient_or_non_finite_2025_base_period_values",
    });
    expect(
      summarizeConsumptionTotal12MaStatus(true, [
        point("available", Number.NaN),
        point("unavailable", 1),
        point("invalid", 1),
      ]),
    ).toEqual({
      status: "invalid",
      reason: "insufficient_complete_12_month_window",
    });
    expect(summarizeConsumptionTotal12MaStatus(true, [point("available", 0)])).toEqual({
      status: "available",
      reason: null,
    });
  });

  it("exposes the calculation result through the standard monthly adapter", () => {
    const result = loadConsumptionTotal12MaSeries();
    expect(result.status).toBe("available");
    expect(result.metadata.frequency).toBe("monthly");
    const explicitRepositoryRoot = computeConsumptionTotal12Ma(path.resolve("data/source"));
    expect(explicitRepositoryRoot.status).toBe("available");
    expect(explicitRepositoryRoot.baseYearB).toBe(result.baseYearB);
    expect(
      explicitRepositoryRoot.points.find((point) => point.yearMonth === "2005-01")?.rawLevel,
    ).toEqual(expect.any(Number));
  });

  it("fails closed for non-Error exceptions from the CTI series builder", () => {
    const hostileRecord = new Proxy({} as CtiBasicRecord, {
      get: () => {
        throw "non-Error record access";
      },
    });
    expect(buildCtiBasicConsumptionOutput([hostileRecord]).reason).toBe(
      "CTI長期系列の検証に失敗しました",
    );
  });

  it("quotes normalized CTI fields containing commas, quotes, and newlines", () => {
    const csv = recordsToNormalizedCsv([
      nominalRecord("2005-01", { seriesName: 'CTI, "nominal"\nseries' }),
    ]);

    expect(csv).toContain('"CTI, ""nominal""\nseries"');
    expect(
      recordsToNormalizedCsv([
        nominalRecord("2005-01", { seriesName: undefined as unknown as string }),
      ]),
    ).toContain("nominal,1,1,,2005-01,120,false");
  });

  it("returns a generic diagnostic when an artifact reader throws a non-Error value", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cti-non-error-read-"));
    const paths = ctiBasicSeriesPaths("nominal", root);
    try {
      for (const file of Object.values(paths)) fs.writeFileSync(file, "placeholder");
      vi.doMock("node:fs", async (importOriginal) => {
        const original = await importOriginal<typeof import("node:fs")>();
        return {
          ...original,
          readFileSync: () => {
            throw "synthetic non-Error filesystem failure";
          },
        };
      });
      vi.resetModules();

      const loader = await import("../../server/lib/ctiBasicSeries2025LongTerm");
      expect(loader.loadCtiBasicConsumptionOutput(root).reason).toBe(
        "CTI長期系列の検証に失敗しました",
      );
    } finally {
      vi.doUnmock("node:fs");
      vi.resetModules();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads or safely rejects the optional 2004 household-composition source", () => {
    const validRows = [
      "year,table,household_group,households_ten_thousand",
      "2004,IV-4,二人以上の一般世帯,3459",
      "2004,IV-4,総世帯,4915",
    ].join("\n");
    const malformedRows = [
      "year,table,household_group,households_ten_thousand",
      '"2004,IV-4,二人以上の一般世帯,3459',
      "2004,IV-4,総世帯,4915",
    ].join("\n");
    const cases = [
      validRows,
      [validRows, "2004,IV-4,二人以上の一般世帯,3459"].join("\n"),
      validRows.replace("総世帯", "全世帯"),
      validRows.replace("二人以上の一般世帯,3459", "二人以上の一般世帯"),
      validRows.replace("総世帯,4915", "総世帯"),
      validRows.replace(",3459", ",3.459"),
      validRows.replace(",3459", ",9007199254740992"),
      validRows.replace(",3459", ",0"),
      validRows.replace(",4915", ",3000"),
      [
        "year,table,household_group,households_ten_thousand",
        "2004,IV-4,二人以上の一般世帯",
        "2004,IV-4,総世帯,4915",
      ].join("\n"),
      [
        "year,table,household_group,households_ten_thousand",
        "2004,IV-4,二人以上の一般世帯,3459",
        "2004,IV-4,総世帯",
      ].join("\n"),
      ["year,table,household_group", "2004,IV-4,二人以上の一般世帯", "2004,IV-4,総世帯"].join("\n"),
      malformedRows,
      undefined,
    ];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const compositionCsv of cases) {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "consumption-source-"));
        try {
          makeConsumptionSource(root, compositionCsv);
          const result = computeConsumptionTotal12Ma(root);
          expect(result.status).toBe("available");
          expect(result.points.at(-1)?.yearMonth).toBe("2025-12");
        } finally {
          fs.rmSync(root, { recursive: true, force: true });
        }
      }
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("does not reconstruct a historical year whose raw monthly denominator is zero", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "consumption-zero-year-"));
    const share = [
      "year,table,household_group,households_ten_thousand",
      "2004,IV-4,二人以上の一般世帯,3459",
      "2004,IV-4,総世帯,4915",
    ].join("\n");
    try {
      fs.cpSync(path.resolve("data/source/cti-adjusted"), path.join(root, "cti-adjusted"), {
        recursive: true,
      });
      makeConsumptionSource(root, share);
      const zeroYear = [
        "series_index,series_name,month,raw_value,is_missing",
        ...Array.from(
          { length: 12 },
          (_, index) => `1,消費支出（名目）,2005-${String(index + 1).padStart(2, "0")},0,false`,
        ),
      ];
      fs.writeFileSync(
        path.join(root, "official-cti-2025-long-term", "000040499070.normalized.csv"),
        `${zeroYear.join("\n")}\n`,
      );
      const result = computeConsumptionTotal12Ma(root);
      expect(result.status).toBe("available");
      expect(result.points.find((point) => point.yearMonth === "2005-01")?.rawLevel).toBeNull();
      expect(result.points.find((point) => point.yearMonth === "2006-01")?.rawLevel).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires complete finite positive raw denominators when reconstructing historical years", async () => {
    const cases = [
      { months: 11, value: 100, description: "Incomplete raw monthly data in year" },
      { months: 12, value: 0, description: "Non-positive or non-finite meanRaw" },
      { months: 12, value: 1e308, description: "Non-positive or non-finite meanRaw" },
      {
        months: 12,
        value: 100,
        description:
          "Plan39 V2 composition-corrected annual anchor +二人以上世帯 raw monthly seasonal weights",
      },
    ] as const;
    vi.doMock("../../server/lib/data-loader/ctiAdjusted", () => ({
      loadCtiAdjustedV2Estimate: () => ({
        rows: Array.from({ length: 12 }, (_, index) => ({
          year: 2005 + index,
          status: "available",
          values: { 総合: 100 },
        })),
        prehistoryAnchors: { 2004: 100 },
      }),
    }));
    vi.resetModules();
    try {
      const { computeConsumptionTotal12Ma: computeWithAnchorFixture } =
        await import("../../server/lib/consumptionTotal12Ma");
      for (const entry of cases) {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "consumption-history-boundary-"));
        try {
          makeConsumptionSource(root);
          const rows = ["series_index,series_name,month,raw_value,is_missing"];
          for (let year = 2005; year <= 2016; year += 1) {
            const monthCount = year === 2005 ? entry.months : 12;
            const value = year === 2005 ? entry.value : 100;
            for (let month = 1; month <= monthCount; month += 1) {
              rows.push(
                `1,消費支出（名目）,${year}-${String(month).padStart(2, "0")},${value},false`,
              );
            }
          }
          fs.writeFileSync(
            path.join(root, "official-cti-2025-long-term", "000040499070.normalized.csv"),
            `${rows.join("\n")}\n`,
          );

          const result = computeWithAnchorFixture(root);
          const january = result.points.find((candidate) => candidate.yearMonth === "2005-01");
          expect(january?.provenance.description).toBe(entry.description);
          if (entry.months === 12 && entry.value === 100)
            expect(january?.rawLevel).toBeGreaterThan(0);
          else expect(january?.rawLevel).toBeNull();
        } finally {
          fs.rmSync(root, { recursive: true, force: true });
        }
      }
    } finally {
      vi.doUnmock("../../server/lib/data-loader/ctiAdjusted");
      vi.resetModules();
    }
  });

  it("fails closed or keeps available data when a source artifact cannot be read", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cases = [
      {
        file: "official-cti-2025-long-term/000040499070.2004-prehistory.csv",
        status: "available",
      },
      {
        file: "official-cti-2025-long-term/000040499070.normalized.csv",
        status: "available",
      },
      {
        file: "official-cti-2025-long-term/000040499028.normalized.csv",
        status: "invalid",
      },
      {
        file: "cti-size-composition/lfs-iv4-2004-pi2plus.csv",
        status: "available",
      },
    ] as const;
    try {
      for (const entry of cases) {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "consumption-unreadable-"));
        try {
          makeConsumptionSource(root);
          const file = path.join(root, entry.file);
          fs.rmSync(file, { recursive: true, force: true });
          fs.mkdirSync(file, { recursive: true });
          const result = computeConsumptionTotal12Ma(root);
          expect(result.status).toBe(entry.status);
        } finally {
          fs.rmSync(root, { recursive: true, force: true });
        }
      }
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("validates normalized CTI columns, missing markers, and the complete three-artifact manifest", () => {
    const rows = Array.from({ length: 22 }, (_, index) =>
      nominalRecord("2005-01", {
        seriesIndex: index + 1,
        officialSeriesCode: String(index + 1),
        seriesName: index === 0 ? "消費支出（名目）" : `系列${index + 1}`,
        rawValue: index === 0 ? null : index + 1,
        isMissing: index === 0,
      }),
    );
    const csv = recordsToNormalizedCsv(rows);
    expect(normalizeCtiBasicSeriesCsv(csv, "2005-01")[0]).toMatchObject({
      rawValue: null,
      isMissing: true,
    });
    expect(() =>
      normalizeCtiBasicSeriesCsv(csv.replace("variant,series_index", "series_index,variant")),
    ).toThrow("CTI CSV has unexpected columns");
    expect(() => normalizeCtiBasicSeriesCsv(csv.replace(",true\n", ",false\n"))).toThrow(
      "CTI missing marker mismatch",
    );
    expect(() => normalizeCtiBasicSeriesCsv(csv.replace("nominal,1,1", "unknown,1,1"))).toThrow(
      "unknown CTI variant",
    );
    expect(() => normalizeCtiBasicSeriesCsv(csv.replace("nominal,1,1", "nominal,0,1"))).toThrow(
      "invalid CTI series index",
    );
    expect(() => normalizeCtiBasicSeriesCsv("variant,unexpected_column\nnominal,value\n")).toThrow(
      "CTI CSV has unexpected columns",
    );
    expect(() =>
      normalizeCtiBasicSeriesCsv(
        "variant,series_index,official_series_code,series_name,month,raw_value,is_missing\nnominal,1,1,name,2005-01,,false",
      ),
    ).toThrow("CTI missing marker mismatch");
    expect(() => normalizeCtiBasicSeriesCsv(csv.replace("2005-01", "2005-13"))).toThrow(
      "invalid CTI month",
    );
    expect(() => normalizeCtiBasicSeriesCsv(csv.split("\n").slice(0, 2).join("\n"))).toThrow(
      "CTI CSV must contain one variant with 22 series",
    );
    expect(() => normalizeCtiBasicSeriesCsv(csv, "2005-02")).toThrow(
      "CTI series does not start at 2005-02",
    );
    const duplicated = `${csv.trimEnd()}\n${csv.split("\n")[1]}\n`;
    expect(() => normalizeCtiBasicSeriesCsv(duplicated)).toThrow("CTI duplicate key");
    expect(() =>
      normalizeCtiBasicSeriesCsv(csv.replace("2005-01,,true", "2005-01,Infinity,false")),
    ).toThrow("CTI value is not numeric");
    expect(() => normalizeCtiBasicSeriesCsv('"unterminated')).toThrow("CTI CSV schema error");
    expect(normalizeCtiMonth("'2025年1月'")).toBe("2025-01");
    expect(normalizeCtiMonth("2025/12")).toBe("2025-12");
    expect(() => normalizeCtiMonth("2025-13")).toThrow("invalid CTI month");
    expect(
      recordsToNormalizedCsv([nominalRecord("2005-01", { seriesName: 'series,"quoted"' })]),
    ).toContain('"series,""quoted"""');

    const grouped = Array.from({ length: 22 }, (_, index) =>
      nominalRecord("2005-01", {
        seriesIndex: index + 1,
        seriesName: `系列${index + 1}`,
      }),
    );
    const latestMismatch = [
      ...grouped,
      nominalRecord("2005-02", {
        seriesIndex: 1,
        seriesName: "系列1",
      }),
    ];
    expect(() => normalizeCtiBasicSeriesCsv(recordsToNormalizedCsv(latestMismatch))).toThrow(
      "CTI series have different latest months",
    );
    const gap = [
      ...grouped,
      nominalRecord("2005-03", {
        seriesIndex: 1,
        seriesName: "系列1",
      }),
    ];
    expect(() => normalizeCtiBasicSeriesCsv(recordsToNormalizedCsv(gap))).toThrow(
      "CTI months are not continuous at 2005-03",
    );

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cti-core-manifest-"));
    try {
      const manifest = validManifestFixture(root);
      expect(() => validateCtiBasicManifest(manifest, root)).not.toThrow();
      expect(getCtiBasicConsumptionStatus(root)).toMatchObject({
        valid: false,
        artifactRoot: "custom",
        artifactStatus: "ready",
        artifactReason: null,
      });
      const nominal = manifest.files.find((item) => item.seriesKind === "nominal")!;
      const metadataPath = path.join(root, nominal.metadataFile);
      const normalizedPath = path.join(root, nominal.normalizedFile);
      const rawPath = path.join(root, nominal.rawFile);
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as OfficialCtiMetadata;
      const normalized = fs.readFileSync(normalizedPath, "utf8");
      const raw = fs.readFileSync(rawPath);
      expect(
        validateCtiBasicSeriesArtifact({
          metadata,
          normalizedCsv: normalized,
          rawCsv: raw,
          kind: "nominal",
        }),
      ).toHaveLength(22);
      expect(validateCtiBasicSeriesArtifact({ metadata, normalizedCsv: normalized })).toHaveLength(
        22,
      );
      expect(() =>
        validateCtiBasicSeriesArtifact({
          metadata: { ...metadata, status: "unavailable" },
          normalizedCsv: normalized,
        }),
      ).toThrow("CTI metadata is not ready");
      expect(() =>
        validateCtiBasicSeriesArtifact({
          metadata: { ...metadata, seriesLabel: "wrong label" },
          normalizedCsv: normalized,
          kind: "nominal",
        }),
      ).toThrow("CTI metadata series identity mismatch");
      expect(() =>
        validateCtiBasicSeriesArtifact({
          metadata: { ...metadata, householdScope: "総世帯" },
          normalizedCsv: normalized,
        }),
      ).toThrow("CTI metadata scope or source identity mismatch");
      expect(() =>
        validateCtiBasicSeriesArtifact({
          metadata: { ...metadata, sourceStart: "2005-01" },
          normalizedCsv: normalized,
        }),
      ).toThrow("CTI metadata source/request boundary mismatch");
      expect(() =>
        validateCtiBasicSeriesArtifact({
          metadata: { ...metadata, rawSha256: "0".repeat(64) },
          normalizedCsv: normalized,
          rawCsv: raw,
        }),
      ).toThrow("CTI raw SHA-256 mismatch");
      expect(() =>
        validateCtiBasicSeriesArtifact({
          metadata: { ...metadata, normalizedSha256: "0".repeat(64) },
          normalizedCsv: normalized,
        }),
      ).toThrow("CTI normalized SHA-256 mismatch");
      expect(() =>
        validateCtiBasicSeriesArtifact({
          metadata: { ...metadata, rowCount: 21 },
          normalizedCsv: normalized,
        }),
      ).toThrow("CTI metadata latest month or row count mismatch");
      expect(() =>
        validateCtiBasicManifest(
          {
            ...manifest,
            files: [manifest.files[0], manifest.files[0], manifest.files[2]],
          },
          root,
        ),
      ).toThrow("CTI manifest has a circular reference or duplicate");
      expect(() =>
        validateCtiBasicManifest(
          {
            ...manifest,
            files: manifest.files.map((item) => ({
              ...item,
              statInfId: "wrong",
            })),
          },
          root,
        ),
      ).toThrow("CTI manifest has unexpected series identity");
      fs.rmSync(rawPath);
      expect(() => validateCtiBasicManifest(manifest, root)).toThrow(
        "CTI manifest artifact is missing",
      );
      fs.writeFileSync(rawPath, raw);
      fs.writeFileSync(rawPath, "tampered raw artifact");
      expect(() => validateCtiBasicManifest(manifest, root)).toThrow(
        "CTI manifest artifact hash mismatch",
      );
      fs.writeFileSync(rawPath, raw);

      const alteredMetadataBytes = Buffer.from(
        JSON.stringify({
          ...metadata,
          series: metadata.series.map((series, index) =>
            index === 0 ? { ...series, seriesName: "wrong series" } : series,
          ),
        }),
      );
      fs.writeFileSync(metadataPath, alteredMetadataBytes);
      const alteredManifest: CtiBasicManifest = {
        ...manifest,
        files: manifest.files.map((item) =>
          item === nominal ? { ...item, metadataSha256: sha256Hex(alteredMetadataBytes) } : item,
        ),
      };
      expect(() => validateCtiBasicManifest(alteredManifest, root)).toThrow(
        "CTI metadata series identity mismatch",
      );
      expect(() =>
        validateCtiBasicManifest({ ...manifest, files: manifest.files.slice(0, 2) }, root),
      ).toThrow("CTI manifest is incomplete");
      expect(() =>
        validateCtiBasicManifest(
          {
            ...manifest,
            files: manifest.files.map((item) => ({
              ...item,
              rawFile: "../outside",
            })),
          },
          root,
        ),
      ).toThrow("CTI manifest file path is outside root");
      expect(() =>
        validateCtiBasicManifest(
          {
            ...manifest,
            files: manifest.files.map((item) => ({ ...item, rawFile: "" })),
          },
          root,
        ),
      ).toThrow("CTI manifest file name is invalid");
      expect(() =>
        validateCtiBasicManifest(
          {
            ...manifest,
            files: manifest.files.map((item) => ({
              ...item,
              metadataFile: "manifest.json",
            })),
          },
          root,
        ),
      ).toThrow("CTI manifest has a circular reference or duplicate");
      const invalidJson = Buffer.from("not JSON");
      fs.writeFileSync(metadataPath, invalidJson);
      const invalidJsonManifest: CtiBasicManifest = {
        ...manifest,
        files: manifest.files.map((item) =>
          item === nominal ? { ...item, metadataSha256: sha256Hex(invalidJson) } : item,
        ),
      };
      expect(() => validateCtiBasicManifest(invalidJsonManifest, root)).toThrow(
        "CTI metadata is invalid JSON",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("aggregates quarterly CTI only when all three calendar months are usable", () => {
    const records: CtiBasicRecord[] = [
      nominalRecord("2005-01", { rawValue: 90 }),
      nominalRecord("2005-02", { rawValue: 100 }),
      nominalRecord("2005-03", { rawValue: 110 }),
      nominalRecord("2005-04", { rawValue: null, isMissing: true }),
      nominalRecord("2005-05", { rawValue: 100 }),
      nominalRecord("2005-06", { rawValue: 110 }),
      nominalRecord("2005-07", { rawValue: Number.NaN }),
      nominalRecord("2005-08", { rawValue: 100 }),
      nominalRecord("2005-09", { rawValue: 110 }),
      nominalRecord("2018-01"),
      nominalRecord("invalid-month"),
    ];
    const result = aggregateCtiBasicNominalQuarterly(records);
    expect(result.values.get("2005Q1")).toBe(100);
    expect(result.measurements.get("2005Q2")).toMatchObject({
      status: "invalid",
      reason: "missing",
    });
    expect(result.measurements.get("2005Q3")).toMatchObject({
      status: "invalid",
      reason: "non_finite",
    });
    expect(result.measurements.get("2005Q4")).toMatchObject({
      status: "invalid",
      reason: "insufficient_months",
    });
    expect(result.measurements.size).toBe(52);
    expect(result.reason).toBe("missing");
  });

  it("prioritizes an identity mismatch and marks the affected quarter", () => {
    const records = [
      nominalRecord("2005-01", { seriesName: "wrong series" }),
      nominalRecord("2005-02"),
      nominalRecord("2005-03"),
      nominalRecord("2006-01", { variant: "seasonallyAdjusted" }),
    ];
    const result = aggregateCtiBasicNominalQuarterly(records);
    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("series_mismatch");
    expect(result.measurements.get("2005Q1")).toMatchObject({
      status: "invalid",
      reason: "series_mismatch",
    });
    expect(result.measurements.get("2006Q1")?.reason).toBe("series_mismatch");
  });

  it("keeps duplicate-month failures local to their quarter while retaining valid quarters", () => {
    const records = [
      nominalRecord("2005-01"),
      nominalRecord("2005-01", { rawValue: 999 }),
      nominalRecord("2005-02"),
      nominalRecord("2005-03"),
      nominalRecord("2005-04"),
      nominalRecord("2005-05"),
      nominalRecord("2005-06"),
    ];
    const result = aggregateCtiBasicNominalQuarterly(records);
    expect(result.measurements.get("2005Q1")?.reason).toBe("duplicate");
    expect(result.measurements.get("2005Q2")).toMatchObject({
      status: "valid",
      value: 120,
    });
    expect(result.reason).toBe("duplicate");
  });

  it("gives an identity failure priority over a duplicate in the global CTI status", () => {
    const result = aggregateCtiBasicNominalQuarterly([
      nominalRecord("2005-01"),
      nominalRecord("2005-01", { rawValue: 121 }),
      nominalRecord("2006-01", { seriesIndex: 2 }),
    ]);
    expect(result.reason).toBe("series_mismatch");
    expect(result.measurements.get("2005Q1")?.reason).toBe("duplicate");
    expect(result.measurements.get("2006Q1")?.reason).toBe("series_mismatch");
  });

  it("builds a comparison series from strict moving-average windows and a complete positive base", () => {
    const history = Array.from({ length: 12 }, (_, index) =>
      nominalRecord(`2024-${String(index + 1).padStart(2, "0")}`, {
        rawValue: 120,
      }),
    );
    history[5] = nominalRecord("2024-06", { rawValue: null, isMissing: true });
    const base = Array.from({ length: 12 }, (_, index) =>
      nominalRecord(`2025-${String(index + 1).padStart(2, "0")}`, {
        rawValue: 120,
      }),
    );
    const result = buildCtiBasicConsumptionOutput([...history, ...base]);
    expect(result.valid).toBe(true);
    expect(result.baseline).toBe(120);
    expect(result.movingAverage.has("2024-12")).toBe(false);
    expect(result.movingAverage.get("2025-12")).toBe(120);
    expect(result.comparison.get("2025-12")).toBe(100);
  });

  it("fails closed for empty, incomplete, non-positive, and exceptional CTI inputs", () => {
    expect(buildCtiBasicConsumptionOutput([]).reason).toBe(
      "fixed CTI nominal consumption series is missing",
    );
    expect(buildCtiBasicConsumptionOutput([nominalRecord("2025-01")])).toMatchObject({
      valid: false,
      reason: "2025年raw基準の12か月がそろっていません",
    });
    const zeroBase = Array.from({ length: 12 }, (_, index) =>
      nominalRecord(`2025-${String(index + 1).padStart(2, "0")}`, {
        rawValue: 0,
      }),
    );
    expect(buildCtiBasicConsumptionOutput(zeroBase)).toMatchObject({
      valid: false,
      reason: "2025年raw基準が0以下です",
    });
    expect(
      buildCtiBasicConsumptionOutput([
        nominalRecord("2025-01", {
          isMissing: false,
          rawValue: Number.POSITIVE_INFINITY,
        }),
      ]).raw.size,
    ).toBe(0);
    expect(getCtiBasicConsumptionStatus()).toMatchObject({
      valid: true,
      artifactStatus: "ready",
    });
    expect(
      getCtiBasicConsumptionStatus(path.join(os.tmpdir(), "missing-cti-artifacts")),
    ).toMatchObject({
      valid: false,
      artifactRoot: null,
      artifactStatus: "unavailable",
      artifactReason: "CTI artifact set is unavailable",
    });
  });

  it("parses population years, fallback columns, valid counts, and 2020-based indexes", () => {
    const rows = [
      ["heading"],
      ["heading"],
      ["2003年", "1月", "", "", "1,000"],
      ["令和2年", "1月", "", "", "1,200"],
      ["", "2月", "", "", "1,300"],
      ["平成16年", "3月", "", "", "1,400"],
      ["平成16年", "4月", "", "", "…"],
      ["平成16年", "5月", "", "", "-"],
      ["平成16年", "6月", "", "", "unknown"],
      [],
      ["", "3月", "", "", "1,500"],
    ];
    const result = processPopulationData(rows, 0, 0, -1, 1, 4);
    expect(result.get("2020年1月")).toMatchObject({
      total: 12_000_000,
      index: 96,
      ma: 108,
    });
    expect(result.get("2020年2月")?.total).toBe(13_000_000);
    expect(result.get("2004年3月")?.index).toBeGreaterThan(0);
    expect(result.has("2003年1月")).toBe(false);
    expect(result.get("2004年3月")?.total).toBe(15_000_000);
  });

  it("leaves population levels unindexed when no 2020 observations exist", () => {
    const rows = [[], [], ["2004年", "1月", "", "", "2,000"], ["2004年", "2月", "", "", "2,100"]];
    const result = processPopulationData(rows, 0, 0, -1, 1, 4);
    expect(result.get("2004年1月")).toEqual({
      total: 20_000_000,
      index: 0,
      ma: 0,
    });

    const fallbackColumns = [
      [],
      [],
      ["2004年", "2月", "", "", undefined, "1,800"] as unknown as string[],
    ];
    const fallbackResult = processPopulationData(fallbackColumns, 0, -1, 0, -1, 4);
    expect(fallbackResult.get("2004年2月")?.total).toBe(18_000_000);
  });

  it("handles zero population baselines, unrecognized year/month cells, and showa-era years", () => {
    const rows = [
      [],
      [],
      ["2020", "1月", "", "", "0"],
      ["2020", "2月", "", "", ""],
      ["昭和59年", "3月", "", "", "1,000"],
      ["平成17年", "3月", "", "", "1,000"],
      ["number year", "bad month", "", "", "1,000"],
      [2020, "4月", "", "", "1,000"] as unknown as string[],
      ["12年", "5月", "", "", "100"],
      ["平成17年", "6月", "", "", 1_200] as unknown as string[],
    ];
    const result = processPopulationData(rows, 0, 0, -1, 1, 4);
    expect(result.get("2020年1月")).toMatchObject({ total: 0, index: 0 });
    expect(result.has("1984年3月")).toBe(false);
    expect(result.get("2005年3月")?.total).toBe(10_000_000);
    expect(result.has("2005年bad month")).toBe(false);
    expect(result.has("2005年4月")).toBe(true);
    expect(result.has("12年5月")).toBe(false);
    expect(result.has("2005年6月")).toBe(false);
  });

  it("parses a year-only era label through the population year fallback", () => {
    const result = processPopulationData(
      [[], [], ["平成17年", "7月", "", "", "2,300"]],
      0,
      0,
      -1,
      1,
      4,
    );

    expect(result.get("2005年7月")?.total).toBe(23_000_000);
  });

  it("handles wage denominator boundaries and missing numeric components", () => {
    expect(calculateAdjustedMetric(100, 0, 2)).toBeNull();
    expect(calculateAdjustedMetric(100, -1, 2)).toBeNull();
    expect(calculateAdjustedMetric(100, 4, 2)).toBe(50);
    expect(calculateRawResidual(10, Number.NaN)).toBe(0);
    expect(
      calculateSmoothedTotal(
        cpiDataRow("2025年1月", {
          所定内給与: 0,
          所定外給与: null,
          特別給与: "5",
        }),
      ),
    ).toBe(5);
  });

  it("propagates unavailable residual windows and refuses incomplete or duplicate base years", () => {
    const data: CpiData[] = [
      cpiDataRow("2005年1月", { 残差: 10 }),
      cpiDataRow("2005年2月", { 残差: Number.POSITIVE_INFINITY }),
      cpiDataRow("2005年3月", { 残差: 30 }),
      cpiDataRow("2025年1月", { 残差: 1 }),
      cpiDataRow("2025年2月", { 残差: 2 }),
    ];
    applyResidualMovingAverage(data);
    expect(data[1].残差).toBeNull();
    expect(data[2].残差).toBeNull();

    const incomplete = Array.from({ length: 12 }, (_, index) =>
      cpiDataRow(`2025年${index === 11 ? 11 : index + 1}月`, { 残差: index + 1 }),
    );
    rebaseResidualToYearAverage(incomplete, 2025);
    expect(incomplete[0].残差).toBe(1);
    const nonFinite = Array.from({ length: 12 }, (_, index) =>
      cpiDataRow(`2025年${index + 1}月`, { 残差: index === 7 ? Number.NaN : index + 1 }),
    );
    rebaseResidualToYearAverage(nonFinite, 2025);
    expect(nonFinite[0].残差).toBe(1);
    const valid = [
      ...Array.from({ length: 12 }, (_, index) =>
        cpiDataRow(`2025年${index + 1}月`, { 残差: index + 1 }),
      ),
      cpiDataRow("2026年1月", { 残差: 99 }),
    ];
    rebaseResidualToYearAverage(valid, 2025);
    expect(valid[0].残差).toBe(-5.5);
    expect(valid[12].残差).toBe(92.5);
  });

  it("keeps the first eligible residual and leaves non-numeric values untouched when rebasing", () => {
    const first = [cpiDataRow("2005年2月", { 残差: 5 })];
    applyResidualMovingAverage(first);
    expect(first[0].残差).toBe(5);

    const values = [
      ...Array.from({ length: 12 }, (_, index) =>
        cpiDataRow(`2025年${index + 1}月`, { 残差: index + 1 }),
      ),
      cpiDataRow("2026年1月", { 残差: null }),
    ];
    rebaseResidualToYearAverage(values, 2025);
    expect(values[12].残差).toBeNull();
  });
});
