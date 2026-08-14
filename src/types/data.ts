export interface CpiData {
  年月: string;
  総合: number;
  生鮮食品を除く総合: number;
  持家の帰属家賃を除く総合: number;
  "消費支出（参考）": number;
  "民間最終消費支出（参考）"?: number | null;
  "CTI消費支出（参考）"?: number | null;
  "CPI総合(参考)": number;
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
