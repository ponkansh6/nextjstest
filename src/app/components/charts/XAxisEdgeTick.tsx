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
      {payload?.value}
    </Text>
  );
};
