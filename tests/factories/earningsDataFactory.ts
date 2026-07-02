import type { CpiData } from "../../src/types";

/**
 * テスト用のEarningsデータを生成するファクトリ
 */
export function createEarningsData(overrides: Partial<CpiData> = {}): CpiData {
  return {
    年月: "2020年01月",
    総合: 100,
    所定内給与: 100,
    所定外給与: 10,
    特別給与: 20,
    ...overrides,
  } as CpiData;
}
