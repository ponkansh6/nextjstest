import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { QuarterlyRow as LegacyQuarterlyRow } from "../../server/lib/view-models/quarterlyAggregation";
import type { QuarterlyRow as SharedQuarterlyRow } from "../../src/types/chart";

const projectionPath = resolve("src/lib/quarterlyPublicProjection.ts");
const aggregationPath = resolve("server/lib/view-models/quarterlyAggregation.ts");

describe("quarterly client/server type boundary", () => {
  it("keeps the public projection free of server imports", () => {
    const source = readFileSync(projectionPath, "utf8");

    expect(source).toContain('import type { QuarterlyRow, QuarterlyView } from "@/types/chart";');
    expect(source).not.toMatch(/(?:from|import\s*\()\s*["'][^"']*server[\/]/);
  });

  it("preserves QuarterlyRow from the aggregation module as a shared-type API", () => {
    const source = readFileSync(aggregationPath, "utf8");
    expect(source).toContain('export type { QuarterlyRow } from "@/types/chart";');

    const sharedRow: SharedQuarterlyRow = {
      年: 2025,
      quarter: 1,
      label: "2025Q1",
      年月: "2025年1月",
    };
    const legacyRow: LegacyQuarterlyRow = sharedRow;
    expect(legacyRow).toEqual(sharedRow);
  });
});
