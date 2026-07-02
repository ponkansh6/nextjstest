import type { CpiData } from "../../src/types";

/**
 * テスト用のCpiDataオブジェクトを生成するファクトリ関数
 */
export function createCpiData(overrides: Partial<CpiData> = {}): CpiData {
  return {
    年月: "2020年01月",
    持家の帰属家賃を除く総合: 100,
    生鮮食品を除く総合: 100,
    総合: 100,
    "消費支出（参考）": 100,
    "CPI総合(参考)": 100,
    民間最終消費支出: 0,
    ...overrides,
  };
}

/**
 * 複数のCpiDataオブジェクトを生成する
 */
export function createCpiDataList(items: Partial<CpiData>[]): CpiData[] {
  return items.map(createCpiData);
}
