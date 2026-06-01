/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { SpendingBarChart } from '../../src/app/components/SpendingBarChart';
import { MajorIndicesChart } from '../../src/app/components/MajorIndicesChart';
import { EarningsBreakdownChart } from '../../src/app/components/EarningsBreakdownChart';
import { loadCtiData, loadCpiData, loadTotalEarningData } from '../../server/lib/dataLoader';
import { nominalKeys, getLegendLabel, targetKeys } from '../../src/lib/chartConstants';
import { computeChartData } from '../../src/lib/clientCalculations';
import { filterDataByYear, mergeChartData } from '../../src/lib/chartUtils';
import { setupUiMocks } from '../utils/ui-mocks';

// Standard UI mocks
setupUiMocks();

// Mock ResponsiveContainer to avoid issues in JSDOM
vi.mock('recharts', async () => {
  const original = await vi.importActual('recharts') as any;
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

describe("Chart Rendering Verification with Real Data", () => {
  let rawCtiData: any[];
  let rawCpiData: any[];
  let rawEarningData: any[];
  
  const startYear = 2020;
  const endYear = 2025;
  const maxCpiDate = { year: 2025, month: 3 };

  const chartColors = { gridStroke: "#000", axisText: "#000", tooltipBg: "#000", tooltipText: "#000" };
  const mockCustomTooltip = () => null;

  beforeAll(async () => {
    rawCtiData = await loadCtiData();
    rawCpiData = await loadCpiData();
    rawEarningData = await loadTotalEarningData();
  });

  it("should render SpendingBarChart legends and processed data", () => {
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
        title="Test Chart"
        data={processed.quarterlyNominalData}
        keys={nominalKeys}
        colors={nominalKeys.map(() => "#000")}
        hiddenKeys={[]}
        onToggle={() => {}}
        chartColors={chartColors}
        isMobile={false}
        CustomTooltip={mockCustomTooltip}
        hiddenQuarters={[]}
        onToggleQuarter={() => {}}
        onReset={() => {}}
      />
    );

    // Verify labels are present
    nominalKeys.forEach(key => {
        expect(screen.getByText(getLegendLabel(key))).toBeDefined();
    });
    
    // Verify quarter labels
    [1, 2, 3, 4].forEach(q => {
        expect(screen.getByText(`Q${q}`)).toBeDefined();
    });
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
        CustomTooltip={mockCustomTooltip}
      />
    );

    targetKeys.forEach(key => {
        expect(screen.getByText(key)).toBeDefined();
    });
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
        CustomTooltip={mockCustomTooltip}
      />
    );

    const expectedLabels = ["所定内給与", "所定外給与", "特別給与", "時間当たり給与", "15歳以上国民当たり給与", "CPI総合(参考)"];
    expectedLabels.forEach(label => {
        expect(screen.getByText(label)).toBeDefined();
    });
  });
});
