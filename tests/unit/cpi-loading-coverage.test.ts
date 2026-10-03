import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { createHash } from "node:crypto";

const { selectCtiPairMock, getGdpSupportStatusMock } = vi.hoisted(() => ({
  selectCtiPairMock: vi.fn(),
  getGdpSupportStatusMock: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("../../server/lib/dataIo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/lib/dataIo")>();
  return {
    ...actual,
    buildCpiFilePaths: () => ({
      main: "/fixture/cpi_data2025_long.csv",
      contribution: "/fixture/contribution2025.csv",
      metadata: "/fixture/cpi_data2025_long.metadata.json",
    }),
  };
});

vi.mock("../../server/lib/data-loader/ctiValidation", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../server/lib/data-loader/ctiValidation")>();
  return { ...actual, selectCtiPair: selectCtiPairMock };
});

vi.mock("../../server/lib/data-loader/gdpSupport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/lib/data-loader/gdpSupport")>();
  return { ...actual, getGdpSupportStatus: getGdpSupportStatusMock };
});

function build2025PairFixture(
  overrides: { csv?: string; metadata?: Record<string, unknown> } = {},
) {
  const series = ["総合", ...Array.from({ length: 77 }, (_, index) => `系列${index + 1}`)];
  const rows = ["年月," + series.join(",")];
  for (let offset = 0; offset < 679; offset += 1) {
    const date = new Date(Date.UTC(1970, offset, 1));
    const month = `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月`;
    const values = series.map(() => "100");
    rows.push(`${month},${values.join(",")}`);
  }
  const csv = overrides.csv ?? rows.join("\n");
  const metadata = {
    status: "ready",
    baseYear: 2025,
    indexFile: "cpi_data2025_long.csv",
    contributionFile: "contribution2025.csv",
    csvSha256: createHash("sha256").update(csv).digest("hex"),
    period: { start: "1970年1月", end: "2026年7月", monthlyRows: 679 },
    seriesCount: 78,
    ...overrides.metadata,
  };
  return {
    csv,
    contribution: `類・品目,${series.join(",")}\nウエイト(2025年指数以降),10000,${series
      .slice(1)
      .map(() => "100")
      .join(",")}`,
    metadata: JSON.stringify(metadata),
  };
}

async function configureCti2025Fixture(options: {
  cti?: string;
  metadata?: Record<string, unknown> | string;
  nominal?: string;
  real?: string;
  normalizationFactors?: { nominal: number; real: number };
}) {
  const pair = {
    baseYear: 2025 as const,
    pair: "2025" as const,
    mainPath: "/fixture/cti2025.csv",
    supportNominalPath: "/fixture/unused-nominal.csv",
    supportRealPath: "/fixture/unused-real.csv",
  };
  selectCtiPairMock.mockReturnValue({ pair });
  getGdpSupportStatusMock.mockResolvedValue(
    options.normalizationFactors
      ? { valid: true, normalizationFactors: options.normalizationFactors }
      : { valid: false },
  );
  const { buildCtiFilePaths } = await import("../../server/lib/dataIo");
  const paths = buildCtiFilePaths();
  vi.mocked(fs.existsSync).mockImplementation((filePath) => String(filePath) === paths.metadata);
  vi.mocked(fs.readFileSync).mockImplementation(((filePath: fs.PathOrFileDescriptor) => {
    const path = String(filePath);
    if (path === pair.mainPath) return options.cti ?? "月,消費支出（名目）\n2025年1月,100";
    if (path === paths.metadata)
      return typeof options.metadata === "string"
        ? options.metadata
        : JSON.stringify(options.metadata ?? {});
    if (path === paths.candidateSupportNominal) return options.nominal ?? "";
    if (path === paths.candidateSupportReal) return options.real ?? "";
    return "";
  }) as typeof fs.readFileSync);
  return pair;
}

describe("CPI loading public contract edge coverage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    selectCtiPairMock.mockReset();
    getGdpSupportStatusMock.mockReset().mockResolvedValue({ valid: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed and keeps public outputs empty when 2025 metadata is invalid", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(((filePath: fs.PathOrFileDescriptor) => {
      const path = String(filePath);
      if (path.endsWith("cpi_data2025_long.csv"))
        return "年月,総合,食料\n2025年1月,100,110\n2025年2月,101,111";
      if (path.endsWith("contribution2025.csv"))
        return "類・品目,総合,食料\nウエイト(2025年指数以降),10000,2000";
      if (path.endsWith("cpi_data2025_long.metadata.json")) return "invalid metadata";
      return "";
    }) as typeof fs.readFileSync);

    const { getCpiDataStatus, loadCpiDataInternal, loadCpiIndexDataInternal } =
      await import("../../server/lib/data-loader/cpi");
    const [data, status, rawIndex] = await Promise.all([
      loadCpiDataInternal(),
      getCpiDataStatus(),
      loadCpiIndexDataInternal(),
    ]);

    expect(status).toEqual({
      baseYear: null,
      pair: null,
      valid: false,
      reason: "cpi_metadata_invalid",
    });
    expect(data).toEqual([]);
    expect(rawIndex).toEqual([]);
  });

  it("returns the invalid status and empty public data when required CPI files are absent", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { getCpiDataStatus, loadCpiDataInternal, loadCpiIndexDataInternal } =
      await import("../../server/lib/data-loader/cpi");
    const [status, data, rawIndex] = await Promise.all([
      getCpiDataStatus(),
      loadCpiDataInternal(),
      loadCpiIndexDataInternal(),
    ]);

    expect(status).toMatchObject({ baseYear: null, pair: null, valid: false });
    expect(status.reason).toBe("cpi_source_missing");
    expect(data).toEqual([]);
    expect(rawIndex).toEqual([]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("CPI data unavailable:"));
  });

  it("forwards the quarterly GDP validation result through the CPI module export", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const { validateQuarterlyGdpSupport, getQuarterlyGdpSupportStatus, loadQuarterlyGdpData } =
      await import("../../server/lib/data-loader/cpi");

    const validated = validateQuarterlyGdpSupport();
    expect(validated).toMatchObject({ valid: false });
    await expect(getQuarterlyGdpSupportStatus()).resolves.toEqual(validated);
    expect(loadQuarterlyGdpData()).toEqual({ rows: [], comparisonReady: false });
  });

  it("returns valid and invalid CTI source status from the public loader", async () => {
    const { getCtiDataStatus } = await import("../../server/lib/data-loader/cpi");
    const validPair = {
      baseYear: 2025 as const,
      pair: "2025" as const,
      mainPath: "/fixture/cti2025.csv",
      supportNominalPath: "/fixture/unused-nominal.csv",
      supportRealPath: "/fixture/unused-real.csv",
    };
    selectCtiPairMock.mockReturnValue({ pair: validPair });

    await expect(getCtiDataStatus()).resolves.toEqual({
      baseYear: 2025,
      pair: "2025",
      valid: true,
    });

    const invalidStatus = { baseYear: null, pair: null, valid: false, reason: "no pair" };
    selectCtiPairMock.mockReturnValue(invalidStatus);
    await expect(getCtiDataStatus({ source: "auto" })).resolves.toEqual(invalidStatus);
    expect(selectCtiPairMock).toHaveBeenLastCalledWith({ source: "auto" });
  });

  it("returns validated 2025 CPI index rows from 2004 onward", async () => {
    const fixture = build2025PairFixture();
    const { buildCpiFilePaths } = await import("../../server/lib/dataIo");
    const paths = buildCpiFilePaths();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(((filePath: fs.PathOrFileDescriptor) => {
      const path = String(filePath);
      if (path === paths.main) return fixture.csv;
      if (path === paths.contribution) return fixture.contribution;
      if (path === paths.metadata) return fixture.metadata;
      return "";
    }) as typeof fs.readFileSync);
    const { loadCpiIndexDataInternal } = await import("../../server/lib/data-loader/cpi");

    const rows = await loadCpiIndexDataInternal();

    expect(rows[0]?.年月).toBe("2004年1月");
    expect(rows.at(-1)?.年月).toBe("2026年7月");
    expect(rows).toHaveLength(271);
  });

  it("skips a missing CTI value cell in a short CSV row", async () => {
    await configureCti2025Fixture({ cti: "月,消費支出（名目）\n2025年1月" });
    const { loadCtiDataInternal } = await import("../../server/lib/data-loader/cpi");

    const rows = await loadCtiDataInternal();
    const january = rows.find((row) => row.年月 === "2025年1月");

    expect(january).toBeDefined();
    expect(january?.["消費支出（名目）"]).toBeUndefined();
  });

  it("preserves an alternate 年月 header without a 月 header", async () => {
    await configureCti2025Fixture({ cti: "年月,消費支出（名目）\n2025年1月,100" });
    const { loadCtiDataInternal } = await import("../../server/lib/data-loader/cpi");

    const rows = await loadCtiDataInternal();

    expect(rows.find((row) => row.年月 === "2025年1月")).toMatchObject({
      年月: "2025年1月",
      "消費支出（名目）": 100,
    });
  });

  it("drops CTI rows with no 年月 value", async () => {
    await configureCti2025Fixture({ cti: "月別,消費支出（名目）\n2025年1月,100" });
    const { loadCtiDataInternal } = await import("../../server/lib/data-loader/cpi");

    const rows = await loadCtiDataInternal();

    expect(rows.some((row) => row["消費支出（名目）"] === 100)).toBe(false);
    expect(rows.every((row) => Boolean(row.年月))).toBe(true);
  });

  it("rejects contribution files without the required aggregate series", async () => {
    const { validateContribution } = await import("../../server/lib/data-loader/cpiSource");

    expect(validateContribution("類・品目,食料\nウエイト,2000")).toBe(
      "missing required contribution header: 総合",
    );
  });

  it("rejects a CPI pair when only the contribution file is missing", async () => {
    vi.mocked(fs.existsSync).mockImplementation((filePath) => String(filePath) === "index.csv");
    vi.mocked(fs.readFileSync).mockReturnValue("類・品目,総合\nウエイト,10000" as never);
    const { validateCpiFiles } = await import("../../server/lib/data-loader/cpiValidation");

    expect(
      validateCpiFiles({
        baseYear: 2025,
        pair: "2025",
        mainPath: "index.csv",
        contributionPath: "contribution.csv",
      }),
    ).toBe("missing index or contribution file");
  });

  it("continues past malformed month rows when a later valid month exists", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(((filePath: fs.PathOrFileDescriptor) =>
      String(filePath) === "contribution.csv"
        ? "類・品目,総合\nウエイト,10000"
        : "年月,総合\nnot-a-month,100\n2004年1月,100") as typeof fs.readFileSync);
    const { validateCpiFiles } = await import("../../server/lib/data-loader/cpiValidation");

    expect(
      validateCpiFiles({
        baseYear: 2025,
        pair: "2025",
        mainPath: "index.csv",
        contributionPath: "contribution.csv",
      }),
    ).toMatchObject({ data: [{ 年月: "not-a-month" }, { 年月: "2004年1月" }] });
  });

  it("reports a missing date header for an empty index file", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(((filePath: fs.PathOrFileDescriptor) =>
      String(filePath) === "contribution.csv"
        ? "類・品目,総合\nウエイト,10000"
        : "") as typeof fs.readFileSync);
    const { validateCpiFiles } = await import("../../server/lib/data-loader/cpiValidation");

    expect(
      validateCpiFiles({
        baseYear: 2025,
        pair: "2025",
        mainPath: "index.csv",
        contributionPath: "contribution.csv",
      }),
    ).toBe("missing required index header: 年月");
  });

  it.each([
    ["status", { status: "pending" }, "2025 metadata is not ready"],
    ["base year", { baseYear: 2020 }, "2025 metadata baseYear mismatch"],
    ["index filename", { indexFile: "other.csv" }, "2025 metadata indexFile mismatch"],
    [
      "contribution filename",
      { contributionFile: "other.csv" },
      "2025 metadata contributionFile mismatch",
    ],
    [
      "monthly count",
      { period: { start: "1970年1月", end: "2026年7月", monthlyRows: 678 } },
      "2025 metadata monthlyRows mismatch",
    ],
    [
      "period start",
      { period: { start: "1970年2月", end: "2026年7月", monthlyRows: 679 } },
      "2025 metadata period mismatch",
    ],
    [
      "period end",
      { period: { start: "1970年1月", end: "2026年6月", monthlyRows: 679 } },
      "2025 metadata period mismatch",
    ],
    ["series count", { seriesCount: 77 }, "2025 metadata seriesCount mismatch"],
    ["hash format", { csvSha256: "not-a-sha256" }, "2025 metadata CSV SHA-256 mismatch"],
  ])("rejects metadata with an incorrect %s", async (_label, override, expected) => {
    const validMetadata = {
      status: "ready",
      baseYear: 2025,
      indexFile: "cpi_data2025_long.csv",
      contributionFile: "contribution2025.csv",
      csvSha256: "a".repeat(64),
      period: { start: "1970年1月", end: "2026年7月", monthlyRows: 679 },
      seriesCount: 78,
      ...override,
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validMetadata) as never);
    const { validate2025Metadata } = await import("../../server/lib/data-loader/cpiSource");

    expect(validate2025Metadata("metadata.json")).toBe(expected);
  });

  it("rejects duplicate index series in the validated source pair", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(((filePath: fs.PathOrFileDescriptor) =>
      String(filePath) === "contribution.csv"
        ? "類・品目,総合\nウエイト,10000"
        : "年月,総合, 総合\n2004年1月,100,100") as typeof fs.readFileSync);
    const { validateCpiFiles } = await import("../../server/lib/data-loader/cpiValidation");

    expect(
      validateCpiFiles({
        baseYear: 2025,
        pair: "2025",
        mainPath: "index.csv",
        contributionPath: "contribution.csv",
      }),
    ).toBe("duplicate index headers");
  });

  it("filters rows with missing or malformed months and ignores unweighted non-finite CPI values", async () => {
    const { transformCpiData, getCpiMajorWeightTotal } =
      await import("../../server/lib/data-loader/cpiLoader");
    const result = transformCpiData({
      weights: { 総合: 10_000, 食料: 2_000 },
      data: [
        { 総合: 100 },
        { 年月: "not-a-month", 総合: 100 },
        { 年月: "2004年1月", 総合: 100, 食料: Number.NaN },
      ] as never,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ 年月: "2004年1月", 総合: 100, 食料: undefined });
    expect(getCpiMajorWeightTotal({ 食料: Number.MAX_VALUE })).toBe(10_000);
  });

  it.each([
    [
      "row count",
      (csv: string) => csv.slice(0, csv.lastIndexOf("\n")),
      "2025 CSV monthly row count mismatch",
    ],
    [
      "header count",
      (csv: string) => {
        const [header, ...rows] = csv.split("\n");
        return `${header},extra\n${rows.map((row) => `${row},1`).join("\n")}`;
      },
      "2025 CSV series count mismatch",
    ],
    ["period", (csv: string) => csv.replace("1970年1月", "1970年2月"), "2025 CSV period mismatch"],
    [
      "duplicate month",
      (csv: string) => csv.replace("1970年2月", "1970年1月"),
      "2025 CSV contains duplicate months",
    ],
    [
      "continuity",
      (csv: string) =>
        csv
          .replace("1970年2月", "1970年2月__TEMP__")
          .replace("1970年3月", "1970年2月")
          .replace("1970年2月__TEMP__", "1970年3月"),
      "2025 CSV monthly series is not continuous",
    ],
    [
      "base-year average",
      (csv: string) =>
        csv.replace(/(2025年\d+月,)100(?=,)/g, (_match, month: string) => `${month}101`),
      "2025 CSV general-index average mismatch",
    ],
  ])("rejects a 2025 CPI pair with invalid %s", async (_name, alterCsv, expected) => {
    const baseFixture = build2025PairFixture();
    const csv = alterCsv(baseFixture.csv);
    const fixture = build2025PairFixture({ csv });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(((filePath: fs.PathOrFileDescriptor) => {
      const path = String(filePath);
      if (path.endsWith("contribution2025.csv")) return fixture.contribution;
      if (path.endsWith("cpi_data2025_long.metadata.json")) return fixture.metadata;
      return fixture.csv;
    }) as typeof fs.readFileSync);
    const { validateCpiPair, buildCpiSourceCandidates } =
      await import("../../server/lib/data-loader/cpiSource");
    const { pairs, metadata } = buildCpiSourceCandidates();

    expect(validateCpiPair(pairs[0], metadata)).toBe(expected);
  });

  it("rejects metadata whose referenced filenames do not match the selected pair", async () => {
    const fixture = build2025PairFixture();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(((filePath: fs.PathOrFileDescriptor) => {
      const path = String(filePath);
      if (path.endsWith("contribution2025.csv")) return fixture.contribution;
      if (path.endsWith("cpi_data2025_long.metadata.json")) return fixture.metadata;
      return fixture.csv;
    }) as typeof fs.readFileSync);
    const { validateCpiPair, buildCpiSourceCandidates } =
      await import("../../server/lib/data-loader/cpiSource");
    const { pairs, metadata } = buildCpiSourceCandidates();

    expect(validateCpiPair({ ...pairs[0], mainPath: "/fixture/renamed.csv" }, metadata)).toBe(
      "2025 metadata file pairing mismatch",
    );
  });

  it("drops malformed values and keeps row without them when values are malformed", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const pair = {
      baseYear: 2025 as const,
      pair: "2025" as const,
      mainPath: "/fixture/cti.csv",
      supportNominalPath: "/fixture/nominal.csv",
      supportRealPath: "/fixture/real.csv",
    };
    selectCtiPairMock.mockReturnValue({ pair });
    vi.mocked(fs.readFileSync).mockImplementation(((filePath: fs.PathOrFileDescriptor) =>
      String(filePath) === pair.mainPath
        ? "月,消費支出（名目）,食料（名目）\nnot-a-month,1,1\n2004年1月,invalid,invalid"
        : "no support header") as typeof fs.readFileSync);
    const { loadCtiDataInternal } = await import("../../server/lib/data-loader/cpi");

    const data = await loadCtiDataInternal();

    const row = data.find((r) => r.年月 === "2004年1月");
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("消費支出（名目）");
    expect(row).not.toHaveProperty("食料（名目）");
    expect(data.some((row) => row.年月 === "not-a-month")).toBe(false);
  });

  it("returns no CTI rows when the index has no recognizable header", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    selectCtiPairMock.mockReturnValue({
      pair: {
        baseYear: 2025,
        pair: "2025",
        mainPath: "/fixture/cti.csv",
        supportNominalPath: "/fixture/nominal.csv",
        supportRealPath: "/fixture/real.csv",
      },
    });
    vi.mocked(fs.readFileSync).mockReturnValue("unrecognized header\n2004年1月,100" as never);
    const { loadCtiDataInternal } = await import("../../server/lib/data-loader/cpi");

    await expect(loadCtiDataInternal()).resolves.toEqual([]);
  });

  it("keeps CTI data when optional 2025 runtime metadata is malformed", async () => {
    const pair = {
      baseYear: 2025 as const,
      pair: "2025" as const,
      mainPath: "/fixture/cti2025.csv",
      supportNominalPath: "/fixture/unused-nominal.csv",
      supportRealPath: "/fixture/unused-real.csv",
    };
    selectCtiPairMock.mockReturnValue({ pair });
    const { buildCtiFilePaths } = await import("../../server/lib/dataIo");
    const paths = buildCtiFilePaths();
    vi.mocked(fs.existsSync).mockImplementation((filePath) => String(filePath) === paths.metadata);
    vi.mocked(fs.readFileSync).mockImplementation(((filePath: fs.PathOrFileDescriptor) =>
      String(filePath) === pair.mainPath
        ? "月,消費支出（名目）\n2025年1月,100"
        : "invalid metadata") as typeof fs.readFileSync);
    const { loadCtiDataInternal } = await import("../../server/lib/data-loader/cpi");

    const data = await loadCtiDataInternal();

    expect(data).toContainEqual(expect.objectContaining({ 年月: "2025年1月" }));
    expect(data.ctiMetadata).toBeUndefined();
  });

  it("applies matched annual GDP values and projects complete CTI source metadata", async () => {
    await configureCti2025Fixture({
      cti: "月,消費支出（名目）\n2024年1月,10\n2025年1月,11",
      nominal: "補助,時間軸（暦年）,民間最終消費支出\nx\n,x,\nx,2024,100\nx,2025,200",
      real: "補助,時間軸（暦年）,民間最終消費支出\nx,2024,50\nx,2025",
      normalizationFactors: { nominal: 2, real: 3 },
      metadata: {
        statInfId: "0000000000",
        householdScope: "二人以上の世帯",
        unit: "指数",
        frequency: "monthly",
        sourceFile: "cti_data2025.csv",
        valueType: "index",
        period: { start: "1970年1月", end: "2026年7月" },
      },
    });
    const { loadCtiDataInternal } = await import("../../server/lib/data-loader/cpi");

    const data = await loadCtiDataInternal();
    const row2024 = data.find((row) => row.年月 === "2024年1月");

    expect(row2024).toMatchObject({
      "民間最終消費支出（名目・原値）": 100,
      "民間最終消費支出（実質・原値）": 50,
      "民間最終消費支出（名目）": 200,
      "民間最終消費支出（実質）": 150,
    });
    expect(data.ctiMetadata).toMatchObject({
      statInfId: "0000000000",
      householdScope: "二人以上の世帯",
      unit: "指数",
      frequency: "monthly",
      sourceFile: "cti_data2025.csv",
      valueType: "index",
      rawRange: { startYear: 1970, endYear: 2026 },
      adoptedRange: { startYear: 1970, endYear: 2026 },
    });
  });

  it("uses valueType as the runtime unit and tolerates an empty annual GDP file", async () => {
    await configureCti2025Fixture({
      nominal: "",
      real: "時間軸（暦年）,民間最終消費支出\n2024,50",
      normalizationFactors: { nominal: 1, real: 1 },
      metadata: {
        unit: 12,
        valueType: "指数",
        period: { start: "1970年1月", end: "not-a-year" },
      },
    });
    const { loadCtiDataInternal } = await import("../../server/lib/data-loader/cpi");

    const data = await loadCtiDataInternal();

    expect(data.ctiMetadata).toMatchObject({ unit: "指数", valueType: "指数" });
    expect(data.ctiMetadata?.rawRange).toBeUndefined();
    expect(data.find((row) => row.年月 === "2025年1月")).not.toHaveProperty(
      "民間最終消費支出（名目・原値）",
    );
  });

  it("defaults absent optional CTI metadata fields and ranges", async () => {
    await configureCti2025Fixture({ metadata: { period: {} } });
    const { loadCtiDataInternal } = await import("../../server/lib/data-loader/cpi");

    const data = await loadCtiDataInternal();

    expect(data.ctiMetadata).toMatchObject({
      statInfId: "",
      householdScope: "",
      unit: undefined,
      frequency: undefined,
      sourceFile: undefined,
      valueType: undefined,
    });
    expect(data.ctiMetadata?.rawRange).toBeUndefined();
    expect(data.ctiMetadata?.adoptedRange).toBeUndefined();
  });

  it("derives nominal and real residual categories from complete 2025 CTI totals", async () => {
    const categories = [
      "食料",
      "住居",
      "光熱・水道",
      "家具・家事用品",
      "被服及び履物",
      "保健医療",
      "交通・通信",
      "教育",
      "教養娯楽",
    ];
    const fields = [
      "月",
      "消費支出（名目）",
      ...categories.map((name) => `${name}（名目）`),
      "消費支出（実質）",
      ...categories.map((name) => `${name}（実質）`),
    ];
    await configureCti2025Fixture({
      cti: `${fields.join(",")}\n2025年1月,100,${categories.map(() => 10).join(",")},200,${categories.map(() => 20).join(",")}`,
    });
    const { loadCtiDataInternal } = await import("../../server/lib/data-loader/cpi");

    const data = await loadCtiDataInternal();

    expect(data.find((row) => row.年月 === "2025年1月")).toMatchObject({
      "その他の消費支出（名目）": 10,
      "その他の消費支出（実質）": 20,
    });
  });
});
