import { describe, expect, it } from "vitest";
import expected from "../fixtures/plan27-private-consumption.json";
import {
  aggregateCtiBasicNominalQuarterly,
  loadCtiBasicSeries2025,
} from "../../server/lib/ctiBasicSeries2025LongTerm";
import {
  COMPARISON_SERIES_REGISTRY,
  CTI_BASIC_RAW_KEY,
  CTI_BASIC_SERIES_DESCRIPTORS,
  EARNINGS_SERIES_REGISTRY,
  SUPPORT_SERIES_KEY_NOMINAL,
} from "../../src/lib/chartConstants";
import { QUARTERLY_PUBLIC_NOMINAL_KEYS } from "../../src/lib/quarterlyPublicProjection";

describe("Plan27 private-consumption source contract", () => {
  it("projects the official raw CTI artifact into the fixed 52-quarter window", () => {
    const sourceRecords = loadCtiBasicSeries2025("nominal").filter(
      (record) => record.seriesIndex === 1,
    );
    const quarterly = aggregateCtiBasicNominalQuarterly(sourceRecords);
    const periods = [...quarterly.measurements.keys()];

    expect(quarterly.status).toBe("valid");
    expect(periods).toHaveLength(expected.quarterCount);
    expect(periods[0]).toBe("2005Q1");
    expect(periods.at(-1)).toBe("2017Q4");
    expect(periods.every((period) => /^20(?:0[5-9]|1[0-7])Q[1-4]$/.test(period))).toBe(true);
    expect(quarterly.values.has("2018Q1")).toBe(false);

    const firstMeasurement = quarterly.measurements.get("2005Q1");
    expect(firstMeasurement).toMatchObject({
      key: expected.series,
      label: expected.label,
      unit: "指数",
      source: "e-Stat 公式CTI長期artifact 000040499070",
      frequency: "quarterly",
      aggregation: "simple_mean_of_three_calendar_months",
      status: "valid",
      reason: null,
    });
    expect(firstMeasurement?.value).toBe((98.3 + 90.3 + 108.4) / 3);
  });

  it("keeps the nominal quarterly support key separate from wage and comparison registries", () => {
    const sourceDescriptor = CTI_BASIC_SERIES_DESCRIPTORS.find(
      (descriptor) => descriptor.key === CTI_BASIC_RAW_KEY,
    );
    const wageAndComparisonKeys = [...EARNINGS_SERIES_REGISTRY, ...COMPARISON_SERIES_REGISTRY].map(
      ({ key }) => key,
    );

    expect(expected.series).toBe(SUPPORT_SERIES_KEY_NOMINAL);
    expect(QUARTERLY_PUBLIC_NOMINAL_KEYS).toContain(expected.series);
    expect(sourceDescriptor).toMatchObject({
      key: CTI_BASIC_RAW_KEY,
      unit: "指数",
      source: "e-Stat 公式CTI長期artifact 000040499070",
      valueType: "raw",
      frequency: "monthly",
    });
    expect(wageAndComparisonKeys).not.toContain(expected.series);
    expect(wageAndComparisonKeys).not.toContain(CTI_BASIC_RAW_KEY);
  });
});
