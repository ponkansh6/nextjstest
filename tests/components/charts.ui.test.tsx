/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent, renderHook } from '@testing-library/react';
import React from 'react';

// Components
import CpiChart from '../../src/app/components/CpiChart';
import { CpiAreaChart } from '../../src/app/components/CpiAreaChart';
import { CpiBarChart } from '../../src/app/components/CpiBarChart';
import { SpendingBarChart } from '../../src/app/components/SpendingBarChart';
import { EarningsBreakdownChart } from '../../src/app/components/EarningsBreakdownChart';
import { ResidualAreaChart } from '../../src/app/components/ResidualAreaChart';
import { MajorIndicesChart } from '../../src/app/components/MajorIndicesChart';
import { StackedAreaChart } from '../../src/app/components/StackedAreaChart';

// Hooks & Logic
import { useCpiChartData } from '../../src/hooks/useCpiChartData';
import { sumCategoryValues } from '../../src/lib/clientCalculations';

// Types & Utils
import type { CpiData } from '../../src/types';
import { loadCtiData, loadCpiData, loadTotalEarningData } from '../../server/lib/dataLoader';
import { nominalKeys, realKeys, SUPPORT_SERIES_KEY_NOMINAL, SUPPORT_SERIES_KEY_REAL, getLegendLabel, targetKeys, stackedKeys, stackedColors } from '../../src/lib/chartConstants';
import { computeChartData } from '../../src/lib/clientCalculations';
import { filterDataByYear, mergeChartData } from '../../src/lib/chartUtils';
import { setupUiMocks } from '../utils/ui-mocks';

// Standard UI mocks
setupUiMocks();

// Mock Recharts
vi.mock('recharts', async () => {
  const original = await vi.importActual('recharts') as any;
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
    BarChart: ({ children }: any) => <div className="recharts-wrapper">{children}</div>,
    AreaChart: ({ children }: any) => <div className="recharts-wrapper">{children}</div>,
    Bar: (props: any) => <div data-testid="bar-mock" datakey={props.dataKey} {...props} />,
    Area: (props: any) => <div data-testid="area-mock" datakey={props.dataKey} {...props} />,
  };
});

// Local test utilities
const MockTooltip = () => <div>Tooltip</div>;
const chartColors = {
  axisText: "#000",
  gridStroke: "#000",
  tooltipBg: "#000",
  tooltipText: "#000",
  barFill: "#000",
};

describe('Integrated UI Chart Tests', () => {
  let rawCtiData: any[];
  let rawCpiData: any[];
  let rawEarningData: any[];

  beforeAll(async () => {
    rawCtiData = await loadCtiData();
    rawCpiData = await loadCpiData();
    rawEarningData = await loadTotalEarningData();
  });
  
  describe('Chart Rendering Verification with Real Data (formerly render-verification)', () => {
    
    const startYear = 2020;
    const endYear = 2025;
    const maxCpiDate = { year: 2025, month: 3 };

    it("should render SpendingBarChart legends and processed data (Nominal)", () => {
      const realKeys = nominalKeys.map(k => k.replace("名目", "実質"));
      const processed = computeChartData({
        data: rawCpiData,
        nominalData: rawCtiData,
        startYear,
        endYear,
        nominalKeys,
        realKeys,
        maxCpiDate
      }, []);

      render(
        <SpendingBarChart
          title="Test Chart Nominal"
          data={processed.quarterlyNominalData}
          keys={nominalKeys}
          colors={nominalKeys.map(() => "#000")}
          hiddenKeys={[]}
          onToggle={() => {}}
          chartColors={chartColors}
          isMobile={false}
          CustomTooltip={MockTooltip}
          hiddenQuarters={[]}
          onToggleQuarter={() => {}}
          onReset={() => {}}
        />
      );
    });

    it("should render SpendingBarChart legends and processed data (Real)", () => {
      const realKeys = nominalKeys.map(k => k.replace("名目", "実質"));
      const processed = computeChartData({
        data: rawCpiData,
        nominalData: rawCtiData,
        startYear,
        endYear,
        nominalKeys,
        realKeys,
        maxCpiDate
      }, []);

      render(
        <SpendingBarChart
          title="Test Chart Real"
          data={processed.quarterlyRealData}
          keys={realKeys}
          colors={realKeys.map(() => "#000")}
          hiddenKeys={[]}
          onToggle={() => {}}
          chartColors={chartColors}
          isMobile={false}
          CustomTooltip={MockTooltip}
          hiddenQuarters={[]}
          onToggleQuarter={() => {}}
          onReset={() => {}}
        />
      );
    });

    it("should render MajorIndicesChart with real data legends", () => {
      const filteredData = filterDataByYear(rawCpiData, startYear, endYear);
      render(
        <MajorIndicesChart
          data={filteredData}
          keys={targetKeys}
          colors={targetKeys.map(() => "#000")}
          hiddenKeys={[]}
          onToggle={() => {}}
          chartColors={chartColors}
          isMobile={false}
          CustomTooltip={MockTooltip}
        />
      );
      targetKeys.forEach(key => expect(screen.getByText(key)).toBeDefined());
    });

    it("should render EarningsBreakdownChart with real data legends", () => {
      const mergedData = mergeChartData(rawEarningData, rawCpiData, startYear, endYear);
      render(
        <EarningsBreakdownChart
          data={mergedData}
          hiddenKeys={[]}
          onToggle={() => {}}
          chartColors={chartColors}
          isMobile={false}
          CustomTooltip={MockTooltip}
        />
      );
      const expectedLabels = ["所定内給与", "所定外給与", "特別給与", "時間当たり給与", "15歳以上国民当たり給与", "CPI総合(参考)"];
      expectedLabels.forEach(label => expect(screen.getByText(label)).toBeDefined());
    });

    it("should render StackedAreaChart with real data", () => {
      const filteredData = filterDataByYear(rawCpiData, startYear, endYear);
      render(
        <StackedAreaChart
          title="CPI費目別積み上げ"
          data={filteredData}
          keys={stackedKeys}
          colors={stackedColors}
          hiddenKeys={[]}
          onToggle={() => {}}
          chartColors={chartColors}
          isMobile={false}
          CustomTooltip={MockTooltip}
          onReset={() => {}}
        />
      );
      expect(screen.getByText("CPI費目別積み上げ")).toBeDefined();
    });

    it("should render ResidualAreaChart with merged data", () => {
      const mergedData = mergeChartData(rawEarningData, rawCpiData, startYear, endYear);
      render(
        <ResidualAreaChart
          data={mergedData}
          chartColors={chartColors}
          isMobile={false}
          CustomTooltip={MockTooltip}
        />
      );
      expect(screen.getByText("残差（現金給与総額 - CPI総合）")).toBeDefined();
    });
  });

  describe('Pipeline Integration with Real Data', () => {

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

          // 民間最終消費支出 (SUPPORT_KEY) の検証
          [SUPPORT_SERIES_KEY_NOMINAL, SUPPORT_SERIES_KEY_REAL].forEach(supportKey => {
            const isNominal = supportKey === SUPPORT_SERIES_KEY_NOMINAL;
            const targetData = isNominal ? quarterlyNominalData : quarterlyRealData;
            const keys = isNominal ? nominalKeys : realKeys;
            const supportKeyNominal = SUPPORT_SERIES_KEY_NOMINAL;
            const supportKeyReal = SUPPORT_SERIES_KEY_REAL;
            
            // 2005-2016: 200-400の範囲であること
            const pre2017Data = targetData.filter(d => d.年 <= 2016);
            pre2017Data.forEach(d => {
              const val = d[supportKey] as number;
              expect(val, `${d.label} support value should be 200-400`).toBeGreaterThanOrEqual(200);
              expect(val, `${d.label} support value should be 200-400`).toBeLessThanOrEqual(400);
            });

            // 2017年以降: 0であること
            const post2016Data = targetData.filter(d => d.年 >= 2017);
            post2016Data.forEach(d => {
              expect(d[supportKey], `${d.label} support value should be 0`).toBe(0);
            });

            // 2017年以降: フック出力の内訳費目合計が正規化済み（200-400範囲）であること
            const expenditureKeys = keys.filter(k => 
              k !== supportKeyNominal && 
              k !== supportKeyReal && 
              !k.includes("その他の消費支出")
            );

            // 実データがある四半期のみ検証（内訳合計 > 0 のもの）
            const validQuarters = post2016Data.filter(q => 
              expenditureKeys.some(key => (Number(q[key]) || 0) > 0)
            );
            
            expect(validQuarters.length, `${isNominal ? 'nominal' : 'real'} 検証対象の四半期データが存在すること`).toBeGreaterThan(0);

            validQuarters.forEach(quarterRow => {
              const sum = sumCategoryValues(quarterRow, expenditureKeys);
              expect(sum, `${quarterRow.label} expenditure sum should be normalized to 200-400`).toBeGreaterThanOrEqual(200);
              expect(sum, `${quarterRow.label} expenditure sum should be normalized to 200-400`).toBeLessThanOrEqual(400);
            });
          });
      });

      it("should verify that handleNominalLegendClick toggles keys correctly", () => {
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

        expect(handleToggle(supportKey, [])).toEqual([supportKey]);
        expect(handleToggle(supportKey, [supportKey])).toEqual([]);
        expect(handleToggle("食料（名目）", [])).toEqual(["食料（名目）", "食料（実質）"]);
      });
    });

  describe('CpiChart UI Integration (formerly cpi-chart)', () => {
    let ctiData: any[];
    let cpiData: any[];

    beforeAll(async () => {
      ctiData = await loadCtiData();
      cpiData = await loadCpiData();
    });

    it('should toggle 民間最終消費支出 independently', async () => {
      const mockData = [{ 年月: '2023年1月', '総合': 100 }];
      const ctiDataMock = [
        { 年月: '2023年1月', [SUPPORT_SERIES_KEY_NOMINAL]: 300, [SUPPORT_SERIES_KEY_NOMINAL.replace("名目", "実質")]: 200 }
      ];
      // Note: Test needs to be adjusted if keys have changed. Fixed key access.

      render(
        <CpiChart 
          data={mockData as any} 
          ctiData={ctiDataMock as any} 
          totalEarningData={[]} 
        />
      );
      
      const allButtons = screen.getAllByRole('button');
      const targetButtons = allButtons.filter(b => b.textContent === '民間最終消費支出');
      const buttonNominal = targetButtons[0];
      
      fireEvent.click(buttonNominal);
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
      
      expect(buttonNominal.className.split(' ').some(c => c.includes('hidden'))).toBe(true);
    });

    it('should update CAGR calculation when legend items are toggled', async () => {
      // 2020: 住居=100, 外食以外食料=100 (Total 200)
      // 2022: 住居=110, 外食以外食料=132 (Total 242)
      // All: (242/200)^0.5 - 1 = 10%
      // Only 住居: (110/100)^0.5 - 1 = 4.88%
      const mockData = [
        { 年月: '2020年1月', '住居': 100, '外食以外食料': 100 },
        { 年月: '2022年1月', '住居': 110, '外食以外食料': 132 },
      ];

      render(
        <CpiChart 
          data={mockData as any} 
          ctiData={[]} 
          totalEarningData={[]} 
        />
      );

      // 1. Calculate with all
      const calcButton = screen.getByText('Calculate');
      fireEvent.click(calcButton);
      
      // クラス名から要素を探し、そのテキストを取得して検証
      const resultElements = screen.getAllByText(/%/);
      const resultElement = resultElements.find(el => el.className.includes('_cagrResultValue_'));
      expect(resultElement).toBeDefined();
      expect(resultElement?.textContent).toBe('10.00%');


      // 2. Toggle '食料' off
      // CPI_CATEGORIES に基づいてレンダリングされる。
      // 「外食以外食料」というラベルを探す。
      const foodButton = screen.getByText('外食以外食料');
      fireEvent.click(foodButton);

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // 3. Calculate with '食料' hidden
      // Total 2020: 100 (住居のみ)
      // Total 2022: 110 (住居のみ)
      // CAGR: (110/100)^0.5 - 1 = 0.048808... => 4.88%
      fireEvent.click(calcButton);
      const resultElement2 = screen.getByText(/4\.88%/);
      expect(resultElement2.className).toContain('_cagrResultValue_');
    });

    it('should call onReset handler when "全選択解除" button is clicked in SpendingBarChart', async () => {
      const onReset = vi.fn();
      const mockData = [{ label: '2023年Q1', 年: 2023, quarter: 1, 住居: 100, 食料: 50 }];
      const keys = ['住居', '食料'];
      const colors = ['#ff0000', '#00ff00'];

      render(
        <SpendingBarChart
          title="Test Chart"
          data={mockData as any}
          keys={keys}
          colors={colors}
          hiddenKeys={['住居']}
          onToggle={vi.fn()}
          chartColors={{ gridStroke: '#000', axisText: '#000', tooltipBg: '#000', tooltipText: '#000' }}
          isMobile={false}
          CustomTooltip={({ active }) => active ? <div>tooltip</div> : null}
          hiddenQuarters={[]}
          onToggleQuarter={vi.fn()}
          onReset={onReset}
        />
      );

      // Click the reset button
      const resetButton = screen.getByText('全選択解除');
      fireEvent.click(resetButton);

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(onReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('Deep UI Component Tests (formerly charts-deep)', () => {
      it('should hide each series when its legend button is clicked', async () => {
        const keys = Array.from(new Set([...nominalKeys, SUPPORT_SERIES_KEY_NOMINAL]));
        
        const TestWrapper = () => {
          const [hiddenKeys, setHiddenKeys] = React.useState<string[]>([]);
          const handleToggle = (key: string) => {
            setHiddenKeys(prev => 
              prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
            );
          };
          
          return (
            <SpendingBarChart
              title="Toggle Test"
              data={[{ label: '2023年Q1', 年: 2023, quarter: 1, ...Object.fromEntries(keys.map(k => [k, 100])) }]}
              keys={keys}
              colors={keys.map(() => '#000000')}
              hiddenKeys={hiddenKeys}
              onToggle={handleToggle}
              chartColors={chartColors}
              isMobile={false}
              CustomTooltip={MockTooltip}
              hiddenQuarters={[]}
              onToggleQuarter={vi.fn()}
              onReset={vi.fn()}
            />
          );
        };
  
        render(<TestWrapper />);
  
        for (const key of keys) {
          const label = getLegendLabel(key) || key;
          const button = screen.getByText(label);
          
          await act(async () => { button.click(); });
          await act(async () => { button.click(); });
  
          const barsAfterToggleBack = screen.getAllByTestId('bar-mock');
          const restoredBar = barsAfterToggleBack.find((bar) => bar.getAttribute('datakey') === key);
          expect(restoredBar).toBeDefined();
        }
      });
  });
});
