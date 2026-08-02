import type { CpiData } from "@/types";
import {
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
  CPI_CATEGORIES,
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
} from "./chartConstants";
import { parseYearMonth, normalizeYearMonth } from "./yearMonth";
import { applySupportSeriesScaling } from "@server/lib/math/supportSeries";

// 行データとキーリストから合計を算出する共通ロジック
export const sumCategoryValues = (
  row: CpiData,
  keys: string[],
  hiddenKeys: string[] = [],
): number => {
  let sum = 0;
  keys.forEach((key) => {
    if (!hiddenKeys.includes(key)) {
      const value = row[key as keyof CpiData];
      if (typeof value === "number") {
        sum += value;
      }
    }
  });
  return sum;
};

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
    const parsed = parseYearMonth(item.年月);
    if (!parsed) {
      return false;
    }
    return parsed.year === year && parsed.month === month;
  });

  if (!dataPoint) {
    throw new Error(`指定された年月のデータが見つかりません: ${year}年${monthStr}月`);
  }

  return sumCategoryValues(dataPoint, stackedKeys, hiddenKeys);
};

/**
 * CAGR (年平均成長率) を計算する
 * @param startValue 開始時点の値
 * @param endValue 終了時点の値
 * @param years 経過年数
 * @returns CAGR (10%なら0.1)
 */
export const calculateCAGRValue = (startValue: number, endValue: number, years: number): number => {
  if (startValue <= 0 || years <= 0) return 0;
  return (endValue / startValue) ** (1 / years) - 1;
};

export interface UseCpiChartDataProps {
  data: CpiData[];
  nominalData: CpiData[];
  startYear: number;
  endYear: number;
  nominalKeys?: string[];
  realKeys?: string[];
  maxCpiDate: { year: number; month: number };
}

// フックからロジックを抽出した関数
export const computeChartData = (props: UseCpiChartDataProps, hiddenQuarters: number[]) => {
  const { nominalData, startYear, endYear, maxCpiDate } = props;
  const nominalKeys = props.nominalKeys || CONSUMPTION_NOMINAL_KEYS;
  const realKeys = props.realKeys || CONSUMPTION_REAL_KEYS;

  const normalizedNominalData: CpiData[] = nominalData.map((d) => {
    return {
      ...d,
      年月: normalizeYearMonth(String(d.年月)),
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
        // 既存データがあっても、SUPPORT_SERIES_KEY_NOMINAL がない場合は初期化する
        if (!(SUPPORT_SERIES_KEY_NOMINAL in existingData)) {
          (existingData as any)[SUPPORT_SERIES_KEY_NOMINAL] = 0;
        }
        return existingData;
      }

      const emptyItem: CpiData = { 年月: yearMonth } as CpiData;
      // すべてのキーを初期化（SUPPORT_SERIES_KEY_NOMINALも含む）
      [...nominalKeys, ...realKeys, SUPPORT_SERIES_KEY_NOMINAL].forEach((key: string) => {
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

        // サポートキーを常に初期化
        item[SUPPORT_SERIES_KEY_NOMINAL] = 0;
        item[SUPPORT_SERIES_KEY_REAL] = 0;

        keys.forEach((k: string) => (item[k] = 0));

        let validMonthsCount = 0;
        months.forEach((m) => {
          const monthStr = `${y}年${m}月`;
          const row = filteredNominalMap.get(monthStr);
          if (row) {
            if (nominalMonthsSet.has(monthStr)) {
              validMonthsCount++;
            }
            // キーごとの値チェック
            keys.forEach((k) => {
              if (
                typeof row[k as keyof CpiData] === "number" &&
                (row[k as keyof CpiData] as number) > 0
              ) {
                // ログは重いので省略
              }
            });

            // keys だけではなく、サポートキーも含めて集計する
            const allKeys = [
              ...new Set([...keys, SUPPORT_SERIES_KEY_NOMINAL, SUPPORT_SERIES_KEY_REAL]),
            ];

            allKeys.forEach((k: string) => {
              if (k === SUPPORT_SERIES_KEY_NOMINAL || k === SUPPORT_SERIES_KEY_REAL) {
                // 既に値が設定されている（0以外）なら上書きしない
                if (typeof item[k] === "number" && (item[k] as number) > 0) return;

                // 四半期データは最初の月に格納されていると仮定して取得
                const v = row[k as keyof CpiData];
                if (typeof v === "number") {
                  item[k] = v;
                }
              } else if (keys.includes(k)) {
                // 月次データは合計
                const v = row[k as keyof CpiData];
                if (typeof v === "number") {
                  item[k] = (item[k] as number) + v;
                }
              }
            });
          }
        });

        // 月次データの集計要件チェック（support系列は除く）
        const needsValidation = keys.some(
          (k) => k !== SUPPORT_SERIES_KEY_NOMINAL && k !== SUPPORT_SERIES_KEY_REAL,
        );
        if (needsValidation && validMonthsCount !== 3) {
          keys.forEach((k: string) => {
            if (k !== SUPPORT_SERIES_KEY_NOMINAL && k !== SUPPORT_SERIES_KEY_REAL) {
              item[k] = 0;
            }
          });
        }
        if (!hiddenQuarters.includes(q)) {
          // 四半期データの各カテゴリーを3で割る（月次指数合計(≒300) → 四半期平均(≒100)）
          keys.forEach((k: string) => {
            if (k !== SUPPORT_SERIES_KEY_NOMINAL && k !== SUPPORT_SERIES_KEY_REAL) {
              item[k] = (item[k] as number) / 3;
            }
          });
          rows.push(item);
        }
      }
    }
    return rows;
  };

  // compute quarterly nominal/real rows
  const nominalRows = getQuarterlyData(nominalKeys);
  const realRows = getQuarterlyData(realKeys);

  applySupportSeriesScaling(nominalRows, SUPPORT_SERIES_KEY_NOMINAL);
  applySupportSeriesScaling(realRows, SUPPORT_SERIES_KEY_REAL);

  return {
    quarterlyNominalData: nominalRows,
    quarterlyRealData: realRows,
  };
};
export { CPI_CATEGORIES };
