export interface CustomTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number }[];
  label?: string;
  isMobile: boolean;
  tooltipBg: string;
  tooltipText: string;
}
