import type { PopulationData } from "../../src/types";

/**
 * テスト用のPopulationデータを生成するファクトリ
 */
export function createPopulationData(overrides: Partial<PopulationData> = {}): PopulationData {
  return {
    total: 100_000_000,
    index: 100,
    ma: 100,
    ...overrides,
  };
}
