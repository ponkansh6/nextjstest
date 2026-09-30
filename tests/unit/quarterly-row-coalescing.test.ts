import { describe, expect, it } from "vitest";
import { coalesceQuarterlyRowsByPeriod } from "../../server/lib/view-models/quarterlyAggregation";
import type { QuarterlyRow, SeriesMeasurement } from "../../src/types/chart";

const measurement = (
  key: string,
  value: number | null,
  source: string,
  official: boolean,
  status: SeriesMeasurement["status"] = "available",
): SeriesMeasurement => ({
  key,
  label: key,
  unit: "指数",
  source,
  valueType: "comparison",
  value,
  status,
  reason: status === "unavailable" ? "official_quarterly_value_unavailable" : null,
  frequency: "quarterly",
  aggregation: official ? "official_quarterly_adjusted_nominal_observation" : "legacy_monthly_mean",
  seriesType: official ? "official_adjusted" : "estimated_adjusted",
  official,
});

describe("quarterly row coalescing", () => {
  it("keeps fields from multiple legacy rows and preserves explicit official nulls", () => {
    const firstLegacyOnlyKey = "CTI legacy field A";
    const secondLegacyOnlyKey = "CTI legacy field B";
    const sharedKey = "shared field";
    const legacy: QuarterlyRow = {
      label: "2025Q1",
      年: 2025,
      quarter: 1,
      年月: "2025年1月",
      kind: "legacy-cti",
      [firstLegacyOnlyKey]: 40,
      [sharedKey]: 30,
      measurements: {
        [firstLegacyOnlyKey]: measurement(firstLegacyOnlyKey, 40, "monthly CTI", false),
        [sharedKey]: measurement(sharedKey, 30, "monthly CTI", false),
      },
    };
    const secondLegacy: QuarterlyRow = {
      label: "2025Q1",
      年: 2025,
      quarter: 1,
      年月: "2025年1月",
      kind: "legacy-cti",
      [secondLegacyOnlyKey]: 70,
      measurements: {
        [secondLegacyOnlyKey]: measurement(secondLegacyOnlyKey, 70, "monthly CTI", false),
      },
    };
    const official: QuarterlyRow = {
      label: "2025Q1",
      年: 2025,
      quarter: 1,
      年月: "2025年1月",
      kind: "plan40-official-quarterly",
      [sharedKey]: null,
      measurements: {
        [sharedKey]: measurement(sharedKey, null, "official CTI", true, "unavailable"),
      },
    };

    const merged = coalesceQuarterlyRowsByPeriod([legacy, secondLegacy, official]);

    expect(merged).toHaveLength(1);
    expect(merged.map((row) => row.label)).toEqual(["2025Q1"]);
    expect(merged[0]).toMatchObject({
      kind: "plan40-official-quarterly",
      [firstLegacyOnlyKey]: 40,
      [secondLegacyOnlyKey]: 70,
      [sharedKey]: null,
    });
    expect(merged[0]?.measurements).toMatchObject({
      [firstLegacyOnlyKey]: { source: "monthly CTI", value: 40, official: false },
      [secondLegacyOnlyKey]: { source: "monthly CTI", value: 70, official: false },
      [sharedKey]: {
        source: "official CTI",
        value: null,
        status: "unavailable",
        reason: "official_quarterly_value_unavailable",
        official: true,
      },
    });
  });
});
