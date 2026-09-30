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
  SUPPORT_SERIES_KEY_NOMINAL,
} from "../../src/lib/chartConstants";
import {
  projectQuarterlyPublicView,
  QUARTERLY_PUBLIC_KEYS,
  QUARTERLY_PUBLIC_NOMINAL_KEYS,
  QUARTERLY_PUBLIC_REAL_KEYS,
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
    expect(QUARTERLY_PUBLIC_NOMINAL_KEYS).toEqual(expenseKeys);
    expect(QUARTERLY_PUBLIC_NOMINAL_KEYS).toHaveLength(10);
    expect(QUARTERLY_PUBLIC_KEYS).toEqual([
      ...QUARTERLY_PUBLIC_NOMINAL_KEYS,
      ...QUARTERLY_PUBLIC_REAL_KEYS,
    ]);
    expect(QUARTERLY_PUBLIC_NOMINAL_KEYS).not.toContain(
      CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.総合,
    );
    expect(expenseKeys).not.toContain(CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.総合);
    expect(expenseKeys).not.toContain("CTIミクロ調整系列（残差）");
  });

  it("projects exactly ten canonical nominal keys and preserves source provenance", () => {
    const expenseKeys = CTI_ADJUSTED_V2_PUBLIC_REGISTRY.filter(
      (entry) => entry.category !== "総合",
    ).map((entry) => entry.key);
    const foodKey = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料;
    const housingKey = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.住居;
    const canonicalFields = Object.fromEntries(expenseKeys.map((key) => [key, 101]));
    const legacyRow = {
      年: 2017,
      quarter: 4,
      label: "2017Q4",
      年月: "2017年10月",
      kind: "legacy-cti" as const,
      ...canonicalFields,
      [SUPPORT_SERIES_KEY_NOMINAL]: 999,
    };
    const officialMeasurement: SeriesMeasurement = {
      key: foodKey,
      label: foodKey,
      unit: "指数",
      source:
        "e-Stat 公式Excel cti-distribution-adjusted-000040499087.xlsx / 総・四(原) / 000040499087",
      valueType: "comparison",
      value: 101,
      status: "available" as const,
      reason: null,
      frequency: "quarterly",
      aggregation: "official_quarterly_adjusted_nominal_observation",
      annualAnchorType: "official" as const,
      quarterlyDerived: true,
      seriesType: "official_adjusted",
      official: true,
    };
    const historicalMeasurement: SeriesMeasurement = {
      ...officialMeasurement,
      key: housingKey,
      label: housingKey,
      source: "e-Stat 公式CTI長期artifact 000040499070 / Plan39-v2 bottom-up",
      aggregation: "cti_adjusted_v2_bottom_up_estimate",
      annualAnchorType: "estimated",
      seriesType: "estimated_adjusted",
      official: false,
    };
    const plan40Row = {
      年: 2017,
      quarter: 4,
      label: "2017Q4",
      年月: "2017年10月",
      kind: "plan40-v2-cost-stack" as const,
      ...canonicalFields,
      [SUPPORT_SERIES_KEY_NOMINAL]: 999,
      measurements: {
        [foodKey]: officialMeasurement,
        [housingKey]: historicalMeasurement,
      },
    };
    const legacyNominal = projectQuarterlyPublicView([legacyRow], "nominal")[0]!;
    const plan40Nominal = projectQuarterlyPublicView([plan40Row], "nominal")[0]!;
    const publicDataKeys = (rows: Record<string, unknown>[]) =>
      [...new Set(rows.flatMap((row) => Object.keys(row)))].filter(
        (key) => !["label", "quarter", "年", "年月", "measurements"].includes(key),
      );
    expect(publicDataKeys([legacyNominal])).toEqual(expenseKeys);
    expect(publicDataKeys([plan40Nominal])).toEqual(expenseKeys);
    expect(legacyNominal[foodKey]).toBe(101);
    expect(plan40Nominal[foodKey]).toBe(101);
    expect(legacyNominal).not.toHaveProperty(SUPPORT_SERIES_KEY_NOMINAL);
    expect(plan40Nominal).not.toHaveProperty(SUPPORT_SERIES_KEY_NOMINAL);
    expect(plan40Nominal.measurements?.[foodKey]).toBe(officialMeasurement);
    expect(plan40Nominal.measurements?.[housingKey]).toBe(historicalMeasurement);
    expect(plan40Nominal.measurements?.[foodKey]).toMatchObject({
      source:
        "e-Stat 公式Excel cti-distribution-adjusted-000040499087.xlsx / 総・四(原) / 000040499087",
      seriesType: "official_adjusted",
      official: true,
    });
    expect(plan40Nominal.measurements?.[housingKey]).toMatchObject({
      source: "e-Stat 公式CTI長期artifact 000040499070 / Plan39-v2 bottom-up",
      seriesType: "estimated_adjusted",
      official: false,
    });
  });

  it("does not map the legacy support alias to a canonical key", () => {
    const foodKey = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料;
    const row = projectQuarterlyPublicView([
      {
        年: 2017,
        quarter: 4,
        label: "2017Q4",
        年月: "2017年10月",
        [SUPPORT_SERIES_KEY_NOMINAL]: 999,
      },
    ])[0]!;
    expect(row[foodKey]).toBeNull();
    expect(row).not.toHaveProperty(SUPPORT_SERIES_KEY_NOMINAL);
    expect(QUARTERLY_PUBLIC_NOMINAL_KEYS).toContain(foodKey);
  });

  it("keeps a poisoned legacy alias separate from a bare canonical key", () => {
    const foodKey = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料;
    const row = projectQuarterlyPublicView([
      {
        年: 2017,
        quarter: 4,
        label: "2017Q4",
        年月: "2017年10月",
        [foodKey]: 101,
        [SUPPORT_SERIES_KEY_NOMINAL]: 999,
      },
    ])[0]!;
    expect(row[foodKey]).toBe(101);
    expect(row).not.toHaveProperty(SUPPORT_SERIES_KEY_NOMINAL);
  });

  it("excludes rows whose quarter is outside 1–4 or whose label disagrees with its period", () => {
    const rows = projectQuarterlyPublicView([
      { 年: 2017, quarter: 4, label: "2017Q4", 年月: "2017年10月" },
      { 年: 2017, quarter: 0, label: "2017Q0", 年月: "2017年1月" },
      { 年: 2017, quarter: 5, label: "2017Q5", 年月: "2018年1月" },
      { 年: 2017, quarter: 4, label: "2017Q3", 年月: "2017年10月" },
    ]);

    expect(rows.map((row) => row.label)).toEqual(["2017Q4"]);
  });
});
