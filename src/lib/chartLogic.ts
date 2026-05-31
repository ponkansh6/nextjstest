import type { CpiData } from "@/types";

export interface UseCpiChartDataProps {
  data: CpiData[];
  nominalData: CpiData[];
  startYear: number;
  endYear: number;
  nominalKeys: string[];
  realKeys: string[];
  maxCpiDate: { year: number; month: number };
}

// フックからロジックを抽出した関数
export const computeChartData = (props: UseCpiChartDataProps, hiddenQuarters: number[]) => {
  const { nominalData, startYear, endYear, nominalKeys, realKeys, maxCpiDate } = props;

  // Normalize 年月 formatting to a canonical form (e.g., "2020年1月") to tolerate zero-padded months like "2020年01月".
  const normalizeYm = (ym?: string | number) => {
    if (!ym || typeof ym !== "string") return String(ym || "").trim();
    const m = ym.trim().match(/^(\d{4})年0?(\d{1,2})月/);
    if (!m) return ym.trim();
    return `${m[1]}年${parseInt(m[2], 10)}月`;
  };

  const normalizedNominalData: CpiData[] = nominalData.map((d) => ({
    ...d,
    年月: normalizeYm(String(d.年月)),
  }));

  const filteredNominalData = (() => {
    const allMonths: string[] = [];
    for (let y = startYear; y <= endYear; y++) {
      for (let m = 1; m <= 12; m++) {
        allMonths.push(`${y}年${m}月`);
      }
    }

    const nominalMap = new Map(normalizedNominalData.map((d) => [d.年月, d]));
    return allMonths.map((yearMonth) => {
      const existingData = nominalMap.get(yearMonth);
      if (existingData) {
        return existingData;
      }

      const emptyItem: CpiData = { 年月: yearMonth } as CpiData;
      nominalKeys.forEach((key: string) => {
        emptyItem[key as keyof CpiData] = 0;
      });
      realKeys.forEach((key: string) => {
        emptyItem[key as keyof CpiData] = 0;
      });
      return emptyItem;
    });
  })();

  const nominalMonthsSet = new Set(normalizedNominalData.map((d: CpiData) => d.年月));
  const effectiveEndYear = Math.min(endYear, maxCpiDate.year);
  const filteredNominalMap = new Map(filteredNominalData.map((d) => [d.年月, d]));

  const getQuarterlyData = (keys: string[]) => {
    const rows: {
      年: number;
      quarter: number;
      label: string;
      [key: string]: number | string;
    }[] = [];
    for (let y = startYear; y <= effectiveEndYear; y++) {
      const maxQ = y === maxCpiDate.year ? Math.ceil(maxCpiDate.month / 3) : 4;
      for (let q = 1; q <= maxQ; q++) {
        const months =
          q === 1 ? [1, 2, 3] : q === 2 ? [4, 5, 6] : q === 3 ? [7, 8, 9] : [10, 11, 12];
        const label = `${y}年Q${q}`;
        const item: {
          年: number;
          quarter: number;
          label: string;
          [key: string]: number | string;
        } = { label, quarter: q, 年: y };
        keys.forEach((k: string) => (item[k] = 0));

        let validMonthsCount = 0;
        months.forEach((m) => {
          const monthStr = `${y}年${m}月`;
          const row = filteredNominalMap.get(monthStr);
          if (row) {
            if (nominalMonthsSet.has(monthStr)) {
              validMonthsCount++;
            }
            keys.forEach((k: string) => {
              const v = row[k as keyof CpiData];
              if (typeof v === "number") {
                item[k] = (item[k] as number) + v;
              }
            });
          }
        });

        if (validMonthsCount !== 3) {
          keys.forEach((k: string) => (item[k] = 0));
        }
        if (!hiddenQuarters.includes(q)) {
          rows.push(item);
        }
      }
    }
    return rows;
  };

  return {
    quarterlyNominalData: getQuarterlyData(nominalKeys),
    quarterlyRealData: getQuarterlyData(realKeys),
  };
};
