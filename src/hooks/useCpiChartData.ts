import { useMemo, useState } from "react";
import type { UseCpiChartDataProps } from "../lib/clientCalculations";
import { computeChartData } from "../lib/clientCalculations";

export type { UseCpiChartDataProps };

export const useCpiChartData = (props: UseCpiChartDataProps) => {
  const [hiddenQuarters, setHiddenQuarters] = useState<number[]>([]);

  const { quarterlyNominalData, quarterlyRealData } = useMemo(
    () => computeChartData(props, hiddenQuarters),
    [hiddenQuarters, props],
  );

  const toggleQuarter = (q: number) => {
    setHiddenQuarters((prev) =>
      prev.includes(q) ? prev.filter((prevQ) => prevQ !== q) : [...prev, q],
    );
  };

  return {
    hiddenQuarters,
    quarterlyNominalData,
    quarterlyRealData,
    toggleQuarter,
    loading: false, // Explicitly false as it's synchronous now
    error: null,
  };
};
