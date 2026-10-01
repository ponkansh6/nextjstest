import { describe, expect, it } from "vitest";
import type { CpiData } from "../../src/types";
import type { QuarterlyRow, SeriesMeasurement } from "../../src/types/chart";
import {
  CTI_ADJUSTED_V2_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY,
  CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY,
  CTI_NOMINAL_DERIVED_TOTAL_KEY,
} from "../../src/lib/chartConstants";
import { deriveQuarterlyRealRows } from "../../server/lib/view-models/quarterlyProjection";
import { projectQuarterlyPublicView } from "../../src/lib/quarterlyPublicProjection";

const expenseCategories = CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.filter(
  (category) => category !== "総合",
);

function nominalRow(otherValue = 20): QuarterlyRow {
  const measurements: Record<string, SeriesMeasurement> = {};
  const values: Record<string, number> = {};
  for (const category of expenseCategories) {
    const key = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY[category];
    const value = category === "その他の消費支出" ? otherValue : 20;
    values[key] = value;
    measurements[key] = {
      key,
      label: key,
      unit: "指数",
      source: "test nominal source",
      valueType: "comparison",
      value,
      status: "available",
      reason: null,
      frequency: "quarterly",
      aggregation: "test nominal quarter",
    };
  }
  values[CTI_NOMINAL_DERIVED_TOTAL_KEY] = 100;
  measurements[CTI_NOMINAL_DERIVED_TOTAL_KEY] = {
    key: CTI_NOMINAL_DERIVED_TOTAL_KEY,
    label: CTI_NOMINAL_DERIVED_TOTAL_KEY,
    unit: "指数",
    source: "test CTI total source",
    valueType: "comparison",
    value: 100,
    status: "available",
    reason: null,
    frequency: "quarterly",
    aggregation: "test CTI total quarter",
  };
  return {
    年: 2005,
    quarter: 1,
    label: "2005Q1",
    年月: "2005年1月",
    ...values,
    measurements,
  };
}

function cpiRows(): CpiData[] {
  return [1, 2, 3].map((month) => {
    const row = { 年月: `2005年${month}月` } as CpiData;
    for (const category of expenseCategories) row[category] = 100;
    row["持家の帰属家賃を除く住居"] = 110;
    row["持家の帰属家賃を除く総合"] = 120;
    return row;
  });
}

describe("quarterly real CTI projection", () => {
  it("deflates nominal quarter values by the arithmetic mean of three direct 2025-base CPI months", () => {
    const [real] = deriveQuarterlyRealRows([nominalRow()], cpiRows());
    expect(real?.["食料（実質）"]).toBe(20);
    expect(real?.["住居（実質）"]).toBeCloseTo((20 * 100) / 110);
    expect(real?.[CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY]).toBeCloseTo((100 * 100) / 120);
    expect(real?.measurements?.["住居（実質）"]).toMatchObject({
      cpiSeries: "持家の帰属家賃を除く住居",
      cpiPeriod: "2005Q1 (1–3月)",
      cpiAggregation: "算術平均（四半期内の3か月）",
      nominalSource: "test nominal source",
      sourceId: "0004052037",
      baseYear: 2025,
      status: "available",
    });
    expect(real?.measurements?.["その他の消費支出（実質）"]?.measurementNote).toContain(
      "一般proxy",
    );
    expect(real?.measurements?.["その他の消費支出（実質）"]).toMatchObject({
      sourceRole: "proxy_cpi_deflator",
      canonicalSeries: "その他の消費支出",
    });
    expect(real?.measurements?.[CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY]?.measurementNote).toContain(
      "一致する定義ではありません",
    );
    expect(real?.measurements?.[CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY]).toMatchObject({
      sourceRole: "direct_cpi_deflator",
      canonicalSeries: "総合",
    });
    const projected = projectQuarterlyPublicView([real!], "real")[0]!;
    expect(projected).toHaveProperty(CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY);
    expect(projected).not.toHaveProperty("民間最終消費支出（実質）");
    expect(Object.keys(projected.measurements ?? {})).toHaveLength(11);
  });

  it("preserves a signed Other residual after deflation", () => {
    const [real] = deriveQuarterlyRealRows([nominalRow(-2)], cpiRows());
    expect(real?.["その他の消費支出（実質）"]).toBeCloseTo((-2 * 100) / 120);
  });

  it("fails closed when a quarter CPI month is absent", () => {
    const [real] = deriveQuarterlyRealRows([nominalRow()], cpiRows().slice(0, 2));
    expect(real?.["食料（実質）"]).toBeNull();
    expect(real?.measurements?.["食料（実質）"]).toMatchObject({
      status: "unavailable",
      reason: "cpi_month_missing",
    });
    expect(real?.[CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY]).toBeNull();
  });

  it("fails closed for a missing nominal measurement while retaining other available series", () => {
    const nominal = nominalRow();
    const foodKey = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料;
    nominal[foodKey] = null;
    nominal.measurements![foodKey]!.value = null;
    nominal.measurements![foodKey]!.status = "unavailable";
    nominal.measurements![foodKey]!.reason = "source_nominal_missing";
    const [real] = deriveQuarterlyRealRows([nominal], cpiRows());
    expect(real?.["食料（実質）"]).toBeNull();
    expect(real?.measurements?.["食料（実質）"]).toMatchObject({
      status: "unavailable",
      reason: "source_nominal_missing",
    });
    expect(real?.["住居（実質）"]).toBeCloseTo((20 * 100) / 110);
  });
});
