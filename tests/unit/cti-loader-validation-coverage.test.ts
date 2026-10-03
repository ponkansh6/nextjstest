import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadCtiAdjustedInputs } from "../../server/lib/data-loader/ctiAdjusted";
import { buildCtiFilePaths } from "../../server/lib/dataIo";
import {
  isContinuousMonths,
  validateCtiLegacySupport,
  validateCtiLegacySupportPair,
  validateCtiMetadata,
  validateCtiPair,
  selectCtiPair,
  mapCtiReasonToCode,
  type CtiPair,
} from "../../server/lib/data-loader/ctiValidation";

const metadata = {
  schemaVersion: "plan39-annual-v1",
  revision: "fixture-r1",
  statisticalCode: "00200567",
  source: "coverage fixture",
  artifact: "fixture.json",
  retrievedAt: "2026-01-01",
  baseYear: 2025,
  unit: "指数",
  valueType: "原数値（名目指数）",
  householdScope: "総世帯",
  frequency: "annual",
  rawRange: { startYear: 2020, endYear: 2020 },
  adoptedRange: { startYear: 2020, endYear: 2020 },
  missingRepresentation: "null",
  sha256: "a".repeat(64),
};

function temporaryDirectory(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function writeJson(file: string, value: unknown): Buffer {
  const bytes = Buffer.from(JSON.stringify(value));
  writeFileSync(file, bytes);
  return bytes;
}

function writeAdjustedManifest(root: string, artifacts: Record<string, unknown>) {
  writeJson(path.join(root, "manifest.json"), {
    schemaVersion: "plan39-annual-v1",
    revision: "fixture-r1",
    statisticalCode: "00200567",
    artifacts,
  });
}

function validJsonArtifact(kind: "B" | "A" | "L") {
  const artifactMetadata = { ...metadata, artifact: `${kind}.json` };
  const bytes = Buffer.from(
    JSON.stringify({
      metadata: artifactMetadata,
      categoryOrder: ["総合", "食料"],
      rows: [{ year: 2020, values: { 総合: 100, 食料: 101 } }],
    }),
  );
  return { bytes, document: JSON.parse(bytes.toString("utf8")) };
}

function writeValidAdjustedSet(root: string) {
  mkdirSync(root, { recursive: true });
  const artifacts: Record<string, unknown> = {};
  for (const kind of ["B", "A", "L"] as const) {
    const { bytes } = validJsonArtifact(kind);
    writeFileSync(path.join(root, `${kind}.json`), bytes);
    artifacts[kind] = {
      path: `${kind}.json`,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }
  writeAdjustedManifest(root, artifacts);
}

describe("CTI adjusted loader validation coverage", () => {
  it("loads verified JSON artifacts and fingerprints a complete audited snapshot", () => {
    const root = temporaryDirectory("cti-adjusted-valid-");
    writeValidAdjustedSet(root);
    writeJson(path.join(root, "audit.json"), { reviewed: true });

    const loaded = loadCtiAdjustedInputs({ artifactRoot: root });

    expect(loaded.manifestInvalid).toBe(false);
    expect(loaded.missingKinds).toEqual([]);
    expect(loaded.loadReasons).toEqual([]);
    expect(loaded.B?.categoryOrder).toEqual(["総合", "食料"]);
    expect(loaded.B?.rows).toEqual([{ year: 2020, values: { 総合: 100, 食料: 101 } }]);
    expect(loaded.inputFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it.each([
    ["invalid JSON", "{"],
    ["null JSON root", "null"],
    ["non-object metadata", JSON.stringify({ metadata: null, rows: [] })],
    [
      "metadata without a supported digest",
      JSON.stringify({ metadata: { ...metadata, sha256: "bad" }, rows: [] }),
    ],
  ])("fails closed for %s", (_label, content) => {
    const root = temporaryDirectory("cti-adjusted-invalid-");
    mkdirSync(root, { recursive: true });
    const bytes = Buffer.from(content);
    writeFileSync(path.join(root, "B.json"), bytes);
    writeAdjustedManifest(root, {
      B: { path: "B.json", sha256: createHash("sha256").update(bytes).digest("hex") },
    });

    const loaded = loadCtiAdjustedInputs({ artifactRoot: root });

    expect(loaded.loadReasons).toContain("invalid_metadata");
    expect(loaded.B?.rows).toEqual([]);
  });

  it("distinguishes an absent digest from metadata that has a malformed digest", () => {
    const root = temporaryDirectory("cti-adjusted-hash-");
    mkdirSync(root, { recursive: true });
    const artifact = validJsonArtifact("B");
    const document = artifact.document as { metadata: Record<string, unknown>; rows: unknown[] };
    delete document.metadata.sha256;
    const bytes = writeJson(path.join(root, "B.json"), document);
    writeAdjustedManifest(root, {
      B: { path: "B.json", sha256: createHash("sha256").update(bytes).digest("hex") },
    });

    const loaded = loadCtiAdjustedInputs({ artifactRoot: root });

    expect(loaded.loadReasons).toEqual(["invalid_hash", "invalid_metadata"]);
  });

  it("rejects a saved artifact whose bytes no longer match the manifest digest", () => {
    const root = temporaryDirectory("cti-adjusted-tampered-");
    mkdirSync(root, { recursive: true });
    const { bytes } = validJsonArtifact("B");
    writeFileSync(path.join(root, "B.json"), bytes);
    writeAdjustedManifest(root, { B: { path: "B.json", sha256: "b".repeat(64) } });

    const loaded = loadCtiAdjustedInputs({ artifactRoot: root });

    expect(loaded.loadReasons).toEqual(["invalid_metadata"]);
    expect(loaded.B?.rows).toEqual([]);
  });

  it("rejects manifest metadata that disagrees with the declared revision or source", () => {
    const root = temporaryDirectory("cti-adjusted-manifest-meta-");
    mkdirSync(root, { recursive: true });
    const { document } = validJsonArtifact("B");
    const parsed = document as { metadata: Record<string, unknown>; rows: unknown[] };
    parsed.metadata.revision = "stale-revision";
    const bytes = writeJson(path.join(root, "B.json"), parsed);
    writeAdjustedManifest(root, {
      B: {
        path: "B.json",
        sha256: createHash("sha256").update(bytes).digest("hex"),
        sourceUrl: "https://example.test/expected.csv",
      },
    });

    const loaded = loadCtiAdjustedInputs({ artifactRoot: root });

    expect(loaded.loadReasons).toContain("invalid_metadata");
  });

  it("parses CSV missing-value markers and rejects non-finite CSV values", () => {
    const root = temporaryDirectory("cti-adjusted-csv-");
    mkdirSync(root, { recursive: true });
    const csv = "年度,総合,食料,住居\n2020,1,2,-\n2021,3,4,NaN\n";
    const csvBytes = Buffer.from(csv);
    writeFileSync(path.join(root, "B.csv"), csvBytes);
    writeJson(path.join(root, "B.csv.metadata.json"), { ...metadata, artifact: "B.csv" });
    writeAdjustedManifest(root, {
      B: { path: "B.csv", sha256: createHash("sha256").update(csvBytes).digest("hex") },
    });

    const loaded = loadCtiAdjustedInputs({
      artifactRoot: root,
      paths: { B: path.join(root, "B.csv") },
    });

    expect(loaded.B?.categoryOrder).toEqual(["総合", "食料", "住居"]);
    expect(loaded.B?.rows).toEqual([
      { year: 2020, values: { 総合: 1, 食料: 2, 住居: null } },
      { year: 2021, values: { 総合: 3, 食料: 4, 住居: Number.NaN } },
    ]);
    expect(loaded.loadReasons).toEqual([]);
  });

  it("rejects a CSV artifact when its adjacent metadata file is missing", () => {
    const root = temporaryDirectory("cti-adjusted-csv-metadata-missing-");
    mkdirSync(root, { recursive: true });
    const csvBytes = Buffer.from("年度,総合\n2020,100\n");
    writeFileSync(path.join(root, "B.csv"), csvBytes);
    writeAdjustedManifest(root, {
      B: { path: "B.csv", sha256: createHash("sha256").update(csvBytes).digest("hex") },
    });

    const loaded = loadCtiAdjustedInputs({
      artifactRoot: root,
      paths: { B: path.join(root, "B.csv") },
    });

    expect(loaded.loadReasons).toContain("invalid_metadata");
    expect(loaded.B?.rows).toEqual([]);
  });
});

const supportHeader = "時間軸（四半期）,民間最終消費支出";
const validSupport = [supportHeader, "2020年1～3月期,100", "2020年4～6月期,101"].join("\n");

function writeLegacyPair(
  root: string,
  main: string,
  nominal = validSupport,
  real = validSupport,
): CtiPair {
  mkdirSync(root, { recursive: true });
  const mainPath = path.join(root, "main.csv");
  const supportNominalPath = path.join(root, "support-nominal.csv");
  const supportRealPath = path.join(root, "support-real.csv");
  writeFileSync(mainPath, main);
  writeFileSync(supportNominalPath, nominal);
  writeFileSync(supportRealPath, real);

  const p = pathsFor(root);
  writeFileSync(p.seriesMap, "");
  writeFileSync(p.officialSnapshot, "");
  writeFileSync(p.metadata, "");
  writeFileSync(p.candidateDistributionAdjusted, "");
  writeFileSync(p.candidateDistributionAdjustedMetadata, "");
  writeFileSync(p.candidateDistributionAdjustedQuarterly, "");
  writeFileSync(p.candidateDistributionAdjustedQuarterlyMetadata, "");

  return { baseYear: 2025, pair: "2025", mainPath, supportNominalPath, supportRealPath };
}

function pathsFor(root: string): Parameters<typeof validateCtiPair>[1] {
  const base = buildCtiFilePaths();
  const res: Record<string, string> = {};
  for (const key of Object.keys(base) as (keyof typeof base)[]) {
    res[key] = path.join(root, path.basename(base[key]));
  }
  return res as Parameters<typeof validateCtiPair>[1];
}

describe("CTI legacy input validation coverage", () => {
  it("selects the verified 2025 CTI pair from the current source set", () => {
    expect(selectCtiPair()).toMatchObject({
      pair: { baseYear: 2025, pair: "2025" },
    });
  });

  it.each([
    ["missing official quarterly source workbook", "cti_required_support_unavailable"],
    ["official quarterly CTI artifact/metadata/manifest mismatch", "cti_fail_closed"],
  ])("maps the %s validation reason to %s", (validation, reason) => {
    expect(mapCtiReasonToCode(validation)).toBe(reason);
  });

  it.each([
    ["invalid first month", ["not-a-month"]],
    ["invalid later month", ["2025年1月", "2025年13月"]],
    ["month gap", ["2025年1月", "2025年3月"]],
  ])("rejects %s", (_label, months) => {
    expect(isContinuousMonths(months)).toBe(false);
  });

  it("treats an empty month list as continuous by the validator's vacuous rule", () => {
    expect(isContinuousMonths([])).toBe(true);
  });

  it.each([
    ["missing header", "統計名,系列\n2020,1", "missing CTI support period or series header"],
    ["empty period", `${supportHeader}\n,100`, "invalid or duplicate CTI support period"],
    ["malformed period", `${supportHeader}\n2020Q1,100`, "invalid or duplicate CTI support period"],
    [
      "duplicate period",
      `${supportHeader}\n2020年1～3月期,100\n2020年1～3月期,101`,
      "invalid or duplicate CTI support period",
    ],
    ["dash value", `${supportHeader}\n2020年1～3月期,-`, "invalid CTI support value"],
    ["non-numeric value", `${supportHeader}\n2020年1～3月期,NaN`, "invalid CTI support value"],
    ["no data", supportHeader, "CTI support contains no values"],
    [
      "discontinuous quarters",
      `${supportHeader}\n2020年1～3月期,100\n2020年7～9月期,101`,
      "CTI support periods are not continuous",
    ],
  ])("returns the specific support-input error for %s", (_label, content, expected) => {
    expect(validateCtiLegacySupport(content)).toBe(expected);
  });

  it("rejects the nominal support error before inspecting real support", () => {
    expect(validateCtiLegacySupportPair("bad", "bad")).toBe(
      "missing CTI support period or series header",
    );
  });

  it("returns the real support validation error after nominal support passes", () => {
    expect(validateCtiLegacySupportPair(validSupport, `${supportHeader}\n,100`)).toBe(
      "invalid or duplicate CTI support period",
    );
  });

  it("rejects pair support with a missing matching period", () => {
    const real = `${supportHeader}\n2020年4～6月期,100\n2020年7～9月期,101`;
    expect(validateCtiLegacySupportPair(validSupport, real)).toBe(
      "CTI nominal/real support period set mismatch",
    );
  });

  it.each([
    ["missing metadata", null, "missing metadata"],
    ["invalid JSON", "{", "invalid metadata"],
    [
      "wrong status",
      JSON.stringify({ status: "draft", baseYear: 2025, file: "x.csv", csvSha256: "a".repeat(64) }),
      "metadata is not ready for 2025",
    ],
    [
      "wrong file",
      JSON.stringify({
        status: "ready",
        baseYear: 2025,
        file: "other.csv",
        csvSha256: "a".repeat(64),
      }),
      "metadata file pairing mismatch",
    ],
    [
      "invalid digest",
      JSON.stringify({ status: "ready", baseYear: 2025, file: "x.csv", csvSha256: "bad" }),
      "metadata SHA-256 is missing or invalid",
    ],
  ])("validates metadata contract: %s", (_label, contents, expected) => {
    const root = temporaryDirectory("cti-metadata-");
    const metadataPath = path.join(root, "metadata.json");
    if (contents !== null) writeFileSync(metadataPath, contents);
    expect(validateCtiMetadata(metadataPath, "x.csv")).toBe(expected);
  });

  it("accepts metadata when its declared file and digest have the required shape", () => {
    const root = temporaryDirectory("cti-metadata-valid-");
    const value = {
      status: "ready",
      baseYear: 2025,
      outputFile: "x.csv",
      csvSha256: "a".repeat(64),
    };
    const metadataPath = path.join(root, "metadata.json");
    writeJson(metadataPath, value);
    expect(validateCtiMetadata(metadataPath, "x.csv")).toEqual(value);
  });

  it("rejects legacy pairs at each main-file validation boundary", () => {
    const root = temporaryDirectory("cti-pair-boundary-");
    const missingHeader = writeLegacyPair(root, "title,other\n2020,1");
    expect(validateCtiPair(missingHeader, pathsFor(root))).toBe("missing CTI 年月 header");

    const missingTotals = writeLegacyPair(root, "年月,総合\n2020年1月,1");
    expect(validateCtiPair(missingTotals, pathsFor(root))).toBe(
      "missing required CTI total headers",
    );

    const noMonths = writeLegacyPair(root, "年月,消費支出（名目）,消費支出（実質）\n");
    expect(validateCtiPair(noMonths, pathsFor(root))).toBe("invalid or discontinuous CTI 年月");

    const brokenSequence = writeLegacyPair(
      root,
      "年月,消費支出（名目）,消費支出（実質）\n2020年1月,1,1\n2020年3月,1,1",
    );
    expect(validateCtiPair(brokenSequence, pathsFor(root))).toBe(
      "invalid or discontinuous CTI 年月",
    );

    const duplicateMonth = writeLegacyPair(
      root,
      "年月,消費支出（名目）,消費支出（実質）\n2020年1月,1,1\n2020年1月,1,1",
    );
    expect(validateCtiPair(duplicateMonth, pathsFor(root))).toBe("invalid or duplicate CTI 年月");

    const invalidValue = writeLegacyPair(
      root,
      "年月,消費支出（名目）,消費支出（実質）\n2020年1月,-,1",
    );
    expect(validateCtiPair(invalidValue, pathsFor(root))).toBe(
      "invalid CTI required numeric value",
    );
  });
});
