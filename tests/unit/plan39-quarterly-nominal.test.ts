import { describe, expect, it } from "vitest";
import {
  CTI_ADJUSTED_V2_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY,
  CTI_ADJUSTED_V2_PUBLIC_KEYS,
} from "../../src/lib/chartConstants";
import { buildPlan39V2CtiNominalRows } from "../../server/lib/view-models/quarterlyAggregation";
import type { CtiBasicRecord } from "../../server/lib/ctiBasicSeries2025LongTerm";
import type {
  CtiAdjustedV2Result,
  CtiAdjustedV2Row,
} from "../../server/lib/ctiAdjustedConnectionEstimateV2";
import { buildCsv } from "../../src/lib/csvExport";
import { getMeasurementNote } from "../../src/types/chart";

const seriesIndexByCategory = Object.fromEntries(
  CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.filter((category) => category !== "総合").map(
    (category, index) => [category, index + 2],
  ),
);
const expenseKeys = CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.filter((category) => category !== "総合").map(
  (category) => CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY[category],
);
const foodKey = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料;

function makeResult(): CtiAdjustedV2Result {
  const rows: CtiAdjustedV2Row[] = [];
  for (let year = 2005; year <= 2017; year += 1) {
    const values = Object.fromEntries(
      CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.map((category) => [
        category,
        category === "総合" ? 110 : 10,
      ]),
    ) as CtiAdjustedV2Row["values"];
    rows.push({
      year,
      seriesType: year === 2017 ? "official_adjusted" : "estimated_bottom_up",
      official: year === 2017,
      status: "available",
      reason: null,
      values,
    });
  }
  return {
    model: "v2-bottom-up",
    estimateVersion: "plan39-v2",
    years: rows.map((row) => row.year),
    rows,
    categories: {} as CtiAdjustedV2Result["categories"],
    other: {} as CtiAdjustedV2Result["other"],
    residual: {} as CtiAdjustedV2Result["residual"],
    beta: {} as CtiAdjustedV2Result["beta"],
    fitDiagnostics: {} as CtiAdjustedV2Result["fitDiagnostics"],
    benchmarkG: {},
    benchmarkGDiagnostics: {} as CtiAdjustedV2Result["benchmarkGDiagnostics"],
    artifactValidation: {} as CtiAdjustedV2Result["artifactValidation"],
    publicationGate: {
      accepted: true,
      status: "pass",
      reasonCodes: [],
      blockingReasonCodes: [],
      warningReasonCodes: [],
      diagnostics: [],
    },
  };
}

function makeRecords(missing?: string): CtiBasicRecord[] {
  const records: CtiBasicRecord[] = [];
  for (let year = 2005; year <= 2017; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      for (const category of CTI_ADJUSTED_V2_PUBLIC_CATEGORIES) {
        if (category === "総合") continue;
        const monthKey = `${year}-${String(month).padStart(2, "0")}`;
        if (monthKey === missing && category === "食料") continue;
        records.push({
          variant: "nominal",
          seriesIndex: seriesIndexByCategory[category]!,
          officialSeriesCode: String(seriesIndexByCategory[category]),
          seriesName: `${category}（名目）`,
          month: monthKey as `${number}-${number}`,
          rawValue: month <= 3 ? 20 : 10,
          isMissing: false,
        });
      }
    }
  }
  return records;
}

describe("Plan39-v2 quarterly nominal projection", () => {
  it("preserves monthly seasonality while anchoring each category to v2 annual values", () => {
    const rows = buildPlan39V2CtiNominalRows({ records: makeRecords(), result: makeResult() });
    expect(rows).toHaveLength(52);
    const q1 = rows.find((row) => row.label === "2005Q1")!;
    const q2 = rows.find((row) => row.label === "2005Q2")!;
    expect(q1.kind).toBe("plan40-v2-cost-stack");
    expect(Object.keys(q1.measurements ?? {})).toEqual(expenseKeys);
    expect(
      Object.keys(q1).filter(
        (key) =>
          key !== "label" &&
          key !== "quarter" &&
          key !== "年" &&
          key !== "年月" &&
          key !== "kind" &&
          key !== "measurements",
      ),
    ).toEqual(expenseKeys);
    expect(q1[foodKey]).toBeCloseTo(10 * (20 / 12.5));
    expect(q2[foodKey]).toBeCloseTo(10 * (10 / 12.5));
    expect(q1.measurements?.[foodKey]).toMatchObject({
      frequency: "quarterly",
      aggregation: "derived_quarterly_mean_seasonal_pattern_anchored_to_plan39_v2_annual",
      seriesType: "estimated_adjusted",
      official: false,
      annualAnchorType: "estimated",
      quarterlyDerived: true,
    });
    expect(rows.find((row) => row.label === "2017Q4")?.measurements?.[foodKey]).toMatchObject({
      seriesType: "official_adjusted",
      official: false,
      annualAnchorType: "official",
      quarterlyDerived: true,
    });
    const officialQuarter = rows.find((row) => row.label === "2017Q4")?.measurements?.[foodKey];
    expect(getMeasurementNote(officialQuarter ?? {})).toBe(
      "公式年次値を月次系列から四半期化（公式四半期値ではない）",
    );
  });

  it("marks invalid derived quarterly measurements as unavailable", () => {
    expect(
      getMeasurementNote({
        status: "invalid",
        reason: "insufficient_months",
        annualAnchorType: "official",
        quarterlyDerived: true,
      }),
    ).toBe("利用不可: insufficient_months");
  });

  it("fails closed for a missing month and keeps graph/table/CSV measurement metadata identical", () => {
    const rows = buildPlan39V2CtiNominalRows({
      records: makeRecords("2005-02"),
      result: makeResult(),
    });
    const invalid = rows.find((row) => row.label === "2005Q1")!;
    expect(invalid[foodKey]).toBeNull();
    for (const key of expenseKeys) {
      expect(invalid[key]).toBeNull();
      expect(invalid.measurements?.[key]).toMatchObject({
        status: "unavailable",
        value: null,
        reason: "insufficient_months",
      });
    }
    expect(invalid.measurements?.[foodKey]).toMatchObject({
      status: "unavailable",
      reason: "insufficient_months",
      value: null,
    });
    const key = CTI_ADJUSTED_V2_PUBLIC_KEYS.find((candidate) => candidate === foodKey)!;
    const measurement = rows.find((row) => row.measurements?.[key])!.measurements![key]!;
    const csv = buildCsv(rows as unknown as Record<string, unknown>[], [key], [key], {
      metadata: [measurement],
    });
    expect(csv).toContain(`${key}__frequency`);
    expect(csv).toContain("quarterly");
    expect(csv).toContain(measurement.aggregation);
  });
});
