import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyLoaderHashes } from "../../../scripts/plan39/rollback.mjs";

const roots = [];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function makeFixture({
  lSchema = "plan39-annual-v1",
  revision = "fixture-r1",
  corruptHash = false,
} = {}) {
  const temp = mkdtempSync(path.join(tmpdir(), "plan39-rollback-schema-family-"));
  roots.push(temp);
  const sourceRoot = path.join(temp, "data/source");
  const root = path.join(sourceRoot, "cti-adjusted");
  mkdirSync(root, { recursive: true });
  const sourceSha256 = "a".repeat(64);
  const artifactEntries = {};
  for (const [kind, schemaVersion] of [
    ["B", "adjusted-cti-annual-v1"],
    ["A", "adjusted-cti-annual-v1"],
    ["L", lSchema],
  ]) {
    const bytes = Buffer.from(
      JSON.stringify({
        metadata: {
          schemaVersion,
          revision,
          statisticalCode: "00200567",
          valueType: "原数値（名目指数）",
          sha256: sourceSha256,
          sourceSha256,
        },
        rows: [],
      }),
    );
    writeFileSync(path.join(root, `${kind}.json`), bytes);
    artifactEntries[kind] = {
      path: `${kind}.json`,
      sha256: corruptHash && kind === "B" ? "b".repeat(64) : hash(bytes),
    };
  }
  const quarterlyBytes = Buffer.from("period,総合\n2025Q1,100\n");
  writeFileSync(
    path.join(sourceRoot, "cti_data2025_distribution_adjusted_quarterly.csv"),
    quarterlyBytes,
  );
  const quarterlyMetadata = {
    schemaVersion: "adjusted-cti-quarterly-nominal-v1",
    revision,
    valueType: "原数値（名目指数）",
    sourceSha256,
    csvSha256: hash(quarterlyBytes),
  };
  const quarterlyMetadataBytes = Buffer.from(JSON.stringify(quarterlyMetadata));
  writeFileSync(
    path.join(sourceRoot, "cti_data2025_distribution_adjusted_quarterly.metadata.json"),
    quarterlyMetadataBytes,
  );
  artifactEntries.quarterlyNominal = {
    path: "../cti_data2025_distribution_adjusted_quarterly.csv",
    metadataPath: "../cti_data2025_distribution_adjusted_quarterly.metadata.json",
    sha256: hash(quarterlyBytes),
    metadataSha256: hash(quarterlyMetadataBytes),
    revision,
  };
  writeFileSync(
    path.join(root, "manifest.json"),
    JSON.stringify({
      schemaVersion: "adjusted-cti-annual-v1",
      revision,
      statisticalCode: "00200567",
      artifacts: artifactEntries,
    }),
  );
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Plan39 rollback loader hash verifier", () => {
  it("accepts mixed canonical and legacy annual schema values within the same family", () => {
    const root = makeFixture();
    expect(verifyLoaderHashes(root)).toMatchObject({ quarterlyNominal: expect.any(String) });
  });

  it("rejects an unknown annual artifact schema", () => {
    const root = makeFixture({ lSchema: "future-annual-v9" });
    expect(() => verifyLoaderHashes(root)).toThrow("loader metadata contract mismatch: L");
  });

  it("rejects an artifact path outside the loader root", () => {
    const root = makeFixture();
    const manifestPath = path.join(root, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts.B.path = "../B.json";
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => verifyLoaderHashes(root)).toThrow("loader artifact hash mismatch: B");
  });

  it("rejects an annual manifest and artifacts with an altered statistical code", () => {
    const root = makeFixture();
    const manifestPath = path.join(root, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.statisticalCode = "99999999";
    for (const kind of ["A", "B", "L"]) {
      const artifactPath = path.join(root, manifest.artifacts[kind].path);
      const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
      artifact.metadata.statisticalCode = manifest.statisticalCode;
      const bytes = Buffer.from(JSON.stringify(artifact));
      writeFileSync(artifactPath, bytes);
      manifest.artifacts[kind].sha256 = hash(bytes);
    }
    writeFileSync(manifestPath, JSON.stringify(manifest));

    expect(() => verifyLoaderHashes(root)).toThrow("invalid Plan39 manifest");
  });

  it("rejects an annual artifact whose statistical code differs from the manifest", () => {
    const root = makeFixture();
    const manifestPath = path.join(root, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const artifactPath = path.join(root, manifest.artifacts.B.path);
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    artifact.metadata.statisticalCode = "99999999";
    const bytes = Buffer.from(JSON.stringify(artifact));
    writeFileSync(artifactPath, bytes);
    manifest.artifacts.B.sha256 = hash(bytes);
    writeFileSync(manifestPath, JSON.stringify(manifest));

    expect(() => verifyLoaderHashes(root)).toThrow("loader metadata contract mismatch: B");
  });

  it("rejects hash and revision mismatches", () => {
    const hashMismatchRoot = makeFixture({ corruptHash: true });
    expect(() => verifyLoaderHashes(hashMismatchRoot)).toThrow("loader artifact hash mismatch: B");

    const revisionRoot = makeFixture();
    const manifestPath = path.join(revisionRoot, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts.A.revision = "different-revision";
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => verifyLoaderHashes(revisionRoot)).toThrow("loader metadata contract mismatch: A");
  });
});
