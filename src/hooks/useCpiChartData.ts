import { useCallback, useState } from "react";

/**
 * Lightweight hook for managing hidden quarters.
 * Quarterly data is now pre-computed on the server, so this only handles filtering.
 */
export const useCpiChartData = (_quarterlyNominalData: any[], _quarterlyRealData: any[]) => {
  const [hiddenQuarters, setHiddenQuarters] = useState<number[]>([]);

  const toggleQuarter = useCallback((q: number) => {
    setHiddenQuarters((prev) =>
      prev.includes(q) ? prev.filter((prevQ) => prevQ !== q) : [...prev, q],
    );
  }, []);

  return {
    hiddenQuarters,
    toggleQuarter,
  };
};
