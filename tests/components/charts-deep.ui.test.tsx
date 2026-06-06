/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

// Components
import { SpendingBarChart } from '../../src/app/components/SpendingBarChart';

// Utils
import { nominalKeys, getLegendLabel } from '../../src/lib/chartConstants';

// Mock Recharts
vi.mock('recharts', async () => {
  const original = await vi.importActual('recharts') as any;
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
    BarChart: ({ children }: any) => <div className="recharts-wrapper">{children}</div>,
    Bar: (props: any) => <div data-testid="bar-mock" {...props} />,
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
    it('should hide each series when its legend button is clicked, including 民間最終消費支出', async () => {
      const keys = [...nominalKeys, "民間最終消費支出"];
      
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
            onReset={() => setHiddenKeys([])}
          />
        );
      };

      render(<TestWrapper />);

      for (const key of keys) {
        const label = getLegendLabel(key) || key;
        const button = screen.getByText(label);
        
        await act(async () => {
          button.click();
        });

        const bars = screen.getAllByTestId('bar-mock');
        const hiddenBar = bars.find((bar) => bar.getAttribute('datakey') === key);
        expect(hiddenBar, `Series ${key} should be hidden`).toBeUndefined();
        
        await act(async () => {
          button.click();
        });

        const barsAfterToggleBack = screen.getAllByTestId('bar-mock');
        const restoredBar = barsAfterToggleBack.find((bar) => bar.getAttribute('datakey') === key);
        expect(restoredBar, `Series ${key} should be visible again`).toBeDefined();
      }
    });
  });
});
