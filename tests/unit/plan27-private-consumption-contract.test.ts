import { describe, expect, it } from "vitest";
import { loadCtiBasicSeries2025 } from "../../server/lib/ctiBasicSeries2025LongTerm";
import {
  CTI_ADJUSTED_V2_PUBLIC_REGISTRY,
  COMPARISON_SERIES_REGISTRY,
  CTI_BASIC_RAW_KEY,
  CTI_BASIC_SERIES_DESCRIPTORS,
  EARNINGS_SERIES_REGISTRY,
} from "../../src/lib/chartConstants";
import { QUARTERLY_PUBLIC_NOMINAL_KEYS } from "../../src/lib/quarterlyPublicProjection";

describe("CTI monthly source and Plan40 public contract", () => {
  it("retains the Plan37 monthly raw CTI artifact", () => {
    const sourceRecords = loadCtiBasicSeries2025("nominal").filter(
      (record) => record.seriesIndex === 1,
    );
    const periods = sourceRecords.map(({ month }) => month);
    const sourceDescriptor = CTI_BASIC_SERIES_DESCRIPTORS.find(
      (descriptor) => descriptor.key === CTI_BASIC_RAW_KEY,
    );

    expect(sourceRecords.length).toBeGreaterThan(0);
    expect(sourceRecords.every((record) => record.variant === "nominal")).toBe(true);
    expect(periods).toContain("2025-12");
    expect(sourceDescriptor).toMatchObject({
      key: CTI_BASIC_RAW_KEY,
      unit: "指数",
      source: "e-Stat 公式CTI長期artifact 000040499070",
      valueType: "raw",
      frequency: "monthly",
    });
  });

  it("keeps Plan40's ten quarterly keys separate from wage and comparison registries", () => {
    const wageAndComparisonKeys = [...EARNINGS_SERIES_REGISTRY, ...COMPARISON_SERIES_REGISTRY].map(
      ({ key }) => key,
    );
    const canonicalNominalKeys = CTI_ADJUSTED_V2_PUBLIC_REGISTRY.filter(
      (entry) => entry.category !== "総合",
    ).map((entry) => entry.key);

    expect(QUARTERLY_PUBLIC_NOMINAL_KEYS).toEqual(canonicalNominalKeys);
    expect(QUARTERLY_PUBLIC_NOMINAL_KEYS).toHaveLength(10);
    expect(wageAndComparisonKeys).not.toContain(CTI_BASIC_RAW_KEY);
  });
});
