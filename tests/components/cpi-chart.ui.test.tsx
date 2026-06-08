/**
 * @vitest-environment happy-dom
 */

import { expect, it, describe, beforeAll, vi } from "vitest";
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import CpiChart from '../../src/app/components/CpiChart';
import { loadCtiData, loadCpiData } from "../../server/lib/dataLoader";
import { SUPPORT_SERIES_KEY_NOMINAL, SUPPORT_SERIES_KEY_REAL, nominalKeys, realKeys } from "../../src/lib/chartConstants";
// UI test setup is now centralized in utils/ui-test-setup

describe('CpiChart UI Integration', () => {
  let ctiData: any[];
  let cpiData: any[];

  beforeAll(async () => {
    ctiData = await loadCtiData();
    cpiData = await loadCpiData();
  });

  it('should toggle 民間最終消費支出 independently', async () => {
    const mockData = [{ 年月: '2023年1月', '総合': 100 }];
    const ctiDataMock = [
      { 年月: '2023年1月', [SUPPORT_SERIES_KEY_NOMINAL]: 300, [SUPPORT_SERIES_KEY_REAL]: 200 }
    ];

    render(
      <CpiChart 
        data={mockData as any} 
        ctiData={ctiDataMock as any} 
        totalEarningData={[]} 
      />
    );
    
    // 全てのボタンの中から「民間最終消費支出」というテキストを含むものを取得
    const allButtons = screen.getAllByRole('button');
    const targetButtons = allButtons.filter(b => b.textContent === '民間最終消費支出');
    
    const buttonNominal = targetButtons[0];
    
    // 名目をクリック (ペアの同期により名目と実質がトグルされる)
    fireEvent.click(buttonNominal);
    
    // UIの更新を待つ
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // 名目のボタンが hidden になるはず
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
    const { SpendingBarChart } = await import('../../src/app/components/SpendingBarChart');
    
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
