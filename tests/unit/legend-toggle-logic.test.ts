import { describe, it, expect } from 'vitest';

describe('handleNominalLegendClick logic', () => {
  const keyPairs = [{ nominal: "食料（名目）", real: "食料（実質）" }];
  const supportKey = "民間最終消費支出";
  
  const handleToggle = (dataKey: string, prevHiddenKeys: string[]) => {
    if (dataKey === supportKey) {
      return prevHiddenKeys.includes(dataKey) 
        ? prevHiddenKeys.filter(k => k !== dataKey) 
        : [...prevHiddenKeys, dataKey];
    }

    const pair = keyPairs.find((p) => p.nominal === dataKey || p.real === dataKey);
    if (!pair) return prevHiddenKeys;

    const keysToToggle = [pair.nominal, pair.real];
    const next = new Set(prevHiddenKeys);
    keysToToggle.forEach((k) => {
      if (next.has(k)) { next.delete(k); } else { next.add(k); }
    });
    return Array.from(next);
  };

  it("should toggle support key independently", () => {
    expect(handleToggle(supportKey, [])).toEqual([supportKey]);
    expect(handleToggle(supportKey, [supportKey])).toEqual([]);
  });

  it("should toggle nominal/real key pairs together", () => {
    expect(handleToggle("食料（名目）", [])).toEqual(["食料（名目）", "食料（実質）"]);
  });
});
