import type { CpiData } from "../../src/types";

/**
 * テスト用のCTIデータを生成するファクトリ
 */
export function createCtiData(overrides: Partial<CpiData> = {}): CpiData {
  return {
    年月: "2020年01月",
    総合: 100,
    民間最終消費支出: 0,
    ...overrides,
  } as CpiData;
}
