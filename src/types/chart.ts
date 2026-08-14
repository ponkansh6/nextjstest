export interface CustomTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number; color?: string }[];
  label?: string;
  isMobile: boolean;
  isTouch: boolean;
  tooltipBg: string;
  tooltipText: string;
  onDismiss?: () => void;
  /** 積み上げチャート向け: 描画中系列の合計を先頭に表示する */
  showTotal?: boolean;
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
