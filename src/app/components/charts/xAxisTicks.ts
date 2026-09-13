import { MILESTONE_YEARS } from "@/lib/chartConstants";

// 開始年・終了年のラベルと近接しすぎるマイルストーンラベルは、
// 被り防止のため開始年・終了年を優先して非表示にする際の閾値(月数)。
const EDGE_GAP_MONTHS = 36;

interface XAxisTickSource {
  年月: string;
  [key: string]: unknown;
}

export interface XAxisTickOptions {
  includeBoundaryTicks?: boolean;
  preserveAllMilestones?: boolean;
  maxTicks?: number;
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
export function computeXAxisTicks(
  data: XAxisTickSource[],
  tickKey: string = "年月",
  options: XAxisTickOptions = {},
): string[] {
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
    .filter(
      (d) =>
        options.preserveAllMilestones ||
        (() => {
          const idx = monthIndex(d.年月);
          if (idx === null || startIndex === null || endIndex === null) return true;
          return idx - startIndex >= EDGE_GAP_MONTHS && endIndex - idx >= EDGE_GAP_MONTHS;
        })(),
    )
    .map((d) => String(d[tickKey]));

  // Keep an adjacent-series boundary visible so consumers can audit where a
  // regular series hands off to its extension (notably 2017/12 -> 2018/1).
  const boundaryValues =
    options.includeBoundaryTicks === false
      ? []
      : data
          .filter((d) => d.年月 === "2017年12月" || d.年月 === "2018年1月")
          .map((d) => String(d[tickKey]));

  const ticks = [...new Set([startValue, ...milestoneValues, ...boundaryValues, endValue])];
  if (!options.maxTicks || ticks.length <= options.maxTicks) return ticks;

  const endpointTicks = [startValue, endValue];
  const interiorTicks = ticks.filter((tick) => !endpointTicks.includes(tick));
  const interiorSlots = Math.max(0, options.maxTicks - endpointTicks.length);
  if (interiorSlots === 0) return endpointTicks;
  const selectedInterior = Array.from({ length: interiorSlots }, (_, slot) => {
    const index =
      interiorSlots === 1
        ? Math.floor((interiorTicks.length - 1) / 2)
        : Math.round((slot * (interiorTicks.length - 1)) / (interiorSlots - 1));
    return interiorTicks[index];
  });
  return [...new Set([startValue, ...selectedInterior, endValue])];
}
