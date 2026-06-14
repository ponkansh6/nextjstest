/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SpendingBarChart } from '../../src/app/components/SpendingBarChart';

// Mock Recharts
vi.mock('recharts', async () => {
  const original = await vi.importActual('recharts') as any;
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
    BarChart: ({ children }: any) => <div className="recharts-wrapper">{children}</div>,
    Bar: (props: any) => <div data-testid="bar-mock" data-key={props.dataKey} />,
    ReferenceLine: () => <div data-testid="reference-line-mock" />,
    Tooltip: () => <div data-testid="tooltip-mock" />,
    YAxis: () => <div data-testid="yaxis-mock" />,
    XAxis: () => <div data-testid="xaxis-mock" />,
    CartesianGrid: () => <div data-testid="grid-mock" />,
  };
});

describe('SpendingBarChart', () => {
  const mockProps = {
    title: 'Test Bar Chart',
    data: [{ label: '2023年Q1', 年: 2023, quarter: 1, 'キー1': 100 }],
    keys: ['キー1'],
    colors: ['#000'],
    hiddenKeys: [],
    onToggle: vi.fn(),
    chartColors: { gridStroke: '#000', axisText: '#000', tooltipBg: '#000', tooltipText: '#000' },
    isMobile: false,
    CustomTooltip: () => <div>Tooltip</div>,
    hiddenQuarters: [],
    onToggleQuarter: vi.fn(),
    onReset: vi.fn(),
  };

  it('renders correctly', () => {
    render(<SpendingBarChart {...mockProps} />);
    expect(screen.getByText('Test Bar Chart')).toBeDefined();
    expect(screen.getByText('Q1')).toBeDefined();
    expect(screen.getByText('Q2')).toBeDefined();
    expect(screen.getByText('Q3')).toBeDefined();
    expect(screen.getByText('Q4')).toBeDefined();
  });

  it('calls onToggleQuarter when a quarter legend item is clicked', () => {
    render(<SpendingBarChart {...mockProps} />);
    const q1Button = screen.getByText('Q1');
    fireEvent.click(q1Button);
    expect(mockProps.onToggleQuarter).toHaveBeenCalledWith(1);
  });
});
