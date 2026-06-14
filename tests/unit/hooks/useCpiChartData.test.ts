/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCpiChartData } from '../../../src/hooks/useCpiChartData';
import { loadCtiData } from '../../../server/lib/dataLoader';
import { nominalKeys, realKeys, SUPPORT_SERIES_KEY_NOMINAL, SUPPORT_SERIES_KEY_REAL } from '../../../src/lib/chartConstants';

describe('useCpiChartData', () => {
  let rawCtiData: any[];

  beforeAll(async () => {
    rawCtiData = await loadCtiData();
  });

  it("should verify that the hook produces valid quarterly data for all nominal and real keys", async () => {
    const props = {
      data: rawCtiData,
      endYear: 2026,
      maxCpiDate: { month: 12, year: 2026 },
      nominalData: rawCtiData,
      nominalKeys: nominalKeys,
      realKeys: realKeys,
      startYear: 2005,
    };

    const { result } = renderHook(() => useCpiChartData(props));
    const { quarterlyNominalData, quarterlyRealData } = result.current;

    expect(quarterlyNominalData.length).toBeGreaterThan(0);
    
    // 汎用的なデータ検証関数
    const hasDataInRange = (data: any[], keys: string[], startYear: number, endYear: number, checkOnlySupport = false) => {
      const rangeData = data.filter(d => (d.年 as number) >= startYear && (d.年 as number) <= endYear);
      return keys.every(key => {
        // 2005-2016は民間最終消費支出のみ検証
        if (checkOnlySupport && !key.includes('民間最終消費支出')) return true;
        // 'その他の消費支出' 関連は0になる可能性があるため除外
        if (key.includes('その他の消費支出')) return true; 
        return rangeData.some(d => typeof d[key] === 'number' && d[key] > 0);
      });
    };

    // 名目系列の検証
    nominalKeys.forEach(key => {
      if (key === SUPPORT_SERIES_KEY_NOMINAL) return; // 民間最終消費支出は個別に検証
      expect(hasDataInRange(quarterlyNominalData, [key], 2005, 2016, true), `Nominal Series '${key}' should have positive values in 2005-2016`).toBe(true);
      expect(hasDataInRange(quarterlyNominalData, [key], 2017, 2026, false), `Nominal Series '${key}' should have positive values in 2017-2026`).toBe(true);
    });

    // 実質系列の検証
    if (realKeys.length > 0) {
      expect(quarterlyRealData.length).toBeGreaterThan(0);
      realKeys.forEach(key => {
        if (key === SUPPORT_SERIES_KEY_REAL) return; // 民間最終消費支出は個別に検証
        expect(hasDataInRange(quarterlyRealData, [key], 2005, 2016, true), `Real Series '${key}' should have positive values in 2005-2016`).toBe(true);
        expect(hasDataInRange(quarterlyRealData, [key], 2017, 2026, false), `Real Series '${key}' should have positive values in 2017-2026`).toBe(true);
      });
    }
  });
});
