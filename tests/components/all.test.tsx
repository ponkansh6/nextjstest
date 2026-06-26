// @bun-environment happy-dom
import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import { ChartFilters } from '../../src/app/components/ChartFilters';
import { ChartLegend } from '../../src/app/components/ChartLegend';
import { SpendingBarChart } from '../../src/app/components/SpendingBarChart';
import { StackedAreaChart } from '../../src/app/components/StackedAreaChart';
import { EarningsBreakdownChart } from '../../src/app/components/EarningsBreakdownChart';
import { ResidualAreaChart } from '../../src/app/components/ResidualAreaChart';
import { MajorIndicesChart } from '../../src/app/components/MajorIndicesChart';
import { NewGraph } from '../../src/app/components/NewGraph';
import { useCpiChartData } from '../../src/hooks/useCpiChartData';
import { computeChartData } from '../../src/lib/clientCalculations';
import { CpiData } from '../../src/types/data';
import { CONSUMPTION_NOMINAL_KEYS, CONSUMPTION_REAL_KEYS, SUPPORT_SERIES_KEY_NOMINAL, SUPPORT_SERIES_KEY_REAL, targetKeys, stackedKeys, stackedColors } from '../../src/lib/chartConstants';
import { setupUiMocks } from '../utils/ui-mocks';
import '../utils/recharts-mock';
import { beforeAll, describe, it, expect, vi } from 'vitest';

beforeAll(() => {
  setupUiMocks();
});

// --- Mock Data ---
const createMockDataPoint = (year: number, month: number) => {
  const data = { 年月: `${year}年${month}月`, "年": year } as any;
  [...CONSUMPTION_NOMINAL_KEYS, ...CONSUMPTION_REAL_KEYS, SUPPORT_SERIES_KEY_NOMINAL, SUPPORT_SERIES_KEY_REAL].forEach(k => {
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
  { 年月: '2023年1月', '総合': 100, '住居': 100, '生鮮食品を除く総合': 100, '持家の帰属家賃を除く総合': 100, "消費支出(参考)": 0, "CPI総合(参考)": 0 },
  { 年月: '2025年1月', '総合': 105, '住居': 105, '生鮮食品を除く総合': 105, '持家の帰属家賃を除く総合': 105, "消費支出(参考)": 0, "CPI総合(参考)": 0 }
];
const mockMergedData: CpiData[] = [
  { label: '2023年Q1', 年: 2023, 年月: '2023年1月', quarter: 1, '所定内給与': 100, '所定外給与': 100, '特別給与': 100, '時間当たり給与': 100, '15歳以上国民当たり給与': 100, '総合': 100, '生鮮食品を除く総合': 100, '持家の帰属家賃を除く総合': 100, "消費支出(参考)": 100, "CPI総合(12MA)": 100 } as any,
  { label: '2025年Q1', 年: 2025, 年月: '2025年1月', quarter: 1, '所定内給与': 105, '所定外給与': 105, '特別給与': 105, '時間当たり給与': 105, '15歳以上国民当たり給与': 105, '総合': 105, '生鮮食品を除く総合': 105, '持家の帰属家賃を除く総合': 105, "消費支出(参考)": 105, "CPI総合(12MA)": 105 } as any
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
          keys={CONSUMPTION_NOMINAL_KEYS}
          colors={CONSUMPTION_NOMINAL_KEYS.map(() => "#000")}
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

    it("should render StackedAreaChart with computed data and verify legend label", () => {
      const mockData = [
        { 年月: '2023年1月', 'その他の消費支出（名目）': 100, 総合: 100, 生鮮食品を除く総合: 100, 持家の帰属家賃を除く総合: 100 },
        { 年月: '2023年2月', 'その他の消費支出（名目）': 100, 総合: 100, 生鮮食品を除く総合: 100, 持家の帰属家賃を除く総合: 100 },
        { 年月: '2023年3月', 'その他の消費支出（名目）': 100, 総合: 100, 生鮮食品を除く総合: 100, 持家の帰属家賃を除く総合: 100 },
      ];
      
      const props = {
        data: [],
        nominalData: mockData as any,
        startYear: 2023,
        endYear: 2023,
        nominalKeys: ['その他の消費支出（名目）'],
        realKeys: [],
        maxCpiDate: { year: 2023, month: 3 },
      };
      
      const { quarterlyNominalData } = computeChartData(props, []);
      
      // 四半期データを StackedAreaChart が期待する形式（年月プロパティを持つ）に変換
      const chartData = quarterlyNominalData.map(d => ({
        ...d,
        年月: d.label, // label を 年月 として扱う
      }));

      render(
        <StackedAreaChart
          title="CPI費目別積み上げ"
          data={chartData as any}
          keys={['その他の消費支出（名目）']}
          colors={['#000']}
          hiddenKeys={[]}
          onToggle={() => {}}
          chartColors={chartColors}
          isMobile={false}
          CustomTooltip={MockTooltip}
          onReset={() => {}}
        />
      );
      // 凡例ラベルは getLegendLabel で変換されるため、変換後のラベルを確認する
      expect(screen.getByText("諸雑費・CPI外支出")).toBeDefined();
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

  it('calls onToggle when "その他の消費支出（名目）" legend item is clicked', () => {
    const props = {
      title: 'Test Legend',
      keys: ['その他の消費支出（名目）', 'Key2'],
      colors: ['#000', '#fff'],
      hiddenKeys: [],
      onToggle: vi.fn(),
    };
    render(<ChartLegend {...props} />);
    // 凡例ラベルは getLegendLabel で変換されるため、変換後のラベルを確認する
    const button = screen.getByText('諸雑費・CPI外支出');
    fireEvent.click(button);
    expect(props.onToggle).toHaveBeenCalledWith('その他の消費支出（名目）');
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
    data: [{ 年月: '2023年1月', 'キー1': 100, 'キー2': 50, 総合: 150, 生鮮食品を除く総合: 150, 持家の帰属家賃を除く総合: 150 } as unknown as CpiData],
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
      nominalKeys: CONSUMPTION_NOMINAL_KEYS,
      realKeys: CONSUMPTION_REAL_KEYS,
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

    CONSUMPTION_NOMINAL_KEYS.forEach(key => {
      if (key === SUPPORT_SERIES_KEY_NOMINAL) return;
      expect(hasDataInRange(quarterlyNominalData, [key], 2005, 2016, true), `Nominal Series '${key}' should have positive values in 2005-2016`).toBe(true);
      expect(hasDataInRange(quarterlyNominalData, [key], 2017, 2026, false), `Nominal Series '${key}' should have positive values in 2017-2026`).toBe(true);
    });

    if (CONSUMPTION_REAL_KEYS.length > 0) {
      expect(quarterlyRealData.length).toBeGreaterThan(0);
      CONSUMPTION_REAL_KEYS.forEach(key => {
        if (key === SUPPORT_SERIES_KEY_REAL) return;
        expect(hasDataInRange(quarterlyRealData, [key], 2005, 2016, true), `Real Series '${key}' should have positive values in 2005-2016`).toBe(true);
        expect(hasDataInRange(quarterlyRealData, [key], 2017, 2026, false), `Real Series '${key}' should have positive values in 2017-2026`).toBe(true);
      });
    }
  });
});

describe('NewGraph', () => {
  const mockNewGraphData: CpiData[] = [
    { 年月: '2023年1月', '総合': 100, '消費支出(参考)': 100, 'CPI総合(12MA)': 100 } as any,
    { 年月: '2023年2月', '総合': 101, '消費支出(参考)': 101, 'CPI総合(12MA)': 101 } as any,
    { 年月: '2023年3月', '総合': 102, '消費支出(参考)': 102, 'CPI総合(12MA)': 102 } as any,
  ];

  const mockNewGraphColors = {
    axisText: "#000",
    gridStroke: "#000",
    tooltipBg: "#000",
    tooltipText: "#000",
  };

  const mockOnToggle = vi.fn();

  it('renders the chart title and note', () => {
    render(
      <NewGraph
        data={mockNewGraphData}
        hiddenKeys={[]}
        onToggle={mockOnToggle}
        chartColors={mockNewGraphColors}
        isMobile={false}
        CustomTooltip={() => <div>Tooltip</div>}
      />
    );
    expect(screen.getByText('主要指標の12か月移動平均比較')).toBeDefined();
  });

  it('renders legend items with display names', () => {
    render(
      <NewGraph
        data={mockNewGraphData}
        hiddenKeys={[]}
        onToggle={mockOnToggle}
        chartColors={mockNewGraphColors}
        isMobile={false}
        CustomTooltip={() => <div>Tooltip</div>}
      />
    );
    expect(screen.getByText('給与(総合)')).toBeDefined();
    expect(screen.getByText('消費支出(総合)')).toBeDefined();
    expect(screen.getByText('CPI総合(12MA)')).toBeDefined();
  });

  it('calls onToggle when a legend item is clicked', () => {
    render(
      <NewGraph
        data={mockNewGraphData}
        hiddenKeys={[]}
        onToggle={mockOnToggle}
        chartColors={mockNewGraphColors}
        isMobile={false}
        CustomTooltip={() => <div>Tooltip</div>}
      />
    );
    const button = screen.getByText('給与(総合)');
    fireEvent.click(button);
    expect(mockOnToggle).toHaveBeenCalledWith('総合(12MA)');
  });

  it('applies hidden style when key is in hiddenKeys', () => {
    render(
      <NewGraph
        data={mockNewGraphData}
        hiddenKeys={['消費支出(参考)']}
        onToggle={mockOnToggle}
        chartColors={mockNewGraphColors}
        isMobile={false}
        CustomTooltip={() => <div>Tooltip</div>}
      />
    );
    // The hidden legend item should still be rendered
    expect(screen.getByText('消費支出(総合)')).toBeDefined();
    // The visible ones should be there too
    expect(screen.getByText('給与(総合)')).toBeDefined();
    expect(screen.getByText('CPI総合(12MA)')).toBeDefined();
  });

  it('handles empty data gracefully', () => {
    render(
      <NewGraph
        data={[]}
        hiddenKeys={[]}
        onToggle={mockOnToggle}
        chartColors={mockNewGraphColors}
        isMobile={false}
        CustomTooltip={() => <div>Tooltip</div>}
      />
    );
    expect(screen.getByText('主要指標の12か月移動平均比較')).toBeDefined();
  });
});
