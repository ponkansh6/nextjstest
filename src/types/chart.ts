export interface CustomTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number; color?: string; dataKey?: string }[];
  label?: string;
  isMobile: boolean;
  isTouch: boolean;
  tooltipBg: string;
  tooltipText: string;
  onDismiss?: () => void;
  /** 積み上げチャート向け: 描画中系列の合計を先頭に表示する */
  showTotal?: boolean;
  /** 合計から除外する独立比較系列 */
  totalExcludedKeys?: string[];
  showAllPayload?: boolean;
}

export interface CpiView extends Record<string, string | number> {
  年月: string;
}

export interface QuarterlyView extends Record<string, number | string | null> {
  label: string;
  quarter: number;
  年: number;
  年月: string;
}

export interface EarningsView extends Record<string, string | number> {
  年月: string;
}
