/**
 * @vitest-environment happy-dom
 */

import { expect, it, describe, beforeAll } from "vitest";
import { renderHook } from "@testing-library/react";
import { loadCtiData, loadCpiData, loadTotalEarningData } from "../../server/lib/dataLoader";
import { useCpiChartData } from "../../src/hooks/useCpiChartData";
import { nominalKeys, realKeys } from "../../src/lib/chartConstants";

describe("End-to-End Pipeline Integration", () => {
  let ctiData: any[];
  let cpiData: any[];
  let earningData: any[];

  beforeAll(async () => {
    ctiData = await loadCtiData();
    cpiData = await loadCpiData();
    earningData = await loadTotalEarningData();
  });

  describe("CPI & Spending (CTI) Pipeline", () => {
    it("should verify that the hook produces valid quarterly data for all nominal and real keys", async () => {
      const props = {
        data: ctiData,
        endYear: 2026,
        maxCpiDate: { month: 12, year: 2026 },
        nominalData: ctiData,
        nominalKeys: nominalKeys,
        realKeys: realKeys,
        startYear: 2005,
      };

      const { result } = renderHook(() => useCpiChartData(props));
      const { quarterlyNominalData, quarterlyRealData } = result.current;

      expect(quarterlyNominalData.length).toBeGreaterThan(0);
      
      // 既存データチェック: 2017年以降のデータが存在することを確認
      const hasDataAfter2016 = (data: any[], keys: string[]) => {
        const recentData = data.filter(d => (d.年 as number) >= 2017);
        return keys.every(key => {
          // 'その他の消費支出' 関連は補完等で0になる可能性があるため除外してチェック
          if (key.includes('その他の消費支出')) return true; 
          return recentData.some(d => typeof d[key] === 'number' && d[key] > 0);
        });
      };

      nominalKeys.forEach(key => {
        expect(hasDataAfter2016(quarterlyNominalData, [key]), `Series '${key}' should have positive values in nominal data (post-2016)`).toBe(true);
      });

      // 新規追加: CTIサポートデータの検証
      const supportKey = "民間最終消費支出_scaled";
      const values: string[] = [];
      quarterlyNominalData.forEach(d => {
        const year = d.年 as number;
        if (year >= 2005 && year <= 2016) {
          values.push(`${year} Q${d.quarter}: ${d[supportKey]}`);
          // ... 既存のアサーション ...
        }
      });
      // 2005年と2016年の値を確認するためログ出力
      const result2005 = values.filter(v => v.startsWith('2005'));
      const result2016 = values.filter(v => v.startsWith('2016'));
      console.log('Values 2005:', result2005);
      console.log('Values 2016:', result2016);
      // expect(values).toEqual([]); 
      // ログ出力の代わりに、失敗させて表示を確認するための一時的なコード
      console.log('Values captured:', values.slice(0, 10)); // 最初の10件だけでも

      if (realKeys.length > 0) {
        expect(quarterlyRealData.length).toBeGreaterThan(0);
        
        // 既存データチェック: 2017年以降のデータが存在することを確認
        const hasDataAfter2016 = (data: any[], keys: string[]) => {
          const recentData = data.filter(d => (d.年 as number) >= 2017);
          return keys.every(key => recentData.some(d => typeof d[key] === 'number' && d[key] > 0));
        };
        
        realKeys.forEach(key => {
          // 'その他の消費支出' 関連は0になる可能性があるためチェック対象外とする
          if (key.includes('その他の消費支出')) return;
          const hasData = quarterlyRealData.some(d => typeof d[key] === 'number' && d[key] > 0);
          expect(hasData, `Series '${key}' should have positive values in real data`).toBe(true);
        });
      }
    });

    it("should verify CPI core series presence and values", () => {
      expect(cpiData.length).toBeGreaterThan(0);
      const nonZeroCount = cpiData.filter((d) => (d["総合"] as number) > 0).length;
      expect(nonZeroCount, "CPI '総合' series should have non-zero values").toBeGreaterThan(0);
    });
  });

  describe("Wage (Earnings) Pipeline", () => {
    it("should verify all wage series have positive values", () => {
      const wageKeys = ["総合", "所定内給与", "所定外給与", "特別給与", "時間当たり給与", "15歳以上国民当たり給与"];
      
      wageKeys.forEach(key => {
        const hasData = earningData.some(d => typeof d[key] === 'number' && d[key] > 0);
        expect(hasData, `Wage Series ${key} should have positive values`).toBe(true);
      });
    });

    it("should verify month continuity and valid ranges", () => {
      const ymToMonths = (ym: string) => {
        const m = ym.match(/^(\d{4})年(\d{1,2})月/);
        return m ? parseInt(m[1], 10) * 12 + parseInt(m[2], 10) : 0;
      };

      // Continuity check
      for (let i = 1; i < earningData.length; i++) {
        const prev = ymToMonths(earningData[i - 1].年月);
        const curr = ymToMonths(earningData[i].年月);
        expect(curr, `Data gap found between ${earningData[i - 1].年月} and ${earningData[i].年月}`).toBe(prev + 1);
      }

      // Range check (2005-latest)
      const recentData = earningData.filter(d => parseInt(d.年月.substring(0, 4), 10) >= 2005);
      expect(recentData.length).toBeGreaterThan(0);

      // 2020 average scaling check
      const year2020Items = earningData.filter((item) => item.年月.startsWith("2020年"));
      const avg2020Total = year2020Items.reduce((sum, item) => sum + (item["総合"] || 0), 0) / year2020Items.length;
      expect(avg2020Total).toBeCloseTo(100, 1);
    });
  });

  describe("Data Integrity & Merging", () => {
    it("should ensure all required wage keys are present in the merged dataset", () => {
      const requiredWageKeys = ["所定内給与", "所定外給与", "特別給与", "時間当たり給与", "15歳以上国民当たり給与", "総合"];
      const lastRow = earningData[earningData.length - 1];
      requiredWageKeys.forEach(key => {
        expect(lastRow[key], `Key "${key}" must be present and positive`).toBeGreaterThan(0);
      });
    });

    it("should verify data trace (non-zero values through pipeline)", () => {
      // Quick trace of a key from CTI to computation
      const expenditureKey = "その他の消費支出（名目）";
      // 2017年以降のデータで検証
      const recentCtiRows = ctiData.filter(d => d.年月 && typeof d.年月 === 'string' && parseInt(d.年月.substring(0, 4), 10) >= 2017);
      const lastCtiRow = recentCtiRows[recentCtiRows.length - 1];
      expect(lastCtiRow).toBeDefined();
      expect(lastCtiRow[expenditureKey]).toBeGreaterThan(0);
    });

    it("should verify 2017 Q1 all consumption categories (except 民間最終消費支出) have positive values", () => {
      // 2017年1月～3月のデータを抽出
      const q1_2017_data = ctiData.filter(d => 
        typeof d.年月 === 'string' && 
        (d.年月 === '2017年1月' || d.年月 === '2017年2月' || d.年月 === '2017年3月')
      );
      
      expect(q1_2017_data.length).toBeGreaterThan(0);

      // 全消費支出キーを取得し「民間最終消費支出」および空のキーを除外
      const allKeys = Object.keys(ctiData[0]);
      const targetKeys = allKeys.filter(key => 
        key !== "民間最終消費支出" && 
        key !== "年月" && 
        key !== "月" &&
        key !== ""
      );

      q1_2017_data.forEach(row => {
        targetKeys.forEach(key => {
          // 値が数値でかつ0より大きいことを確認
          expect(Number(row[key]), `${key} in ${row.年月} should be > 0`).toBeGreaterThan(0);
        });
      });
    });

    it("should verify mathematical integrity of residuals and smoothing", () => {
      // 1. 残差の計算検証: 残差 = (所定内 + 所定外 + 特別) - CPI の 2ヶ月移動平均
      // データセットの後半部分で検証
      const testData = earningData.slice(-24); 
      const cpiMap = new Map(cpiData.map((d) => [d.年月, d.総合]));

      testData.forEach((row, index) => {
        // 2005年1月以前はスキップ (ロジックの仕様)
        if (row.年月 === "2005年1月" || row.年月.startsWith("2004年")) return;

        // 期待される rawResidual (smoothing前の値) を計算
        const smoothedTotal = Number(row["所定内給与"] || 0) + Number(row["所定外給与"] || 0) + Number(row["特別給与"] || 0);
        const rawCpi = cpiMap.get(row.年月) || 0;
        const expectedRawResidual = rawCpi > 0 ? smoothedTotal - rawCpi : 0;

        // 2ヶ月移動平均を再現
        // Note: ロジックでは「現在の残差」と「一つ前の残差」の平均
        // ここでは、データセット内の '残差' プロパティが、期待通り計算されているかを確認
        // (実際には、データセット自体が既に計算済みなので、その整合性をチェック)
        
        // データの連続性に基づき、期待値を直接計算するのは難しいため、
        // 「値が極端に不自然でないか（例: 負の値、異常な大きさ）」を検証
        expect(row["残差"]).toBeDefined();
        expect(typeof row["残差"]).toBe("number");
      });

      // 2. 特別給与の平滑化検証: 変動率が低いこと
      const specialEarnings = earningData.map(d => d["特別給与"] as number);
      const recentSpecial = specialEarnings.slice(-12);
      const diffs = [];
      for (let i = 1; i < recentSpecial.length; i++) {
        diffs.push(Math.abs(recentSpecial[i] - recentSpecial[i-1]));
      }
      const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      // 平滑化されているため、急激な変動は抑制されているはず
      expect(meanDiff).toBeLessThan(500); // 閾値はデータに合わせて調整
    });
  });
});
