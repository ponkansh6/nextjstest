import { Text } from "recharts";

interface XAxisEdgeTickProps {
  fill: string;
  emphasisFill: string;
  index?: number;
  visibleTicksCount?: number;
  payload?: { value: string | number };
  className?: string;
  [key: string]: unknown;
}

// "YYYY年M月" 形式のラベルは「12月」等2桁の月で幅が広がり、終了年が
// 右端で欠ける原因になる。"YYYY/M" 形式に短縮して表示幅を抑える。
// dataKey が "年月" と異なる場合(例: 四半期データの "label")は対象外とし、
// そのまま表示する。
function formatTickLabel(value: string | number | undefined): string | number | undefined {
  if (typeof value !== "string") return value;
  const match = value.match(/^(\d+)年(\d+)月$/);
  if (!match) return value;
  return `${match[1]}/${match[2]}`;
}

// カスタム tick 関数を使う場合、recharts の tickFormatter は適用されないため
// (TickItem が custom tick に渡すのは未整形の payload.value のみ)、
// 表示用のフォーマットはここで行う。
//
// interval="preserveStartEnd" と組み合わせて使う想定。recharts の tick は
// 全ラベル一律の色しか指定できないため、先頭・末尾(開始年・終了年)だけ
// 別の色で描画するにはカスタム tick 関数が必要。
export const XAxisEdgeTick = ({
  fill,
  emphasisFill,
  index,
  visibleTicksCount,
  payload,
  className,
  ...rest
}: XAxisEdgeTickProps) => {
  const isEdge = index === 0 || index === (visibleTicksCount ?? 1) - 1;
  return (
    <Text {...rest} className={className} fill={isEdge ? emphasisFill : fill}>
      {formatTickLabel(payload?.value)}
    </Text>
  );
};
