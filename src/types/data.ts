export interface CpiData {
  年月: string;
  総合: number;
  生鮮食品を除く総合: number;
  持家の帰属家賃を除く総合: number;
  "消費支出（参考）": number | null;
  "CTI消費支出（参考）"?: number | null;
  "CTIミクロ基本系列（名目・原数値）"?: number | null;
  "CTIミクロ基本系列（名目・参考）"?: number | null;
  "CTIミクロ基本系列（名目・参考・延長）"?: number | null;
  "CPI総合(参考)": number | null;
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
