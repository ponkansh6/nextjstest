/**
 * @vitest-environment happy-dom
 */

import { expect, it, describe, beforeAll } from "vitest";
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import CpiChart from '../../src/app/components/CpiChart';
import { loadCtiData, loadCpiData } from "../../server/lib/dataLoader";
import { SUPPORT_SERIES_KEY_NOMINAL, SUPPORT_SERIES_KEY_REAL } from "../../src/lib/chartConstants";
import { setupUiMocks } from '../utils/ui-mocks';

setupUiMocks();

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
});
