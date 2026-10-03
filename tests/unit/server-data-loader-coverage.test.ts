import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { parseCsvFileMock, processPopulationDataMock, buildCtiFilePathsMock } = vi.hoisted(() => ({
  parseCsvFileMock: vi.fn(),
  processPopulationDataMock: vi.fn(),
  buildCtiFilePathsMock: vi.fn(),
}));
const { existsSyncMock, readFileSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  existsSyncMock.mockImplementation(actual.existsSync);
  readFileSyncMock.mockImplementation(actual.readFileSync);
  const defaultFs = {
    ...actual,
    existsSync: existsSyncMock,
    readFileSync: readFileSyncMock,
  };
  return {
    ...actual,
    existsSync: existsSyncMock,
    readFileSync: readFileSyncMock,
    default: defaultFs,
  };
});

vi.mock("../../server/lib/dataIo", () => ({
  buildPopulationFilePath: () => "/population.csv",
  buildCtiFilePaths: buildCtiFilePathsMock,
  parseCsvFile: parseCsvFileMock,
}));

vi.mock("../../server/lib/dataProcessor", () => ({
  processPopulationData: processPopulationDataMock,
}));

import { loadPopulationDataInternal } from "../../server/lib/data-loader/population";
import {
  loadCtiAdjustedConnectionEstimate,
  loadCtiAdjustedInputs,
  loadCtiAdjustedV2Estimate,
} from "../../server/lib/data-loader/ctiAdjusted";
import { validateGdpSupport } from "../../server/lib/data-loader/gdpSupport";
import {
  isContinuousMonths,
  selectCtiPair,
  validateCtiPair,
  type CtiPair,
} from "../../server/lib/data-loader/ctiValidation";
import {
  validateQuarterlyGdpSupport,
  loadQuarterlyGdpData,
} from "../../server/lib/data-loader/gdpSupport";

type GdpPaths = {
  candidateSupportNominal: string;
  candidateSupportReal: string;
  supportNominalMetadata: string;
  supportRealMetadata: string;
  gdpDisplayNormalization: string;
  quarterlySupportNominal: string;
  quarterlySupportNominalMetadata: string;
  quarterlyOfficialNominal: string;
  quarterlyEstatNominal: string;
  quarterlySupportReal: string;
  quarterlySupportRealMetadata: string;
  quarterlyOfficialReal: string;
  quarterlyEstatReal: string;
};

const quarterlyRowsFor = (
  priceMeasure: "current-prices" | "previous-year-chain-linked",
  value: number,
  periodOffset = 0,
) =>
  [
    "period,value,series,priceMeasure",
    ...Array.from({ length: 84 }, (_, index) => {
      const absoluteQuarter = index + periodOffset;
      const year = 2005 + Math.floor(absoluteQuarter / 4);
      const quarter = (absoluteQuarter % 4) + 1;
      return `${year}-Q${quarter},${value},private-final-consumption-expenditure,${priceMeasure}`;
    }),
  ].join("\n");

function writeGdpFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "gdp-support-contract-"));
  const paths: GdpPaths = {
    candidateSupportNominal: path.join(root, "nominal.csv"),
    candidateSupportReal: path.join(root, "real.csv"),
    supportNominalMetadata: path.join(root, "nominal.metadata.json"),
    supportRealMetadata: path.join(root, "real.metadata.json"),
    gdpDisplayNormalization: path.join(root, "normalization.json"),
    quarterlySupportNominal: path.join(root, "quarterly-nominal.csv"),
    quarterlySupportNominalMetadata: path.join(root, "quarterly-nominal.metadata.json"),
    quarterlyOfficialNominal: path.join(root, "quarterly-nominal-official.csv"),
    quarterlyEstatNominal: path.join(root, "quarterly-nominal-estat.csv"),
    quarterlySupportReal: path.join(root, "quarterly-real.csv"),
    quarterlySupportRealMetadata: path.join(root, "quarterly-real.metadata.json"),
    quarterlyOfficialReal: path.join(root, "quarterly-real-official.csv"),
    quarterlyEstatReal: path.join(root, "quarterly-real-estat.csv"),
  };
  const csvFor = (value = 100) =>
    [
      "時間軸（暦年）,民間最終消費支出",
      ...Array.from({ length: 32 }, (_, index) => `${1994 + index},${value}`),
    ].join("\n");
  const nominal = csvFor();
  const real = csvFor(80);
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  writeFileSync(paths.candidateSupportNominal, nominal);
  writeFileSync(paths.candidateSupportReal, real);
  const metadataFor = (
    content: string,
    measure: "current-prices" | "previous-year-chain-linked",
  ) => ({
    status: "ready",
    seriesConcept: "private-final-consumption-expenditure",
    seriesCode: "12",
    seriesName: "民間最終消費支出",
    priceMeasure: measure,
    displayNormalizationYear: 2025,
    unit: "10億円",
    rawValuePreserved: true,
    csvSha256: hash(content),
    sourceFrequency: "annual",
    period: { start: "1994", end: "2025", annualRows: 32 },
  });
  writeJson(paths.supportNominalMetadata, metadataFor(nominal, "current-prices"));
  writeJson(paths.supportRealMetadata, metadataFor(real, "previous-year-chain-linked"));
  writeJson(paths.gdpDisplayNormalization, {
    displayNormalizationYear: 2025,
    nominal: { csv: path.basename(paths.candidateSupportNominal), csvSha256: hash(nominal) },
    real: { csv: path.basename(paths.candidateSupportReal), csvSha256: hash(real) },
    factors: { nominal: 1, real: 1.25 },
  });
  const writeQuarterly = (
    measure: "current-prices" | "previous-year-chain-linked",
    id: string,
    key: "Nominal" | "Real",
    value: number,
  ) => {
    const csv = quarterlyRowsFor(measure, value);
    const csvSha256 = hash(csv);
    const support = paths[`quarterlySupport${key}`];
    const official = paths[`quarterlyOfficial${key}`];
    const estat = paths[`quarterlyEstat${key}`];
    const metaPath = paths[`quarterlySupport${key}Metadata`];
    writeFileSync(support, csv);
    writeFileSync(official, csv);
    writeFileSync(estat, csv);
    writeJson(metaPath, {
      frequency: "quarterly",
      period: { start: "2005-Q1", end: "2025-Q4", rows: 84 },
      csvSha256,
      status: "ready",
      seriesConcept: "private-final-consumption-expenditure",
      priceMeasure: measure,
      unit: "billion-yen",
      seasonalAdjustment: "original",
      independentConfirmation: "ready",
      estatSource: {
        provider: "e-Stat",
        statsDataId: id,
        seriesCode: "fixture-series",
        seriesName: "private final consumption expenditure",
        unit: "billion-yen",
        retrievedAt: "2026-01-01",
        jsonSha256: "a".repeat(64),
        comparison: { status: "ready", rowsCompared: 84, mismatches: 0 },
        snapshotFile: path.basename(estat),
        snapshotCsvSha256: hash(csv),
      },
    });
  };
  writeQuarterly("current-prices", "0003113633", "Nominal", 100);
  writeQuarterly("previous-year-chain-linked", "0003113612", "Real", 80);
  buildCtiFilePathsMock.mockReturnValue(paths);
  return { paths, nominal, real };
}

function replaceGdpNominalCsv(paths: GdpPaths, csv: string): void {
  writeFileSync(paths.candidateSupportNominal, csv);
  const csvSha256 = createHash("sha256").update(csv).digest("hex");
  const metadata = JSON.parse(readFileSync(paths.supportNominalMetadata, "utf8"));
  writeJson(paths.supportNominalMetadata, { ...metadata, csvSha256 });
  const normalization = JSON.parse(readFileSync(paths.gdpDisplayNormalization, "utf8"));
  writeJson(paths.gdpDisplayNormalization, {
    ...normalization,
    nominal: { ...normalization.nominal, csvSha256 },
  });
}

function replaceGdpRealCsv(paths: GdpPaths, csv: string): void {
  writeFileSync(paths.candidateSupportReal, csv);
  const csvSha256 = createHash("sha256").update(csv).digest("hex");
  const metadata = JSON.parse(readFileSync(paths.supportRealMetadata, "utf8"));
  writeJson(paths.supportRealMetadata, { ...metadata, csvSha256 });
  const normalization = JSON.parse(readFileSync(paths.gdpDisplayNormalization, "utf8"));
  writeJson(paths.gdpDisplayNormalization, {
    ...normalization,
    real: { ...normalization.real, csvSha256 },
  });
}

function replaceQuarterlySupportCsv(
  paths: GdpPaths,
  measure: "current-prices" | "previous-year-chain-linked",
  csv: string,
): void {
  const kind = measure === "current-prices" ? "Nominal" : "Real";
  const support = paths[`quarterlySupport${kind}`];
  const official = paths[`quarterlyOfficial${kind}`];
  const estat = paths[`quarterlyEstat${kind}`];
  const metadataPath = paths[`quarterlySupport${kind}Metadata`];
  writeFileSync(support, csv);
  writeFileSync(official, csv);
  writeFileSync(estat, csv);
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  const csvSha256 = createHash("sha256").update(csv).digest("hex");
  writeJson(metadataPath, {
    ...metadata,
    csvSha256,
    estatSource: {
      ...metadata.estatSource,
      snapshotCsvSha256: csvSha256,
    },
  });
}

function writeJson(file: string, value: unknown): Buffer {
  const bytes = Buffer.from(JSON.stringify(value));
  writeFileSync(file, bytes);
  return bytes;
}

function write2025CtiValidationFixture(mainCsv: string) {
  const root = mkdtempSync(path.join(tmpdir(), "cti-2025-pair-"));
  const paths = {
    seriesMap: path.join(root, "series-map.csv"),
    officialSnapshot: path.join(root, "official.csv"),
    metadata: path.join(root, "main.metadata.json"),
    candidateDistributionAdjusted: path.join(root, "adjusted.csv"),
    candidateDistributionAdjustedMetadata: path.join(root, "adjusted.metadata.json"),
    candidateDistributionAdjustedQuarterly: path.join(root, "quarterly.csv"),
    candidateDistributionAdjustedQuarterlyMetadata: path.join(root, "quarterly.metadata.json"),
  };
  const pair: CtiPair = {
    baseYear: 2025,
    pair: "2025",
    mainPath: path.join(root, "main.csv"),
    supportNominalPath: "unused-nominal.csv",
    supportRealPath: "unused-real.csv",
  };
  writeFileSync(pair.mainPath, mainCsv);
  for (const file of Object.values(paths)) writeFileSync(file, "placeholder");
  buildCtiFilePathsMock.mockReturnValue(paths);
  return { pair, paths };
}

const valid2025MainCsv = [
  "年月,消費支出（名目）,消費支出（実質）",
  ...Array.from({ length: 12 }, (_, index) => `2025年${index + 1}月,100,99`),
].join("\n");

function withFileReadOverrides<T>(overrides: Map<string, string | Buffer>, callback: () => T): T {
  const originalRead = readFileSyncMock.getMockImplementation()!;
  readFileSyncMock.mockImplementation((file, options) => {
    const content = overrides.get(String(file));
    if (content !== undefined) {
      if (options === "utf8") return Buffer.isBuffer(content) ? content.toString("utf8") : content;
      return Buffer.isBuffer(content) ? content : Buffer.from(content);
    }
    return originalRead(file, options);
  });
  try {
    return callback();
  } finally {
    readFileSyncMock.mockImplementation(originalRead);
  }
}

function writeCompleteCtiAdjustedFixture() {
  const parent = mkdtempSync(path.join(tmpdir(), "cti-adjusted-household-"));
  const root = path.join(parent, "data", "source", "cti-adjusted");
  const compositionDir = path.join(parent, "data", "source", "cti-size-composition");
  mkdirSync(root, { recursive: true });
  mkdirSync(compositionDir, { recursive: true });

  const artifacts: Record<string, unknown> = {};
  for (const kind of ["B", "A", "L"] as const) {
    const bytes = writeJson(path.join(root, `${kind}.json`), {
      metadata: {
        schemaVersion: "plan39-annual-v1",
        revision: "fixture-r1",
        statisticalCode: "00200567",
        statInfId: "fixture-stat-id",
        sourceUrl: "https://example.test/cti-adjusted",
        downloadUrl: "https://example.test/cti-adjusted",
        source: "coverage fixture",
        artifact: `${kind}.json`,
        retrievedAt: "2026-01-01",
        baseYear: 2025,
        unit: "指数",
        valueType: "原数値（名目指数）",
        householdScope: "総世帯",
        frequency: "annual",
        rawRange: { startYear: 2020, endYear: 2020 },
        adoptedRange: { startYear: 2020, endYear: 2020 },
        missingRepresentation: "null",
        sha256: createHash("sha256").update(`fixture source ${kind}`).digest("hex"),
      },
      categoryOrder: ["総合", "食料"],
      rows: [{ year: 2020, values: { 総合: 100, 食料: 101 } }],
    });
    artifacts[kind] = {
      path: `${kind}.json`,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      statInfId: "fixture-stat-id",
      sourceUrl: "https://example.test/cti-adjusted",
      schemaVersion: "plan39-annual-v1",
      revision: "fixture-r1",
    };
  }
  writeJson(path.join(root, "manifest.json"), {
    schemaVersion: "plan39-annual-v1",
    revision: "fixture-r1",
    statisticalCode: "00200567",
    artifacts,
  });
  writeJson(path.join(root, "audit.json"), { reviewed: true });

  const inputs: Record<string, { path: string; sha256: string }> = {};
  for (const name of ["januaryShares", "januaryTrace", "weights", "weightsManifest"]) {
    const relative = `data/source/cti-size-composition/${name}.fixture`;
    const bytes = Buffer.from(`${name} fixture`);
    const file = path.join(parent, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    inputs[name] = { path: relative, sha256: createHash("sha256").update(bytes).digest("hex") };
  }
  const sourceRawFiles: Record<string, { path: string; sha256: string }> = {};
  for (let year = 2017; year <= 2025; year++) {
    const relative = `data/source/cti-size-composition/raw/${year}.fixture`;
    const bytes = Buffer.from(`raw source ${year}`);
    const file = path.join(parent, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    sourceRawFiles[String(year)] = {
      path: relative,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }
  const historicalPi2Plus = Object.fromEntries(
    Array.from({ length: 13 }, (_, index) => [String(2005 + index), 0.7]),
  );
  const historicalPiStatusByYear = Object.fromEntries(
    Array.from({ length: 13 }, (_, index) => {
      const year = 2005 + index;
      const synthetic = year === 2011;
      return [
        String(year),
        {
          status: synthetic
            ? "synthetic_interpolation_unverified"
            : "published_annual_unverified_vintage",
          synthetic,
          benchmarkId: `fixture-${year}`,
          connectionStatus: "unverified_connected_series",
          interpolationMethod: synthetic ? "linear_share_interpolation" : null,
        },
      ];
    }),
  );
  const calibrationPi2Plus = Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => [String(2017 + index), 0.7]),
  );
  const artifact = {
    schemaVersion: "plan39-production-pi2plus-v1",
    modelStatus: "provisional_source_bridged_by_2017_centering",
    historicalPi2Plus,
    historicalPiStatusByYear,
    calibrationPi2Plus,
    caveats: ["fixture for verified source metadata behavior"],
  };
  const artifactBytes = writeJson(path.join(compositionDir, "production-pi2plus.json"), artifact);
  writeJson(path.join(compositionDir, "production-pi2plus-manifest.json"), {
    schemaVersion: "plan39-production-pi2plus-manifest-v1",
    artifactStatus: "provisional_source_bridged_by_2017_centering",
    artifact: {
      path: "production-pi2plus.json",
      sha256: createHash("sha256").update(artifactBytes).digest("hex"),
    },
    inputs,
    sourceRawFiles,
  });
  return root;
}

describe("population loader header selection", () => {
  beforeEach(() => {
    parseCsvFileMock.mockReset();
    processPopulationDataMock.mockReset();
    processPopulationDataMock.mockReturnValue(new Map());
  });

  it("returns an empty map for empty files or files without a period header", async () => {
    parseCsvFileMock.mockResolvedValueOnce([]);
    await expect(loadPopulationDataInternal()).resolves.toEqual(new Map());

    parseCsvFileMock.mockResolvedValueOnce([["notes"], ["unrelated", "columns"]]);
    await expect(loadPopulationDataInternal()).resolves.toEqual(new Map());
    expect(processPopulationDataMock).not.toHaveBeenCalled();
  });

  it("detects Japanese combined month headers and the explicit total column", async () => {
    const rows = [["注記"], ["年 月", "総数"]];
    parseCsvFileMock.mockResolvedValue(rows);
    const result = new Map([["2025年1月", { total: 1, index: 2, ma: 3 }]]);
    processPopulationDataMock.mockReturnValue(result);

    await expect(loadPopulationDataInternal()).resolves.toBe(result);
    expect(processPopulationDataMock).toHaveBeenCalledWith(rows, 1, 0, -1, -1, 1);
  });

  it("accepts English and Japanese year-month headers with the default total column", async () => {
    const englishRows = [["note"], ["Year and month", "other"]];
    parseCsvFileMock.mockResolvedValueOnce(englishRows);
    await loadPopulationDataInternal();
    expect(processPopulationDataMock).toHaveBeenLastCalledWith(englishRows, 1, -1, 0, 1, 4);

    const japaneseRows = [["note"], ["対象年と月", "地域"]];
    parseCsvFileMock.mockResolvedValueOnce(japaneseRows);
    await loadPopulationDataInternal();
    expect(processPopulationDataMock).toHaveBeenLastCalledWith(japaneseRows, 1, -1, 0, 1, 4);
  });

  it("falls back to a Japanese year-and-month label when the standard header is absent", async () => {
    const rows = [["note"], ["対象年と月の集計"]];
    parseCsvFileMock.mockResolvedValue(rows);

    await loadPopulationDataInternal();

    expect(processPopulationDataMock).toHaveBeenCalledWith(rows, 1, -1, 0, 1, 4);
  });

  it("uses the Japanese year-month label before the broader fallback", async () => {
    const rows = [["note"], ["対象年", "Year and month"]];
    parseCsvFileMock.mockResolvedValue(rows);

    await loadPopulationDataInternal();

    expect(processPopulationDataMock).toHaveBeenCalledWith(rows, 1, -1, 0, 1, 4);
  });
});

describe("verified Plan39 household-composition inputs", () => {
  it("uses the repository CTI artifact root when no root override is configured", () => {
    const original = process.env.CTI_ADJUSTED_ARTIFACT_ROOT;
    delete process.env.CTI_ADJUSTED_ARTIFACT_ROOT;
    try {
      expect(loadCtiAdjustedInputs().artifactRoot).toBe(
        path.resolve(process.cwd(), "data", "source", "cti-adjusted"),
      );
    } finally {
      if (original !== undefined) process.env.CTI_ADJUSTED_ARTIFACT_ROOT = original;
    }
  });

  it("falls back to the current directory root after malformed local manifests are rejected", () => {
    const parent = mkdtempSync(path.join(tmpdir(), "cti-adjusted-root-fallback-"));
    const root = path.join(parent, "data", "source", "cti-adjusted");
    mkdirSync(root, { recursive: true });
    const manifestPath = path.join(root, "manifest.json");
    writeFileSync(manifestPath, "{");
    const originalCwd = process.cwd();
    const originalArtifactRoot = process.env.CTI_ADJUSTED_ARTIFACT_ROOT;
    const originalExists = existsSyncMock.getMockImplementation()!;
    delete process.env.CTI_ADJUSTED_ARTIFACT_ROOT;
    process.chdir(parent);
    existsSyncMock.mockImplementation((file) => String(file) === manifestPath);

    try {
      const loaded = loadCtiAdjustedInputs();

      expect(loaded.artifactRoot).toBe(path.resolve(root));
      expect(loaded.manifestInvalid).toBe(true);
    } finally {
      existsSyncMock.mockImplementation(originalExists);
      process.chdir(originalCwd);
      rmSync(parent, { recursive: true, force: true });
      if (originalArtifactRoot === undefined) delete process.env.CTI_ADJUSTED_ARTIFACT_ROOT;
      else process.env.CTI_ADJUSTED_ARTIFACT_ROOT = originalArtifactRoot;
    }
  });

  it("uses the configured artifact root when no explicit root is passed", () => {
    const root = writeCompleteCtiAdjustedFixture();
    const original = process.env.CTI_ADJUSTED_ARTIFACT_ROOT;
    process.env.CTI_ADJUSTED_ARTIFACT_ROOT = root;
    try {
      expect(loadCtiAdjustedInputs().artifactRoot).toBe(path.resolve(root));
    } finally {
      if (original === undefined) delete process.env.CTI_ADJUSTED_ARTIFACT_ROOT;
      else process.env.CTI_ADJUSTED_ARTIFACT_ROOT = original;
    }
  });

  it("finds the checked-in artifacts from a working directory without its own data tree", () => {
    const emptyWorkingDirectory = mkdtempSync(path.join(tmpdir(), "cti-adjusted-cwd-fallback-"));
    const originalWorkingDirectory = process.cwd();
    const originalArtifactRoot = process.env.CTI_ADJUSTED_ARTIFACT_ROOT;
    delete process.env.CTI_ADJUSTED_ARTIFACT_ROOT;

    try {
      process.chdir(emptyWorkingDirectory);
      expect(loadCtiAdjustedInputs().artifactRoot).toBe(
        path.resolve(originalWorkingDirectory, "data/source/cti-adjusted"),
      );
    } finally {
      process.chdir(originalWorkingDirectory);
      if (originalArtifactRoot === undefined) delete process.env.CTI_ADJUSTED_ARTIFACT_ROOT;
      else process.env.CTI_ADJUSTED_ARTIFACT_ROOT = originalArtifactRoot;
      rmSync(emptyWorkingDirectory, { recursive: true, force: true });
    }
  });

  it("loads the supported CSV artifact and metadata sidecar format", () => {
    const root = writeCompleteCtiAdjustedFixture();
    const manifestPath = path.join(root, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const original = JSON.parse(readFileSync(path.join(root, "B.json"), "utf8"));
    const csvPath = path.join(root, "B.csv");
    const csvBytes = Buffer.from("year,総合,食料\n2020,100,101\n");
    writeFileSync(csvPath, csvBytes);
    writeJson(`${csvPath}.metadata.json`, original.metadata);
    manifest.artifacts.B.path = "B.csv";
    manifest.artifacts.B.sha256 = createHash("sha256").update(csvBytes).digest("hex");
    writeJson(manifestPath, manifest);

    const loaded = loadCtiAdjustedInputs({ artifactRoot: root });

    expect(loaded.B?.categoryOrder).toEqual(["総合", "食料"]);
    expect(loaded.B?.rows).toEqual([{ year: 2020, values: { 総合: 100, 食料: 101 } }]);
    expect(loaded.loadReasons).toEqual([]);
  });

  it("parses an empty CSV only when its sidecar and manifest digest are valid", () => {
    const root = writeCompleteCtiAdjustedFixture();
    const manifestPath = path.join(root, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const original = JSON.parse(readFileSync(path.join(root, "B.json"), "utf8"));
    const csvPath = path.join(root, "B.csv");
    const csvBytes = Buffer.alloc(0);
    writeFileSync(csvPath, csvBytes);
    writeJson(`${csvPath}.metadata.json`, original.metadata);
    manifest.artifacts.B.path = "B.csv";
    manifest.artifacts.B.sha256 = createHash("sha256").update(csvBytes).digest("hex");
    writeJson(manifestPath, manifest);

    const loaded = loadCtiAdjustedInputs({ artifactRoot: root });

    expect(loaded.B?.rows).toEqual([]);
    expect(loaded.loadReasons).toEqual([]);
  });

  it("accepts the legacy manifest hash alias when it hashes the saved artifact bytes", () => {
    const root = writeCompleteCtiAdjustedFixture();
    const manifestPath = path.join(root, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const artifactBytes = readFileSync(path.join(root, "B.json"));
    delete manifest.artifacts.B.sha256;
    manifest.artifacts.B.hash = createHash("sha256").update(artifactBytes).digest("hex");
    writeJson(manifestPath, manifest);

    const loaded = loadCtiAdjustedInputs({ artifactRoot: root });

    expect(loaded.B).not.toBeNull();
    expect(loaded.loadReasons).toEqual([]);
  });

  it("does not substitute a source metadata digest for the missing artifact digest", () => {
    const root = writeCompleteCtiAdjustedFixture();
    const manifestPath = path.join(root, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    delete manifest.artifacts.B.sha256;
    delete manifest.artifacts.B.hash;
    writeJson(manifestPath, manifest);

    const loaded = loadCtiAdjustedInputs({ artifactRoot: root });

    expect(loaded.loadReasons).toContain("invalid_hash");
    expect(loaded.loadReasons).toContain("invalid_metadata");
  });

  it("accepts the optional category order and rows fields when absent from a JSON artifact", () => {
    const root = writeCompleteCtiAdjustedFixture();
    const artifactPath = path.join(root, "B.json");
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    const manifestPath = path.join(root, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    delete artifact.categoryOrder;
    delete artifact.rows;
    const artifactBytes = writeJson(artifactPath, artifact);
    manifest.artifacts.B.sha256 = createHash("sha256").update(artifactBytes).digest("hex");
    writeJson(manifestPath, manifest);

    const loaded = loadCtiAdjustedInputs({ artifactRoot: root });

    expect(loaded.B?.categoryOrder).toBeUndefined();
    expect(loaded.B?.rows).toEqual([]);
    expect(loaded.loadReasons).toEqual([]);
  });

  it("returns composition only when manifest, source files, and artifact hashes agree", () => {
    const root = writeCompleteCtiAdjustedFixture();

    const loaded = loadCtiAdjustedInputs({ artifactRoot: root });

    expect(loaded.householdComposition).toMatchObject({
      historicalPi2Plus: { 2005: 0.7, 2017: 0.7 },
      historicalPiStatusByYear: {
        2011: { synthetic: true, interpolationMethod: "linear_share_interpolation" },
      },
      calibrationPi2Plus: { 2017: 0.7, 2025: 0.7 },
    });
  });

  it("defaults optional production composition caveats to an empty list", () => {
    const root = writeCompleteCtiAdjustedFixture();
    const manifestPath = path.join(
      root,
      "../cti-size-composition/production-pi2plus-manifest.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const artifactPath = path.join(root, "../cti-size-composition/production-pi2plus.json");
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    delete artifact.caveats;
    const artifactBytes = writeJson(artifactPath, artifact);
    manifest.artifact.sha256 = createHash("sha256").update(artifactBytes).digest("hex");
    writeJson(manifestPath, manifest);

    expect(
      loadCtiAdjustedInputs({ artifactRoot: root }).householdComposition?.provenance.caveats,
    ).toEqual([]);
  });

  it("returns the successful public connection estimate for a complete artifact set", () => {
    const artifactRoot = writeCompleteCtiAdjustedFixture();

    const estimate = loadCtiAdjustedConnectionEstimate({ artifactRoot });

    expect(estimate.audit.validation.reasons).not.toContain("missing_b_artifact");
    expect(estimate.audit.validation.reasons).not.toContain("invalid_metadata");
  });

  it("reuses the matching checked-in Plan39 evidence for the current complete artifact set", () => {
    const artifactRoot = path.resolve(process.cwd(), "data/source/cti-adjusted");
    const analysisRoot = path.resolve(process.cwd(), "results/plan39");
    const originalAnalysisFile = process.env.CTI_ADJUSTED_ANALYSIS_FILE;
    const originalAnalysisRoot = process.env.CTI_ADJUSTED_ANALYSIS_ROOT;
    delete process.env.CTI_ADJUSTED_ANALYSIS_FILE;
    process.env.CTI_ADJUSTED_ANALYSIS_ROOT = analysisRoot;

    try {
      const loaded = loadCtiAdjustedInputs({ artifactRoot });
      const estimate = loadCtiAdjustedV2Estimate({ artifactRoot });

      expect(loaded.inputFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(estimate.inputFingerprint).toBe(loaded.inputFingerprint);
      expect(estimate.publicationGate.reasonCodes).not.toContain(
        "rolling_loo_evidence_input_fingerprint_mismatch",
      );
      expect(estimate.publicationGate.blockingReasonCodes).not.toContain(
        "rolling_loo_evidence_input_fingerprint_mismatch",
      );
    } finally {
      if (originalAnalysisFile === undefined) delete process.env.CTI_ADJUSTED_ANALYSIS_FILE;
      else process.env.CTI_ADJUSTED_ANALYSIS_FILE = originalAnalysisFile;
      if (originalAnalysisRoot === undefined) delete process.env.CTI_ADJUSTED_ANALYSIS_ROOT;
      else process.env.CTI_ADJUSTED_ANALYSIS_ROOT = originalAnalysisRoot;
    }
  });

  it("builds Plan40 rolling evidence against the complete loaded artifact fingerprint", () => {
    const artifactRoot = path.resolve(process.cwd(), "data/source/cti-adjusted");
    const estimate = loadCtiAdjustedV2Estimate({ artifactRoot, contract: "plan40" });

    expect(estimate.inputFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(estimate.publicationGate.reasonCodes).not.toContain(
      "rolling_loo_evidence_input_fingerprint_mismatch",
    );
  });

  it("keeps Plan40 publication closed when its artifact set is incomplete", () => {
    const artifactRoot = writeCompleteCtiAdjustedFixture();
    const manifestPath = path.join(artifactRoot, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts.B.path = "";
    writeJson(manifestPath, manifest);

    const estimate = loadCtiAdjustedV2Estimate({ artifactRoot, contract: "plan40" });

    expect(estimate.publicationGate.accepted).toBe(false);
    expect(estimate.publicationGate.diagnostics).toContain("publication_gate_closed");
  });

  it("keeps Plan39 fingerprint evidence unavailable when its audit snapshot is missing", () => {
    const artifactRoot = writeCompleteCtiAdjustedFixture();
    unlinkSync(path.join(artifactRoot, "audit.json"));
    const analysisRoot = mkdtempSync(path.join(tmpdir(), "cti-adjusted-missing-audit-analysis-"));
    const originalAnalysisFile = process.env.CTI_ADJUSTED_ANALYSIS_FILE;
    const originalAnalysisRoot = process.env.CTI_ADJUSTED_ANALYSIS_ROOT;
    delete process.env.CTI_ADJUSTED_ANALYSIS_FILE;
    process.env.CTI_ADJUSTED_ANALYSIS_ROOT = analysisRoot;

    try {
      const estimate = loadCtiAdjustedV2Estimate({ artifactRoot });
      expect(estimate.inputFingerprint).toBeUndefined();
      expect(estimate.publicationGate.accepted).toBe(false);
    } finally {
      if (originalAnalysisFile === undefined) delete process.env.CTI_ADJUSTED_ANALYSIS_FILE;
      else process.env.CTI_ADJUSTED_ANALYSIS_FILE = originalAnalysisFile;
      if (originalAnalysisRoot === undefined) delete process.env.CTI_ADJUSTED_ANALYSIS_ROOT;
      else process.env.CTI_ADJUSTED_ANALYSIS_ROOT = originalAnalysisRoot;
      rmSync(analysisRoot, { recursive: true, force: true });
    }
  });

  it("fails Plan39 evidence closed if the artifact manifest changes during reconstruction", () => {
    const artifactRoot = writeCompleteCtiAdjustedFixture();
    const manifestPath = path.join(artifactRoot, "manifest.json");
    const analysisRoot = mkdtempSync(path.join(tmpdir(), "cti-adjusted-fingerprint-change-"));
    const originalRead = readFileSyncMock.getMockImplementation()!;
    const originalAnalysisFile = process.env.CTI_ADJUSTED_ANALYSIS_FILE;
    const originalAnalysisRoot = process.env.CTI_ADJUSTED_ANALYSIS_ROOT;
    let manifestReads = 0;
    delete process.env.CTI_ADJUSTED_ANALYSIS_FILE;
    process.env.CTI_ADJUSTED_ANALYSIS_ROOT = analysisRoot;
    readFileSyncMock.mockImplementation((file, options) => {
      if (String(file) === manifestPath) {
        manifestReads++;
        const manifest = originalRead(file, options);
        if (manifestReads >= 2) {
          const text = Buffer.isBuffer(manifest) ? manifest.toString("utf8") : manifest;
          return Buffer.from(`${text} `);
        }
        return manifest;
      }
      return originalRead(file, options);
    });

    try {
      const estimate = loadCtiAdjustedV2Estimate({ artifactRoot });
      expect(estimate.publicationGate.accepted).toBe(false);
    } finally {
      readFileSyncMock.mockImplementation(originalRead);
      if (originalAnalysisFile === undefined) delete process.env.CTI_ADJUSTED_ANALYSIS_FILE;
      else process.env.CTI_ADJUSTED_ANALYSIS_FILE = originalAnalysisFile;
      if (originalAnalysisRoot === undefined) delete process.env.CTI_ADJUSTED_ANALYSIS_ROOT;
      else process.env.CTI_ADJUSTED_ANALYSIS_ROOT = originalAnalysisRoot;
      rmSync(analysisRoot, { recursive: true, force: true });
    }
  });

  it("rebuilds Plan39 evidence after rejecting a malformed saved analysis", () => {
    const artifactRoot = writeCompleteCtiAdjustedFixture();
    const analysisRoot = mkdtempSync(path.join(tmpdir(), "cti-adjusted-no-analysis-"));
    writeFileSync(path.join(analysisRoot, "plan39-analysis-invalid.json"), "{");
    const originalAnalysisFile = process.env.CTI_ADJUSTED_ANALYSIS_FILE;
    const originalAnalysisRoot = process.env.CTI_ADJUSTED_ANALYSIS_ROOT;
    delete process.env.CTI_ADJUSTED_ANALYSIS_FILE;
    process.env.CTI_ADJUSTED_ANALYSIS_ROOT = analysisRoot;

    try {
      const estimate = loadCtiAdjustedV2Estimate({ artifactRoot });

      expect(estimate.inputFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    } finally {
      if (originalAnalysisFile === undefined) delete process.env.CTI_ADJUSTED_ANALYSIS_FILE;
      else process.env.CTI_ADJUSTED_ANALYSIS_FILE = originalAnalysisFile;
      if (originalAnalysisRoot === undefined) delete process.env.CTI_ADJUSTED_ANALYSIS_ROOT;
      else process.env.CTI_ADJUSTED_ANALYSIS_ROOT = originalAnalysisRoot;
      rmSync(analysisRoot, { recursive: true, force: true });
    }
  });

  it("accepts an explicit Plan39 analysis path but rejects mismatched input artifact hashes", () => {
    const artifactRoot = writeCompleteCtiAdjustedFixture();
    const analysisRoot = mkdtempSync(path.join(tmpdir(), "cti-adjusted-explicit-analysis-"));
    const loaded = loadCtiAdjustedInputs({ artifactRoot });
    const artifacts = Object.fromEntries(
      (["B", "A", "L"] as const).map((kind) => [
        kind,
        {
          path: `${kind}.json`,
          sha256:
            kind === "B"
              ? "0".repeat(64)
              : createHash("sha256")
                  .update(readFileSync(path.join(artifactRoot, `${kind}.json`)))
                  .digest("hex"),
        },
      ]),
    );
    const analysisFile = path.join(analysisRoot, "plan39-analysis-hash-mismatch.json");
    writeJson(analysisFile, {
      schemaVersion: "plan39-analysis-v1",
      inputFingerprint: loaded.inputFingerprint,
      rollingLoo: {},
      v2: {
        model: "v2-bottom-up",
        version: "plan39-v2",
        publicationGate: {},
      },
      inputs: { artifacts },
    });
    const originalAnalysisFile = process.env.CTI_ADJUSTED_ANALYSIS_FILE;
    const originalAnalysisRoot = process.env.CTI_ADJUSTED_ANALYSIS_ROOT;
    process.env.CTI_ADJUSTED_ANALYSIS_FILE = analysisFile;
    delete process.env.CTI_ADJUSTED_ANALYSIS_ROOT;

    try {
      const estimate = loadCtiAdjustedV2Estimate({ artifactRoot });
      expect(estimate.inputFingerprint).toBe(loaded.inputFingerprint);
    } finally {
      if (originalAnalysisFile === undefined) delete process.env.CTI_ADJUSTED_ANALYSIS_FILE;
      else process.env.CTI_ADJUSTED_ANALYSIS_FILE = originalAnalysisFile;
      if (originalAnalysisRoot === undefined) delete process.env.CTI_ADJUSTED_ANALYSIS_ROOT;
      else process.env.CTI_ADJUSTED_ANALYSIS_ROOT = originalAnalysisRoot;
      rmSync(analysisRoot, { recursive: true, force: true });
    }
  });

  it("rebuilds Plan39 evidence when the configured results directory is absent", () => {
    const artifactRoot = writeCompleteCtiAdjustedFixture();
    const environmentRoot = mkdtempSync(path.join(tmpdir(), "cti-adjusted-no-results-root-"));
    const analysisRoot = path.join(environmentRoot, "missing");
    const originalAnalysisFile = process.env.CTI_ADJUSTED_ANALYSIS_FILE;
    const originalAnalysisRoot = process.env.CTI_ADJUSTED_ANALYSIS_ROOT;
    delete process.env.CTI_ADJUSTED_ANALYSIS_FILE;
    process.env.CTI_ADJUSTED_ANALYSIS_ROOT = analysisRoot;

    try {
      const estimate = loadCtiAdjustedV2Estimate({ artifactRoot });
      expect(estimate.inputFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    } finally {
      if (originalAnalysisFile === undefined) delete process.env.CTI_ADJUSTED_ANALYSIS_FILE;
      else process.env.CTI_ADJUSTED_ANALYSIS_FILE = originalAnalysisFile;
      if (originalAnalysisRoot === undefined) delete process.env.CTI_ADJUSTED_ANALYSIS_ROOT;
      else process.env.CTI_ADJUSTED_ANALYSIS_ROOT = originalAnalysisRoot;
      rmSync(environmentRoot, { recursive: true, force: true });
    }
  });

  it.each([
    ["an empty artifact path", ""],
    ["an artifact path outside its root", "../outside.json"],
  ])("keeps Plan39 evidence unavailable for %s", (_label, relativePath) => {
    const artifactRoot = writeCompleteCtiAdjustedFixture();
    const manifestPath = path.join(artifactRoot, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts.B.path = relativePath;
    writeJson(manifestPath, manifest);

    const estimate = loadCtiAdjustedV2Estimate({ artifactRoot });

    expect(estimate.publicationGate.accepted).toBe(false);
    expect(estimate.inputFingerprint).toBeUndefined();
  });

  it.each([
    ["unexpected manifest schema", "schema"],
    ["source path escaping its root", "path"],
  ] as const)("fails closed for composition with %s", (_label, kind) => {
    const root = writeCompleteCtiAdjustedFixture();
    const manifestPath = path.join(
      root,
      "../cti-size-composition/production-pi2plus-manifest.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (kind === "schema") manifest.schemaVersion = "other";
    else manifest.inputs.weights.path = "../../outside.fixture";
    writeJson(manifestPath, manifest);

    expect(loadCtiAdjustedInputs({ artifactRoot: root }).householdComposition).toBeNull();
  });

  it("rejects a composition artifact with out-of-range historical data", () => {
    const root = writeCompleteCtiAdjustedFixture();
    const artifactPath = path.join(root, "../cti-size-composition/production-pi2plus.json");
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    artifact.historicalPi2Plus["2005"] = 1;
    writeJson(artifactPath, artifact);

    expect(loadCtiAdjustedInputs({ artifactRoot: root }).householdComposition).toBeNull();
  });

  it.each([
    ["statistical information id", "stat-id"],
    ["statistical code", "stat-code"],
    ["malformed manifest artifact hash", "artifact-hash-format"],
    ["artifact schema version", "artifact-schema"],
    ["manifest schema version", "manifest-schema"],
    ["artifact revision", "artifact-revision"],
    ["conflicting source URLs", "source-conflict"],
    ["manifest source URL", "manifest-source"],
  ] as const)("checks the CTI artifact's %s against the manifest", (_label, defect) => {
    const root = writeCompleteCtiAdjustedFixture();
    const file = path.join(root, "B.json");
    const document = JSON.parse(readFileSync(file, "utf8"));
    const manifestPath = path.join(root, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (defect === "stat-id") document.metadata.statInfId = "other-stat-id";
    if (defect === "stat-code") document.metadata.statisticalCode = "other-statistical-code";
    if (defect === "artifact-hash-format") manifest.artifacts.B.sha256 = "invalid";
    if (defect === "artifact-schema") manifest.artifacts.B.schemaVersion = "other-schema";
    if (defect === "manifest-schema") manifest.schemaVersion = "other-schema";
    if (defect === "artifact-revision") manifest.artifacts.B.revision = "other-revision";
    if (defect === "source-conflict") document.metadata.downloadUrl = "https://example.test/other";
    if (defect === "manifest-source") {
      document.metadata.sourceUrl = "https://example.test/other";
      document.metadata.downloadUrl = "https://example.test/other";
    }
    const bytes = writeJson(file, document);
    if (defect !== "artifact-hash-format")
      manifest.artifacts.B.sha256 = createHash("sha256").update(bytes).digest("hex");
    writeJson(manifestPath, manifest);

    expect(loadCtiAdjustedInputs({ artifactRoot: root }).loadReasons).toContain("invalid_metadata");
  });

  it.each([
    ["missing source input", "missing-input"],
    ["missing inputs section", "input-section"],
    ["missing source raw files section", "raw-files-section"],
    ["incorrect source input digest", "input-hash"],
    ["missing raw year", "raw-year"],
    ["raw source path missing", "raw-path"],
    ["raw source digest missing", "raw-hash"],
    ["incorrect artifact path", "artifact-path"],
    ["incorrect artifact digest", "artifact-hash"],
    ["artifact schema", "artifact-schema"],
    ["artifact model status", "model-status"],
    ["non-finite historical share", "historical-nonfinite"],
    ["historical share at the lower bound", "historical-lower-bound"],
    ["historical share at the upper bound", "historical-upper-bound"],
    ["missing historical quality metadata", "historical-quality-missing"],
    ["historical synthetic marker", "historical-synthetic"],
    ["historical publication status", "historical-status"],
    ["historical connection status", "historical-connection"],
    ["historical benchmark type", "historical-benchmark-type"],
    ["empty historical benchmark", "historical-benchmark-empty"],
    ["historical interpolation method", "historical-interpolation"],
    ["non-finite calibration share", "calibration-nonfinite"],
    ["calibration share at the lower bound", "calibration-lower-bound"],
    ["calibration share at the upper bound", "calibration-upper-bound"],
  ] as const)("rejects a production composition with %s", (_label, defect) => {
    const root = writeCompleteCtiAdjustedFixture();
    const manifestPath = path.join(
      root,
      "../cti-size-composition/production-pi2plus-manifest.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (defect === "missing-input") delete manifest.inputs.weightsManifest;
    else if (defect === "input-section") delete manifest.inputs;
    else if (defect === "raw-files-section") delete manifest.sourceRawFiles;
    else if (defect === "input-hash") manifest.inputs.weights.sha256 = "0".repeat(64);
    else if (defect === "raw-year") delete manifest.sourceRawFiles["2017"];
    else if (defect === "raw-path") delete manifest.sourceRawFiles["2017"].path;
    else if (defect === "raw-hash") delete manifest.sourceRawFiles["2017"].sha256;
    else if (defect === "artifact-path") manifest.artifact.path = "other.json";
    else if (defect === "artifact-hash") manifest.artifact.sha256 = "0".repeat(64);
    else {
      const artifactPath = path.join(root, "../cti-size-composition/production-pi2plus.json");
      const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
      if (defect === "artifact-schema") artifact.schemaVersion = "other";
      if (defect === "model-status") artifact.modelStatus = "unreviewed";
      if (defect.startsWith("historical-")) {
        if (defect === "historical-nonfinite") artifact.historicalPi2Plus["2005"] = Number.NaN;
        if (defect === "historical-lower-bound") artifact.historicalPi2Plus["2005"] = 0;
        if (defect === "historical-upper-bound") artifact.historicalPi2Plus["2005"] = 1;
        const quality = artifact.historicalPiStatusByYear["2005"];
        if (defect === "historical-quality-missing")
          delete artifact.historicalPiStatusByYear["2005"];
        if (defect === "historical-synthetic") quality.synthetic = true;
        if (defect === "historical-status") quality.status = "unverified";
        if (defect === "historical-connection") quality.connectionStatus = "disconnected";
        if (defect === "historical-benchmark-type") quality.benchmarkId = 1;
        if (defect === "historical-benchmark-empty") quality.benchmarkId = "";
        if (defect === "historical-interpolation")
          quality.interpolationMethod = "linear_share_interpolation";
      }
      if (defect === "calibration-nonfinite") artifact.calibrationPi2Plus["2025"] = Number.NaN;
      if (defect === "calibration-lower-bound") artifact.calibrationPi2Plus["2025"] = 0;
      if (defect === "calibration-upper-bound") artifact.calibrationPi2Plus["2025"] = 1;
      const bytes = writeJson(artifactPath, artifact);
      manifest.artifact.sha256 = createHash("sha256").update(bytes).digest("hex");
    }
    writeJson(manifestPath, manifest);

    expect(loadCtiAdjustedInputs({ artifactRoot: root }).householdComposition).toBeNull();
  });
});

describe("2025 CTI candidate pair validation", () => {
  it("rejects an unparseable current month after a valid first month", () => {
    expect(isContinuousMonths(["2025年1月", "not-a-month"])).toBe(false);
  });

  it("accepts the checked-in candidate against its public source manifest and snapshots", async () => {
    const dataIo =
      await vi.importActual<typeof import("../../server/lib/dataIo")>("../../server/lib/dataIo");
    const paths = dataIo.buildCtiFilePaths();
    const pair: CtiPair = {
      baseYear: 2025,
      pair: "2025",
      mainPath: paths.candidateMain,
      supportNominalPath: paths.candidateSupportNominal,
      supportRealPath: paths.candidateSupportReal,
    };
    buildCtiFilePathsMock.mockReturnValue(paths);

    expect(validateCtiPair(pair, paths)).toEqual(pair);
    expect(selectCtiPair()).toEqual({ pair });
  });

  it("rejects a bad quarter label after its hashes and source manifest are updated", async () => {
    const dataIo =
      await vi.importActual<typeof import("../../server/lib/dataIo")>("../../server/lib/dataIo");
    const paths = dataIo.buildCtiFilePaths();
    const pair: CtiPair = {
      baseYear: 2025,
      pair: "2025",
      mainPath: paths.candidateMain,
      supportNominalPath: paths.candidateSupportNominal,
      supportRealPath: paths.candidateSupportReal,
    };
    const quarterlyCsv = readFileSync(paths.candidateDistributionAdjustedQuarterly, "utf8").replace(
      /^2018Q2(?=,)/m,
      "2018Q5",
    );
    const metadata = JSON.parse(
      readFileSync(paths.candidateDistributionAdjustedQuarterlyMetadata, "utf8"),
    );
    const metadataText = JSON.stringify({
      ...metadata,
      csvSha256: createHash("sha256").update(quarterlyCsv).digest("hex"),
    });
    const manifestPath = path.join(process.cwd(), "data/source/cti-adjusted/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts.quarterlyNominal.sha256 = createHash("sha256")
      .update(quarterlyCsv)
      .digest("hex");
    manifest.artifacts.quarterlyNominal.metadataSha256 = createHash("sha256")
      .update(metadataText)
      .digest("hex");
    const overrides = new Map([
      [paths.candidateDistributionAdjustedQuarterly, quarterlyCsv],
      [paths.candidateDistributionAdjustedQuarterlyMetadata, metadataText],
      [manifestPath, JSON.stringify(manifest)],
    ]);

    const result = withFileReadOverrides(overrides, () => validateCtiPair(pair, paths));
    expect(result).toBe("invalid official quarterly CTI period range");
  });

  it("rejects quarterly rows whose public CSV omits the period column", async () => {
    const dataIo =
      await vi.importActual<typeof import("../../server/lib/dataIo")>("../../server/lib/dataIo");
    const paths = dataIo.buildCtiFilePaths();
    const pair: CtiPair = {
      baseYear: 2025,
      pair: "2025",
      mainPath: paths.candidateMain,
      supportNominalPath: paths.candidateSupportNominal,
      supportRealPath: paths.candidateSupportReal,
    };
    const quarterlyCsv = readFileSync(paths.candidateDistributionAdjustedQuarterly, "utf8").replace(
      /^period,/m,
      "quarter,",
    );
    const metadata = JSON.parse(
      readFileSync(paths.candidateDistributionAdjustedQuarterlyMetadata, "utf8"),
    );
    const metadataText = JSON.stringify({
      ...metadata,
      csvSha256: createHash("sha256").update(quarterlyCsv).digest("hex"),
    });
    const manifestPath = path.join(process.cwd(), "data/source/cti-adjusted/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts.quarterlyNominal.sha256 = createHash("sha256")
      .update(quarterlyCsv)
      .digest("hex");
    manifest.artifacts.quarterlyNominal.metadataSha256 = createHash("sha256")
      .update(metadataText)
      .digest("hex");
    const overrides = new Map([
      [paths.candidateDistributionAdjustedQuarterly, quarterlyCsv],
      [paths.candidateDistributionAdjustedQuarterlyMetadata, metadataText],
      [manifestPath, JSON.stringify(manifest)],
    ]);

    const result = withFileReadOverrides(overrides, () => validateCtiPair(pair, paths));
    expect(result).toBe("invalid official quarterly CTI period range");
  });

  it("rejects a continuous candidate that ends before the 2025 calendar year is complete", async () => {
    const dataIo =
      await vi.importActual<typeof import("../../server/lib/dataIo")>("../../server/lib/dataIo");
    const paths = dataIo.buildCtiFilePaths();
    const pair: CtiPair = {
      baseYear: 2025,
      pair: "2025",
      mainPath: paths.candidateMain,
      supportNominalPath: paths.candidateSupportNominal,
      supportRealPath: paths.candidateSupportReal,
    };
    const sourceLines = readFileSync(paths.candidateMain, "utf8").split(/\r?\n/);
    const decemberIndex = sourceLines.findIndex((line) => line.split(",")[1] === "2025年12月");
    expect(decemberIndex).toBeGreaterThan(0);
    const mainCsv = sourceLines.slice(0, decemberIndex).join("\n");
    const monthRows = sourceLines
      .slice(1, decemberIndex)
      .filter((line) => /^\d{9,},\d{4}年\d{1,2}月,/.test(line));
    const metadata = JSON.parse(readFileSync(paths.metadata, "utf8"));
    const metadataText = JSON.stringify({
      ...metadata,
      csvSha256: createHash("sha256").update(mainCsv).digest("hex"),
      period: { ...metadata.period, end: "2025年11月", monthlyRows: monthRows.length },
    });

    const result = withFileReadOverrides(
      new Map([
        [paths.candidateMain, mainCsv],
        [paths.metadata, metadataText],
      ]),
      () => validateCtiPair(pair, paths),
    );
    expect(result).toBe("incomplete 2025 CTI calendar year");
  });

  it("fails closed when the official quarterly source workbook is unavailable", async () => {
    const dataIo =
      await vi.importActual<typeof import("../../server/lib/dataIo")>("../../server/lib/dataIo");
    const paths = dataIo.buildCtiFilePaths();
    const pair: CtiPair = {
      baseYear: 2025,
      pair: "2025",
      mainPath: paths.candidateMain,
      supportNominalPath: paths.candidateSupportNominal,
      supportRealPath: paths.candidateSupportReal,
    };
    const originalRead = readFileSyncMock.getMockImplementation()!;
    readFileSyncMock.mockImplementation((file, options) => {
      if (
        String(file) === "data/source/official-cti-2025/cti-distribution-adjusted-000040499087.xlsx"
      )
        throw new Error("unavailable source workbook");
      return originalRead(file, options);
    });

    let result: ReturnType<typeof validateCtiPair> | undefined;
    try {
      result = validateCtiPair(pair, paths);
    } finally {
      readFileSyncMock.mockImplementation(originalRead);
    }

    expect(result).toBe("missing official quarterly source workbook");
  });

  it("checks the quarterly artifact path against the Plan39 manifest after source verification", async () => {
    const dataIo =
      await vi.importActual<typeof import("../../server/lib/dataIo")>("../../server/lib/dataIo");
    const paths = dataIo.buildCtiFilePaths();
    const pair: CtiPair = {
      baseYear: 2025,
      pair: "2025",
      mainPath: paths.candidateMain,
      supportNominalPath: paths.candidateSupportNominal,
      supportRealPath: paths.candidateSupportReal,
    };
    const manifestPath = path.join(process.cwd(), "data/source/cti-adjusted/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts.quarterlyNominal.path = "../other-quarterly.csv";
    const result = withFileReadOverrides(new Map([[manifestPath, JSON.stringify(manifest)]]), () =>
      validateCtiPair(pair, paths),
    );

    expect(result).toBe("official quarterly CTI artifact/metadata/manifest mismatch");
  });

  it.each([
    ["missing main header", "title,other\n2025,1", "missing CTI 年月 header"],
    ["missing total headers", "年月,総合\n2025年1月,100", "missing required CTI total headers"],
    [
      "missing month cell",
      "id,年月,消費支出（名目）,消費支出（実質）\nfoo",
      "invalid or discontinuous CTI 年月",
    ],
    ["no months", "年月,消費支出（名目）,消費支出（実質）", "invalid or discontinuous CTI 年月"],
    [
      "duplicate month",
      "年月,消費支出（名目）,消費支出（実質）\n2025年1月,100,99\n2025年1月,101,99",
      "invalid or duplicate CTI 年月",
    ],
    [
      "invalid numeric total",
      "年月,消費支出（名目）,消費支出（実質）\n2025年1月,-,99",
      "invalid CTI required numeric value",
    ],
  ])("rejects a 2025 pair with %s", (_label, csv, expected) => {
    const { pair, paths } = write2025CtiValidationFixture(csv);

    expect(validateCtiPair(pair, paths as never)).toBe(expected);
  });

  it("requires the complete 2025 supporting set before reading source files", () => {
    const root = mkdtempSync(path.join(tmpdir(), "cti-2025-missing-set-"));
    const missingPaths = {
      seriesMap: path.join(root, "series-map.csv"),
      officialSnapshot: path.join(root, "official.csv"),
      metadata: path.join(root, "metadata.json"),
      candidateDistributionAdjusted: path.join(root, "adjusted.csv"),
      candidateDistributionAdjustedMetadata: path.join(root, "adjusted.metadata.json"),
      candidateDistributionAdjustedQuarterly: path.join(root, "quarterly.csv"),
      candidateDistributionAdjustedQuarterlyMetadata: path.join(root, "quarterly.metadata.json"),
    };
    buildCtiFilePathsMock.mockReturnValue(missingPaths);
    const pair: CtiPair = {
      baseYear: 2025,
      pair: "2025",
      mainPath: path.join(root, "main.csv"),
      supportNominalPath: "unused-nominal.csv",
      supportRealPath: "unused-real.csv",
    };

    expect(validateCtiPair(pair, missingPaths as never)).toBe("missing required CTI set file");
  });

  it("rejects a candidate that omits either required series-map header", () => {
    const { pair, paths } = write2025CtiValidationFixture(valid2025MainCsv);
    writeFileSync(paths.seriesMap, "official_code,official_name\n");

    expect(validateCtiPair(pair, paths as never)).toBe("invalid 2025 series map headers");
  });

  it("rejects an empty series map file after safely defaulting its missing header row", () => {
    const { pair, paths } = write2025CtiValidationFixture(valid2025MainCsv);
    writeFileSync(paths.seriesMap, "");

    expect(validateCtiPair(pair, paths as never)).toBe("invalid 2025 series map headers");
  });

  it("rejects an official snapshot that omits its source identity headers", () => {
    const { pair, paths } = write2025CtiValidationFixture(valid2025MainCsv);
    writeFileSync(paths.seriesMap, "official_code,official_name,dashboard_key,value_type\n");
    writeFileSync(paths.officialSnapshot, "official_code,other\n");

    expect(validateCtiPair(pair, paths as never)).toBe("invalid 2025 official snapshot headers");
  });

  it.each([
    [
      "empty series map code",
      ",,消費支出（名目）,observed\n",
      "invalid or duplicate 2025 series map rows",
    ],
    [
      "unmapped dashboard column",
      "c1,Series,not-a-source-column,observed\n",
      "2025 series map column missing: not-a-source-column",
    ],
    [
      "empty official snapshot code",
      ",Series,2025年1月,1\n",
      "invalid or duplicate 2025 official snapshot rows",
    ],
    [
      "different code sets",
      "c2,Series,2025年1月,1\n",
      "2025 series map and official snapshot code set mismatch",
    ],
    ["different official names", "c1,Other,2025年1月,1\n", "2025 official name mismatch: c1"],
    [
      "missing representative value",
      "c1,Series,2025年1月,\n",
      "2025 official representative value missing: c1",
    ],
    [
      "representative month absent from the candidate",
      "c1,Series,1900年1月,1\n",
      "2025 official representative month missing: 1900年1月",
    ],
    [
      "representative value mismatch",
      "c1,Series,2025年1月,not-the-candidate-value\n",
      "2025 official representative value mismatch: c1",
    ],
  ])("rejects official series mapping with %s", async (_label, officialRow, expected) => {
    const dataIo =
      await vi.importActual<typeof import("../../server/lib/dataIo")>("../../server/lib/dataIo");
    const paths = dataIo.buildCtiFilePaths();
    const pair: CtiPair = {
      baseYear: 2025,
      pair: "2025",
      mainPath: paths.candidateMain,
      supportNominalPath: paths.candidateSupportNominal,
      supportRealPath: paths.candidateSupportReal,
    };
    const mappedName =
      "official_code,official_name,dashboard_key,value_type\nc1,Series,消費支出（名目）,observed\n";
    const snapshot = `official_code,official_name,representative_month,representative_value\n${officialRow}`;
    const mapCsv =
      _label === "empty series map code"
        ? "official_code,official_name,dashboard_key,value_type\n,,,observed\n"
        : _label === "unmapped dashboard column"
          ? "official_code,official_name,dashboard_key,value_type\nc1,Series,not-a-source-column,observed\n"
          : mappedName;

    const overrides = new Map([
      [paths.seriesMap, mapCsv],
      [paths.officialSnapshot, snapshot],
    ]);
    const result = withFileReadOverrides(overrides, () => validateCtiPair(pair, paths));
    expect(result).toBe(expected);
  });

  it.each([
    ["metadata readiness", "not-ready", "metadata is not ready for 2025"],
    [
      "adjusted artifact metadata readiness",
      "adjusted-not-ready",
      "metadata is not ready for 2025",
    ],
    ["metadata digest format", "bad-digest", "metadata SHA-256 is missing or invalid"],
    ["required basis fields", "basis", "2025 CTI metadata basis fields are missing"],
    ["declared period", "period", "2025 CTI metadata period mismatch"],
    ["main CSV digest", "main-hash", "metadata SHA-256 mismatch"],
    ["adjusted CSV digest", "adjusted-hash", "metadata SHA-256 mismatch"],
  ])("validates each CTI metadata boundary: %s", async (_label, defect, expected) => {
    const dataIo =
      await vi.importActual<typeof import("../../server/lib/dataIo")>("../../server/lib/dataIo");
    const paths = dataIo.buildCtiFilePaths();
    const pair: CtiPair = {
      baseYear: 2025,
      pair: "2025",
      mainPath: paths.candidateMain,
      supportNominalPath: paths.candidateSupportNominal,
      supportRealPath: paths.candidateSupportReal,
    };
    const metadataPath =
      defect === "adjusted-hash" || defect === "adjusted-not-ready"
        ? paths.candidateDistributionAdjustedMetadata
        : paths.metadata;
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    if (defect === "not-ready" || defect === "adjusted-not-ready") metadata.status = "draft";
    if (defect === "bad-digest") metadata.csvSha256 = "invalid";
    if (defect === "basis") delete metadata.sourceBasis;
    if (defect === "basis") delete metadata.comparisonNormalization;
    if (defect === "period") metadata.period.monthlyRows -= 1;
    if (defect === "main-hash" || defect === "adjusted-hash") metadata.csvSha256 = "0".repeat(64);
    const result = withFileReadOverrides(new Map([[metadataPath, JSON.stringify(metadata)]]), () =>
      validateCtiPair(pair, paths),
    );

    expect(result).toBe(expected);
  });

  it.each([
    ["malformed quarterly metadata", "quarterly-metadata"],
    ["malformed Plan39 manifest", "manifest"],
  ] as const)(
    "fails closed for %s after validating the complete CTI source set",
    async (_label, kind) => {
      const dataIo =
        await vi.importActual<typeof import("../../server/lib/dataIo")>("../../server/lib/dataIo");
      const paths = dataIo.buildCtiFilePaths();
      const pair: CtiPair = {
        baseYear: 2025,
        pair: "2025",
        mainPath: paths.candidateMain,
        supportNominalPath: paths.candidateSupportNominal,
        supportRealPath: paths.candidateSupportReal,
      };
      const file =
        kind === "quarterly-metadata"
          ? paths.candidateDistributionAdjustedQuarterlyMetadata
          : path.join(process.cwd(), "data/source/cti-adjusted/manifest.json");
      const result = withFileReadOverrides(new Map([[file, "{"]]), () =>
        validateCtiPair(pair, paths),
      );

      expect(result).toBe("invalid official quarterly metadata or Plan39 manifest");
    },
  );
});

describe("annual GDP support validation", () => {
  beforeEach(() => buildCtiFilePathsMock.mockReset());

  it("accepts continuous 1994–2025 annual inputs with matching hashes and factors", () => {
    writeGdpFixture();

    const result = validateGdpSupport();

    expect(result).toMatchObject({
      factors: { nominal: 1, real: 1.25 },
    });
    if (typeof result !== "string") {
      expect(result.nominal.size).toBe(32);
      expect(result.real.size).toBe(32);
      expect(result.nominal.get(2025)).toBe(100);
      expect(result.real.get(2025)).toBe(80);
    }
  });

  it("ignores blank annual CSV rows while retaining the declared year range", () => {
    const { paths, nominal } = writeGdpFixture();
    replaceGdpNominalCsv(paths, nominal.replace("1995,100", "\n1995,100"));

    const result = validateGdpSupport();
    expect(typeof result).not.toBe("string");
    if (typeof result !== "string") expect(result.nominal.size).toBe(32);
  });

  it.each([
    ["missing header", "Year,Other\n2025,1", "missing GDP year or private-consumption header"],
    ["invalid year", "時間軸（暦年）,民間最終消費支出\nnot-a-year,1", "invalid GDP year or value"],
    ["invalid value", "時間軸（暦年）,民間最終消費支出\n2025,NaN", "invalid GDP year or value"],
    ["duplicate year", "時間軸（暦年）,民間最終消費支出\n2025,1\n2025,2", "duplicate GDP year"],
    ["empty values", "時間軸（暦年）,民間最終消費支出", "GDP support contains no values"],
  ])("rejects annual CSV with %s", (_label, csv, expected) => {
    const { paths } = writeGdpFixture();
    replaceGdpNominalCsv(paths, csv);

    expect(validateGdpSupport()).toBe(expected);
  });

  it.each([
    ["wrong identity", { status: "draft" }, "GDP metadata identity is missing"],
    [
      "wrong measure",
      { priceMeasure: "previous-year-chain-linked" },
      "GDP metadata measure, frequency, or normalization year mismatch",
    ],
    ["missing unit", { unit: "" }, "GDP metadata unit, raw-value, or period is missing"],
    ["missing hash", { csvSha256: undefined }, "GDP metadata SHA-256 is invalid"],
    ["invalid hash", { csvSha256: "bad" }, "GDP metadata SHA-256 is invalid"],
    [
      "wrong period count",
      { period: { start: "1994", end: "2025", annualRows: 31 } },
      "GDP metadata period mismatch",
    ],
  ])("rejects annual metadata with %s", (_label, override, expected) => {
    const { paths } = writeGdpFixture();
    const metadata = JSON.parse(readFileSync(paths.supportNominalMetadata, "utf8"));
    writeJson(paths.supportNominalMetadata, { ...metadata, ...override });

    expect(validateGdpSupport()).toBe(expected);
  });

  it("rejects a support series that is not continuous from 1994 through 2025", () => {
    const { paths } = writeGdpFixture();
    const gap = [
      "時間軸（暦年）,民間最終消費支出",
      ...Array.from({ length: 32 }, (_, index) => `${1994 + index + (index > 10 ? 1 : 0)},100`),
    ].join("\n");
    replaceGdpNominalCsv(paths, gap);

    expect(validateGdpSupport()).toBe(
      "GDP support years must be continuous from 1994 through 2025",
    );
  });

  it("fails the annual set gate for missing metadata and validates a malformed real series", () => {
    const { paths } = writeGdpFixture();
    unlinkSync(paths.supportNominalMetadata);
    expect(validateGdpSupport()).toBe("missing GDP display set file");

    const fresh = writeGdpFixture();
    const malformed = "時間軸（暦年）,民間最終消費支出\n2025,NaN";
    replaceGdpRealCsv(fresh.paths, malformed);
    expect(validateGdpSupport()).toBe("invalid GDP year or value");
  });

  it("reports metadata disappearing after the complete display set preflight", () => {
    const { paths } = writeGdpFixture();
    const metadataPath = paths.supportNominalMetadata;
    const originalExistsSync = existsSyncMock.getMockImplementation()!;
    let removed = false;
    existsSyncMock.mockImplementation((file) => {
      if (file === metadataPath && !removed) {
        removed = true;
        unlinkSync(metadataPath);
        return true;
      }
      return originalExistsSync(file);
    });

    try {
      expect(validateGdpSupport()).toBe("missing GDP metadata");
    } finally {
      existsSyncMock.mockImplementation(originalExistsSync);
    }
  });

  it("rejects malformed annual metadata JSON", () => {
    const { paths } = writeGdpFixture();
    writeFileSync(paths.supportNominalMetadata, "{");

    expect(validateGdpSupport()).toBe("invalid GDP metadata");
  });

  const invalidNormalizationCases: Array<[string, Record<string, unknown>, string]> = [
    [
      "wrong normalization year",
      { displayNormalizationYear: 2020 },
      "GDP normalization year mismatch",
    ],
    [
      "wrong CSV reference",
      { nominal: { csv: "other.csv" } },
      "GDP normalization nominal CSV reference mismatch",
    ],
    ["wrong factor", { factors: { nominal: 2, real: 1 } }, "GDP normalization factors mismatch"],
  ];
  it.each(invalidNormalizationCases)("rejects normalization with %s", (_label, patch, expected) => {
    const { paths } = writeGdpFixture();
    const normalization = JSON.parse(readFileSync(paths.gdpDisplayNormalization, "utf8"));
    const nested = patch as {
      nominal?: Record<string, unknown>;
      factors?: Record<string, number>;
    };
    writeJson(paths.gdpDisplayNormalization, {
      ...normalization,
      ...patch,
      nominal: { ...normalization.nominal, ...nested.nominal },
      factors: { ...normalization.factors, ...nested.factors },
    });

    expect(validateGdpSupport()).toBe(expected);
  });

  it("rejects malformed normalization JSON and a zero 2025 normalization base", () => {
    const { paths } = writeGdpFixture();
    writeFileSync(paths.gdpDisplayNormalization, "{");
    expect(validateGdpSupport()).toBe("invalid GDP normalization record");

    const { paths: zeroBasePaths } = writeGdpFixture();
    const zeroBase = [
      "時間軸（暦年）,民間最終消費支出",
      ...Array.from({ length: 32 }, (_, index) => `${1994 + index},${index === 31 ? 0 : 100}`),
    ].join("\n");
    replaceGdpNominalCsv(zeroBasePaths, zeroBase);
    expect(validateGdpSupport()).toBe("missing or invalid 2025 annual GDP value");
  });

  it("reports a missing annual support file before reading metadata", () => {
    const { paths } = writeGdpFixture();
    unlinkSync(paths.candidateSupportNominal);

    expect(validateGdpSupport()).toBe("missing GDP display set file");
  });
});

describe("quarterly GDP support validation", () => {
  beforeEach(() => buildCtiFilePathsMock.mockReset());

  it("validates and converts a full independent quarterly comparison set", () => {
    writeGdpFixture();

    expect(validateQuarterlyGdpSupport()).toMatchObject({
      valid: true,
      comparisonReady: true,
      independentConfirmation: "ready",
      normalizationFactors: { nominal: 1, real: 1.25 },
    });
    const data = loadQuarterlyGdpData();
    expect(data.rows).toHaveLength(84);
    expect(data.comparisonReady).toBe(true);
    expect(data.rows[0]).toMatchObject({ nominalRaw: 100, realRaw: 80 });
    expect(data.rows[0]).toHaveProperty("nominalComparison");
    expect(data.rows[0]).toHaveProperty("realComparison");
  });

  it("retains validated raw rows until independent confirmation is ready", () => {
    const { paths } = writeGdpFixture();
    const metadata = JSON.parse(readFileSync(paths.quarterlySupportNominalMetadata, "utf8"));
    metadata.independentConfirmation = "pending-independent-confirmation";
    metadata.estatSource.comparison.status = "pending";
    writeJson(paths.quarterlySupportNominalMetadata, metadata);
    const validation = validateQuarterlyGdpSupport();

    expect(validation).toMatchObject({ valid: true, comparisonReady: false });
    expect(loadQuarterlyGdpData()).toMatchObject({
      comparisonReady: false,
      rows: expect.arrayContaining([expect.objectContaining({ nominalRaw: 100, realRaw: 80 })]),
    });
    expect(loadQuarterlyGdpData().rows[0]).not.toHaveProperty("nominalComparison");
  });

  it.each([
    ["missing metadata file", "missing-meta"],
    ["missing real series metadata", "real-missing-meta"],
    ["malformed metadata JSON", "bad-meta-json"],
    ["mismatched CSV digest", "bad-hash"],
    ["wrong quarterly period declaration", "wrong-period"],
    ["wrong e-Stat series identity", "wrong-source"],
    ["unsupported row count", "short-data"],
    ["invalid data period", "bad-row-period"],
    ["zero data value", "zero-row-value"],
    ["duplicate data period", "duplicate-row-period"],
    ["snapshot digest mismatch", "snapshot-hash"],
    ["snapshot header shape", "snapshot-shape"],
    ["snapshot data comparison", "snapshot-compare"],
    ["noncontinuous quarter sequence", "period-gap"],
    ["zero-average comparison base", "zero-quarterly-base"],
    ["invalid confirmation state", "bad-confirmation"],
    ["failed independent confirmation", "failed-confirmation"],
    ["failed ready comparison", "failed-ready-comparison"],
  ])("fails closed for quarterly input with %s", (_label, defect) => {
    const { paths } = writeGdpFixture();
    const nominalCsv = quarterlyRowsFor("current-prices", 100);
    if (defect === "missing-meta") unlinkSync(paths.quarterlySupportNominalMetadata);
    if (defect === "real-missing-meta") unlinkSync(paths.quarterlySupportRealMetadata);
    if (defect === "bad-meta-json") writeFileSync(paths.quarterlySupportNominalMetadata, "{");
    if (defect === "bad-hash") {
      const metadata = JSON.parse(readFileSync(paths.quarterlySupportNominalMetadata, "utf8"));
      writeJson(paths.quarterlySupportNominalMetadata, { ...metadata, csvSha256: "0".repeat(64) });
    }
    if (defect === "wrong-period") {
      const metadata = JSON.parse(readFileSync(paths.quarterlySupportNominalMetadata, "utf8"));
      writeJson(paths.quarterlySupportNominalMetadata, {
        ...metadata,
        period: { ...metadata.period, start: "2006-Q1" },
      });
    }
    if (defect === "wrong-source") {
      const metadata = JSON.parse(readFileSync(paths.quarterlySupportNominalMetadata, "utf8"));
      writeJson(paths.quarterlySupportNominalMetadata, {
        ...metadata,
        estatSource: { ...metadata.estatSource, statsDataId: "wrong-id" },
      });
    }
    if (defect === "short-data") {
      replaceQuarterlySupportCsv(
        paths,
        "current-prices",
        nominalCsv.split("\n").slice(0, -1).join("\n"),
      );
    }
    if (defect === "bad-row-period") {
      replaceQuarterlySupportCsv(paths, "current-prices", nominalCsv.replace("2005-Q1", "2005-Q0"));
    }
    if (defect === "zero-row-value") {
      replaceQuarterlySupportCsv(
        paths,
        "current-prices",
        nominalCsv.replace("2005-Q1,100", "2005-Q1,0"),
      );
    }
    if (defect === "duplicate-row-period") {
      replaceQuarterlySupportCsv(
        paths,
        "current-prices",
        nominalCsv.replace("2005-Q1,100", "2005-Q2,100"),
      );
    }
    if (defect === "snapshot-hash") {
      writeFileSync(paths.quarterlyOfficialNominal, "tampered snapshot");
    }
    if (defect === "snapshot-shape") {
      const shape = nominalCsv.replace("period,value,series,priceMeasure", "period,value");
      writeFileSync(paths.quarterlySupportNominal, shape);
      writeFileSync(paths.quarterlyOfficialNominal, shape);
      writeFileSync(paths.quarterlyEstatNominal, shape);
      const metadata = JSON.parse(readFileSync(paths.quarterlySupportNominalMetadata, "utf8"));
      const hash = createHash("sha256").update(shape).digest("hex");
      writeJson(paths.quarterlySupportNominalMetadata, {
        ...metadata,
        csvSha256: hash,
        estatSource: { ...metadata.estatSource, snapshotCsvSha256: hash },
      });
    }
    if (defect === "snapshot-compare") {
      const wrongSeries = nominalCsv.replaceAll(
        "private-final-consumption-expenditure",
        "other-series",
      );
      replaceQuarterlySupportCsv(paths, "current-prices", wrongSeries);
    }
    if (defect === "period-gap") {
      const gap = [
        "period,value,series,priceMeasure",
        ...Array.from({ length: 84 }, (_, index) => {
          const shifted = index >= 8 ? index + 1 : index;
          const year = 2005 + Math.floor(shifted / 4);
          const quarter = (shifted % 4) + 1;
          return `${year}-Q${quarter},100,private-final-consumption-expenditure,current-prices`;
        }),
      ].join("\n");
      replaceQuarterlySupportCsv(paths, "current-prices", gap);
    }
    if (defect === "zero-quarterly-base") {
      const zeroBase = nominalCsv.replace(
        "2025-Q1,100,private-final-consumption-expenditure,current-prices\n2025-Q2,100,private-final-consumption-expenditure,current-prices\n2025-Q3,100,private-final-consumption-expenditure,current-prices\n2025-Q4,100,private-final-consumption-expenditure,current-prices",
        "2025-Q1,1,private-final-consumption-expenditure,current-prices\n2025-Q2,-1,private-final-consumption-expenditure,current-prices\n2025-Q3,1,private-final-consumption-expenditure,current-prices\n2025-Q4,-1,private-final-consumption-expenditure,current-prices",
      );
      replaceQuarterlySupportCsv(paths, "current-prices", zeroBase);
    }
    if (defect === "bad-confirmation") {
      const metadata = JSON.parse(readFileSync(paths.quarterlySupportNominalMetadata, "utf8"));
      writeJson(paths.quarterlySupportNominalMetadata, {
        ...metadata,
        independentConfirmation: "unknown",
      });
    }
    if (defect === "failed-confirmation") {
      const metadata = JSON.parse(readFileSync(paths.quarterlySupportNominalMetadata, "utf8"));
      writeJson(paths.quarterlySupportNominalMetadata, {
        ...metadata,
        independentConfirmation: "failed",
        estatSource: {
          ...metadata.estatSource,
          comparison: { ...metadata.estatSource.comparison, status: "failed" },
        },
      });
    }
    if (defect === "failed-ready-comparison") {
      const metadata = JSON.parse(readFileSync(paths.quarterlySupportNominalMetadata, "utf8"));
      writeJson(paths.quarterlySupportNominalMetadata, {
        ...metadata,
        estatSource: {
          ...metadata.estatSource,
          comparison: { ...metadata.estatSource.comparison, mismatches: 1 },
        },
      });
    }

    const result = validateQuarterlyGdpSupport();
    if (defect === "failed-confirmation") {
      expect(result).toMatchObject({
        valid: true,
        comparisonReady: false,
        independentConfirmation: "failed",
      });
      const data = loadQuarterlyGdpData();
      expect(data.rows).toHaveLength(84);
      expect(data.comparisonReady).toBe(false);
      expect(data.rows[0]).not.toHaveProperty("nominalComparison");
      return;
    }
    expect(result.valid).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(loadQuarterlyGdpData()).toEqual({ rows: [], comparisonReady: false });
  });
});
