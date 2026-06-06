/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import CpiChart from '../../src/app/components/CpiChart';
import { SUPPORT_SERIES_KEY, SUPPORT_SERIES_KEY_REAL } from '../../src/lib/chartConstants';

// モック化: useCpiChartData などの外部依存
vi.mock('../../hooks/useCpiChartData', () => ({
  useCpiChartData: () => ({
    quarterlyNominalData: [],
    quarterlyRealData: [],
    hiddenQuarters: [],
    toggleQuarter: vi.fn(),
    loading: false,
    error: null,
  }),
}));

vi.mock('../../hooks/useChartTheme', () => ({
  useChartTheme: () => ({
    isMobile: false,
    chartColors: { gridStroke: '#000', axisText: '#000', tooltipBg: '#000', tooltipText: '#000', barFill: '#000' },
  }),
}));

describe('CpiChart UI Integration', () => {
  it('should toggle 民間最終消費支出 correctly in the legend', async () => {
    const mockData = [{ 年月: '2023年1月', '総合': 100 }];
    const ctiData = [{ 年月: '2023年1月', [SUPPORT_SERIES_KEY]: 300 }];
    
    render(
      <CpiChart 
        data={mockData} 
        ctiData={ctiData} 
        totalEarningData={[]} 
      />
    );

    // 民間最終消費支出の凡例ボタンを探す（複数あるため最初のものを取得）
    const buttons = screen.getAllByText('民間最終消費支出');
    const button = buttons[0];
    
    // 初期状態は表示されていることを期待
    expect(button.closest('button')?.className).not.toContain('_hidden_');

    // クリックして非表示にする
    fireEvent.click(button);
    
    // UIの更新を待つ
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // hiddenクラスを持っているはず
    const hasHidden = button.closest('button')?.className.includes('_hidden_');
    
    expect(hasHidden).toBe(true);


    // クリックして再表示する
    fireEvent.click(button);
    expect(button.closest('button')?.classList.contains('hidden')).toBe(false);
  });

  it('should toggle both 民間最終消費支出 and 民間最終消費支出（実質） when either is clicked', async () => {
    const mockData = [{ 年月: '2023年1月', '総合': 100 }];
    const ctiData = [
      { 年月: '2023年1月', [SUPPORT_SERIES_KEY]: 300, [SUPPORT_SERIES_KEY_REAL]: 200 }
    ];
    
    render(
      <CpiChart 
        data={mockData} 
        ctiData={ctiData} 
        totalEarningData={[]} 
      />
    );
    
    // 全てのボタンの中から「民間最終消費支出」というテキストを含むものを取得
    const allButtons = screen.getAllByRole('button');
    const targetButtons = allButtons.filter(b => b.textContent === '民間最終消費支出');
    
    const buttonNominal = targetButtons[0];
    
    fireEvent.click(buttonNominal);
    
    // UIの更新を待つ
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // 両方に hidden クラスが付与されたか確認
    expect(buttonNominal.className).toContain('_hidden_');
    const buttonReal = targetButtons[1];
    expect(buttonReal.className).toContain('_hidden_');
  });
});
