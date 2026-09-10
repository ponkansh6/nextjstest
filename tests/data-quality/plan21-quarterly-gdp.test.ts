import { createHash } from "node:crypto";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCtiFilePaths } from "../../server/lib/dataIo";
import {
  getGdpSupportStatus,
  getQuarterlyGdpSupportStatus,
} from "../../server/lib/data-loader/cpi";

describe("Plan21 quarterly GDP artifacts", () => {
  const paths = buildCtiFilePaths();

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

  it("keeps comparison readiness fail-closed while independent confirmation is pending", async () => {
    await expect(getQuarterlyGdpSupportStatus()).resolves.toMatchObject({
      valid: true,
      comparisonReady: false,
      independentConfirmation: "pending-independent-confirmation",
    });
  });

  it("does not alter the annual GDP status contract", async () => {
    await expect(getGdpSupportStatus()).resolves.toMatchObject({ valid: true });
  });
});
