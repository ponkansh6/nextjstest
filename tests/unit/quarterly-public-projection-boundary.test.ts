import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { QuarterlyRow as LegacyQuarterlyRow } from "../../server/lib/view-models/quarterlyAggregation";
import type { QuarterlyRow as SharedQuarterlyRow, SeriesMeasurement } from "../../src/types/chart";
import {
  CTI_ADJUSTED_V2_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY,
  CTI_ADJUSTED_V2_PUBLIC_KEYS,
  CTI_ADJUSTED_V2_PUBLIC_REGISTRY,
} from "../../src/lib/chartConstants";
import {
  projectQuarterlyPublicView,
  QUARTERLY_PUBLIC_KEYS,
  QUARTERLY_PUBLIC_NOMINAL_KEYS,
} from "../../src/lib/quarterlyPublicProjection";

const projectionPath = resolve("src/lib/quarterlyPublicProjection.ts");
const aggregationPath = resolve("server/lib/view-models/quarterlyAggregation.ts");

describe("quarterly client/server type boundary", () => {
  it("keeps the public projection free of server imports", () => {
    const source = readFileSync(projectionPath, "utf8");

    expect(source).toMatch(
      /import type \{[^}]*QuarterlyRow[^}]*QuarterlyView[^}]*\} from ["']@\/types\/chart["'];/s,
    );
    expect(source).not.toMatch(/(?:from|import\s*\()\s*["'][^"']*server[\\/]/);
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

  it("uses the Plan40 registry order and excludes total/residual keys from the ten-expense quarterly surface", () => {
    const expenseCategories = CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.filter(
      (category) => category !== "総合",
    );
    const expenseKeys = expenseCategories.map(
      (category) => CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY[category],
    );
    expect(expenseKeys).toEqual(
      CTI_ADJUSTED_V2_PUBLIC_REGISTRY.filter((entry) => entry.category !== "総合").map(
        (entry) => entry.key,
      ),
    );
    expect(expenseKeys).toEqual(
      CTI_ADJUSTED_V2_PUBLIC_KEYS.filter(
        (key) => key !== CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.総合,
      ),
    );
    expect(QUARTERLY_PUBLIC_KEYS).toHaveLength(22);
    expect(QUARTERLY_PUBLIC_NOMINAL_KEYS).not.toContain(expenseKeys[0]);
    expect(expenseKeys).not.toContain(CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.総合);
    expect(expenseKeys).not.toContain("CTIミクロ調整系列（残差）");
  });

  it("keeps the legacy 22-key and Plan40 32-key projection contracts separate", () => {
    const foodKey = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料;
    const legacyRow = {
      年: 2017,
      quarter: 4,
      label: "2017Q4",
      年月: "2017年10月",
      kind: "legacy-cti" as const,
      ...Object.fromEntries(QUARTERLY_PUBLIC_KEYS.map((key) => [key, 101])),
      [foodKey]: 999,
    };
    const measurement: SeriesMeasurement = {
      key: foodKey,
      label: foodKey,
      unit: "指数",
      source: "Plan40",
      valueType: "comparison",
      value: 101,
      status: "available" as const,
      reason: null,
      frequency: "quarterly",
      aggregation: "derived",
      annualAnchorType: "official" as const,
      quarterlyDerived: true,
    };
    const plan40Row = {
      年: 2017,
      quarter: 4,
      label: "2017Q4",
      年月: "2017年10月",
      kind: "plan40-v2-cost-stack" as const,
      ...Object.fromEntries(QUARTERLY_PUBLIC_KEYS.map((key) => [key, 101])),
      ...Object.fromEntries(
        CTI_ADJUSTED_V2_PUBLIC_KEYS.filter(
          (key) => key !== CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.総合,
        ).map((key) => [key, 101]),
      ),
      measurements: { [foodKey]: measurement },
    };
    const legacyNominal = projectQuarterlyPublicView([legacyRow], "nominal")[0]!;
    const legacyReal = projectQuarterlyPublicView([legacyRow], "real")[0]!;
    const plan40Nominal = projectQuarterlyPublicView([plan40Row], "nominal")[0]!;
    const plan40Real = projectQuarterlyPublicView([plan40Row], "real")[0]!;
    const publicDataKeys = (rows: Record<string, unknown>[]) =>
      [...new Set(rows.flatMap((row) => Object.keys(row)))].filter(
        (key) => !["label", "quarter", "年", "年月", "measurements"].includes(key),
      );
    expect(publicDataKeys([legacyNominal, legacyReal])).toHaveLength(22);
    expect(publicDataKeys([plan40Nominal, plan40Real])).toHaveLength(32);
    expect(legacyNominal[foodKey]).toBeUndefined();
    expect(plan40Nominal[foodKey]).toBe(101);
    expect(plan40Nominal.measurements?.[foodKey]).toBe(measurement);
  });

  it("uses legacy fallback without inferring v2 keys from year alone", () => {
    const foodKey = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料;
    const row = projectQuarterlyPublicView([
      { 年: 2017, quarter: 4, label: "2017Q4", 年月: "2017年10月", [foodKey]: 101 },
    ])[0]!;
    expect(row[foodKey]).toBeUndefined();
    expect(row[QUARTERLY_PUBLIC_NOMINAL_KEYS[0]]).toBeNull();
  });
});
