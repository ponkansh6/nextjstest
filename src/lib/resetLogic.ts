export interface ResetConfig {
  hiddenKeys: string[];
  allKeys: string[];
  setHiddenKeys: (value: string[] | ((prev: string[]) => string[])) => void;
}

/**
 * リセットロジックの共通実装
 * 非表示キーがある場合は全表示（空配列）に、全表示の場合は全非表示（全キー）にトグル
 */
export const createResetHandler = (config: ResetConfig): (() => void) => {
  return () => {
    const { allKeys, setHiddenKeys } = config;
    setHiddenKeys((prev: string[]) => (prev.length > 0 ? [] : allKeys));
  };
};

/**
 * 名目・実質両方を同時にリセットするハンドラ
 */
export const createDualResetHandler = (
  nominalConfig: ResetConfig,
  realConfig: ResetConfig,
): (() => void) => {
  return () => {
    nominalConfig.setHiddenKeys((prev: string[]) => (prev.length > 0 ? [] : nominalConfig.allKeys));
    realConfig.setHiddenKeys((prev: string[]) => (prev.length > 0 ? [] : realConfig.allKeys));
  };
};
