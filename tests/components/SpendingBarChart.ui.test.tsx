import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpendingBarChart } from '../../src/app/components/SpendingBarChart';
import React from 'react';

vi.mock('recharts', async () => {
  const original = await vi.importActual('recharts') as any;
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 800, height: 600 }}>{children}</div>
    ),
  };
});

describe('SpendingBarChart', () => {
  const mockData = [
    { label: '2023年Q1', 年: 2023, quarter: 1, food: 100, housing: 200 },
    { label: '2023年Q2', 年: 2023, quarter: 2, food: 110, housing: 210 },
  ];
  const mockKeys = ['food', 'housing'];
  const mockColors = ['#ff0000', '#00ff00'];
  const mockChartColors = { gridStroke: '#ccc', axisText: '#000', tooltipBg: '#fff', tooltipText: '#000' };

  const CustomTooltip = () => null;

  it('renders the chart title', () => {
    render(
      <SpendingBarChart
        title="消費支出"
        data={mockData}
        keys={mockKeys}
        colors={mockColors}
        hiddenKeys={[]}
        onToggle={() => {}}
        chartColors={mockChartColors}
        isMobile={false}
        CustomTooltip={CustomTooltip}
        hiddenQuarters={[]}
        onToggleQuarter={() => {}}
        onReset={() => {}}
      />
    );
    expect(screen.getByText('消費支出')).toBeDefined();
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
        chartColors={mockChartColors}
        isMobile={false}
        CustomTooltip={CustomTooltip}
        hiddenQuarters={[]}
        onToggleQuarter={() => {}}
        onReset={() => {}}
      />
    );
    // getLegendLabel returns key directly if not in overrides
    expect(screen.getByText('food')).toBeDefined();
    expect(screen.getByText('housing')).toBeDefined();
  });

  it('renders data when provided', () => {
    const { container } = render(
      <SpendingBarChart
        title="消費支出"
        data={mockData}
        keys={mockKeys}
        colors={mockColors}
        hiddenKeys={[]}
        onToggle={() => {}}
        chartColors={mockChartColors}
        isMobile={false}
        CustomTooltip={CustomTooltip}
        hiddenQuarters={[]}
        onToggleQuarter={() => {}}
        onReset={() => {}}
      />
    );
    
    // Check if the BarChart exists
    expect(container.querySelector('.recharts-wrapper')).not.toBeNull();
  });
});
