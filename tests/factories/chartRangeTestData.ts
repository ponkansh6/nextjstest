import type { CpiData } from "../../src/types";
import type { CpiView, QuarterlyView, EarningsView } from "../../src/types/chart";

/**
 * 月次CPI テスト用データ生成
 */
export function createMockCpiData(
  yearStart: number = 2020,
  yearEnd: number = 2024,
): CpiView[] {
  const data: CpiView[] = [];
  for (let year = yearStart; year <= yearEnd; year++) {
    for (let month = 1; month <= 12; month++) {
      data.push({
        年月: `${year}年${String(month).padStart(2, "0")}月`,
        総合: 100 + year,
        持家の帰属家賃を除く総合: 100 + year,
        生鮮食品を除く総合: 100 + year,
        "消費支出（参考）": 100 + year,
        "CPI総合(参考)": 100 + year,
        民間最終消費支出: 0,
      });
    }
  }
  return data;
}

/**
 * 四半期 CPI テスト用データ生成（名目）
 */
export function createMockQuarterlyNominalData(
  yearStart: number = 2020,
  yearEnd: number = 2024,
): QuarterlyView[] {
  const data: QuarterlyView[] = [];
  for (let year = yearStart; year <= yearEnd; year++) {
    for (let q = 1; q <= 4; q++) {
      data.push({
        label: `${year}年Q${q}`,
        年: year,
        quarter: q,
        年月: `${year}年${(q - 1) * 3 + 1}月`,
        "民間最終消費支出": 500 + year,
        "政府最終消費支出": 300 + year,
        "総資本形成": 200 + year,
        "財貨・サービスの輸出": 150 + year,
        "財貨・サービスの輸入": 100 + year,
        "民間最終消費支出（支援）": 50 + year,
      });
    }
  }
  return data;
}

/**
 * 四半期 CPI テスト用データ生成（実質）
 */
export function createMockQuarterlyRealData(
  yearStart: number = 2020,
  yearEnd: number = 2024,
): QuarterlyView[] {
  const data: QuarterlyView[] = [];
  for (let year = yearStart; year <= yearEnd; year++) {
    for (let q = 1; q <= 4; q++) {
      data.push({
        label: `${year}年Q${q}`,
        年: year,
        quarter: q,
        年月: `${year}年${(q - 1) * 3 + 1}月`,
        "民間最終消費支出（実質）": 480 + year,
        "政府最終消費支出（実質）": 290 + year,
        "総資本形成（実質）": 190 + year,
        "財貨・サービスの輸出（実質）": 140 + year,
        "財貨・サービスの輸入（実質）": 90 + year,
        "民間最終消費支出（実質）（支援）": 45 + year,
      });
    }
  }
  return data;
}

/**
 * 給与データ テスト用生成
 */
export function createMockTotalEarningData(
  yearStart: number = 2020,
  yearEnd: number = 2024,
): EarningsView[] {
  const data: EarningsView[] = [];
  for (let year = yearStart; year <= yearEnd; year++) {
    for (let month = 1; month <= 12; month++) {
      data.push({
        年月: `${year}年${String(month).padStart(2, "0")}月`,
        "所定内給与": 100 + year,
        "所定外給与": 50 + year,
        "特別給与": 30 + year,
        "給与総額": 180 + year,
        "実質給与": 170 + year,
      });
    }
  }
  return data;
}

/**
 * すべてのテストデータを一括生成
 */
export function createAllChartTestData(
  yearStart: number = 2020,
  yearEnd: number = 2024,
) {
  return {
    data: createMockCpiData(yearStart, yearEnd),
    quarterlyNominalData: createMockQuarterlyNominalData(yearStart, yearEnd),
    quarterlyRealData: createMockQuarterlyRealData(yearStart, yearEnd),
    totalEarningData: createMockTotalEarningData(yearStart, yearEnd),
    maxCpiDate: { year: yearEnd, month: 12 },
  };
}
