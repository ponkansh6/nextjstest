import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  const existsSync = vi.fn(actual.existsSync);
  const readFileSync = vi.fn(actual.readFileSync);
  const mockedFs = { ...actual, existsSync, readFileSync };
  return {
    ...actual,
    ...mockedFs,
    default: mockedFs,
  };
});

import {
  getGdpSupportStatus,
  getQuarterlyGdpSupportStatus,
  loadQuarterlyGdpData,
  validateQuarterlyGdpSupport,
  isQuarterlyComparisonReady,
} from "../../../../../server/lib/data-loader/gdpSupport";
import type { GdpMetadata } from "../../../../../server/lib/data-loader/gdpSupport";
import { buildCtiFilePaths } from "../../../../../server/lib/dataIo";

describe("GDP support validation boundary", () => {
  it("models the annual metadata shape used by the validator", () => {
    const metadata: GdpMetadata = {
      status: "ready",
      seriesConcept: "private-final-consumption-expenditure",
      seriesCode: "12",
      seriesName: "民間最終消費支出",
      priceMeasure: "current-prices",
      displayNormalizationYear: 2025,
      unit: "10億円",
      rawValuePreserved: true,
      csvSha256: "a".repeat(64),
      sourceFrequency: "annual",
      period: { start: "1994", end: "2025", annualRows: 32 },
    };
    expect(metadata.sourceFrequency).toBe("annual");
  });

  // Metadata-only predicate: row contents are intentionally not an input.
  it("isQuarterlyComparisonReady is a metadata-only predicate", () => {
    expect(isQuarterlyComparisonReady({ independentConfirmation: "ready" })).toBe(false);
    expect(
      isQuarterlyComparisonReady({
        estatSource: { comparison: { status: "ready", rowsCompared: 84, mismatches: 1 } },
      }),
    ).toBe(false);
    expect(
      isQuarterlyComparisonReady({
        independentConfirmation: "ready",
        estatSource: { comparison: { status: "ready", rowsCompared: 84, mismatches: 0 } },
      }),
    ).toBe(true);
  });

  it("rejects a ready comparison paired with pending or failed confirmation metadata", () => {
    const comparison = {
      estatSource: { comparison: { status: "ready", rowsCompared: 84, mismatches: 0 } },
    };
    expect(
      isQuarterlyComparisonReady({
        ...comparison,
        independentConfirmation: "pending-independent-confirmation",
      }),
    ).toBe(false);
    expect(isQuarterlyComparisonReady({ ...comparison, independentConfirmation: "failed" })).toBe(
      false,
    );
  });
  it("keeps annual and quarterly status contracts independent", async () => {
    const annual = getGdpSupportStatus();
    const quarterly = validateQuarterlyGdpSupport();
    expect(annual).toHaveProperty("valid");
    expect(quarterly).toMatchObject({
      valid: expect.any(Boolean),
      comparisonReady: expect.any(Boolean),
      independentConfirmation: expect.stringMatching(
        /^(pending-independent-confirmation|ready|failed)$/,
      ),
    });
    await expect(getQuarterlyGdpSupportStatus()).resolves.toEqual(quarterly);
  });

  it("keeps validated raw quarterly rows while withholding unready comparisons", () => {
    const data = loadQuarterlyGdpData();
    const status = validateQuarterlyGdpSupport();
    expect(data).toHaveProperty("rows");
    expect(data).toHaveProperty("comparisonReady");
    expect(data.rows).toHaveLength(status.valid ? 84 : 0);
    if (status.valid && !data.comparisonReady) {
      expect(
        data.rows.every(
          (row) =>
            !Object.hasOwn(row, "nominalComparison") && !Object.hasOwn(row, "realComparison"),
        ),
      ).toBe(true);
    }
    for (const row of data.rows) {
      expect(row.period).toMatch(/^\d{4}-Q[1-4]$/);
      expect(row).toHaveProperty("nominalRaw");
      expect(row).toHaveProperty("realRaw");
    }
  });

  it("fails closed with empty data when a quarterly artifact is missing", () => {
    const paths = buildCtiFilePaths();
    const existsSync = vi.mocked(fs.existsSync);
    const originalExistsSync = existsSync.getMockImplementation()!;
    existsSync.mockImplementation((file) =>
      file === paths.quarterlySupportNominal ? false : originalExistsSync(file),
    );

    try {
      expect(loadQuarterlyGdpData()).toEqual({ rows: [], comparisonReady: false });
    } finally {
      existsSync.mockImplementation(originalExistsSync);
    }
  });

  it.each([
    ["pending-independent-confirmation", "pending"],
    ["failed", "failed"],
  ] as const)(
    "retains raw rows without comparisons for %s metadata",
    (confirmation, comparisonStatus) => {
      const paths = buildCtiFilePaths();
      const readFileSync = vi.mocked(fs.readFileSync);
      const originalReadFileSync = readFileSync.getMockImplementation()!;
      readFileSync.mockImplementation(((file: fs.PathLike | number, options?: any) => {
        if (
          options === "utf8" &&
          (file === paths.quarterlySupportNominalMetadata ||
            file === paths.quarterlySupportRealMetadata)
        ) {
          const metadata = JSON.parse(originalReadFileSync(file, "utf8") as string);
          metadata.independentConfirmation = confirmation;
          metadata.estatSource.comparison.status = comparisonStatus;
          return JSON.stringify(metadata);
        }
        return originalReadFileSync(file, options);
      }) as typeof fs.readFileSync);

      try {
        const data = loadQuarterlyGdpData();
        expect(data.rows).toHaveLength(84);
        expect(data.comparisonReady).toBe(false);
        expect(
          data.rows.every(
            (row) =>
              !Object.hasOwn(row, "nominalComparison") && !Object.hasOwn(row, "realComparison"),
          ),
        ).toBe(true);
        expect(data.rows[0]).toMatchObject({
          nominalRaw: expect.any(Number),
          realRaw: expect.any(Number),
        });
      } finally {
        readFileSync.mockImplementation(originalReadFileSync);
      }
    },
  );
});
