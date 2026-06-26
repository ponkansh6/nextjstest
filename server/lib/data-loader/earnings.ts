import * as fs from "node:fs";
import Papa from "papaparse";
import type { CpiData } from "@/types";
import { buildEarningsFilePaths, parseIndexSection } from "../dataIo";
import {
  calculateSmoothedTotal,
  calculateAdjustedMetric,
  calculateRawResidual,
  applyResidualMovingAverage,
} from "../serverCalculations";
import { loadPopulationDataInternal } from "./population";
import { loadCpiDataInternal, loadCtiDataInternal } from "./cpi";
import { calculateSupportScale } from "@/lib/chartUtils";

/** 年月文字列（例: "2020年1月"）から {year, month} を抽出 */
function parseYearMonth(ym: string): { year: number; month: number } | null {
  const m = ym.match(/^(\d{4})年(\d{1,2})月/);
  return m ? { year: parseInt(m[1], 10), month: parseInt(m[2], 10) } : null;
}

/** 年月文字列の昇順ソート用比較関数 */
function compareByYearMonth(a: string, b: string): number {
  const pa = parseYearMonth(a);
  const pb = parseYearMonth(b);
  if (!pa || !pb) return 0;
  return pa.year !== pb.year ? pa.year - pb.year : pa.month - pb.month;
}

/** エントリー配列の12か月移動平均マップを計算（値>0のみ対象） */
function computeTrailingMA12(entries: [string, number][]): Map<string, number> {
  const sorted = entries.filter(([_, v]) => v > 0).sort(([a], [b]) => compareByYearMonth(a, b));
  const maMap = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - 11); j <= i; j++) {
      sum += sorted[j][1];
      count++;
    }
    maMap.set(sorted[i][0], count > 0 ? sum / count : 0);
  }
  return maMap;
}

/** 特定の年を含むエントリーの平均値を計算する */
function averageForYear(map: Map<string, number>, yearPrefix: string): number {
  const values = [...map.entries()].filter(([ym]) => ym.startsWith(yearPrefix)).map(([_, v]) => v);
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** 指定フィールドの移動平均を計算し、新しいフィールドに書き込む */
function computeMovingAverageToField(
  data: CpiData[],
  sourceKey: string,
  targetKey: string,
  windowSize: number,
): void {
  const originalValues = data.map((d) => d[sourceKey] as number | undefined);
  data.forEach((item, index) => {
    let sum = 0;
    let count = 0;
    for (let i = Math.max(0, index - (windowSize - 1)); i <= index; i++) {
      const val = originalValues[i];
      if (typeof val === "number" && val > 0) {
        sum += val;
        count++;
      }
    }
    (item as Record<string, unknown>)[targetKey] = count > 0 ? sum / count : 0;
  });
}

export async function loadTotalEarningDataInternal(): Promise<CpiData[]> {
  const paths = buildEarningsFilePaths();
  const contractualContent = fs.readFileSync(paths.contractual, "utf8");
  const scheduledContent = fs.readFileSync(paths.scheduled, "utf8");
  const totalContent = fs.readFileSync(paths.total, "utf8");
  const hoursContent = fs.readFileSync(paths.hours, "utf8");
  const employmentContent = fs.readFileSync(paths.employment, "utf8");

  const contractualMap = parseIndexSection(contractualContent);
  const scheduledMap = parseIndexSection(scheduledContent);
  const totalMap = parseIndexSection(totalContent);
  const hoursMap = parseIndexSection(hoursContent);
  const employmentMap = parseIndexSection(employmentContent);

  let factorScheduled = 1;
  let factorContractual = 1;
  const honMksContent = fs.readFileSync(paths.honMks, "utf8");
  const parsedHonMks = Papa.parse<string[]>(honMksContent, {
    header: false,
    skipEmptyLines: false,
  });
  const tRow = parsedHonMks.data.find((row) => row[0] === "T" && row[1] === "T" && row[2] === "T");
  if (tRow) {
    const totalReal = parseFloat(tRow[12].replace(/,/g, ""));
    const contractualReal = parseFloat(tRow[13].replace(/,/g, ""));
    const scheduledReal = parseFloat(tRow[14].replace(/,/g, ""));
    const ym202512 = "2025年12月";
    const totalIdx = totalMap.get(ym202512) || 0;
    const contractualIdx = contractualMap.get(ym202512) || 0;
    const scheduledIdx = scheduledMap.get(ym202512) || 0;
    if (totalReal !== 0 && totalIdx !== 0 && contractualIdx !== 0 && scheduledIdx !== 0) {
      const baseUnit = totalReal / totalIdx;
      factorScheduled = scheduledReal / scheduledIdx / baseUnit;
      factorContractual = contractualReal / contractualIdx / baseUnit;
    } else if (totalReal !== 0) {
      factorScheduled = scheduledReal / totalReal;
      factorContractual = contractualReal / totalReal;
    }
  }

  const keys = new Set<string>([
    ...contractualMap.keys(),
    ...scheduledMap.keys(),
    ...totalMap.keys(),
    ...hoursMap.keys(),
    ...employmentMap.keys(),
  ]);
  const populationDataMap = await loadPopulationDataInternal();
  const cpiData = await loadCpiDataInternal();
  const ctiData = await loadCtiDataInternal();
  const cpiMap = new Map<string, number>();
  const consumptionMap = new Map<string, number>();
  cpiData.forEach((d) => {
    if (typeof d.総合 === "number") cpiMap.set(d.年月, d.総合);
  });
  // 2020年基準のスケーリング係数を算出
  const supportScale = calculateSupportScale(ctiData, "民間最終消費支出（名目）");

  // CTIデータから消費支出データを取得
  ctiData.forEach((d) => {
    const ym = d.年月 as string | undefined;
    if (!ym) return;

    const match = ym.match(/^(\d{4})年(\d+)月$/);
    if (!match) return;

    const year = parseInt(match[1], 10);

    let val = 0;
    if (year < 2017) {
      // 2016年12月までは名目民間最終消費支出の値をスケール
      val = ((d["民間最終消費支出（名目）"] as number) || 0) * supportScale;
    } else {
      // 2017年1月以降は全ての名目消費支出内訳費目を足し合わせた値 (消費支出（名目）)
      val = (d["消費支出（名目）"] as number) || 0;
    }
    consumptionMap.set(ym, val);
  });

  const year2020 = [...keys].filter((ym) => ym.startsWith("2020年"));
  const hourly2020 =
    year2020.reduce((acc, ym) => {
      const h = hoursMap.get(ym) ?? 0;
      const t = totalMap.get(ym) ?? 0;
      return acc + (h > 0 ? t / h : 0);
    }, 0) / (year2020.length || 1);

  const findPopulationTotal = (ym: string): number | undefined => {
    if (populationDataMap.has(ym)) return populationDataMap.get(ym)?.total;
    const m = ym.match(/^(\d{4})年0?(\d{1,2})月$/);
    if (!m) return undefined;
    const padded = `${m[1]}年${String(m[2]).padStart(2, "0")}月`;
    const unpadded = `${m[1]}年${parseInt(m[2], 10)}月`;
    return populationDataMap.get(padded)?.total ?? populationDataMap.get(unpadded)?.total;
  };

  const perCapitaBase2020 = (() => {
    const ratios = year2020
      .map((ym) => {
        const t = totalMap.get(ym) ?? 0;
        const e = employmentMap.get(ym) ?? 0;
        const p = findPopulationTotal(ym) ?? 0;
        return p > 0 ? (t * e) / p : 0;
      })
      .filter((r) => r > 0);
    return ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
  })();

  const hourlyFactor = hourly2020 > 0 ? 100 / hourly2020 : 1;
  const popFactor = perCapitaBase2020 > 0 ? 100 / perCapitaBase2020 : 1;

  // 消費支出の12か月移動平均を計算し、2020年平均を基準100とする
  const consumptionMAMap = computeTrailingMA12([...consumptionMap.entries()]);
  const avgMA2020 = averageForYear(consumptionMAMap, "2020年");
  const maConsumptionFactor = avgMA2020 > 0 ? 100 / avgMA2020 : 1;

  // CPI総合の12か月移動平均を計算（CPIデータは既に2020年基準）
  const cpiMAMap = computeTrailingMA12([...cpiMap.entries()]);

  const result: CpiData[] = [...keys].map((ym) => {
    const contractualVal = contractualMap.get(ym) ?? 0;
    const scheduledVal = scheduledMap.get(ym) ?? 0;
    const totalVal = totalMap.get(ym) ?? 0;
    const finalTotal = totalVal;
    const finalContractual = contractualVal * factorContractual;
    const finalScheduled = scheduledVal * factorScheduled;
    return {
      年月: ym,
      所定内給与: finalScheduled,
      _契約給与: finalContractual,
      所定外給与: Math.max(0, finalContractual - finalScheduled),
      特別給与: Math.max(0, finalTotal - finalContractual),
      総合: 0,
    } as unknown as CpiData;
  });

  result.sort((a, b) => compareByYearMonth(a.年月, b.年月));

  // 各フィールドの12か月移動平均を別フィールドに計算（生値は保持）
  for (const field of ["特別給与", "所定内給与", "所定外給与"] as const) {
    computeMovingAverageToField(result, field, `${field}(12MA)`, 12);
  }
  // 特別給与の生値を12か月移動平均で置き換え（所定内・所定外は生値のまま）
  for (const item of result) {
    item["特別給与"] = (item["特別給与(12MA)"] as number) ?? 0;
  }
  const totals2020 = result
    .filter((r) => r.年月.startsWith("2020年"))
    .map((r) => calculateSmoothedTotal(r));
  const avg2020 =
    totals2020.length > 0 ? totals2020.reduce((a, b) => a + b, 0) / totals2020.length : 0;
  const totalIndexFactor = avg2020 > 0 ? 100 / avg2020 : 1;

  result.forEach((item, index) => {
    // (12MA)フィールドのスケーリング
    item["所定内給与(12MA)"] = Number(item["所定内給与(12MA)"] || 0) * totalIndexFactor;
    item["所定外給与(12MA)"] = Number(item["所定外給与(12MA)"] || 0) * totalIndexFactor;
    item["特別給与(12MA)"] = Number(item["特別給与(12MA)"] || 0) * totalIndexFactor;
    // 生値フィールドのスケーリング（所定内・所定外は生値、特別給与はMA値）
    item["所定内給与"] = Number(item["所定内給与"] || 0) * totalIndexFactor;
    item["所定外給与"] = Number(item["所定外給与"] || 0) * totalIndexFactor;
    item["特別給与"] = Number(item["特別給与"] || 0) * totalIndexFactor;
    // 総合 = 生値所定内 + 生値所定外 + MA特別給与
    const smoothedTotal = calculateSmoothedTotal(item);
    item["総合"] = smoothedTotal;
    // 総合(12MA) = 全3系列の(12MA)合計（NewGraph用）
    const maTotal =
      ((item["所定内給与(12MA)"] as number) ?? 0) +
      ((item["所定外給与(12MA)"] as number) ?? 0) +
      ((item["特別給与(12MA)"] as number) ?? 0);
    item["総合(12MA)"] = maTotal;
    let sumHours = 0,
      sumEmp = 0,
      sumPop = 0,
      count = 0;
    for (let i = Math.max(0, index - 11); i <= index; i++) {
      const ym = result[i].年月;
      sumHours += hoursMap.get(ym) || 0;
      sumEmp += employmentMap.get(ym) || 0;
      sumPop += populationDataMap.get(ym)?.total || 0;
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
    const rawCpi = cpiMap.get(item.年月) || 0;
    item["残差"] = calculateRawResidual(smoothedTotal, rawCpi);
    item["CPI総合(参考)"] = rawCpi;
    item["CPI総合(12MA)"] = cpiMAMap.get(item.年月) ?? 0;
    // 消費支出(参考)の計算（12か月移動平均）
    const maConsumption = consumptionMAMap.get(item.年月) ?? 0;
    item["消費支出(参考)"] = maConsumption > 0 ? maConsumption * maConsumptionFactor : 0;
  });
  applyResidualMovingAverage(result);
  return result;
}
