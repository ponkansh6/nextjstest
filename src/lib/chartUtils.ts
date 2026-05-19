import { CpiData } from "../app/page";

/**
 * 年月文字列（例: "2020年1月"）から年を抽出するヘルパー
 */
export const extractYear = (ym: string): number => {
  const match = ym.match(/^(\d{4})年/);
  return match ? parseInt(match[1], 10) : 0;
};

/**
 * 年範囲でデータをフィルタリングする
 */
export const filterDataByYear = <T extends { 年月: string }>(
  data: T[],
  startYear: number,
  endYear: number,
): T[] => {
  return data.filter((item) => {
    const year = extractYear(item.年月);
    return year >= startYear && year <= endYear;
  });
};

/**
 * 賃金データとCPIデータをマージする
 */
export const mergeChartData = (
  wageData: CpiData[],
  cpiData: CpiData[],
  startYear: number,
  endYear: number,
): (CpiData & { 総合?: number })[] => {
  const map = new Map<string, CpiData & { 総合?: number }>();

  // 賃金データの追加（範囲フィルタ済み）
  wageData.forEach((row) => {
    map.set(row.年月, { ...row });
  });

  // CPIデータの結合
  cpiData.forEach((row) => {
    const year = extractYear(row.年月);
    if (year < startYear || year > endYear) return;

    if (map.has(row.年月)) {
      const item = map.get(row.年月)!;
      item.総合 = row.総合;
    } else {
      map.set(row.年月, { 年月: row.年月, 総合: row.総合 } as CpiData & {
        総合?: number;
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const ma = a.年月.match(/^(\d{4})年(\d{1,2})月/);
    const mb = b.年月.match(/^(\d{4})年(\d{1,2})月/);
    if (!ma || !mb) return 0;
    const ay = parseInt(ma[1], 10);
    const am = parseInt(ma[2], 10);
    const by = parseInt(mb[1], 10);
    const bm = parseInt(mb[2], 10);
    return ay !== by ? ay - by : am - bm;
  });
};
