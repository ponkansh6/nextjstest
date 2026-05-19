import { useMemo, useState } from "react";
import { computeChartData, UseCpiChartDataProps } from "../lib/chartLogic";

export type { UseCpiChartDataProps };

export const useCpiChartData = (props: UseCpiChartDataProps) => {
  const [hiddenQuarters, setHiddenQuarters] = useState<number[]>([]);

  const { quarterlyNominalData, quarterlyRealData } = useMemo(
    () => computeChartData(props, hiddenQuarters),
    [props, hiddenQuarters],
  );

  const toggleQuarter = (q: number) => {
    setHiddenQuarters((prev) =>
      prev.includes(q) ? prev.filter((prevQ) => prevQ !== q) : [...prev, q],
    );
  };

  return {
    quarterlyNominalData,
    quarterlyRealData,
    hiddenQuarters,
    toggleQuarter,
  };
};
