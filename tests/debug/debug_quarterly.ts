import { computeChartData } from "../../src/lib/chartLogic";
import { nominalKeys } from "../../src/lib/chartConstants";

import { CpiData } from "../../src/app/page";

// ダミーデータ：2020年のQ1（1月、2月、3月）のデータ
const mockData: CpiData[] = [
  { 年月: "2020年1月", "食料（名目）": 10, "その他の消費支出（名目）": 10, 総合: 0, "生鮮食品を除く総合": 0, "生鮮食品及びエネルギーを除く総合": 0, "食料（酒類を除く）及びエネルギーを除く総合": 0 } as any,
  { 年月: "2020年2月", "食料（名目）": 20, "その他の消費支出（名目）": 20, 総合: 0, "生鮮食品を除く総合": 0, "生鮮食品及びエネルギーを除く総合": 0, "食料（酒類を除く）及びエネルギーを除く総合": 0 } as any,
  { 年月: "2020年3月", "食料（名目）": 30, "その他の消費支出（名目）": 30, 総合: 0, "生鮮食品を除く総合": 0, "生鮮食品及びエネルギーを除く総合": 0, "食料（酒類を除く）及びエネルギーを除く総合": 0 } as any,
];

const props = {
  data: [],
  nominalData: mockData,
  startYear: 2020,
  endYear: 2020,
  nominalKeys: nominalKeys,
  realKeys: [],
  maxCpiDate: { year: 2020, month: 3 },
};

const result = computeChartData(props, []);
console.log("Quarterly Data:", JSON.stringify(result.quarterlyNominalData, null, 2));
