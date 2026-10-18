import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  loadCtiAdjustedConnectionEstimate,
  loadCtiAdjustedInputs,
  loadCtiAdjustedV2Estimate,
} from "../../../../../server/lib/data-loader/ctiAdjusted";

describe("Plan39 adjusted artifact loader", () => {
  it("fails closed on an unknown input contract before loading artifact fingerprints or evidence", () => {
    const result = loadCtiAdjustedV2Estimate({
      artifactRoot: path.join(tmpdir(), "cti-adjusted-input-contract-must-not-be-read"),
      inputContract: "future-contract" as never,
    });

    expect(result.inputFingerprint).toBeUndefined();
    expect(result.publicationGate.accepted).toBe(false);
    expect(result.publicationGate.diagnostics).toContain("unknown_input_contract");
    expect(result.other.reasons).toContain("unknown_input_contract");
  });

  it("rejects conflicting canonical and legacy input contracts before loading artifacts", () => {
    const result = loadCtiAdjustedV2Estimate({
      artifactRoot: path.join(tmpdir(), "cti-adjusted-conflicting-input-contract-must-not-be-read"),
      inputContract: "annual-public",
      contract: "plan40",
    });

    expect(result.inputFingerprint).toBeUndefined();
    expect(result.publicationGate.accepted).toBe(false);
    expect(result.publicationGate.diagnostics).toContain("input_contract_conflict");
    expect(result.other.reasons).toContain("input_contract_conflict");
  });

  it("uses artifacts under process.cwd when no loader root is supplied", () => {
    const originalCwd = process.cwd();
    const cwd = mkdtempSync(path.join(tmpdir(), "plan39-loader-cwd-"));
    const root = path.join(cwd, "data", "source", "cti-adjusted");
    mkdirSync(root, { recursive: true });
    writeFileSync(
      path.join(root, "manifest.json"),
      JSON.stringify({
        schemaVersion: "test-v1",
        revision: "test",
        statisticalCode: "00200567",
        artifacts: { B: { path: "B.json" }, A: { path: "A.json" }, L: { path: "L.json" } },
      }),
    );
    for (const kind of ["B", "A", "L"]) writeFileSync(path.join(root, `${kind}.json`), "{}");

    process.chdir(cwd);
    try {
      const result = loadCtiAdjustedConnectionEstimate();
      expect(result.rows).toEqual([]);
      expect(result.audit.validation.reasons).toEqual(expect.arrayContaining(["invalid_metadata"]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("loads legacy and canonical schema families with equal values but distinct exact fingerprints", () => {
    const loadFixture = (schemaVersion: string) => {
      const root = mkdtempSync(path.join(tmpdir(), "cti-schema-family-parity-"));
      const manifestArtifacts: Record<string, unknown> = {};
      for (const kind of ["B", "A", "L"] as const) {
        const bytes = Buffer.from(
          JSON.stringify({
            metadata: {
              schemaVersion,
              revision: "fixture-r1",
              statisticalCode: "00200567",
              source: "test",
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
              sha256: "a".repeat(64),
            },
            categoryOrder: ["総合"],
            rows: [{ year: 2020, values: { 総合: 100 } }],
          }),
        );
        writeFileSync(path.join(root, `${kind}.json`), bytes);
        manifestArtifacts[kind] = {
          path: `${kind}.json`,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        };
      }
      writeFileSync(
        path.join(root, "manifest.json"),
        JSON.stringify({
          schemaVersion,
          revision: "fixture-r1",
          statisticalCode: "00200567",
          artifacts: manifestArtifacts,
        }),
      );
      writeFileSync(path.join(root, "audit.json"), JSON.stringify({ reviewed: true }));
      return loadCtiAdjustedInputs({ artifactRoot: root });
    };

    const legacy = loadFixture("plan39-annual-v1");
    const canonical = loadFixture("adjusted-cti-annual-v1");

    expect(legacy.manifestInvalid).toBe(false);
    expect(canonical.manifestInvalid).toBe(false);
    expect(legacy.missingKinds).toEqual([]);
    expect(canonical.missingKinds).toEqual([]);
    expect(legacy.loadReasons).toEqual([]);
    expect(canonical.loadReasons).toEqual([]);
    expect(legacy.B?.rows).toEqual(canonical.B?.rows);
    expect(legacy.A?.rows).toEqual(canonical.A?.rows);
    expect(legacy.L?.rows).toEqual(canonical.L?.rows);
    expect(legacy.inputFingerprint).toBeTruthy();
    expect(canonical.inputFingerprint).toBeTruthy();
    // Schema bytes are part of the exact snapshot identity. This prevents old
    // analysis/evidence from being reused after canonical writer migration.
    expect(canonical.inputFingerprint).not.toBe(legacy.inputFingerprint);
  });

  it("ignores a saved analysis when its input artifact digest is stale", () => {
    const root = mkdtempSync(path.join(tmpdir(), "plan39-stale-analysis-"));
    const artifactMetadata = (kind: string) => ({
      schemaVersion: "plan39-annual-v1",
      revision: "fixture-r1",
      statisticalCode: "00200567",
      source: "test",
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
      sha256: "a".repeat(64),
    });
    const artifactHashes: Record<string, string> = {};
    const manifestArtifacts: Record<string, unknown> = {};
    for (const kind of ["B", "A", "L"] as const) {
      const bytes = Buffer.from(
        JSON.stringify({
          metadata: artifactMetadata(kind),
          categoryOrder: ["総合"],
          rows: [{ year: 2020, values: { 総合: 100 } }],
        }),
      );
      writeFileSync(path.join(root, `${kind}.json`), bytes);
      const hash = createHash("sha256").update(bytes).digest("hex");
      artifactHashes[kind] = hash;
      manifestArtifacts[kind] = { path: `${kind}.json`, sha256: hash };
    }
    const manifestBytes = Buffer.from(
      JSON.stringify({
        schemaVersion: "plan39-annual-v1",
        revision: "fixture-r1",
        statisticalCode: "00200567",
        artifacts: manifestArtifacts,
      }),
    );
    const auditBytes = Buffer.from(JSON.stringify({ reviewed: true }));
    writeFileSync(path.join(root, "manifest.json"), manifestBytes);
    writeFileSync(path.join(root, "audit.json"), auditBytes);
    const fingerprint = `sha256:${createHash("sha256")
      .update(
        JSON.stringify({
          manifest: createHash("sha256").update(manifestBytes).digest("hex"),
          audit: createHash("sha256").update(auditBytes).digest("hex"),
          artifacts: artifactHashes,
          householdComposition: null,
        }),
      )
      .digest("hex")}`;
    const analysisPath = path.join(root, "analysis.json");
    writeFileSync(
      analysisPath,
      JSON.stringify({
        schemaVersion: "plan39-analysis-v1",
        inputFingerprint: fingerprint,
        rollingLoo: { sentinel: "stale-analysis" },
        v2: {
          model: "v2-bottom-up",
          version: "plan39-v2",
          publicationGate: {},
        },
        inputs: {
          artifacts: {
            B: { path: "B.json", sha256: "0".repeat(64) },
            A: { path: "A.json", sha256: artifactHashes.A },
            L: { path: "L.json", sha256: artifactHashes.L },
          },
        },
      }),
    );

    const previousAnalysisFile = process.env.CTI_ADJUSTED_ANALYSIS_FILE;
    process.env.CTI_ADJUSTED_ANALYSIS_FILE = analysisPath;
    try {
      const result = loadCtiAdjustedV2Estimate({ artifactRoot: root });
      expect(JSON.stringify(result)).not.toContain("stale-analysis");

      writeFileSync(
        analysisPath,
        JSON.stringify({
          schemaVersion: "plan39-analysis-v1",
          inputFingerprint: fingerprint,
          rollingLoo: {
            rolling: { status: "pass", pass: true, allFoldsFinite: true, leakageFree: true },
            loo: { status: "pass", pass: true, allFoldsFinite: true, leakageFree: true },
            sentinel: "matching-analysis",
          },
          v2: {
            model: "v2-bottom-up",
            version: "plan39-v2",
            publicationGate: { rollingLooEvidence: { schema: "plan39-publication-gate-v1" } },
          },
          inputs: {
            artifacts: {
              B: { path: "B.json", sha256: artifactHashes.B },
              A: { path: "A.json", sha256: artifactHashes.A },
              L: { path: "L.json", sha256: artifactHashes.L },
            },
          },
        }),
      );
      const matchingResult = loadCtiAdjustedV2Estimate({ artifactRoot: root });
      expect(matchingResult.publicationGate).toMatchObject({
        evidence: { accepted: true, inputFingerprint: fingerprint },
      });
    } finally {
      if (previousAnalysisFile === undefined) delete process.env.CTI_ADJUSTED_ANALYSIS_FILE;
      else process.env.CTI_ADJUSTED_ANALYSIS_FILE = previousAnalysisFile;
    }
  });

  it("does not discover candidate artifacts when the manifest is missing", () => {
    const root = mkdtempSync(path.join(tmpdir(), "plan39-loader-"));
    const csv = "year,総合\n2020,1\n";
    writeFileSync(path.join(root, "B.csv"), csv);
    writeFileSync(
      path.join(root, "B.csv.metadata.json"),
      JSON.stringify({
        schemaVersion: "plan39-annual-v1",
        revision: "test",
        statisticalCode: "00200567",
        sha256: createHash("sha256").update(csv).digest("hex"),
      }),
    );

    const result = loadCtiAdjustedConnectionEstimate({ artifactRoot: root });

    expect(result.rows).toEqual([]);
    expect(result.audit.validation.status).toBe("unavailable");
    expect(result.audit.validation.reasons).toEqual(expect.arrayContaining(["invalid_manifest"]));
  });

  it("accepts manifest sourceUrl against metadata downloadUrl and preserves JSON categoryOrder", () => {
    const root = mkdtempSync(path.join(tmpdir(), "plan39-loader-"));
    const sourceUrl = "https://example.test/source.json";
    const metadata = {
      schemaVersion: "adjusted-cti-annual-v1",
      revision: "test",
      statisticalCode: "00200567",
      sha256: "a".repeat(64),
      source: "test",
      artifact: "B.json",
      downloadUrl: sourceUrl,
      retrievedAt: "2026-01-01",
      baseYear: 2025,
      unit: "指数",
      valueType: "原数値（名目指数）",
      householdScope: "総世帯",
      frequency: "annual",
      rawRange: { startYear: 2020, endYear: 2020 },
      adoptedRange: { startYear: 2020, endYear: 2020 },
      missingRepresentation: "null",
    };
    const document = {
      metadata,
      categoryOrder: ["総合", "未知"],
      rows: [{ year: 2020, values: { 総合: 100 } }],
    };
    const bytes = JSON.stringify(document);
    writeFileSync(path.join(root, "B.json"), bytes);
    writeFileSync(
      path.join(root, "manifest.json"),
      JSON.stringify({
        schemaVersion: "adjusted-cti-annual-v1",
        revision: "test",
        statisticalCode: "00200567",
        artifacts: {
          B: {
            path: "B.json",
            sha256: createHash("sha256").update(bytes).digest("hex"),
            sourceUrl,
          },
        },
      }),
    );
    const result = loadCtiAdjustedConnectionEstimate({ artifactRoot: root });
    expect(result.audit.inputMetadata.B?.downloadUrl).toBe(sourceUrl);
    expect(result.audit.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ input: "B", code: "unknown_category", category: "未知" }),
      ]),
    );
  });

  it("rejects conflicting metadata sourceUrl and downloadUrl", () => {
    const root = mkdtempSync(path.join(tmpdir(), "plan39-loader-"));
    const metadata = {
      schemaVersion: "test-v1",
      revision: "test",
      statisticalCode: "00200567",
      sha256: "a".repeat(64),
      source: "test",
      artifact: "B.json",
      sourceUrl: "https://example.test/source",
      downloadUrl: "https://example.test/download",
      retrievedAt: "2026-01-01",
      baseYear: 2025,
      unit: "指数",
      valueType: "原数値（名目指数）",
      householdScope: "総世帯",
      frequency: "annual",
      rawRange: { startYear: 2020, endYear: 2020 },
      adoptedRange: { startYear: 2020, endYear: 2020 },
      missingRepresentation: "null",
    };
    const document = JSON.stringify({
      metadata,
      categoryOrder: ["総合"],
      rows: [{ year: 2020, values: { 総合: 100 } }],
    });
    writeFileSync(path.join(root, "B.json"), document);
    writeFileSync(
      path.join(root, "manifest.json"),
      JSON.stringify({
        schemaVersion: "test-v1",
        revision: "test",
        statisticalCode: "00200567",
        artifacts: {
          B: {
            path: "B.json",
            sha256: createHash("sha256").update(document).digest("hex"),
            sourceUrl: metadata.sourceUrl,
          },
        },
      }),
    );
    const result = loadCtiAdjustedConnectionEstimate({ artifactRoot: root });
    expect(result.audit.validation.reasons).toContain("invalid_metadata");
  });

  it("does not discover candidate artifacts when the manifest is invalid", () => {
    const root = mkdtempSync(path.join(tmpdir(), "plan39-loader-"));
    writeFileSync(path.join(root, "manifest.json"), JSON.stringify({ revision: "test" }));
    writeFileSync(path.join(root, "B.csv"), "year,総合\n2020,1\n");

    const result = loadCtiAdjustedConnectionEstimate({ artifactRoot: root });

    expect(result.rows).toEqual([]);
    expect(result.audit.validation.status).toBe("unavailable");
    expect(result.audit.validation.reasons).toEqual(expect.arrayContaining(["invalid_manifest"]));
  });

  it("preserves a manifest-declared missing artifact instead of using a candidate", () => {
    const root = mkdtempSync(path.join(tmpdir(), "plan39-loader-"));
    writeFileSync(
      path.join(root, "manifest.json"),
      JSON.stringify({
        schemaVersion: "plan39-annual-v1",
        revision: "test",
        statisticalCode: "00200567",
        artifacts: { A: { path: "A.json" }, L: { path: "L.json" } },
      }),
    );
    writeFileSync(path.join(root, "B.csv"), "year,総合\n2020,1\n");

    const result = loadCtiAdjustedConnectionEstimate({ artifactRoot: root });

    expect(result.audit.validation.status).toBe("unavailable");
    expect(result.audit.validation.reasons).toEqual(expect.arrayContaining(["missing_b_artifact"]));
    expect(result.audit.validation.reasons).not.toContain("B metadata is missing");
  });

  it.each([
    ["B", "missing_b_artifact"],
    ["A", "missing_a_artifact"],
    ["L", "missing_l_artifact"],
  ] as const)(
    "classifies a manifest-declared missing %s artifact before metadata validation",
    (kind, reason) => {
      const root = mkdtempSync(path.join(tmpdir(), "plan39-loader-"));
      const artifacts = Object.fromEntries(
        (["B", "A", "L"] as const)
          .filter((candidate) => candidate !== kind)
          .map((candidate) => [candidate, { path: `${candidate}.json` }]),
      );
      writeFileSync(
        path.join(root, "manifest.json"),
        JSON.stringify({
          schemaVersion: "plan39-annual-v1",
          revision: "test",
          statisticalCode: "00200567",
          artifacts,
        }),
      );

      const result = loadCtiAdjustedConnectionEstimate({ artifactRoot: root });

      expect(result.audit.validation.status).toBe("unavailable");
      expect(result.audit.validation.reasons).toContain(reason);
      expect(result.audit.validation.reasons).not.toContain(`${kind} metadata is missing`);
    },
  );

  it("classifies a manifest-declared artifact with a missing file before metadata validation", () => {
    const root = mkdtempSync(path.join(tmpdir(), "plan39-loader-"));
    writeFileSync(
      path.join(root, "manifest.json"),
      JSON.stringify({
        schemaVersion: "plan39-annual-v1",
        revision: "test",
        statisticalCode: "00200567",
        artifacts: { B: { path: "B.json" }, A: { path: "A.json" }, L: { path: "L.json" } },
      }),
    );

    const result = loadCtiAdjustedConnectionEstimate({ artifactRoot: root });

    expect(result.audit.validation.status).toBe("unavailable");
    expect(result.audit.validation.reasons).toEqual(
      expect.arrayContaining(["missing_b_artifact", "missing_a_artifact", "missing_l_artifact"]),
    );
    expect(result.audit.validation.reasons).not.toContain("B metadata is missing");
  });

  it("fails closed with the declared missing-artifact reasons", () => {
    const root = mkdtempSync(path.join(tmpdir(), "plan39-loader-"));
    writeFileSync(
      path.join(root, "manifest.json"),
      JSON.stringify({
        schemaVersion: "plan39-annual-v1",
        revision: "test",
        statisticalCode: "00200567",
        artifacts: {
          B: { path: "missing/B.json" },
          A: { path: "missing/A.json" },
          L: { path: "missing/L.json" },
        },
      }),
    );

    const result = loadCtiAdjustedConnectionEstimate({ artifactRoot: root });

    expect(result.rows).toEqual([]);
    expect(result.audit.validation.valid).toBe(false);
    expect(result.audit.validation.reasons).toEqual(
      expect.arrayContaining(["missing_b_artifact", "missing_a_artifact", "missing_l_artifact"]),
    );
  });

  it("rejects an artifact whose metadata does not carry the required hash", () => {
    const root = mkdtempSync(path.join(tmpdir(), "plan39-loader-"));
    writeFileSync(
      path.join(root, "manifest.json"),
      JSON.stringify({
        schemaVersion: "plan39-annual-v1",
        revision: "test",
        statisticalCode: "00200567",
        artifacts: { B: { path: "B.json" } },
      }),
    );
    writeFileSync(
      path.join(root, "B.json"),
      JSON.stringify({
        metadata: {
          schemaVersion: "plan39-annual-v1",
          revision: "test",
          statisticalCode: "00200567",
        },
        rows: [],
      }),
    );

    const result = loadCtiAdjustedConnectionEstimate({ artifactRoot: root });

    expect(result.audit.validation.valid).toBe(false);
    expect(result.audit.validation.status).toBe("unavailable");
    expect(result.audit.validation.reasons).toEqual(
      expect.arrayContaining([
        "invalid_hash",
        "invalid_metadata",
        "missing_a_artifact",
        "missing_l_artifact",
      ]),
    );
    expect(result.audit.validation.issues.some((issue) => issue.input === "B")).toBe(true);
  });
});
