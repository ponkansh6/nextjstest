import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadCtiAdjustedConnectionEstimate } from "../../../../../server/lib/data-loader/ctiAdjusted";

describe("Plan39 adjusted artifact loader", () => {
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
      schemaVersion: "test-v1",
      revision: "test",
      statisticalCode: "00200567",
      sha256: "a".repeat(64),
      source: "test",
      artifact: "B.json",
      downloadUrl: sourceUrl,
      retrievedAt: "2026-01-01",
      baseYear: 2025,
      unit: "指数",
      valueType: "原数値",
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
        schemaVersion: "test-v1",
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
      valueType: "原数値",
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
