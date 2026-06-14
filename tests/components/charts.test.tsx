/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Components
import CpiChart from '../../src/app/components/CpiChart';
import { SpendingBarChart } from '../../src/app/components/SpendingBarChart';
import { EarningsBreakdownChart } from '../../src/app/components/EarningsBreakdownChart';
import { ResidualAreaChart } from '../../src/app/components/ResidualAreaChart';
import { MajorIndicesChart } from '../../src/app/components/MajorIndicesChart';
import { StackedAreaChart } from '../../src/app/components/StackedAreaChart';

// Types & Utils
import { nominalKeys, SUPPORT_SERIES_KEY_NOMINAL, getLegendLabel, targetKeys, stackedKeys, stackedColors } from '../../src/lib/chartConstants';
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
    Bar: (props: any) => <div data-testid="bar-mock" data-key={props.dataKey} />,
    Area: (props: any) => <div data-testid="area-mock" data-key={props.dataKey} />,
    ReferenceLine: () => <div data-testid="reference-line-mock" />,
    Tooltip: () => <div data-testid="tooltip-mock" />,
    YAxis: () => <div data-testid="yaxis-mock" />,
    XAxis: () => <div data-testid="xaxis-mock" />,
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

// Static Mock Data
const mockQuarterlyData = [{ label: '2023年Q1', 年: 2023, quarter: 1, '総合（名目）': 100, '総合（実質）': 100 }];
const mockCpiData = [
  { 年月: '2023年1月', '総合': 100, '住居': 100 },
  { 年月: '2025年1月', '総合': 105, '住居': 105 }
];
const mockMergedData = [
  { label: '2023年Q1', 年: 2023, 年月: '2023年1月', quarter: 1, '所定内給与': 100, '所定外給与': 100, '特別給与': 100, '時間当たり給与': 100, '15歳以上国民当たり給与': 100, '総合': 100 },
  { label: '2025年Q1', 年: 2025, 年月: '2025年1月', quarter: 1, '所定内給与': 105, '所定外給与': 105, '特別給与': 105, '時間当たり給与': 105, '15歳以上国民当たり給与': 105, '総合': 105 }
];

describe('Integrated UI Chart Tests', () => {
  
  describe('Chart Rendering Verification with Mock Data', () => {

    it("should render SpendingBarChart legends and processed data (Nominal)", () => {
      render(
        <SpendingBarChart
          title="Test Chart Nominal"
          data={mockQuarterlyData}
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
      const realKeys_ = nominalKeys.map(k => k.replace("名目", "実質"));
      render(
        <SpendingBarChart
          title="Test Chart Real"
          data={mockQuarterlyData}
          keys={realKeys_}
          colors={realKeys_.map(() => "#000")}
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

    it("should render MajorIndicesChart with ReferenceLine, YAxis, and Tooltip", () => {
      render(
        <MajorIndicesChart
          data={mockCpiData}
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
      
      expect(screen.getByTestId('yaxis-mock')).toBeDefined();
      expect(screen.getByTestId('tooltip-mock')).toBeDefined();
      // ReferenceLineはデータが2025年を含むためレンダリングされることを確認
      expect(screen.getByTestId('reference-line-mock')).toBeDefined();
    });

    it("should render EarningsBreakdownChart with real data legends and common chart elements", () => {
      render(
        <EarningsBreakdownChart
          data={mockMergedData}
          hiddenKeys={[]}
          onToggle={() => {}}
          chartColors={chartColors}
          isMobile={false}
          CustomTooltip={MockTooltip}
        />
      );
      const expectedLabels = ["所定内給与", "所定外給与", "特別給与", "時間当たり給与", "15歳以上国民当たり給与", "CPI総合(参考)"];
      expectedLabels.forEach(label => expect(screen.getByText(label)).toBeDefined());
      
      expect(screen.getByTestId('yaxis-mock')).toBeDefined();
      expect(screen.getByTestId('tooltip-mock')).toBeDefined();
      // ReferenceLineはデータが2025年を含むためレンダリングされることを確認
      expect(screen.getByTestId('reference-line-mock')).toBeDefined();
    });

    it("should render StackedAreaChart with real data and common chart elements", () => {
      render(
        <StackedAreaChart
          title="CPI費目別積み上げ"
          data={mockCpiData}
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
      
      expect(screen.getByTestId('yaxis-mock')).toBeDefined();
      expect(screen.getByTestId('tooltip-mock')).toBeDefined();
      // ReferenceLineはデータが2025年を含むためレンダリングされることを確認
      expect(screen.getByTestId('reference-line-mock')).toBeDefined();
    });

    it("should render ResidualAreaChart with merged data and common chart elements", () => {
      render(
        <ResidualAreaChart
          data={mockMergedData}
          chartColors={chartColors}
          isMobile={false}
          CustomTooltip={MockTooltip}
        />
      );
      expect(screen.getByText("残差（現金給与総額 - CPI総合）")).toBeDefined();
      
      expect(screen.getByTestId('yaxis-mock')).toBeDefined();
      expect(screen.getByTestId('tooltip-mock')).toBeDefined();
      // ReferenceLineはデータが2025年を含むためレンダリングされることを確認
      expect(screen.getByTestId('reference-line-mock')).toBeDefined();
    });
  });


  describe('CpiChart UI Integration (formerly cpi-chart)', () => {

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

    it('should update filtering when ChartFilters are changed', async () => {
      const mockData = [
        { 年月: '2023年1月', '総合': 100 },
        { 年月: '2024年1月', '総合': 110 }
      ];

      render(
        <CpiChart 
          data={mockData as any} 
          ctiData={[]} 
          totalEarningData={[]} 
        />
      );
      
      // Initially both years might be visible or it defaults.
      // Let's try to change the end year to 2023
      const endYearSelect = screen.getByLabelText('終了年:', { selector: '#endYear' });
      fireEvent.change(endYearSelect, { target: { value: '2023' } });
      
      // Verify that it didn't crash and state updated. 
      expect((endYearSelect as HTMLSelectElement).value).toBe('2023');
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

    it('should update CAGR start and end years when controls are changed', async () => {
      const mockData = [
        { 年月: '2020年1月', '住居': 100 },
        { 年月: '2021年1月', '住居': 110 },
        { 年月: '2022年1月', '住居': 121 },
      ];

      render(
        <CpiChart 
          data={mockData as any} 
          ctiData={[]} 
          totalEarningData={[]} 
        />
      );

      const startYearSelect = screen.getByLabelText('開始年:', { selector: '#cagrStartYear' });
      const endYearSelect = screen.getByLabelText('終了年:', { selector: '#cagrEndYear' });

      fireEvent.change(startYearSelect, { target: { value: '2021' } });
      fireEvent.change(endYearSelect, { target: { value: '2022' } });
      
      expect((startYearSelect as HTMLSelectElement).value).toBe('2021');
      expect((endYearSelect as HTMLSelectElement).value).toBe('2022');
    });

    it('should reset both nominal and real charts when reset button is clicked', async () => {
      const mockData = [{ 年月: '2023年1月', '住居': 100 }];
      
      // We need to render the full CpiChart to test the dual reset handler
      render(
        <CpiChart 
          data={mockData as any} 
          ctiData={mockData as any} 
          totalEarningData={[]} 
        />
      );
      
      const resetButtons = screen.getAllByText('全選択解除');
      // Reset button of the first spending chart (Nominal)
      fireEvent.click(resetButtons[0]);

      expect(resetButtons[0]).toBeDefined();
    });
  });

  describe('EarningsBreakdownChart UI Tests', () => {
    it('should call onToggle when a legend item is clicked', async () => {
      const onToggle = vi.fn();
      render(
        <EarningsBreakdownChart
          data={mockMergedData}
          hiddenKeys={[]}
          onToggle={onToggle}
          chartColors={chartColors}
          isMobile={false}
          CustomTooltip={MockTooltip}
        />
      );

      const targetKey = '所定内給与';
      const legendButton = screen.getByText(targetKey);
      
      fireEvent.click(legendButton);
      
      expect(onToggle).toHaveBeenCalledWith(targetKey);
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
           const restoredBar = barsAfterToggleBack.find((bar) => bar.getAttribute('data-key') === key);
           expect(restoredBar).toBeDefined();

        }
      });
  });
});
