import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildPlan39CtiArtifacts } from "../../../../../scripts/plan39/fetch-and-build.mjs";
import { verifyLoaderHashes } from "../../../../../scripts/plan39/rollback.mjs";
import {
  loadCtiAdjustedInputs,
  loadCtiAdjustedV2Estimate,
} from "../../../../../server/lib/data-loader/ctiAdjusted";
import { loadCompositionAdjustedQuarterlyRows } from "../../../../../server/lib/view-models/quarterlyAggregation";
import { projectCtiAdjustedPublicRows } from "../../../../../src/lib/ctiAdjustedPublicProjection";
import { projectQuarterlyPublicView } from "../../../../../src/lib/quarterlyPublicProjection";

const tempRoots: string[] = [];
const repoRoot = process.cwd();
const currentArtifactRoot = path.join(repoRoot, "data/source/cti-adjusted");
const sourceFiles = {
  B: path.join(repoRoot, "data/source/official-cti-2025/cti-basic-000040499069.xlsx"),
  A: path.join(
    repoRoot,
    "data/source/official-cti-2025/cti-distribution-adjusted-000040499087.xlsx",
  ),
};
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const omitFingerprintDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(omitFingerprintDeep);
  if (typeof value !== "object" || value === null) return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "inputFingerprint")
      .map(([key, entry]) => [key, omitFingerprintDeep(entry)]),
  );
};
type FingerprintField = { path: string; value: unknown; parentKeys: string[] };
const collectFingerprintFields = (
  value: unknown,
  currentPath = "$",
  found: FingerprintField[] = [],
) => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectFingerprintFields(entry, `${currentPath}[${index}]`, found),
    );
    return found;
  }
  if (typeof value !== "object" || value === null) return found;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return found;
  const objectValue = value as Record<string, unknown>;
  const parentKeys = Object.keys(objectValue);
  for (const [key, entry] of Object.entries(objectValue)) {
    const entryPath = `${currentPath}[${JSON.stringify(key)}]`;
    if (key === "inputFingerprint") {
      found.push({ path: entryPath, value: entry, parentKeys });
    } else {
      collectFingerprintFields(entry, entryPath, found);
    }
  }
  return found;
};
const expectFingerprintFieldsToChangeWithShape = (current: unknown, generated: unknown) => {
  const currentFields = collectFingerprintFields(current);
  const generatedFields = collectFingerprintFields(generated);
  expect(generatedFields.map(({ path }) => path)).toEqual(currentFields.map(({ path }) => path));
  expect(generatedFields.map(({ parentKeys }) => parentKeys)).toEqual(
    currentFields.map(({ parentKeys }) => parentKeys),
  );
  for (const [index, currentField] of currentFields.entries()) {
    const generatedField = generatedFields[index];
    expect(typeof currentField.value).toBe("string");
    expect(typeof generatedField?.value).toBe(typeof currentField.value);
    expect(currentField.value).not.toBe("");
    expect(generatedField?.value).not.toBe("");
    expect(generatedField?.value).not.toBe(currentField.value);
  }
};

describe("canonical CTI artifact writer parity", () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("preserves loaded values and public row shape while emitting canonical schemas", () => {
    for (const file of Object.values(sourceFiles)) expect(existsSync(file)).toBe(true);
    expect(existsSync(path.join(currentArtifactRoot, "L.json"))).toBe(true);

    const tempRoot = mkdtempSync(path.join(tmpdir(), "cti-writer-parity-"));
    tempRoots.push(tempRoot);
    const generatedArtifactRoot = path.join(tempRoot, "data/source/cti-adjusted");
    cpSync(currentArtifactRoot, generatedArtifactRoot, { recursive: true });
    cpSync(
      path.join(repoRoot, "data/source/cti-size-composition"),
      path.join(tempRoot, "data/source/cti-size-composition"),
      { recursive: true },
    );

    const sourceBytes = {
      B: readFileSync(sourceFiles.B),
      A: readFileSync(sourceFiles.A),
    };
    const currentAudit = JSON.parse(
      readFileSync(path.join(currentArtifactRoot, "audit.json"), "utf8"),
    );
    for (const kind of ["B", "A"] as const) {
      expect(sha256(sourceBytes[kind])).toBe(currentAudit.sources[kind].sourceSha256);
    }

    const currentManifest = JSON.parse(
      readFileSync(path.join(currentArtifactRoot, "manifest.json"), "utf8"),
    );
    const result = buildPlan39CtiArtifacts({
      stageRoot: tempRoot,
      sources: sourceBytes,
      pinnedLegacyArtifactBytes: readFileSync(path.join(currentArtifactRoot, "L.json")),
      revision: currentManifest.revision,
      retrievedAt: currentAudit.retrievedAt,
    });
    const generatedQuarterly = result.artifacts.find((artifact) =>
      artifact.path.endsWith("cti_data2025_distribution_adjusted_quarterly.csv"),
    );
    expect(generatedQuarterly).toBeDefined();
    expect(generatedQuarterly?.bytes).toEqual(
      readFileSync(
        path.join(repoRoot, "data/source/cti_data2025_distribution_adjusted_quarterly.csv"),
      ),
    );
    for (const artifact of result.artifacts) {
      const output = path.join(tempRoot, artifact.path);
      expect(path.resolve(output).startsWith(`${tempRoot}${path.sep}`)).toBe(true);
      mkdirSync(path.dirname(output), { recursive: true });
      writeFileSync(output, artifact.bytes);
    }

    const currentInputs = loadCtiAdjustedInputs({ artifactRoot: currentArtifactRoot });
    const generatedInputs = loadCtiAdjustedInputs({ artifactRoot: generatedArtifactRoot });
    expect(currentInputs.loadReasons).toEqual([]);
    expect(generatedInputs.loadReasons).toEqual([]);
    expect(generatedInputs.B?.rows).toEqual(currentInputs.B?.rows);
    expect(generatedInputs.A?.rows).toEqual(currentInputs.A?.rows);
    expect(generatedInputs.L?.rows).toEqual(currentInputs.L?.rows);
    expect(generatedInputs.inputFingerprint).not.toBe(currentInputs.inputFingerprint);

    const currentEstimate = loadCtiAdjustedV2Estimate({ artifactRoot: currentArtifactRoot });
    const generatedEstimate = loadCtiAdjustedV2Estimate({ artifactRoot: generatedArtifactRoot });
    expect(generatedEstimate.rows).toEqual(currentEstimate.rows);
    expect(generatedEstimate.householdComposition).toEqual(currentEstimate.householdComposition);
    expect(generatedEstimate.inputFingerprint).not.toBe(currentEstimate.inputFingerprint);

    const toAnnualPublicRows = (estimate: typeof currentEstimate) =>
      projectCtiAdjustedPublicRows(
        estimate.rows.map((row) => ({
          year: row.year,
          seriesType:
            row.seriesType === "official_adjusted"
              ? "official_adjusted"
              : row.seriesType === "unavailable"
                ? "unavailable"
                : "estimated_adjusted",
          official: row.seriesType === "official_adjusted",
          status: row.status === "insufficient-data" ? "unavailable" : row.status,
          reason: row.reason,
          values: row.values,
        })),
        estimate.publicationGate,
      );
    const currentAnnualPublicRows = toAnnualPublicRows(currentEstimate);
    const generatedAnnualPublicRows = toAnnualPublicRows(generatedEstimate);
    expectFingerprintFieldsToChangeWithShape(currentAnnualPublicRows, generatedAnnualPublicRows);
    const currentAnnualSemanticRows = omitFingerprintDeep(currentAnnualPublicRows);
    const generatedAnnualSemanticRows = omitFingerprintDeep(generatedAnnualPublicRows);
    expect(generatedAnnualSemanticRows).toEqual(currentAnnualSemanticRows);
    expect(
      (generatedAnnualSemanticRows as Array<Record<string, unknown>>).map((row) =>
        Object.keys(row),
      ),
    ).toEqual(
      (currentAnnualSemanticRows as Array<Record<string, unknown>>).map((row) => Object.keys(row)),
    );
    expect(JSON.stringify(generatedAnnualSemanticRows)).toBe(
      JSON.stringify(currentAnnualSemanticRows),
    );

    const currentPublicRows = projectQuarterlyPublicView(
      loadCompositionAdjustedQuarterlyRows(currentEstimate),
      "nominal",
    );
    const generatedPublicRows = projectQuarterlyPublicView(
      loadCompositionAdjustedQuarterlyRows(generatedEstimate),
      "nominal",
    );
    expectFingerprintFieldsToChangeWithShape(currentPublicRows, generatedPublicRows);
    const currentQuarterlySemanticRows = omitFingerprintDeep(currentPublicRows);
    const generatedQuarterlySemanticRows = omitFingerprintDeep(generatedPublicRows);
    expect(generatedQuarterlySemanticRows).toEqual(currentQuarterlySemanticRows);
    expect(
      (generatedQuarterlySemanticRows as Array<Record<string, unknown>>).map((row) =>
        Object.keys(row),
      ),
    ).toEqual(
      (currentQuarterlySemanticRows as Array<Record<string, unknown>>).map((row) =>
        Object.keys(row),
      ),
    );
    expect(JSON.stringify(generatedQuarterlySemanticRows)).toBe(
      JSON.stringify(currentQuarterlySemanticRows),
    );

    expect(verifyLoaderHashes(generatedArtifactRoot)).toMatchObject({
      B: result.manifest.artifacts.B.sha256,
      A: result.manifest.artifacts.A.sha256,
      L: result.manifest.artifacts.L.sha256,
      quarterlyNominal: result.manifest.artifacts.quarterlyNominal.sha256,
    });
    expect(result.manifest.schemaVersion).toBe("adjusted-cti-annual-v1");
    expect(
      JSON.parse(readFileSync(path.join(generatedArtifactRoot, "L.json"), "utf8")).metadata
        .schemaVersion,
    ).toBe("plan39-annual-v1");
  });
});
