import type { CpiData, PopulationData } from "@/types";
import { calculateSmoothedTotal, calculateAdjustedMetric } from "./serverCalculations";

/**
 * Population data processing: calculates population indices and moving averages.
 */
export function processPopulationData(
  rows: string[][],
  headerIndex: number,
  yearCol: number,
  separateYearCol: number,
  monthCol: number,
  totalCol: number,
): Map<string, { total: number; index: number; ma: number }> {
  const map = new Map<string, { total: number; index: number; ma: number }>();
  let currentYear = 0;
  for (let i = headerIndex + 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const yearCell = row[yearCol] || row[separateYearCol] || row[0];
    const yearStr = typeof yearCell === "string" ? yearCell.trim() : "";
    if (yearStr) {
      const yearMatch = yearStr.match(/(\d{4})|(\d+)年/);
      if (yearMatch) {
        if (yearMatch[1]) currentYear = parseInt(yearMatch[1], 10);
        else if (yearMatch[2]) {
          const eraYear = parseInt(yearMatch[2], 10);
          if (yearStr.includes("令和")) currentYear = 2018 + eraYear;
          else if (yearStr.includes("平成")) currentYear = 1988 + eraYear;
          else if (yearStr.includes("昭和")) currentYear = 1925 + eraYear;
          else currentYear = eraYear;
        }
      }
    }
    if (currentYear < 2004) continue;
    const monthCell = row[monthCol] ?? row[1];
    const monthStr = typeof monthCell === "string" ? monthCell.trim() : "";
    const monthMatch = monthStr.match(/(\d+)月/);
    if (!monthMatch) continue;
    const month = parseInt(monthMatch[1], 10);
    const popCell = row[totalCol] ?? row[4] ?? row[5];
    const popStr = typeof popCell === "string" ? popCell.trim().replace(/,/g, "") : "";
    if (!popStr || popStr === "-" || popStr === "…") continue;
    const pop = parseFloat(popStr);
    if (isNaN(pop)) continue;
    const ym = `${currentYear}年${month}月`;
    map.set(ym, { index: 0, ma: 0, total: pop * 10000 });
  }

  const year2020 = [...map.entries()]
    .filter(([_]) => _.startsWith("2020年"))
    .map(([, data]) => data.total);
  if (year2020.length > 0) {
    const avg2020 = year2020.reduce((a, b) => a + b, 0) / year2020.length;
    const indexFactor = avg2020 > 0 ? 100 / avg2020 : 1;
    const entries = [...map.entries()];
    entries.sort((a, b) => {
      const ma = a[0].match(/^(\d{4})年(\d{1,2})月/);
      const mb = b[0].match(/^(\d{4})年(\d{1,2})月/);
      if (!ma || !mb) return 0;
      const ay = parseInt(ma[1], 10);
      const am = parseInt(ma[2], 10);
      const by = parseInt(mb[1], 10);
      const bm = parseInt(mb[2], 10);
      return ay !== by ? ay - by : am - bm;
    });
    entries.forEach(([, data]) => {
      data.index = data.total * indexFactor;
    });
    entries.forEach((_entry, index) => {
      let sum = 0;
      let count = 0;
      for (let i = Math.max(0, index - 11); i <= index; i++) {
        sum += entries[i][1].index;
        count++;
      }
      _entry[1].ma = count > 0 ? sum / count : 0;
    });
  }
  return map;
}

// ... (existing processing code)

/**
 * Earnings data processing: processes raw earnings data.
 */
export function processEarningsData(
  result: CpiData[],
  hoursMap: Map<string, number>,
  employmentMap: Map<string, number>,
  populationDataMap: Map<string, PopulationData>,
  hourlyFactor: number,
  popFactor: number,
  totalIndexFactor: number,
): CpiData[] {
  result.forEach((item, index) => {
    item["所定内給与"] = Number(item["所定内給与"] || 0) * totalIndexFactor;
    item["所定外給与"] = Number(item["所定外給与"] || 0) * totalIndexFactor;
    item["特別給与"] = Number(item["特別給与"] || 0) * totalIndexFactor;
    const smoothedTotal = calculateSmoothedTotal(item);
    item["総合"] = smoothedTotal;

    let sumHours = 0,
      sumEmp = 0,
      sumPop = 0,
      count = 0;
    for (let i = Math.max(0, index - 11); i <= index; i++) {
      const ym = result[i].年月;
      sumHours += hoursMap.get(ym) || 0;
      sumEmp += employmentMap.get(ym) || 0;
      sumPop += populationDataMap.get(ym)?.total || 0; // Simplified population lookup
      count++;
    }
    const denom = count > 0 ? count : 1;
    const smoothedHours = sumHours / denom;
    const smoothedEmp = sumEmp / denom;
    const smoothedPop = sumPop / denom;
    item["時間当たり給与"] = calculateAdjustedMetric(smoothedTotal, smoothedHours, hourlyFactor);
    item["15歳以上国民当たり給与"] = calculateAdjustedMetric(
      smoothedTotal * smoothedEmp,
      smoothedPop,
      popFactor,
    );
    // 残差計算用のCPIマップが必要だが、呼び出し元で渡すか引数を増やす必要がある
  });
  return result;
}

/**
 * CTI data processing: processes raw CTI data and complements missing values.
 */
export function processCtiData(mapped: CpiData[]): CpiData[] {
  // 差分計算: 「その他の消費支出」を計算する
  mapped.forEach((obj) => {
    const nominalTotal = (obj["消費支出（名目）"] as number) || 0;
    const realTotal = (obj["消費支出（実質）"] as number) || 0;

    const nominalKeysList = [
      "食料（名目）",
      "住居（名目）",
      "光熱・水道（名目）",
      "家具・家事用品（名目）",
      "被服及び履物（名目）",
      "保健医療（名目）",
      "交通・通信（名目）",
      "教育（名目）",
      "教養娯楽（名目）",
    ];
    const realKeysList = [
      "食料（実質）",
      "住居（実質）",
      "光熱・水道（実質）",
      "家具・家事用品（実質）",
      "被服及び履物（実質）",
      "保健医療（実質）",
      "交通・通信（実質）",
      "教育（実質）",
      "教養娯楽（実質）",
    ];

    let nominalSum = 0;
    nominalKeysList.forEach((k) => (nominalSum += (obj[k] as number) || 0));
    obj["その他の消費支出（名目）"] = Math.max(0, nominalTotal - nominalSum);

    let realSum = 0;
    realKeysList.forEach((k) => (realSum += (obj[k] as number) || 0));
    obj["その他の消費支出（実質）"] = Math.max(0, realTotal - realSum);
  });

  return mapped;
}

/**
 * CPI data processing: applies weights and calculates derived fields.
 */
export function processCpiData(rawData: CpiData[], weights: Record<string, number>): CpiData[] {
  return rawData.map((row) => {
    const newRow: CpiData = { ...row };
    Object.keys(weights).forEach((key) => {
      const value = row[key];
      if (typeof value === "number") newRow[key] = (value * weights[key]) / 10_000;
    });
    const foodTotal = typeof newRow.食料 === "number" ? newRow.食料 : 0;
    const dinedOut = typeof newRow.外食 === "number" ? newRow.外食 : 0;
    newRow["外食以外食料"] = foodTotal - dinedOut;
    newRow["諸雑費"] = typeof newRow["諸雑費"] === "number" ? newRow["諸雑費"] : 0;
    const transport = typeof newRow.交通 === "number" ? newRow.交通 : 0;
    const autoRelated = typeof newRow["自動車等関係費"] === "number" ? newRow["自動車等関係費"] : 0;
    newRow["交通・自動車等関係費"] = transport + autoRelated;

    // 不要なキーの削除などは呼び出し側で行うか、ここで行うか検討。
    // 元のロジックに合わせて削除する
    delete newRow["教養娯楽サービス"];
    delete newRow["教養娯楽用品"];
    delete newRow["交通"];
    delete newRow["自動車等関係費"];

    return newRow;
  });
}
