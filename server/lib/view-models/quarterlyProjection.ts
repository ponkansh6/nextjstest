import { loadCpiData, loadCtiData } from "../dataLoader";
import { computeQuarterlyAggregates, type QuarterlyRow } from "./quarterlyAggregation";
import { projectQuarterlyPublicView } from "../../../src/lib/quarterlyPublicProjection";
import type { QuarterlyGdpData } from "../dataLoader";
import type { QuarterlyView, SeriesMeasurement } from "@/types/chart";
import type { CpiData } from "@/types";
import {
  CTI_ADJUSTED_V2_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY,
  CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY,
  CTI_NOMINAL_DERIVED_TOTAL_KEY,
} from "@/lib/chartConstants";
import { normalizeYearMonth } from "@/lib/yearMonth";

const cpiSeriesByCtiCategory: Record<string, string> = {
  食料: "食料",
  住居: "持家の帰属家賃を除く住居",
  "光熱・水道": "光熱・水道",
  "家具・家事用品": "家具・家事用品",
  被服及び履物: "被服及び履物",
  保健医療: "保健医療",
  "交通・通信": "交通・通信",
  教育: "教育",
  教養娯楽: "教養娯楽",
  その他の消費支出: "持家の帰属家賃を除く総合",
};

const realKeyByCategory: Record<
  Exclude<(typeof CTI_ADJUSTED_V2_PUBLIC_CATEGORIES)[number], "総合">,
  string
> = {
  食料: "食料（実質）",
  住居: "住居（実質）",
  "光熱・水道": "光熱・水道（実質）",
  "家具・家事用品": "家具・家事用品（実質）",
  被服及び履物: "被服及び履物（実質）",
  保健医療: "保健医療（実質）",
  "交通・通信": "交通・通信（実質）",
  教育: "教育（実質）",
  教養娯楽: "教養娯楽（実質）",
  その他の消費支出: "その他の消費支出（実質）",
};

const REAL_CPI_SOURCE = "e-Stat CPI 2025年基準公式接続指数 / 0004052037";
const OTHER_PROXY_NOTE =
  "CTI「その他の消費支出」に直接対応するCPI大分類はないため、「持家の帰属家賃を除く総合」を一般proxyとして適用。費目固有の物価変動を表すものではありません。";
const TOTAL_DEFINITION_NOTE =
  "実質総合はCTI名目総合に「持家の帰属家賃を除く総合」を独立適用した値です。9費目とその他の実質値の和に一致する定義ではありません。";

function measurementValue(row: QuarterlyRow, key: string): number | null {
  const measurement = row.measurements?.[key];
  if (measurement) {
    return measurement.status !== "unavailable" &&
      measurement.status !== "invalid" &&
      typeof measurement.value === "number" &&
      Number.isFinite(measurement.value)
      ? measurement.value
      : null;
  }
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cpiMonthMap(rows: readonly CpiData[]): Map<string, CpiData | null> {
  const result = new Map<string, CpiData | null>();
  for (const row of rows) {
    const month = normalizeYearMonth(String(row.年月 ?? ""));
    if (!/^\d{4}年\d{1,2}月$/.test(month)) continue;
    if (result.has(month)) result.set(month, null);
    else result.set(month, row);
  }
  return result;
}

/** Derive the public real rows from the fixed public nominal rows and raw 2025-base CPI. */
export function deriveQuarterlyRealRows(
  nominalRows: readonly QuarterlyRow[],
  monthlyCpiRows: readonly CpiData[],
): QuarterlyRow[] {
  const cpiByMonth = cpiMonthMap(monthlyCpiRows);
  return nominalRows.map((nominalRow) => {
    const startMonth = (nominalRow.quarter - 1) * 3 + 1;
    const period = `${nominalRow.年}Q${nominalRow.quarter}`;
    const monthLabels = [0, 1, 2].map((offset) => `${nominalRow.年}年${startMonth + offset}月`);
    const values: Record<string, number | null> = {};
    const measurements: Record<string, SeriesMeasurement> = {};

    const derive = (
      outputKey: string,
      nominalKey: string,
      cpiSeries: string,
      note?: string,
      sourceRole: "direct_cpi_deflator" | "proxy_cpi_deflator" = "direct_cpi_deflator",
      canonicalSeries = cpiSeries,
    ) => {
      const nominalValue = measurementValue(nominalRow, nominalKey);
      const nominalMeasurement = nominalRow.measurements?.[nominalKey];
      const monthRows = monthLabels.map((month) => cpiByMonth.get(month));
      const cpiValues = monthRows.map((row) => row?.[cpiSeries]);
      let reason: string | null = null;
      if (nominalValue === null) reason = nominalMeasurement?.reason ?? "nominal_value_unavailable";
      else if (monthRows.some((row) => row === undefined)) reason = "cpi_month_missing";
      else if (monthRows.some((row) => row === null)) reason = "duplicate_cpi_month";
      else if (
        cpiValues.some(
          (value) => typeof value !== "number" || !Number.isFinite(value) || value <= 0,
        )
      )
        reason = "cpi_value_invalid";
      const cpiMean = reason
        ? null
        : cpiValues.reduce<number>((sum, value) => sum + Number(value), 0) / 3;
      const realValue =
        nominalValue !== null && cpiMean !== null ? (nominalValue * 100) / cpiMean : null;
      const valid = typeof realValue === "number" && Number.isFinite(realValue);
      values[outputKey] = valid ? realValue : null;
      measurements[outputKey] = {
        key: outputKey,
        label: outputKey,
        unit: "指数",
        source: `${nominalMeasurement?.source ?? "CTI 公開名目四半期系列"} × ${REAL_CPI_SOURCE}`,
        sourceId: "0004052037",
        statInfId: "0004052037",
        sourceColumn: cpiSeries,
        sourceRole,
        canonicalSeries,
        valueType: "comparison",
        value: valid ? realValue : null,
        status: valid ? "available" : "unavailable",
        reason: valid ? null : (reason ?? "real_value_non_finite"),
        frequency: "quarterly",
        aggregation:
          "quarterly_nominal_index_times_100_divided_by_three_month_arithmetic_mean_of_2025_base_CPI",
        seriesType: "derived_adjusted",
        official: false,
        annualAnchorType: nominalMeasurement?.annualAnchorType,
        quarterlyDerived: true,
        baseYear: 2025,
        cpiSeries,
        cpiPeriod: `${period} (${startMonth}–${startMonth + 2}月)`,
        cpiAggregation: "算術平均（四半期内の3か月）",
        nominalSource: nominalMeasurement?.source ?? nominalKey,
        measurementNote: note,
      };
    };

    for (const category of CTI_ADJUSTED_V2_PUBLIC_CATEGORIES) {
      if (category === "総合") continue;
      derive(
        realKeyByCategory[category],
        CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY[category],
        cpiSeriesByCtiCategory[category],
        category === "その他の消費支出" ? OTHER_PROXY_NOTE : undefined,
        category === "その他の消費支出" ? "proxy_cpi_deflator" : "direct_cpi_deflator",
        category,
      );
    }
    derive(
      CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY,
      CTI_NOMINAL_DERIVED_TOTAL_KEY,
      "持家の帰属家賃を除く総合",
      TOTAL_DEFINITION_NOTE,
      "direct_cpi_deflator",
      "総合",
    );
    return {
      label: nominalRow.label,
      quarter: nominalRow.quarter,
      年: nominalRow.年,
      年月: nominalRow.年月,
      kind: nominalRow.kind,
      ...values,
      measurements,
    };
  });
}

/** Project fixed nominal rows and CPI-derived real rows; GDP is not a public real source. */
export function buildQuarterlyPublicViews(
  nominalRows: QuarterlyRow[],
  _realRows: QuarterlyRow[],
  _gdp: QuarterlyGdpData | undefined,
  monthlyCpiRows: CpiData[] = [],
): { nominal: QuarterlyView[]; real: QuarterlyView[] } {
  return {
    nominal: projectQuarterlyPublicView(nominalRows, "nominal"),
    real: projectQuarterlyPublicView(deriveQuarterlyRealRows(nominalRows, monthlyCpiRows), "real"),
  };
}

/** Load and project quarterly data through the same public path used by Page. */
export async function loadQuarterlyPublicData(): Promise<{
  nominal: QuarterlyView[];
  real: QuarterlyView[];
  maxCpiDate: { year: number; month: number };
}> {
  const [cpiData, ctiData] = await Promise.all([loadCpiData({ rawIndex: true }), loadCtiData()]);
  let maxCpiYear = 1994;
  let maxCpiMonth = 1;
  for (const row of cpiData) {
    const match = String(row.年月).match(/^(\d{4})年(\d{1,2})月/);
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year > maxCpiYear || (year === maxCpiYear && month > maxCpiMonth)) {
      maxCpiYear = year;
      maxCpiMonth = month;
    }
  }
  const aggregated = computeQuarterlyAggregates(ctiData, {
    year: maxCpiYear,
    month: maxCpiMonth,
  });
  return {
    ...buildQuarterlyPublicViews(aggregated.nominal, aggregated.real, undefined, cpiData),
    maxCpiDate: { year: maxCpiYear, month: maxCpiMonth },
  };
}
