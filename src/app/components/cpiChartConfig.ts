export interface CpiChartSection {
  id: string;
  label: string;
}

export const CPI_CHART_SECTIONS: CpiChartSection[] = [
  { id: "section-cpi-major", label: "CPI主要" },
  { id: "section-stacked", label: "CPI費目別" },
  { id: "section-consumption-nominal", label: "消費(名目)" },
  { id: "section-consumption-real", label: "消費(実質)" },
  { id: "section-earnings", label: "給与" },
  { id: "section-residual", label: "給与物価差" },
  { id: "section-new-graph", label: "3種比較" },
];
