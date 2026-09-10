import { createHash } from "node:crypto";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCtiFilePaths } from "../../server/lib/dataIo";
import {
  getGdpSupportStatus,
  getQuarterlyGdpSupportStatus,
  loadQuarterlyGdpData,
} from "../../server/lib/data-loader/cpi";
import {
  projectQuarterlyPublicView,
  QUARTERLY_PUBLIC_KEYS,
} from "../../src/lib/quarterlyPublicProjection";

describe("Plan21 quarterly GDP artifacts", () => {
  const paths = buildCtiFilePaths();

  it("retains internal GDP values but excludes them from the public projection", () => {
    const internal = loadQuarterlyGdpData();
    expect(internal.rows[0]).toHaveProperty("nominalRaw");
    expect(internal.rows[0]).toHaveProperty("realRaw");
    expect(QUARTERLY_PUBLIC_KEYS).toEqual(
      expect.arrayContaining(["民間最終消費支出（名目）", "民間最終消費支出（実質）"]),
    );
    expect(QUARTERLY_PUBLIC_KEYS).toHaveLength(22);
    const projected = projectQuarterlyPublicView([
      { label: "2025Q1", quarter: 1, 年: 2025, 年月: "2025年1月", GDP名目原値: 1 } as any,
    ]);
    expect(Object.keys(projected[0])).not.toEqual(
      expect.arrayContaining(["GDP名目原値", "GDP名目比較指数", "GDP実質原値", "GDP実質比較指数"]),
    );
  });

  it("provides two 84-row long-form official artifacts and matching hashes", () => {
    for (const [csv, metadata] of [
      [paths.quarterlySupportNominal, paths.quarterlySupportNominalMetadata],
      [paths.quarterlySupportReal, paths.quarterlySupportRealMetadata],
    ]) {
      const content = fs.readFileSync(csv, "utf8");
      const rows = content.trim().split("\n");
      const record = JSON.parse(fs.readFileSync(metadata, "utf8"));
      expect(rows).toHaveLength(85);
      expect(record.csvSha256).toBe(createHash("sha256").update(content).digest("hex"));
      expect(rows.slice(1).map((row) => row.split(",")[0])).toEqual(
        Array.from(
          { length: 84 },
          (_, index) => `${2005 + Math.floor(index / 4)}-Q${(index % 4) + 1}`,
        ),
      );
    }
  });

  it("stores independent e-Stat snapshots and compares all 84 quarters", () => {
    for (const [metadata, estat, statsDataId] of [
      [paths.quarterlySupportNominalMetadata, paths.quarterlyEstatNominal, "0003113633"],
      [paths.quarterlySupportRealMetadata, paths.quarterlyEstatReal, "0003113612"],
    ]) {
      const record = JSON.parse(fs.readFileSync(metadata, "utf8"));
      const snapshot = fs.readFileSync(estat, "utf8");
      expect(record.estatSource.provider).toBe("e-Stat");
      expect(record.estatSource.statsDataId).toBe(statsDataId);
      expect(record.estatSource.snapshotCsvSha256).toBe(
        createHash("sha256").update(snapshot).digest("hex"),
      );
      expect(record.estatSource.comparison).toMatchObject({
        status: "ready",
        rowsCompared: 84,
        mismatches: 0,
      });
    }
  });

  it("enables comparison readiness after independent confirmation", async () => {
    await expect(getQuarterlyGdpSupportStatus()).resolves.toMatchObject({
      valid: true,
      comparisonReady: true,
      independentConfirmation: "ready",
      normalizationFactors: { nominal: expect.any(Number), real: expect.any(Number) },
    });
  });

  it("returns distinct quarterly raw values and separate comparison fields", () => {
    const result = loadQuarterlyGdpData();
    expect(result.rows).toHaveLength(84);
    expect(new Set(result.rows.slice(0, 4).map((row) => row.nominalRaw)).size).toBeGreaterThan(1);
    expect(new Set(result.rows.slice(0, 4).map((row) => row.realRaw)).size).toBeGreaterThan(1);
    expect(result.rows[0]).toHaveProperty("nominalRaw");
    expect(result.rows[0]).toHaveProperty("nominalComparison");
    expect(result.rows[0]).not.toHaveProperty("民間最終消費支出（名目）");
  });

  it("does not alter the annual GDP status contract", async () => {
    await expect(getGdpSupportStatus()).resolves.toMatchObject({ valid: true });
  });
});
