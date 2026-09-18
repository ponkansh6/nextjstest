/** Legacy support values retain their established comparison-index scale. */
export type LegacyConsumptionComparisonValue = number | null;
/** Official GDP amounts and GDP-only display indices must not share a key. */
export type GdpRawValue = number | null;
export type GdpNormalizedValue = number | null;

export interface CpiData {
  年月: string;
  総合: number;
  生鮮食品を除く総合: number;
  持家の帰属家賃を除く総合: number;
  "消費支出（参考）": number | null;
  "民間最終消費支出（参考）"?: number | null;
  "民間最終消費支出（参考・延長）"?: number | null;
  "CTI消費支出（参考）"?: number | null;
  "CPI総合(参考)": number | null;
  "民間最終消費支出（名目）"?: LegacyConsumptionComparisonValue;
  "民間最終消費支出（実質）"?: LegacyConsumptionComparisonValue;
  "民間最終消費支出（名目・原値）"?: GdpRawValue;
  "民間最終消費支出（実質・原値）"?: GdpRawValue;
  "民間最終消費支出（名目・比較指数）"?: GdpNormalizedValue;
  "民間最終消費支出（実質・比較指数）"?: GdpNormalizedValue;
  [key: string]: string | number | null | undefined;
}

export interface PopulationData {
  total: number;
  index: number;
  ma: number;
}

export interface ParsedCsvRow {
  [key: string]: string | number;
}
