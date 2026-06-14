/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { StackedAreaChart } from '../../src/app/components/StackedAreaChart';

// Mock Recharts
vi.mock('recharts', async () => {
  const original = await vi.importActual('recharts') as any;
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
    AreaChart: ({ children }: any) => <div className="recharts-wrapper">{children}</div>,
    Area: (props: any) => <div data-testid="area-mock" data-key={props.dataKey} />,
    ReferenceLine: () => <div data-testid="reference-line-mock" />,
    Tooltip: () => <div data-testid="tooltip-mock" />,
    YAxis: () => <div data-testid="yaxis-mock" />,
    XAxis: () => <div data-testid="xaxis-mock" />,
    CartesianGrid: () => <div data-testid="grid-mock" />,
  };
});

describe('StackedAreaChart', () => {
  const mockProps = {
    title: 'Test Stacked Chart',
    data: [{ 年月: '2023年1月', 'キー1': 100, 'キー2': 50 }],
    keys: ['キー1', 'キー2'],
    colors: ['#000', '#fff'],
    hiddenKeys: [],
    onToggle: vi.fn(),
    chartColors: { gridStroke: '#000', axisText: '#000', tooltipBg: '#000', tooltipText: '#000' },
    isMobile: false,
    CustomTooltip: () => <div>Tooltip</div>,
    onReset: vi.fn(),
  };

  it('renders correctly', () => {
    render(<StackedAreaChart {...mockProps} />);
    expect(screen.getByText('Test Stacked Chart')).toBeDefined();
    expect(screen.getByText('キー1')).toBeDefined();
    expect(screen.getByText('キー2')).toBeDefined();
  });

  it('calls onToggle when a legend item is clicked', () => {
    render(<StackedAreaChart {...mockProps} />);
    const button = screen.getByText('キー1');
    fireEvent.click(button);
    expect(mockProps.onToggle).toHaveBeenCalledWith('キー1');
  });

  it('calls onReset when reset button is clicked', () => {
    render(<StackedAreaChart {...mockProps} />);
    const resetButton = screen.getByText('全選択解除');
    fireEvent.click(resetButton);
    expect(mockProps.onReset).toHaveBeenCalledTimes(1);
  });
});
