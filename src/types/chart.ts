export interface CustomTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number; color?: string }[];
  label?: string;
  isMobile: boolean;
  isTouch: boolean;
  tooltipBg: string;
  tooltipText: string;
  resetKey?: number;
  /** プログラム的スクロール（タブジャンプ）の抑制中であることを示す */
  suppressed?: boolean;
}

export interface CpiView extends Record<string, string | number> {
  年月: string;
}

export interface QuarterlyView extends Record<string, number | string> {
  label: string;
  quarter: number;
  年: number;
  年月: string;
}

export interface EarningsView extends Record<string, string | number> {
  年月: string;
}
