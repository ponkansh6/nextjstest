import { useCallback, useMemo, useState } from "react";
import type { UseCpiChartDataProps } from "../lib/clientCalculations";
import { computeChartData } from "../lib/clientCalculations";

export type { UseCpiChartDataProps };

export const useCpiChartData = (props: UseCpiChartDataProps) => {
  const [hiddenQuarters, setHiddenQuarters] = useState<number[]>([]);
  const { data, nominalData, startYear, endYear, nominalKeys, realKeys, maxCpiDate } = props;

  const { quarterlyNominalData, quarterlyRealData } = useMemo(
    () =>
      computeChartData(
        { data, nominalData, startYear, endYear, nominalKeys, realKeys, maxCpiDate },
        hiddenQuarters,
      ),
    [data, nominalData, startYear, endYear, nominalKeys, realKeys, maxCpiDate, hiddenQuarters],
  );

  const toggleQuarter = useCallback((q: number) => {
    setHiddenQuarters((prev) =>
      prev.includes(q) ? prev.filter((prevQ) => prevQ !== q) : [...prev, q],
    );
  }, []);

  return {
    hiddenQuarters,
    quarterlyNominalData,
    quarterlyRealData,
    toggleQuarter,
    loading: false, // Explicitly false as it's synchronous now
    error: null,
  };
};
