import type { CustomTooltipProps } from "@/types/chart";

export interface ChartTooltipSelection {
  label?: string;
  payload: NonNullable<CustomTooltipProps["payload"]>;
}

export interface ChartTooltipSelectionSeries {
  key: string;
  name?: string;
  color?: string;
}

/** Build a Recharts-compatible tooltip payload for one concrete chart datum. */
export function createChartTooltipSelectionResolver<Row extends Record<string, unknown>>(
  rows: readonly Row[],
  getSeries: (
    row: Row,
    label: string | undefined,
    index: number,
  ) => readonly ChartTooltipSelectionSeries[],
  getLabel: (row: Row) => string | undefined = (row) => {
    const value = row.label ?? row["年月"];
    return typeof value === "string" ? value : undefined;
  },
): (index: number) => ChartTooltipSelection | null {
  return (index) => {
    const row = rows[index];
    if (!row) return null;
    const label = getLabel(row);
    return {
      label,
      payload: getSeries(row, label, index).map(({ key, name, color }) => {
        const rawValue = row[key];
        return {
          dataKey: key,
          name: name ?? key,
          value: typeof rawValue === "number" || rawValue == null ? rawValue : null,
          color,
          payload: { ...row },
        };
      }),
    };
  };
}
