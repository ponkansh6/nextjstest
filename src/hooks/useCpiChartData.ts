import { useMemo, useState, useEffect } from "react";
import type { UseCpiChartDataProps } from "../lib/chartLogic";
import { computeChartData } from "../lib/chartLogic";
import type { CpiData } from "../app/page";

export type { UseCpiChartDataProps };

export const useCpiChartData = (props: UseCpiChartDataProps) => {
  const [hiddenQuarters, setHiddenQuarters] = useState<number[]>([]);
  const [apiData, setApiData] = useState<CpiData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { nominalData } = props;

  useEffect(() => {
    fetch("/api/cpi")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        setApiData(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const dataToUse = apiData || nominalData;

  const { quarterlyNominalData, quarterlyRealData } = useMemo(
    () => computeChartData({ ...props, nominalData: dataToUse }, hiddenQuarters),
    [dataToUse, hiddenQuarters, props],
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
    loading,
    error,
  };
};
