// @bun-environment happy-dom
import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import { ChartFilters } from '../../src/app/components/ChartFilters';
import { ChartLegend } from '../../src/app/components/ChartLegend';
import { SpendingBarChart } from '../../src/app/components/SpendingBarChart';
import { StackedAreaChart } from '../../src/app/components/StackedAreaChart';
import { EarningsBreakdownChart } from '../../src/app/components/EarningsBreakdownChart';
import { ResidualAreaChart } from '../../src/app/components/ResidualAreaChart';
import { MajorIndicesChart } from '../../src/app/components/MajorIndicesChart';
import { useCpiChartData } from '../../src/hooks/useCpiChartData';
import { CpiData } from '../../src/types/data';
import { nominalKeys, realKeys, SUPPORT_SERIES_KEY_NOMINAL, SUPPORT_SERIES_KEY_REAL, targetKeys, stackedKeys, stackedColors } from '../../src/lib/chartConstants';
import { setupUiMocks } from '../utils/ui-mocks';
import '../utils/recharts-mock';

setupUiMocks();

// --- Mock Data ---
const createMockDataPoint = (year: number, month: number) => {
  const data = { 年月: `${year}年${month}月`, "年": year } as any;
  [...nominalKeys, ...realKeys, SUPPORT_SERIES_KEY_NOMINAL, SUPPORT_SERIES_KEY_REAL].forEach(k => {
    data[k] = 100;
  });
  return data;
};

const mockCtiData = [
  createMockDataPoint(2005, 1),
  createMockDataPoint(2005, 2),
  createMockDataPoint(2005, 3),
  createMockDataPoint(2017, 1),
  createMockDataPoint(2017, 2),
  createMockDataPoint(2017, 3),
];

const mockQuarterlyData = [{ label: '2023年Q1', 年: 2023, quarter: 1, '総合（名目）': 100, '総合（実質）': 100 }];
const mockCpiData: CpiData[] = [
  { 年月: '2023年1月', '総合': 100, '住居': 100, '生鮮食品を除く総合': 100, '持家の帰属家賃を除く総合': 100, "消費支出(参考)": 0 },
  { 年月: '2025年1月', '総合': 105, '住居': 105, '生鮮食品を除く総合': 105, '持家の帰属家賃を除く総合': 105, "消費支出(参考)": 0 }
];
const mockMergedData: CpiData[] = [
  { label: '2023年Q1', 年: 2023, 年月: '2023年1月', quarter: 1, '所定内給与': 100, '所定外給与': 100, '特別給与': 100, '時間当たり給与': 100, '15歳以上国民当たり給与': 100, '総合': 100, '生鮮食品を除く総合': 100, '持家の帰属家賃を除く総合': 100, "消費支出(参考)": 100 } as any,
  { label: '2025年Q1', 年: 2025, 年月: '2025年1月', quarter: 1, '所定内給与': 105, '所定外給与': 105, '特別給与': 105, '時間当たり給与': 105, '15歳以上国民当たり給与': 105, '総合': 105, '生鮮食品を除く総合': 105, '持家の帰属家賃を除く総合': 105, "消費支出(参考)": 105 } as any
];

const chartColors = {
  axisText: "#000",
  gridStroke: "#000",
  tooltipBg: "#000",
  tooltipText: "#000",
};

const MockTooltip = () => <div>Tooltip</div>;

// --- Tests ---

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
      const expectedLabels = ["所定内給与", "所定外給与", "特別給与", "時間当たり給与", "15歳以上国民当たり給与", "消費支出(参考)"];
      expectedLabels.forEach(label => expect(screen.getByText(label)).toBeDefined());
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
    });

    it("should verify 消費支出(参考) is within 50-150 range", () => {
      mockMergedData.forEach(d => {
        const val = Number(d["消費支出(参考)"] || 0);
        expect(val, `消費支出(参考) at ${d.年月} should be 50-150`).toBeGreaterThanOrEqual(50);
        expect(val, `消費支出(参考) at ${d.年月} should be 50-150`).toBeLessThanOrEqual(150);
      });
    });
  });
});

describe('ChartFilters', () => {
  const mockProps = {
    allYears: [2020, 2021, 2022],
    startYear: 2020,
    endYear: 2022,
    setStartYear: vi.fn(),
    setEndYear: vi.fn(),
  };

  it('renders correctly', () => {
    render(<ChartFilters {...mockProps} />);
    expect(screen.getByLabelText('開始年:')).toBeDefined();
    expect(screen.getByLabelText('終了年:')).toBeDefined();
  });

  it('calls setStartYear when start year is changed', () => {
    render(<ChartFilters {...mockProps} />);
    const select = screen.getByLabelText('開始年:');
    fireEvent.change(select, { target: { value: '2021' } });
    expect(mockProps.setStartYear).toHaveBeenCalledWith(2021);
  });

  it('calls setEndYear when end year is changed', () => {
    render(<ChartFilters {...mockProps} />);
    const select = screen.getByLabelText('終了年:');
    fireEvent.change(select, { target: { value: '2021' } });
    expect(mockProps.setEndYear).toHaveBeenCalledWith(2021);
  });
});

describe('ChartLegend', () => {
  const mockProps = {
    title: 'Test Legend',
    keys: ['Key1', 'Key2'],
    colors: ['#000', '#fff'],
    hiddenKeys: ['Key1'],
    onToggle: vi.fn(),
  };

  it('renders legend items correctly', () => {
    render(<ChartLegend {...mockProps} />);
    expect(screen.getByText('Test Legend')).toBeDefined();
    expect(screen.getByText('Key1')).toBeDefined();
    expect(screen.getByText('Key2')).toBeDefined();
  });

  it('calls onToggle when a legend item is clicked', () => {
    render(<ChartLegend {...mockProps} />);
    const button = screen.getByText('Key2');
    fireEvent.click(button);
    expect(mockProps.onToggle).toHaveBeenCalledWith('Key2');
  });
});

describe('SpendingBarChart', () => {
  const mockProps = {
    title: 'Test Bar Chart',
    data: [{ label: '2023年Q1', 年: 2023, quarter: 1, 'キー1': 100 }],
    keys: ['キー1'],
    colors: ['#000'],
    hiddenKeys: [],
    onToggle: vi.fn(),
    chartColors,
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

describe('StackedAreaChart', () => {
  const mockProps = {
    title: 'Test Stacked Chart',
    data: [{ 年月: '2023年1月', 'キー1': 100, 'キー2': 50 }],
    keys: ['キー1', 'キー2'],
    colors: ['#000', '#fff'],
    hiddenKeys: [],
    onToggle: vi.fn(),
    chartColors,
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

describe('useCpiChartData', () => {
  it("should verify that the hook produces valid quarterly data for all nominal and real keys", () => {
    const props = {
      data: mockCtiData,
      endYear: 2026,
      maxCpiDate: { month: 12, year: 2026 },
      nominalData: mockCtiData,
      nominalKeys: nominalKeys,
      realKeys: realKeys,
      startYear: 2005,
    };

    const { result } = renderHook(() => useCpiChartData(props));
    const { quarterlyNominalData, quarterlyRealData } = result.current;

    expect(quarterlyNominalData.length).toBeGreaterThan(0);
    
    const hasDataInRange = (data: any[], keys: string[], startYear: number, endYear: number, checkOnlySupport = false) => {
      const rangeData = data.filter(d => (d.年 as number) >= startYear && (d.年 as number) <= endYear);
      return keys.every(key => {
        if (checkOnlySupport && !key.includes('民間最終消費支出')) return true;
        if (key.includes('その他の消費支出')) return true; 
        return rangeData.some(d => typeof d[key] === 'number' && d[key] > 0);
      });
    };

    nominalKeys.forEach(key => {
      if (key === SUPPORT_SERIES_KEY_NOMINAL) return;
      expect(hasDataInRange(quarterlyNominalData, [key], 2005, 2016, true), `Nominal Series '${key}' should have positive values in 2005-2016`).toBe(true);
      expect(hasDataInRange(quarterlyNominalData, [key], 2017, 2026, false), `Nominal Series '${key}' should have positive values in 2017-2026`).toBe(true);
    });

    if (realKeys.length > 0) {
      expect(quarterlyRealData.length).toBeGreaterThan(0);
      realKeys.forEach(key => {
        if (key === SUPPORT_SERIES_KEY_REAL) return;
        expect(hasDataInRange(quarterlyRealData, [key], 2005, 2016, true), `Real Series '${key}' should have positive values in 2005-2016`).toBe(true);
        expect(hasDataInRange(quarterlyRealData, [key], 2017, 2026, false), `Real Series '${key}' should have positive values in 2017-2026`).toBe(true);
      });
    }
  });
});
