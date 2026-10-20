import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Papa from "papaparse";
import { buildCtiFilePaths } from "../../../../../server/lib/dataIo";
import {
  isContinuousMonths,
  selectCtiPair,
  validateCtiMetadata,
  validateCtiPair,
  mapCtiReasonToCode,
} from "../../../../../server/lib/data-loader/ctiValidation";

function validateWithDerivedFiles(
  metadataOverrides: Record<string, unknown> = {},
  mapTransform: (csv: string) => string = (csv) => csv,
) {
  const paths = buildCtiFilePaths();
  const root = mkdtempSync(path.join(tmpdir(), "cti-derived-validation-"));
  const metadata = JSON.parse(readFileSync(paths.metadata, "utf8")) as Record<string, unknown>;
  const map = mapTransform(readFileSync(paths.seriesMap, "utf8"));
  const snapshot = readFileSync(paths.officialSnapshot, "utf8");
  const metadataPath = path.join(root, "metadata.json");
  const mapPath = path.join(root, "series-map.csv");
  const snapshotPath = path.join(root, "official-series.csv");
  writeFileSync(mapPath, map);
  writeFileSync(snapshotPath, snapshot);
  writeFileSync(metadataPath, JSON.stringify({ ...metadata, ...metadataOverrides }));

  return validateCtiPair(
    {
      baseYear: 2025,
      pair: "2025",
      mainPath: paths.candidateMain,
    },
    { ...paths, metadata: metadataPath, seriesMap: mapPath, officialSnapshot: snapshotPath },
  );
}

describe("CTI validation boundary", () => {
  it("rejects a discontinuous candidate before selection", () => {
    expect(isContinuousMonths(["2025年1月", "2025年3月"])).toBe(false);
    expect(isContinuousMonths(["2025年1月", "2025年2月"])).toBe(true);
  });

  it("supports automatic 2025 selection and fail-closed metadata", () => {
    const selected = selectCtiPair({ source: "auto" });
    expect(selected).toMatchObject({ pair: { baseYear: 2025, pair: "2025" } });
    expect(validateCtiMetadata("/path/that/does/not/exist", "candidate.csv")).toBe(
      "missing metadata",
    );
  });

  it("validateCtiPair accepts the valid 2025 candidate", () => {
    const paths = buildCtiFilePaths();
    const pair = {
      baseYear: 2025 as const,
      pair: "2025" as const,
      mainPath: paths.candidateMain,
    };

    expect(validateCtiPair(pair, paths)).toEqual(pair);
  });

  it("keeps required-file and main-CSV failures ahead of later metadata failures", () => {
    const paths = buildCtiFilePaths();
    const root = mkdtempSync(path.join(tmpdir(), "cti-validation-order-"));
    const mainPath = path.join(root, "main.csv");
    const metadataPath = path.join(root, "metadata.json");
    writeFileSync(mainPath, "title,other\n2025,1\n");
    writeFileSync(metadataPath, "{");
    const pair = { baseYear: 2025 as const, pair: "2025" as const, mainPath };

    expect(validateCtiPair(pair, { ...paths, seriesMap: path.join(root, "missing-map.csv") })).toBe(
      "missing required CTI set file",
    );
    expect(validateCtiPair(pair, { ...paths, metadata: metadataPath })).toBe(
      "missing CTI 年月 header",
    );
  });

  it("preserves the main CSV read exception and metadata read catch boundaries", () => {
    const paths = buildCtiFilePaths();
    const directory = mkdtempSync(path.join(tmpdir(), "cti-read-boundary-"));
    expect(validateCtiMetadata(directory, "candidate.csv")).toBe("invalid metadata");

    expect(() =>
      validateCtiPair({ baseYear: 2025, pair: "2025", mainPath: directory }, paths),
    ).toThrow();
  });

  it("maps an exception while validating loaded metadata to invalid metadata", () => {
    const root = mkdtempSync(path.join(tmpdir(), "cti-metadata-validation-error-"));
    const metadataPath = path.join(root, "metadata.json");
    writeFileSync(metadataPath, "{}");
    const parse = vi.spyOn(JSON, "parse").mockImplementation(
      () =>
        new Proxy(
          {},
          {
            get: () => {
              throw new Error("metadata access failed");
            },
          },
        ),
    );

    try {
      expect(validateCtiMetadata(metadataPath, "candidate.csv")).toBe("invalid metadata");
    } finally {
      parse.mockRestore();
    }
  });

  it("rejects null metadata returned by the JSON parser", () => {
    const root = mkdtempSync(path.join(tmpdir(), "cti-null-metadata-"));
    const metadataPath = path.join(root, "metadata.json");
    writeFileSync(metadataPath, "{}");
    const parse = vi.spyOn(JSON, "parse").mockReturnValue(null);

    try {
      expect(validateCtiMetadata(metadataPath, "candidate.csv")).toBe("invalid metadata");
    } finally {
      parse.mockRestore();
    }
  });

  it("validates the main CSV when its month column is labeled 年月", () => {
    const paths = buildCtiFilePaths();
    const mainCsv = readFileSync(paths.candidateMain, "utf8");
    const quarterlyCsv = readFileSync(paths.candidateDistributionAdjustedQuarterly, "utf8");
    const originalParse = Papa.parse.bind(Papa);
    let changedMainHeader = false;
    let parsedQuarterlyWithoutErrors = false;
    const parse = vi.spyOn(Papa, "parse").mockImplementation(((input: unknown, config: unknown) => {
      const result = originalParse(input as string, config as never) as unknown as {
        data: unknown[];
        errors: unknown[];
      };
      if (input === mainCsv) {
        const rows = result.data as string[][];
        const header = rows.find((row) =>
          row.some((cell) => cell?.trim() === "年月" || cell?.trim() === "月"),
        );
        if (header) {
          for (let index = 0; index < header.length; index += 1) {
            if (header[index]?.trim() === "月") header[index] = "年月";
          }
          expect(header.some((cell) => cell?.trim() === "年月")).toBe(true);
          expect(header.every((cell) => cell?.trim() !== "月")).toBe(true);
          changedMainHeader = true;
        }
      }
      if (input === quarterlyCsv) parsedQuarterlyWithoutErrors = result.errors.length === 0;
      return result as never;
    }) as never);

    try {
      expect(
        validateCtiPair({ baseYear: 2025, pair: "2025", mainPath: paths.candidateMain }, paths),
      ).toEqual({ baseYear: 2025, pair: "2025", mainPath: paths.candidateMain });
      expect(changedMainHeader).toBe(true);
      expect(parsedQuarterlyWithoutErrors).toBe(true);
    } finally {
      parse.mockRestore();
    }
  });

  it("rejects quarterly CSV parse errors as an invalid quarterly period range", () => {
    const paths = buildCtiFilePaths();
    const quarterlyCsv = readFileSync(paths.candidateDistributionAdjustedQuarterly, "utf8");
    const originalParse = Papa.parse.bind(Papa);
    const parse = vi.spyOn(Papa, "parse").mockImplementation(((input: unknown, config: unknown) => {
      const result = originalParse(input as string, config as never) as unknown as {
        data: unknown[];
        errors: unknown[];
      };
      return input === quarterlyCsv
        ? { ...result, errors: [...result.errors, { message: "injected parse error" }] }
        : result;
    }) as never);

    try {
      expect(
        validateCtiPair({ baseYear: 2025, pair: "2025", mainPath: paths.candidateMain }, paths),
      ).toBe("invalid official quarterly CTI period range");
    } finally {
      parse.mockRestore();
    }
  });

  it("preserves the distribution CSV read before the main CSV digest check", () => {
    const paths = buildCtiFilePaths();
    const root = mkdtempSync(path.join(tmpdir(), "cti-digest-snapshot-order-"));
    const metadataPath = path.join(root, "metadata.json");
    const metadata = JSON.parse(readFileSync(paths.metadata, "utf8")) as Record<string, unknown>;
    metadata.csvSha256 = "f".repeat(64);
    writeFileSync(metadataPath, JSON.stringify(metadata));
    const distributionDirectory = mkdtempSync(path.join(tmpdir(), "cti-distribution-read-error-"));

    expect(() =>
      validateCtiPair(
        { baseYear: 2025, pair: "2025", mainPath: paths.candidateMain },
        {
          ...paths,
          metadata: metadataPath,
          candidateDistributionAdjusted: distributionDirectory,
        },
      ),
    ).toThrow();
  });

  it("maps a quarterly metadata read failure to the existing combined JSON reason", () => {
    const paths = buildCtiFilePaths();
    const quarterlyMetadataDirectory = mkdtempSync(
      path.join(tmpdir(), "cti-quarterly-metadata-read-error-"),
    );

    expect(
      validateCtiPair(
        { baseYear: 2025, pair: "2025", mainPath: paths.candidateMain },
        {
          ...paths,
          candidateDistributionAdjustedQuarterlyMetadata: quarterlyMetadataDirectory,
        },
      ),
    ).toBe("invalid official quarterly metadata or composition-adjusted annual manifest");
  });

  it("keeps map headers and metadata basis ahead of later metadata and digest failures", () => {
    const paths = buildCtiFilePaths();
    const root = mkdtempSync(path.join(tmpdir(), "cti-validation-stage-order-"));
    const mapPath = path.join(root, "map.csv");
    const metadataPath = path.join(root, "metadata.json");
    writeFileSync(mapPath, "wrong,headers\n");
    writeFileSync(metadataPath, "{");
    expect(
      validateCtiPair(
        { baseYear: 2025, pair: "2025", mainPath: paths.candidateMain },
        { ...paths, seriesMap: mapPath, metadata: metadataPath },
      ),
    ).toBe("invalid 2025 series map headers");

    expect(
      validateWithDerivedFiles({
        sourceBasis: undefined,
        officialSeriesMapSha256: "f".repeat(64),
      }),
    ).toBe("2025 CTI metadata basis fields are missing");
    expect(
      validateWithDerivedFiles({
        officialSeriesMapSha256: "f".repeat(64),
        period: { start: "wrong", end: "wrong", monthlyRows: 1 },
      }),
    ).toBe("2025 CTI derived map/snapshot identity or SHA-256 mismatch");
  });

  it("keeps quarterly artifact identity failure ahead of quarterly period failure", () => {
    const paths = buildCtiFilePaths();
    const root = mkdtempSync(path.join(tmpdir(), "cti-quarterly-validation-order-"));
    const quarterlyPath = path.join(root, "quarterly.csv");
    const quarterlyMetadataPath = path.join(root, "quarterly.metadata.json");
    writeFileSync(quarterlyPath, "invalid quarterly input\n");
    writeFileSync(quarterlyMetadataPath, JSON.stringify({ schemaVersion: "unknown" }));

    expect(
      validateCtiPair(
        { baseYear: 2025, pair: "2025", mainPath: paths.candidateMain },
        {
          ...paths,
          candidateDistributionAdjustedQuarterly: quarterlyPath,
          candidateDistributionAdjustedQuarterlyMetadata: quarterlyMetadataPath,
        },
      ),
    ).toBe("official quarterly CTI artifact/metadata/manifest mismatch");
  });

  it.each([
    ["missing series map digest", { officialSeriesMapSha256: undefined }],
    ["missing snapshot digest", { officialSeriesSnapshotSha256: undefined }],
    ["mismatched series map digest", { officialSeriesMapSha256: "f".repeat(64) }],
    ["mismatched snapshot digest", { officialSeriesSnapshotSha256: "f".repeat(64) }],
    ["mismatched snapshot source identity", { officialSeriesSnapshotSourceStatInfId: "wrong" }],
    ["mismatched source digest identity", { officialSeriesSnapshotSourceSha256: "f".repeat(64) }],
  ] as const)("rejects derived CTI artifacts with %s", (_label, overrides) => {
    expect(validateWithDerivedFiles(overrides)).toBe(
      "2025 CTI derived map/snapshot identity or SHA-256 mismatch",
    );
  });

  it("rejects a map source identity mismatch even when its declared digest is updated", () => {
    const paths = buildCtiFilePaths();
    const map = readFileSync(paths.seriesMap, "utf8").replace(
      "00401-01,消費支出（名目）,000040499069",
      "00401-01,消費支出（名目）,000000000000",
    );

    expect(
      validateWithDerivedFiles(
        { officialSeriesMapSha256: createHash("sha256").update(map).digest("hex") },
        () => map,
      ),
    ).toBe("2025 series map source identity mismatch");
  });

  it.each([
    ["missing metadata", "cti_source_missing"],
    ["missing required CTI set file", "cti_source_missing"],
    ["missing CTI 年月 header", "cti_source_missing"],
    ["metadata is not ready for 2025", "cti_metadata_invalid"],
    ["metadata file pairing mismatch", "cti_metadata_invalid"],
    ["invalid metadata", "cti_metadata_invalid"],
    ["invalid 2025 series map headers", "cti_metadata_invalid"],
    ["invalid 2025 official snapshot headers", "cti_metadata_invalid"],
    ["2025 CTI metadata basis fields are missing", "cti_metadata_invalid"],
    ["metadata SHA-256 is missing or invalid", "cti_hash_mismatch"],
    ["metadata SHA-256 mismatch", "cti_hash_mismatch"],
    ["missing required CTI total headers", "cti_schema_invalid"],
    ["invalid CTI required numeric value", "cti_schema_invalid"],
    ["invalid or duplicate 2025 series map rows", "cti_schema_invalid"],
    ["invalid or duplicate 2025 official snapshot rows", "cti_schema_invalid"],
    ["2025 series map and official snapshot code set mismatch", "cti_schema_invalid"],
    ["invalid or discontinuous CTI 年月", "cti_period_invalid"],
    ["invalid or duplicate CTI 年月", "cti_period_invalid"],
    ["2025 CTI metadata period mismatch", "cti_period_invalid"],
    ["incomplete 2025 CTI calendar year", "cti_period_invalid"],
    ["missing official quarterly source workbook", "cti_required_support_unavailable"],
    ["unrecognized validation reason", "cti_fail_closed"],
  ] as const)("maps %s to %s", (validation, code) => {
    expect(mapCtiReasonToCode(validation)).toBe(code);
  });
});
