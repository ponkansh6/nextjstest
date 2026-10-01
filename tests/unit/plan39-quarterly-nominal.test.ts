import { describe, expect, it } from "vitest";
import {
  CTI_ADJUSTED_V2_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY,
  CTI_ADJUSTED_V2_PUBLIC_KEYS,
  CTI_NOMINAL_DERIVED_TOTAL_KEY,
} from "../../src/lib/chartConstants";
import { buildPlan39V2CtiNominalRows } from "../../server/lib/view-models/quarterlyAggregation";
import type { CtiBasicRecord } from "../../server/lib/ctiBasicSeries2025LongTerm";
import type {
  CtiAdjustedV2Result,
  CtiAdjustedV2Row,
} from "../../server/lib/ctiAdjustedConnectionEstimateV2";
import { buildCsv } from "../../src/lib/csvExport";
import { getMeasurementNote } from "../../src/types/chart";
import { projectQuarterlyPublicView } from "../../src/lib/quarterlyPublicProjection";

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
        category === "総合" ? 100 : 10,
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
    householdComposition: {} as CtiAdjustedV2Result["householdComposition"],
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
      const componentValue = month <= 3 ? 20 : 10;
      const otherValue = month <= 3 ? 5 : 2.5;
      records.push({
        variant: "nominal",
        seriesIndex: 1,
        officialSeriesCode: "1",
        seriesName: "総合（名目）",
        month: `${year}-${String(month).padStart(2, "0")}` as `${number}-${number}`,
        rawValue: componentValue * 9 + otherValue,
        isMissing: false,
      });
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
          rawValue: componentValue,
          isMissing: false,
        });
      }
    }
  }
  return records;
}

function makeOfficialQuarterly(): Array<{
  label: string;
  year: number;
  quarter: number;
  values: Record<string, number | null>;
}> {
  const sourceRows = [
    [91.1, 22.4, 6.3, 7.8, 3.0, 3.6, 4.0, 15.6, 3.1, 9.1],
    [90.8, 23.3, 6.6, 6.3, 3.3, 3.7, 4.0, 15.0, 3.9, 9.5],
    [89.7, 24.3, 6.7, 5.6, 3.9, 3.1, 3.9, 15.1, 2.7, 9.8],
    [94.4, 25.9, 7.3, 6.3, 3.8, 4.1, 4.3, 14.6, 3.0, 9.8],
  ];
  return sourceRows.map((values, index) => ({
    label: `2017Q${index + 1}`,
    year: 2017,
    quarter: index + 1,
    values: Object.fromEntries([
      ...CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.filter(
        (category) => category !== "その他の消費支出",
      ).map((category, categoryIndex) => [category, values[categoryIndex]!]),
      ["その他の消費支出", null],
    ]),
  }));
}

describe("Plan39-v2 quarterly nominal projection", () => {
  it("preserves monthly seasonality while anchoring each category to v2 annual values", () => {
    const rows = buildPlan39V2CtiNominalRows({
      records: makeRecords(),
      result: makeResult(),
      officialQuarterly: makeOfficialQuarterly(),
    });
    expect(rows).toHaveLength(52);
    const q1 = rows.find((row) => row.label === "2005Q1")!;
    const q2 = rows.find((row) => row.label === "2005Q2")!;
    expect(q1.kind).toBe("plan40-v2-cost-stack");
    const internalKeys = [...expenseKeys, CTI_NOMINAL_DERIVED_TOTAL_KEY];
    expect(Object.keys(q1.measurements ?? {})).toEqual(internalKeys);
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
    ).toEqual(internalKeys);
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
      official: true,
      annualAnchorType: "official",
      quarterlyDerived: false,
    });
    const officialQuarter = rows.find((row) => row.label === "2017Q4")?.measurements?.[foodKey];
    expect(getMeasurementNote(officialQuarter ?? {})).toBe("公式調整値");
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

  it("uses the official 2017 quarterly nominal values directly", () => {
    const rows = buildPlan39V2CtiNominalRows({
      records: makeRecords(),
      result: makeResult(),
      officialQuarterly: makeOfficialQuarterly(),
    });
    const q1 = rows.find((row) => row.label === "2017Q1")!;
    const q2 = rows.find((row) => row.label === "2017Q2")!;
    expect(q1[foodKey]).toBe(22.4);
    expect(q2[foodKey]).toBe(23.3);
    expect(q1.measurements?.[foodKey]).toMatchObject({
      source:
        "e-Stat 公式Excel cti-distribution-adjusted-000040499087.xlsx / 総・四(原) / 000040499087",
      statInfId: "000040499087",
      householdScope: "総世帯",
      baseYear: 2025,
      official: true,
      aggregation: "official_quarterly_adjusted_nominal_observation",
    });
  });

  it("matches all ten 2017 expense categories to official quarters and derives Other as a residual", () => {
    const rows = buildPlan39V2CtiNominalRows({
      records: makeRecords(),
      result: makeResult(),
      officialQuarterly: makeOfficialQuarterly(),
    });
    const q1 = rows.find((row) => row.label === "2017Q1")!;
    const q2 = rows.find((row) => row.label === "2017Q2")!;
    const q3 = rows.find((row) => row.label === "2017Q3")!;
    const q4 = rows.find((row) => row.label === "2017Q4")!;
    const expected = [
      [22.4, 6.3, 7.8, 3, 3.6, 4, 15.6, 3.1, 9.1, 16.2],
      [23.3, 6.6, 6.3, 3.3, 3.7, 4, 15, 3.9, 9.5, 15.2],
      [24.3, 6.7, 5.6, 3.9, 3.1, 3.9, 15.1, 2.7, 9.8, 14.6],
      [25.9, 7.3, 6.3, 3.8, 4.1, 4.3, 14.6, 3, 9.8, 15.3],
    ];
    const quarters = [q1, q2, q3, q4];
    for (const [index, key] of expenseKeys.entries()) {
      for (const [quarterIndex, row] of quarters.entries()) {
        expect(row[key]).toBeCloseTo(expected[quarterIndex]![index]!);
        const isOther = key === CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.その他の消費支出;
        expect(row.measurements?.[key]).toMatchObject({
          official: !isOther,
          status: "available",
          source:
            "e-Stat 公式Excel cti-distribution-adjusted-000040499087.xlsx / 総・四(原) / 000040499087",
          baseYear: 2025,
          seriesType: isOther ? "estimated_adjusted" : "official_adjusted",
          quarterlyDerived: isOther,
          aggregation: isOther
            ? "derived_quarterly_residual_from_official_nominal_total_minus_nine_categories"
            : "official_quarterly_adjusted_nominal_observation",
        });
      }
    }
    expect(expenseKeys.reduce((sum, key) => sum + Number(q1[key]), 0)).toBeCloseTo(91.1);
    expect(expenseKeys.reduce((sum, key) => sum + Number(q2[key]), 0)).toBeCloseTo(90.8);
    const otherKey = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.その他の消費支出;
    expect(q1[otherKey]).toBeCloseTo(16.2);
    expect(q4[otherKey]).toBe(15.3);
    const otherMeasurement = q1.measurements?.[otherKey];
    expect(otherMeasurement).toMatchObject({
      official: false,
      seriesType: "estimated_adjusted",
      quarterlyDerived: true,
      aggregation: "derived_quarterly_residual_from_official_nominal_total_minus_nine_categories",
      sourceRole: "derived_residual",
      canonicalSeries: "その他の消費支出",
      sourceDerivedFromColumns: ["J", "K", "L", "M", "N", "O", "P", "Q", "R", "S"],
    });
    expect(getMeasurementNote(otherMeasurement ?? {})).toBe(
      "公式公表のその他値はなく、公式総合から他9費目を引いた残差（名目指数の公表桁に合わせ0.1単位に丸め）",
    );
  });

  it("keeps the fixed s_i annual level and original annual growth through 2005-2016", () => {
    const result = makeResult();
    for (const row of result.rows) {
      row.values.食料 = row.year - 2000;
    }
    const rows = buildPlan39V2CtiNominalRows({
      records: makeRecords(),
      result,
    });
    for (const year of [2005, 2010, 2016]) {
      const quarters = rows.filter((row) => row.年 === year);
      const mean = quarters.reduce((sum, row) => sum + Number(row[foodKey]), 0) / 4;
      expect(mean).toBeCloseTo(year - 2000);
    }
    const mean2010 =
      rows.filter((row) => row.年 === 2010).reduce((sum, row) => sum + Number(row[foodKey]), 0) / 4;
    const mean2011 =
      rows.filter((row) => row.年 === 2011).reduce((sum, row) => sum + Number(row[foodKey]), 0) / 4;
    expect(mean2011 / mean2010).toBeCloseTo(11 / 10);
  });

  it("preserves a negative Other residual instead of clipping it or using direct series 11", () => {
    const records = [
      ...makeRecords(),
      ...Array.from({ length: 12 }, (_, index) => ({
        variant: "nominal" as const,
        seriesIndex: 11,
        officialSeriesCode: "11",
        seriesName: "その他（直接値）",
        month: `2005-${String(index + 1).padStart(2, "0")}` as `${number}-${number}`,
        rawValue: 999,
        isMissing: false,
      })),
    ];
    for (const record of records) {
      if (record.seriesIndex === 1 && /^2005-0[1-3]$/.test(record.month)) {
        record.rawValue = 179;
      }
    }
    const rows = buildPlan39V2CtiNominalRows({
      records,
      result: makeResult(),
    });
    const q1 = rows.find((row) => row.label === "2005Q1")!;
    const otherKey = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.その他の消費支出;
    // The historical monthly residual is negative in Q1 and positive otherwise.
    expect(q1[otherKey]).toBeCloseTo((-1 / 1.625) * 10);
    expect(q1.measurements?.[otherKey]).toMatchObject({
      status: "available",
      reason: null,
      value: expect.any(Number),
    });
    for (const month of ["2005-01", "2005-02", "2005-03"] as const) {
      const total = records.find((record) => record.seriesIndex === 1 && record.month === month);
      const majorRecords = records.filter(
        (record) => record.month === month && record.seriesIndex >= 2 && record.seriesIndex <= 10,
      );
      const majorSum = majorRecords.reduce((sum, record) => {
        if (typeof record.rawValue !== "number") throw new Error("fixture major value is missing");
        return sum + record.rawValue;
      }, 0);
      const totalValue = total?.rawValue;
      expect(totalValue).toBe(179);
      if (typeof totalValue !== "number") throw new Error("fixture total value is missing");
      expect(totalValue - majorSum).toBe(-1);
    }
  });

  it("keeps poisoned legacy nominal aliases out of the canonical ten-series publication", () => {
    const baselineRows = buildPlan39V2CtiNominalRows({
      records: makeRecords(),
      result: makeResult(),
      officialQuarterly: makeOfficialQuarterly(),
    });
    const poisonedRows = buildPlan39V2CtiNominalRows({
      records: [
        ...makeRecords(),
        ...Array.from({ length: 12 }, (_, index) => ({
          variant: "nominal" as const,
          seriesIndex: 11,
          officialSeriesCode: "11",
          seriesName: "その他（直接値）",
          month: `2005-${String(index + 1).padStart(2, "0")}` as `${number}-${number}`,
          rawValue: 999_999,
          isMissing: false,
        })),
      ],
      result: makeResult(),
      officialQuarterly: makeOfficialQuarterly(),
    });
    const baseline = baselineRows.find((row) => row.label === "2005Q1")!;
    const poisoned = poisonedRows.find((row) => row.label === "2005Q1")!;
    const expectedPublishedKeys = [...expenseKeys, CTI_NOMINAL_DERIVED_TOTAL_KEY];

    expect(
      Object.keys(poisoned).filter(
        (key) => !["label", "quarter", "年", "年月", "kind", "measurements"].includes(key),
      ),
    ).toEqual(expectedPublishedKeys);
    for (const key of expectedPublishedKeys) {
      expect(poisoned[key]).toBe(baseline[key]);
    }

    const projected = projectQuarterlyPublicView([poisoned], "nominal")[0]!;
    expect(expenseKeys.map((key) => projected[key])).toEqual(
      expenseKeys.map((key) => poisoned[key]),
    );
    expect(projected[CTI_NOMINAL_DERIVED_TOTAL_KEY]).toBeUndefined();
    expect(Object.keys(projected.measurements ?? {}).sort()).toEqual([...expenseKeys].sort());
    const csv = buildCsv(
      [projected as unknown as Record<string, unknown>],
      expenseKeys,
      expenseKeys,
    );
    expect(csv).toContain("その他の消費支出");
    expect(csv).not.toContain("その他（直接値）");
    expect(csv).not.toContain("999999");
  });

  it("uses the published 2017 quarter when a legacy monthly record is duplicated", () => {
    const records = makeRecords();
    records.push({
      ...records.find((record) => record.month === "2017-01" && record.seriesIndex === 1)!,
    });
    const rows = buildPlan39V2CtiNominalRows({
      records,
      result: makeResult(),
      officialQuarterly: makeOfficialQuarterly(),
    });
    expect(rows.find((row) => row.label === "2017Q1")?.[foodKey]).toBe(22.4);
  });

  it("does not mutate the Plan39 annual result while adding official quarters", () => {
    const result = makeResult();
    const before = result.rows.map((row) => ({ year: row.year, food: row.values.食料 }));
    buildPlan39V2CtiNominalRows({
      records: makeRecords(),
      result,
      officialQuarterly: makeOfficialQuarterly(),
    });
    expect(result.rows.map((row) => ({ year: row.year, food: row.values.食料 }))).toEqual(before);
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
