import * as fs from "node:fs";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    existsSync: vi.fn(actual.existsSync),
    readFileSync: vi.fn(actual.readFileSync),
  };
});
import { buildCpiFilePaths, buildCtiFilePaths } from "../../../../server/lib/dataIo";
import { getCpiDataStatus, getCtiDataStatus } from "../../../../server/lib/data-loader/cpi";
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
};

const golden = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "tests/fixtures/loader-comparison/golden.json"), "utf8"),
) as Golden;
const cpiPaths = buildCpiFilePaths();
const ctiPaths = buildCtiFilePaths();
const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");

function blockFiles(...blocked: string[]) {
  vi.mocked(fs.existsSync).mockImplementation(
    (file) => !blocked.includes(String(file)) && actualFs.existsSync(file),
  );
}

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

  it("compares normal CPI and CTI data/status with independent golden values", async () => {
    const cpi = await observeLoader(loadCpiData, getCpiDataStatus);
    const cti = await observeLoader(loadCtiData, getCtiDataStatus);
    const cpiComparison = compareObservationToGolden(cpi, golden.cpi.observation);
    const ctiComparison = compareObservationToGolden(cti, golden.cti.observation);
    expect.soft(cpiComparison).toEqual({
      matches: true,
      digest: golden.cpi.observation.digest,
      expectedDigest: golden.cpi.observation.digest,
      metadataMatches: true,
    });
    expect.soft(ctiComparison).toEqual({
      matches: true,
      digest: golden.cti.observation.digest,
      expectedDigest: golden.cti.observation.digest,
      metadataMatches: true,
    });
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
    ["CPI", cpiPaths.main, () => observeLoader(loadCpiData, getCpiDataStatus)],
    ["CTI", ctiPaths.candidateMain, () => observeLoader(loadCtiData, getCtiDataStatus)],
  ] as const)("fails closed when %s 2025 is invalid", async (_name, file, observe) => {
    blockFiles(file);
    const observed = await observe();
    expect(observed.value).toEqual([]);
    expect(observed.status).toMatchObject({ valid: false, baseYear: null, pair: null });
    expect(observed.status?.reason).toEqual(expect.any(String));
    expect(observed.status?.reason).not.toEqual("");
  });

  it("fails closed and exposes a classified reason when all CPI/CTI source pairs are invalid", async () => {
    blockFiles(
      cpiPaths.main,
      cpiPaths.contribution,
      ctiPaths.candidateMain,
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
    expect(cpi.status?.reason).toEqual("cpi_source_missing");
    expect(cti.value).toEqual([]);
    expect(cti.status).toMatchObject({
      valid: false,
      baseYear: null,
      pair: null,
    });
    expect(cti.status?.reason).toEqual("cti_source_missing");
  });
});
