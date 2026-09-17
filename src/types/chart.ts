export interface CustomTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number | null | undefined; color?: string; dataKey?: string }[];
  seriesMeta?: TooltipSeriesMetadata[];
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
  /** 合計対象を明示する場合のキー集合。指定時は除外リストより優先する。 */
  totalIncludedKeys?: string[];
  /** 合計行の表示ラベル */
  totalLabel?: string;
  /** 表示中の2グループ間に装飾的な区切り線を表示する設定 */
  separatorBetweenGroups?: {
    firstGroupKeys: string[];
    secondGroupKeys: string[];
  };
  showAllPayload?: boolean;
  /** Explicit visible-series contract; a function may switch keys by period. */
  allowedKeys?: string[] | ((label?: string) => string[]);
  /** Opt in to the raw-payload fallback only when no allowed-key contract is supplied. */
  includeUnmappedPayload?: boolean;
  valueFormatter?: (value: number | null | undefined) => string;
  totalFormatter?: (value: number) => string;
}

export interface TooltipSeriesMetadata {
  key: string;
  label: string;
  color?: string;
  order?: number;
  advanced?: boolean;
}

export interface CpiView extends Record<string, string | number> {
  年月: string;
}

export interface QuarterlyRow {
  年: number;
  quarter: number;
  label: string;
  年月: string;
  [key: string]: number | string;
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
