import fs from "fs";
import Papa from "papaparse";
import type { CpiData } from "@/types";
import { buildEarningsFilePaths, parseIndexSection } from "../dataIo";
import {
  calculateSmoothedTotal,
  applyMovingAverage,
  calculateAdjustedMetric,
  calculateRawResidual,
  applyResidualMovingAverage,
} from "../serverCalculations";
import { loadPopulationDataInternal } from "./population";
import { loadCpiDataInternal } from "./cpi";

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
  const cpiMap = new Map<string, number>();
  cpiData.forEach((d) => {
    if (typeof d.総合 === "number") cpiMap.set(d.年月, d.総合);
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

  result.sort((a, b) => {
    const ma = a.年月.match(/^(\d{4})年(\d{1,2})月/);
    const mb = b.年月.match(/^(\d{4})年(\d{1,2})月/);
    if (!ma || !mb) return 0;
    const ay = parseInt(ma[1], 10);
    const am = parseInt(ma[2], 10);
    const by = parseInt(mb[1], 10);
    const bm = parseInt(mb[2], 10);
    return ay !== by ? ay - by : am - bm;
  });

  applyMovingAverage(result, "特別給与", 12);
  const totals2020 = result
    .filter((r) => r.年月.startsWith("2020年"))
    .map((r) => calculateSmoothedTotal(r));
  const avg2020 =
    totals2020.length > 0 ? totals2020.reduce((a, b) => a + b, 0) / totals2020.length : 0;
  const totalIndexFactor = avg2020 > 0 ? 100 / avg2020 : 1;

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
  });
  applyResidualMovingAverage(result);
  return result;
}
