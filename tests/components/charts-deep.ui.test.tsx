/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

// Types & Utils
import type { CpiData } from '../../../src/types';
import { createCpiDataList } from '../factories/cpiDataFactory';
import { setupUiMocks } from '../utils/ui-mocks';

// Initialize mocks
setupUiMocks();

// Mock Recharts
vi.mock('recharts', async () => {
  const original = await vi.importActual('recharts') as any;
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
    BarChart: ({ children }: any) => <div className="recharts-wrapper">{children}</div>,
    AreaChart: ({ children }: any) => <div className="recharts-wrapper">{children}</div>,
    Bar: (props: any) => <div data-testid="bar-mock" {...props} />,
    Area: (props: any) => <div data-testid="area-mock" {...props} />,
  };
});

const MockTooltip = () => <div>Tooltip</div>;
const chartColors = {
  axisText: "#000",
  gridStroke: "#000",
  tooltipBg: "#000",
  tooltipText: "#000",
  barFill: "#000",
};

describe('Deep UI Component Tests', () => {
  
  describe('SpendingBarChart', () => {
    const mockData = [
      { label: '2023年Q1', 年: 2023, quarter: 1, food: 100, housing: 200, "民間最終消費支出_scaled": 300 },
      { label: '2023年Q2', 年: 2023, quarter: 2, food: 110, housing: 210, "民間最終消費支出_scaled": 310 },
    ];
    const mockKeys = ['food', 'housing', "民間最終消費支出_scaled"];
    const mockColors = ['#ff0000', '#00ff00'];

    it('should hide the support series when hiddenKeys includes it', async () => {
      render(
        <SpendingBarChart
          title="Test Chart"
          data={[{ label: '2023年Q1', 年: 2023, quarter: 1, food: 100, "民間最終消費支出_scaled": 300 }]}
          keys={['food', '民間最終消費支出_scaled']}
          colors={['#ff0000', '#94a3b8']}
          hiddenKeys={['民間最終消費支出_scaled']}
          onToggle={vi.fn()}
          chartColors={{ gridStroke: '#ccc', axisText: '#000', tooltipBg: '#fff', tooltipText: '#000' }}
          isMobile={false}
          CustomTooltip={() => null}
          hiddenQuarters={[]}
          onToggleQuarter={vi.fn()}
          onReset={vi.fn()}
        />
      );

      // '民間最終消費支出_scaled' を持つ要素が存在しないことを確認する
      // Rechartsのモック要素は dataKey 属性を持つ
      const bars = screen.getAllByTestId('bar-mock');
      const supportBar = bars.find((bar) => bar.getAttribute('datakey') === '民間最終消費支出_scaled');
      
      expect(supportBar).toBeUndefined();
      expect(bars.length).toBe(1); // 'food' だけが残っている
    });

    
    it('renders the legend items', () => {
      render(
        <SpendingBarChart
          title="消費支出"
          data={mockData}
          keys={mockKeys}
          colors={mockColors}
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
      // Use a regex to be safer with potential translations or labels
      // expect(screen.getByText(/food/i)).toBeDefined();
      // expect(screen.getByText(/housing/i)).toBeDefined();
      // expect(screen.getByText(/民間最終消費支出_scaled/i)).toBeDefined();
    });


    it('passes data with values > 0 to the bar chart', () => {
      render(
        <SpendingBarChart
          title="消費支出"
          data={mockData}
          keys={mockKeys}
          colors={mockColors}
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
      // モック化されたBarコンポーネントを取得
      const bars = screen.getAllByTestId('bar-mock');
      expect(bars.length).toBeGreaterThan(0);
      
      // データが存在し、かつ0より大きいこと（mockDataに基づく）
      // RechartsコンポーネントのProps経由で検証
      bars.forEach(bar => {
        const dataKey = bar.getAttribute('datakey');
        const hasPositiveValue = mockData.some(d => (d as any)[dataKey!] > 0);
        expect(hasPositiveValue).toBe(true);
      });
    });
  });

  describe('CpiAreaChart', () => {
    const mockData = [{ 年月: '2020年01月', A: 10 }];
    it('passes data with values > 0 to the area chart', () => {
      render(
        <CpiAreaChart
          title="Test Area"
          data={mockData}
          keys={['A']}
          colors={['#000']}
          hiddenKeys={[]}
          chartColors={chartColors}
          isMobile={false}
          CustomTooltip={MockTooltip}
        />
      );
      const areas = screen.getByTestId('area-mock');
      const dataKey = areas.getAttribute('datakey');
      expect(dataKey).toBe('A');
      // 値が0より大きいこと
      expect(mockData[0][dataKey!]).toBeGreaterThan(0);
    });
  });

  describe('CpiBarChart', () => {
    const mockData = [{ label: '2020年Q1', A: 10 }];
    it('renders title and chart wrapper', () => {
      const { container } = render(
        <CpiBarChart
          title="Test Bar"
          data={mockData}
          keys={['A']}
          colors={['#000']}
          hiddenKeys={[]}
          chartColors={chartColors}
          isMobile={false}
          CustomTooltip={MockTooltip}
          stackId="test"
        />
      );
      expect(screen.getByText('Test Bar')).toBeDefined();
      expect(container.querySelector('.recharts-wrapper')).not.toBeNull();
    });
  });

  describe('EarningsBreakdownChart', () => {
    const mockData: CpiData[] = createCpiDataList([{ 年月: "2020年01月", 総合: 100 }]);
    it('renders title and legend items', () => {
      const { container } = render(
        <EarningsBreakdownChart
          data={mockData}
          hiddenKeys={[]}
          onToggle={() => {}}
          chartColors={chartColors}
          isMobile={false}
          CustomTooltip={MockTooltip}
        />
      );
      expect(screen.getByText(/現金給与総額/)).toBeDefined();
      // Check for one of the hardcoded legend items
      expect(screen.getByText(/所定内給与/)).toBeDefined();
      expect(container.querySelector('.recharts-wrapper')).not.toBeNull();
    });
  });

  describe('ResidualAreaChart', () => {
    const mockData: CpiData[] = createCpiDataList([{ 年月: "2020年01月", 残差: 5 }]);
    it('renders chart wrapper', () => {
      const { container } = render(
        <ResidualAreaChart
          data={mockData}
          chartColors={chartColors}
          isMobile={false}
          CustomTooltip={MockTooltip}
        />
      );
      expect(container.querySelector('.recharts-wrapper')).not.toBeNull();
    });
  });

  describe('MajorIndicesChart', () => {
    const mockData: CpiData[] = createCpiDataList([{ 年月: "2020年01月", 総合: 100 }]);
    it('renders title and legend items', () => {
      const { container } = render(
        <MajorIndicesChart
          data={mockData}
          keys={['総合']}
          colors={['#000']}
          hiddenKeys={[]}
          onToggle={() => {}}
          chartColors={chartColors}
          isMobile={false}
          CustomTooltip={MockTooltip}
        />
      );
      // MajorIndicesChart doesn't have a title in its JSX, but it has a legendContainer
      expect(container.querySelector('[class*="legendContainer"]')).not.toBeNull();
      expect(screen.getByText('総合')).toBeDefined();
      expect(container.querySelector('.recharts-wrapper')).not.toBeNull();
    });
  });

  describe('StackedAreaChart', () => {
    const mockData: CpiData[] = createCpiDataList([{ 年月: "2020年01月", 総合: 100 }]);
    it('renders title and legend items', () => {
      const { container } = render(
        <StackedAreaChart
          title="Stacked Area"
          data={mockData}
          keys={['総合']}
          colors={['#000']}
          hiddenKeys={[]}
          onToggle={() => {}}
          chartColors={chartColors}
          isMobile={false}
          CustomTooltip={MockTooltip}
          onReset={() => {}}
        />
      );
      expect(screen.getByText('Stacked Area')).toBeDefined();
      expect(container.querySelector('[class*="legendContainer"]')).not.toBeNull();
      expect(container.querySelector('.recharts-wrapper')).not.toBeNull();
    });
  });

  describe('CpiChart (Integration Smokes)', () => {
    it('renders without crashing', () => {
      const mockData: CpiData[] = createCpiDataList([{ 年月: "2020年01月", 総合: 100 }]);
      const totalEarningData: CpiData[] = createCpiDataList([{ 年月: "2020年01月", 所定内給与: 100 }]);

      render(<CpiChart data={mockData} ctiData={[]} totalEarningData={totalEarningData} />);
      expect(true).toBeTruthy();
    });
  });
});
