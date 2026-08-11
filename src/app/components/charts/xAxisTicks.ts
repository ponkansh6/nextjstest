import { MILESTONE_YEARS } from "@/lib/chartConstants";

// 開始年・終了年のラベルと近接しすぎるマイルストーンラベルは、
// 被り防止のため開始年・終了年を優先して非表示にする際の閾値(月数)。
const EDGE_GAP_MONTHS = 35;

interface XAxisTickSource {
  年月: string;
  [key: string]: unknown;
}

function monthIndex(yearMonth: string): number | null {
  const match = yearMonth.match(/^(\d+)年(\d+)月$/);
  if (!match) return null;
  return parseInt(match[1], 10) * 12 + parseInt(match[2], 10);
}

/**
 * X軸に表示するティックの値を計算する。
 * 開始年・終了年は常に表示し、それ以外はマイルストーン年(1月)のうち
 * 開始年・終了年に近接しすぎていないものだけを表示する。
 * dataKey が "年月" と異なる場合(例: 四半期データの "label")は tickKey で指定する。
 */
export function computeXAxisTicks(data: XAxisTickSource[], tickKey: string = "年月"): string[] {
  if (data.length === 0) return [];

  const start = data[0];
  const end = data[data.length - 1];
  const startValue = String(start[tickKey]);
  if (data.length === 1) return [startValue];
  const endValue = String(end[tickKey]);

  const startIndex = monthIndex(start.年月);
  const endIndex = monthIndex(end.年月);

  const milestoneValues = data
    .filter((d) => d !== start && d !== end)
    .filter((d) => {
      const match = d.年月.match(/^(\d+)年1月$/);
      if (!match) return false;
      return (MILESTONE_YEARS as readonly number[]).includes(parseInt(match[1], 10));
    })
    .filter((d) => {
      const idx = monthIndex(d.年月);
      if (idx === null || startIndex === null || endIndex === null) return true;
      return idx - startIndex >= EDGE_GAP_MONTHS && endIndex - idx >= EDGE_GAP_MONTHS;
    })
    .map((d) => String(d[tickKey]));

  return [startValue, ...milestoneValues, endValue];
}
