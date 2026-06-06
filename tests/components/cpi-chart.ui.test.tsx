/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import CpiChart from '../../src/app/components/CpiChart';
import { SUPPORT_SERIES_KEY } from '../../src/lib/chartConstants';

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

    // 民間最終消費支出の凡例ボタンを探す
    const button = screen.getByText('民間最終消費支出');
    
    // 初期状態は表示されていることを期待
    expect(button.closest('button')?.classList.contains('hidden')).toBe(false);

    // クリックして非表示にする
    fireEvent.click(button);
    
    // UIの更新を待つ
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // デバッグ: 実際のクラスを確認
    console.log('Button classes:', button.closest('button')?.className);
    
    // hiddenクラスを持っているはず
    const hasHidden = button.closest('button')?.className.includes('_hidden_');
    console.log('Has hidden class:', hasHidden);
    
    expect(hasHidden).toBe(true);


    // クリックして再表示する
    fireEvent.click(button);
    expect(button.closest('button')?.classList.contains('hidden')).toBe(false);
  });
});
