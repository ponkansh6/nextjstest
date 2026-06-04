import type { CpiData } from "@/types";

export const SUPPORT_KEY = "民間最終消費支出";

export const CPI_CATEGORIES = [
  "住居",
  "家具・家事用品",
  "被服及び履物",
  "保健医療",
  "教育",
  "交通・自動車等関係費",
  "通信",
  "光熱・水道",
  "教養娯楽",
  "外食以外食料",
  "外食",
  "諸雑費",
];

export const calculateCategorySum = (
  data: CpiData[],
  year: number,
  month: number,
  hiddenKeys: string[] = [],
  stackedKeys: string[] = CPI_CATEGORIES,
): number => {
  const monthStr = String(month).padStart(2, "0");

  const dataPoint = data.find((item) => {
    if (!item.年月 || typeof item.年月 !== "string") {
      return false;
    }
    const m = item.年月.match(/^\s*(\d{4})年\s*0?(\d{1,2})月/);
    if (!m) {
      return false;
    }
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    return y === year && mo === month;
  });

  if (!dataPoint) {
    throw new Error(`指定された年月のデータが見つかりません: ${year}年${monthStr}月`);
  }

  let sum = 0;
  stackedKeys.forEach((key) => {
    if (!hiddenKeys.includes(key)) {
      const value = dataPoint[key as keyof CpiData];
      if (typeof value === "number") {
        sum += value;
      }
    }
  });
  return sum;
};

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

  const normalizedNominalData: CpiData[] = nominalData.map((d) => {
    return {
      ...d,
      年月: normalizeYm(String(d.年月)),
    };
  });

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
      // ensure support field exists
      emptyItem[SUPPORT_KEY] = 0;
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
        // 1994年1～3月期 => [1, 2, 3] (q=1)
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
        // add support field
        item[SUPPORT_KEY] = 0;

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
            const supp = row[SUPPORT_KEY] as unknown as number;
            if (typeof supp === "number" && !isNaN(supp)) {
              item[SUPPORT_KEY] = (item[SUPPORT_KEY] as number) + supp;
            }
          }
        });

        if (validMonthsCount !== 3) {
          keys.forEach((k: string) => (item[k] = 0));
          item[SUPPORT_KEY] = 0;
        }
        if (!hiddenQuarters.includes(q)) {
          rows.push(item);
        }
      }
    }
    return rows;
  };

  // compute quarterly nominal/real rows
  const nominalRows = getQuarterlyData(nominalKeys);
  const realRows = getQuarterlyData(realKeys);

  // extract support series (quarters 2005-2017 only) and scale so 2020 average == 300
  const supportKey = SUPPORT_KEY;
  // build full quarterly series (including years beyond 2017 to compute scaling if needed)
  const allQuarters: { 年: number; quarter: number; label: string; value: number }[] = [];
  for (let y = startYear; y <= effectiveEndYear; y++) {
    const maxQ = y === maxCpiDate.year ? Math.ceil(maxCpiDate.month / 3) : 4;
    for (let q = 1; q <= maxQ; q++) {
      const months = q === 1 ? [1, 2, 3] : q === 2 ? [4, 5, 6] : q === 3 ? [7, 8, 9] : [10, 11, 12];
      let sum = 0;
      let valid = 0;
      months.forEach((m) => {
        const monthStr = `${y}年${m}月`;
        const row = filteredNominalMap.get(monthStr);
        if (row && typeof row[supportKey as keyof CpiData] === "number") {
          sum += (row[supportKey as keyof CpiData] as unknown as number) || 0;
          if (nominalMonthsSet.has(monthStr)) valid++;
        }
      });
      allQuarters.push({ 年: y, quarter: q, label: `${y}年Q${q}`, value: valid === 3 ? sum : 0 });
    }
  }

  // compute 2020 average across quarters (quarters in 2020 from allQuarters)
  const quarters2020 = allQuarters.filter((q) => q.年 === 2020 && q.value > 0).map((q) => q.value);
  const avg2020 =
    quarters2020.length > 0 ? quarters2020.reduce((a, b) => a + b, 0) / quarters2020.length : 0;
  const scale = avg2020 > 0 ? 300 / avg2020 : 1;

  // attach scaled support series to nominalRows (only for 2005-2017 per request)
  nominalRows.forEach((r) => {
    const year = r.年 as number;
    const q = r.quarter as number;
    const quarterObj = allQuarters.find((aq) => aq.年 === year && aq.quarter === q);
    const rawVal = quarterObj ? quarterObj.value : 0;
    if (year >= 2005 && year <= 2016) {
      r[`${supportKey}_scaled`] = rawVal * scale;
    } else {
      r[`${supportKey}_scaled`] = 0;
    }
  });

  return {
    quarterlyNominalData: nominalRows,
    quarterlyRealData: realRows,
  };
};
