import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    existsSync: vi.fn(actual.existsSync),
    readFileSync: vi.fn(actual.readFileSync),
  };
});
import { buildCpiFilePaths, buildCtiFilePaths } from "../../../../server/lib/dataIo";
import {
  getCpiDataStatus,
  getCtiDataStatus,
  getGdpSupportStatus,
  getQuarterlyGdpSupportStatus,
  loadQuarterlyGdpData,
} from "../../../../server/lib/data-loader/cpi";
import { loadCpiData, loadCtiData } from "../../../../server/lib/dataLoader";
import {
  compareLoaderFixtures,
  compareObservationToGolden,
  observeLoader,
  type LoaderObservation,
  type ObservationGoldenContract,
} from "../../../utils/loader-comparison";

type Golden = {
  cpi: {
    period: string;
    総合: number;
    status: Record<string, unknown>;
    observation: ObservationGoldenContract;
  };
  cti: {
    period: string;
    名目: number;
    実質: number;
    status: Record<string, unknown>;
    observation: ObservationGoldenContract;
  };
  annualGdp: {
    years: string[];
    nominal: Record<string, { raw: number; comparison: number }>;
    real: Record<string, { raw: number; comparison: number }>;
    status: Record<string, unknown>;
    sourceMode: string;
    errors: { load: null; status: null };
    observation: ObservationGoldenContract;
    sourceArtifacts: Record<string, string>;
  };
  quarterlyGdp: {
    periods: string[];
    nominal: Record<string, number>;
    real: Record<string, number>;
    status: Record<string, unknown>;
    observation: ObservationGoldenContract;
    sourceArtifacts: Record<string, string>;
  };
};

const golden = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "tests/fixtures/loader-comparison/golden.json"), "utf8"),
) as Golden;
const annualGoldenYears = new Set(golden.annualGdp.years);
const annualGoldenYearRange = { start: 1994, end: 2025 } as const;
const cpiPaths = buildCpiFilePaths();
const ctiPaths = buildCtiFilePaths();
const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");

const annualArtifactPaths = [
  ["nominalCsvSha256", ctiPaths.candidateSupportNominal],
  ["realCsvSha256", ctiPaths.candidateSupportReal],
  ["nominalMetadataSha256", ctiPaths.supportNominalMetadata],
  ["realMetadataSha256", ctiPaths.supportRealMetadata],
  ["normalizationSha256", ctiPaths.gdpDisplayNormalization],
] as const;
const quarterlyArtifactPaths = [
  ["nominalCsvSha256", ctiPaths.quarterlySupportNominal],
  ["realCsvSha256", ctiPaths.quarterlySupportReal],
  ["normalizationSha256", ctiPaths.quarterlyNormalization],
] as const;

function sha256File(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function expectArtifactHashes(
  artifacts: Record<string, string>,
  expectedPaths: readonly (readonly [string, string])[],
) {
  for (const [artifact, file] of expectedPaths) {
    expect(fs.existsSync(file), `${artifact} path exists: ${file}`).toBe(true);
    expect(sha256File(file), `${artifact} hash: ${file}`).toBe(artifacts[artifact]);
  }
}

function blockFiles(...blocked: string[]) {
  vi.mocked(fs.existsSync).mockImplementation(
    (file) => !blocked.includes(String(file)) && actualFs.existsSync(file),
  );
}

const cacheContract = "not-applicable: no runtime cache wrapper" as const;

// The public annual loader path has no runtime cache wrapper; this is an audit
// fact, not a request to add cache behavior.
describe("loader fixture comparison gate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(fs.existsSync).mockImplementation(actualFs.existsSync);
    vi.mocked(fs.readFileSync).mockImplementation(actualFs.readFileSync);
  });

  it("observes data and status independently", () => {
    const sourceObservation: LoaderObservation<{ value: number }, { valid: boolean }> = {
      value: { value: 1 },
      status: { valid: true },
      error: { load: null, status: null },
    };
    expect(
      compareLoaderFixtures(sourceObservation, {
        ...sourceObservation,
        status: { valid: false },
      }),
    ).toEqual({
      dataEqual: true,
      statusEqual: false,
      errorEqual: true,
      equal: false,
    });
  });

  it("matches every golden source artifact path and SHA-256", () => {
    expectArtifactHashes(golden.annualGdp.sourceArtifacts, annualArtifactPaths);
    expectArtifactHashes(golden.quarterlyGdp.sourceArtifacts, quarterlyArtifactPaths);
  });

  it("compares normal CPI and CTI data/status with independent golden values", async () => {
    const cpi = await observeLoader(loadCpiData, getCpiDataStatus);
    const cti = await observeLoader(loadCtiData, getCtiDataStatus);
    expect(compareObservationToGolden(cpi, golden.cpi.observation).matches).toBe(true);
    expect(compareObservationToGolden(cti, golden.cti.observation).matches).toBe(true);
    expect(cpi.status).toMatchObject(golden.cpi.status);
    expect(cpi.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          年月: golden.cpi.period,
          総合: golden.cpi.総合,
        }),
      ]),
    );
    expect(cti.status).toMatchObject(golden.cti.status);
    expect(cti.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          年月: golden.cti.period,
          "消費支出（名目）": golden.cti.名目,
          "消費支出（実質）": golden.cti.実質,
        }),
      ]),
    );
    expect(cpi.error).toEqual({ load: null, status: null });
    expect(cti.error).toEqual({ load: null, status: null });
  });

  it.each([
    ["CPI", cpiPaths.main, loadCpiData, getCpiDataStatus],
    ["CTI", ctiPaths.candidateMain, loadCtiData, getCtiDataStatus],
  ] as const)(
    "uses the 2020 rollback when %s 2025 is invalid",
    async (_name, file, load, status) => {
      blockFiles(file);
      const observed = await observeLoader(load, status);
      expect(observed.value).not.toEqual([]);
      expect(observed.status).toMatchObject({
        valid: true,
        baseYear: 2020,
        pair: "2020",
      });
    },
  );

  it("fails closed and exposes a classified reason when all CPI/CTI source pairs are invalid", async () => {
    blockFiles(
      cpiPaths.main,
      cpiPaths.contribution,
      cpiPaths.fallbackMain,
      cpiPaths.fallbackContribution,
      ctiPaths.candidateMain,
      ctiPaths.main,
      ctiPaths.supportNominal,
      ctiPaths.supportReal,
      ctiPaths.candidateDistributionAdjusted,
      ctiPaths.candidateDistributionAdjustedMetadata,
      ctiPaths.seriesMap,
      ctiPaths.officialSnapshot,
      ctiPaths.metadata,
    );
    const cpi = await observeLoader(loadCpiData, getCpiDataStatus);
    const cti = await observeLoader(loadCtiData, getCtiDataStatus);
    expect(cpi.value).toEqual([]);
    expect(cpi.status).toMatchObject({
      valid: false,
      baseYear: null,
      pair: null,
    });
    expect(cpi.status?.reason).toEqual(expect.stringContaining("pair"));
    expect(cti.value).toEqual([]);
    expect(cti.status).toMatchObject({
      valid: false,
      baseYear: null,
      pair: null,
    });
    expect(cti.status?.reason).toEqual(expect.stringContaining("pair"));
  });

  it("publishes annual GDP raw and comparison values through the public monthly loader (not-applicable: no runtime cache wrapper)", async () => {
    const observed = await observeLoader(loadCtiData, getGdpSupportStatus);
    expect(cacheContract).toBe("not-applicable: no runtime cache wrapper");
    const annualPaths = [
      ctiPaths.candidateSupportNominal,
      ctiPaths.candidateSupportReal,
      ctiPaths.supportNominalMetadata,
      ctiPaths.supportRealMetadata,
      ctiPaths.gdpDisplayNormalization,
    ];
    expect(annualPaths.every((file) => actualFs.existsSync(file))).toBe(true);
    expect(compareObservationToGolden(observed, golden.annualGdp.observation).matches).toBe(true);
    const gdpKeys = [
      "民間最終消費支出（名目）",
      "民間最終消費支出（実質）",
      "民間最終消費支出（名目・原値）",
      "民間最終消費支出（実質・原値）",
      "民間最終消費支出（名目・比較指数）",
      "民間最終消費支出（実質・比較指数）",
    ] as const;
    const annualRows = new Map(
      (observed.value ?? [])
        .filter((row) => {
          const year = Number(row.年月.slice(0, 4));
          return (
            /^\d{4}年1月$/.test(row.年月) &&
            year >= annualGoldenYearRange.start &&
            year <= annualGoldenYearRange.end &&
            annualGoldenYears.has(String(year)) &&
            gdpKeys.every((key) => row[key] !== undefined)
          );
        })
        .map((row) => [row.年月.slice(0, 4), row]),
    );

    expect([...annualRows.keys()]).toEqual(golden.annualGdp.years);
    for (const year of golden.annualGdp.years) {
      const row = annualRows.get(year);
      expect(row).toBeDefined();
      expect(row).toMatchObject({
        "民間最終消費支出（名目・原値）": expect.any(Number),
        "民間最終消費支出（名目・比較指数）": expect.any(Number),
        "民間最終消費支出（実質・原値）": expect.any(Number),
        "民間最終消費支出（実質・比較指数）": expect.any(Number),
      });
      const nominal = golden.annualGdp.nominal[year];
      const real = golden.annualGdp.real[year];
      if (nominal) {
        expect(row?.["民間最終消費支出（名目・原値）"]).toBe(nominal.raw);
        expect(row?.["民間最終消費支出（名目・比較指数）"]).toBe(nominal.comparison);
      }
      if (real) {
        expect(row?.["民間最終消費支出（実質・原値）"]).toBe(real.raw);
        expect(row?.["民間最終消費支出（実質・比較指数）"]).toBe(real.comparison);
      }
    }
    expect(observed.status).toMatchObject(golden.annualGdp.status);
    expect(observed.error).toEqual(golden.annualGdp.errors);
    const sourceMode = observed.value?.some(
      (row) => row["民間最終消費支出（名目・原値）"] !== undefined,
    )
      ? "official-connected"
      : "unavailable";
    expect(sourceMode).toBe(golden.annualGdp.sourceMode);
  });

  it.each([
    ["nominal CSV", ctiPaths.candidateSupportNominal],
    ["real CSV", ctiPaths.candidateSupportReal],
    ["nominal metadata", ctiPaths.supportNominalMetadata],
    ["real metadata", ctiPaths.supportRealMetadata],
    ["normalization JSON", ctiPaths.gdpDisplayNormalization],
  ] as const)(
    "fails closed for annual GDP when one source path is blocked: %s",
    async (_name, file) => {
      blockFiles(file);
      const observed = await observeLoader(loadCtiData, getGdpSupportStatus);
      expect(observed.status).toMatchObject({
        valid: false,
        reason: expect.any(String),
      });
      expect(observed.error).toEqual(golden.annualGdp.errors);
      expect(observed.value).not.toEqual([]);
      expect(
        observed.value?.some((row) =>
          [
            "民間最終消費支出（名目）",
            "民間最終消費支出（実質）",
            "民間最終消費支出（名目・原値）",
            "民間最終消費支出（実質・原値）",
            "民間最終消費支出（名目・比較指数）",
            "民間最終消費支出（実質・比較指数）",
          ].some((key) => row[key] !== undefined),
        ),
      ).toBe(false);
      expect(
        observed.value?.some((row) => row["民間最終消費支出（名目・原値）"] !== undefined),
      ).toBe(false);
    },
  );

  it.each([
    ["non-continuous nominal", ctiPaths.candidateSupportNominal],
    ["invalid real", ctiPaths.candidateSupportReal],
  ] as const)("keeps annual GDP content validation for %s", async (_name, file) => {
    vi.mocked(fs.readFileSync).mockImplementation(((target: any, encoding?: any) => {
      const content: any = actualFs.readFileSync(target, encoding);
      if (String(target) !== file || typeof content !== "string") return content;
      return _name.includes("non-continuous")
        ? content.replace("2025,", "2024,").replace("1994,", "bad-year,")
        : content.replace("1994,", "bad-year,");
    }) as typeof fs.readFileSync);
    const observed = await observeLoader(loadCtiData, getGdpSupportStatus);
    expect(observed.status).toMatchObject({
      valid: false,
      reason: expect.any(String),
    });
    expect(
      observed.value?.some((row) =>
        [
          "民間最終消費支出（名目）",
          "民間最終消費支出（実質）",
          "民間最終消費支出（名目・原値）",
          "民間最終消費支出（実質・原値）",
          "民間最終消費支出（名目・比較指数）",
          "民間最終消費支出（実質・比較指数）",
        ].some((key) => row[key] !== undefined),
      ),
    ).toBe(false);
  });

  it("compares the complete quarterly key sequence and both independent series", async () => {
    const data = loadQuarterlyGdpData();
    const status = await getQuarterlyGdpSupportStatus();
    const periods = data.rows.map((row) => row.period);
    const observed = await observeLoader(loadQuarterlyGdpData, getQuarterlyGdpSupportStatus);
    expect(compareObservationToGolden(observed, golden.quarterlyGdp.observation).matches).toBe(
      true,
    );
    expect(periods).toEqual(golden.quarterlyGdp.periods);
    for (const row of data.rows) {
      if (golden.quarterlyGdp.nominal[row.period] !== undefined)
        expect(row.nominalRaw).toBe(golden.quarterlyGdp.nominal[row.period]);
      if (golden.quarterlyGdp.real[row.period] !== undefined)
        expect(row.realRaw).toBe(golden.quarterlyGdp.real[row.period]);
    }
    expect(status).toMatchObject(golden.quarterlyGdp.status);
  });

  it("fails closed when nominal and real quarterly period sets differ", async () => {
    vi.mocked(fs.readFileSync).mockImplementation(((target: any, encoding?: any) => {
      const content: any = actualFs.readFileSync(target, encoding);
      if (String(target) === ctiPaths.quarterlySupportReal && typeof content === "string")
        return content.replace("2005-Q1,", "2005-Q2,");
      return content;
    }) as typeof fs.readFileSync);
    expect(loadQuarterlyGdpData()).toEqual({ rows: [], comparisonReady: false });
    await expect(getQuarterlyGdpSupportStatus()).resolves.toMatchObject({
      valid: false,
      comparisonReady: false,
      independentConfirmation: "failed",
      reason: expect.any(String),
    });
  });

  it.each([
    ["missing nominal", ctiPaths.quarterlySupportNominal],
    ["missing real", ctiPaths.quarterlySupportReal],
    ["duplicate/non-continuous nominal", ctiPaths.quarterlySupportNominal],
    ["out-of-order nominal", ctiPaths.quarterlySupportNominal],
    ["invalid real", ctiPaths.quarterlySupportReal],
  ] as const)("fails closed for quarterly %s", async (_name, file) => {
    if (_name.startsWith("missing")) blockFiles(file);
    else
      vi.mocked(fs.readFileSync).mockImplementation(((target: any, encoding?: any) => {
        const content: any = actualFs.readFileSync(target, encoding);
        if (String(target) !== file || typeof content !== "string") return content;
        return _name.startsWith("duplicate")
          ? content.replace("2005-Q2,", "2005-Q1,")
          : _name.startsWith("out-of-order")
            ? content.replace(/(2005-Q1,[^\n]*\n)(2005-Q2,[^\n]*\n)/, "$2$1")
            : content.replace("2005-Q1,72201.4", "2005-Q1,not-a-number");
      }) as typeof fs.readFileSync);
    expect(loadQuarterlyGdpData()).toEqual({
      rows: [],
      comparisonReady: false,
    });
    await expect(getQuarterlyGdpSupportStatus()).resolves.toMatchObject({
      valid: false,
      comparisonReady: false,
      independentConfirmation: "failed",
      reason: expect.any(String),
    });
  });
});
