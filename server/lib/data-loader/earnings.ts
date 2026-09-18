import * as fs from "node:fs";
import Papa from "papaparse";
import type { CpiData } from "@/types";
import { buildEarningsFilePaths, parseIndexSection } from "../dataIo";
import {
  calculateSmoothedTotal,
  calculateAdjustedMetric,
  calculateRawResidual,
  applyResidualMovingAverage,
  rebaseResidualToYearAverage,
} from "../serverCalculations";
import { loadPopulationDataInternal } from "./population";
import { loadCpiDataInternal, loadCtiDataInternal, type CtiLoadOptions } from "./cpi";
import { compareYearMonth, parseYearMonth, toCanonicalYearMonth } from "@/lib/yearMonth";
import { trailingMovingAverage } from "../math/movingAverage";
import { loadCtiBasicConsumptionOutput } from "../ctiBasicSeries2025LongTerm";
import { ctiBasicDescriptors } from "@/lib/chartConstants";
import type { SeriesMeasurement } from "@/types/chart";

function computeTrailingMA12(entries: [string, number][]): Map<string, number> {
  const sorted = entries
    .filter(([, value]) => Number.isFinite(value))
    .sort(([a], [b]) => compareYearMonth(a, b));
  const values = trailingMovingAverage(
    sorted.map(([, value]) => value),
    12,
  );
  return new Map(sorted.map(([month], index) => [month, values[index]]));
}

/** Comparison rebasing is only valid for a complete calendar year of raw values. */
function comparisonAverageForYear(
  map: Map<string, number>,
  yearPrefix: string,
): number | undefined {
  const values = [...map.entries()]
    .filter(([ym]) => ym.startsWith(yearPrefix))
    .map(([_, value]) => value);
  return values.length === 12 && values.every((value) => Number.isFinite(value) && value !== 0)
    ? values.reduce((sum, value) => sum + value, 0) / 12
    : undefined;
}

function hasCompleteWindow(
  endIndex: number,
  dates: readonly string[],
  maps: readonly Map<string, number>[],
): boolean {
  if (endIndex < 11) return false;
  const window = dates.slice(endIndex - 11, endIndex + 1);
  if (window.length !== 12) return false;
  for (let i = 1; i < window.length; i++) {
    const previous = parseYearMonth(window[i - 1]);
    const current = parseYearMonth(window[i]);
    if (
      !previous ||
      !current ||
      current.year * 12 + current.month !== previous.year * 12 + previous.month + 1
    )
      return false;
  }
  return maps.every((map) =>
    window.every((ym) => {
      const value = map.get(ym);
      return typeof value === "number" && Number.isFinite(value);
    }),
  );
}

/** 指定フィールドの移動平均を計算し、新しいフィールドに書き込む */
function computeMovingAverageToField(
  data: CpiData[],
  sourceKey: string,
  targetKey: string,
  windowSize: number,
): void {
  const originalValues = data.map((d) => d[sourceKey] as number | undefined);
  const cleaned = originalValues.map((v) => (typeof v === "number" ? v : Number.NaN));
  const maValues = trailingMovingAverage(cleaned, windowSize, {
    skipNonPositive: false,
  });
  data.forEach((item, index) => {
    (item as Record<string, unknown>)[targetKey] = maValues[index];
  });
}

/**
 * CTIデータから民間最終消費支出MapおよびCTI消費支出Mapを構築する。
 * Plan37: 2005年1月以降の公式CTI基本系列（名目消費支出）を通常/延長ともに使用する。
 */
function buildConsumptionMaps(ctiData: CpiData[]): {
  minkanMap: Map<string, number>;
  minkanNominalRawMap: Map<string, number>;
  minkanNominalComparisonMap: Map<string, number>;
  ctiBasicRawMap: Map<string, number>;
  ctiBasicStatus: "valid" | "invalid";
  ctiBasicReason: string | null;
} {
  const ctiBasic = loadCtiBasicConsumptionOutput();
  const minkanNominalRawMap = new Map<string, number>();
  const minkanNominalComparisonMap = new Map<string, number>();
  ctiData.forEach((d) => {
    const sourceYearMonth = d.年月 as string | undefined;
    const ym = sourceYearMonth ? toCanonicalYearMonth(sourceYearMonth) : null;
    if (!ym) return;
    // GDP raw/comparison fields remain available for their independent contract;
    // neither is used by the Plan37 CTI comparison line.
    const nominalRawValue = d["民間最終消費支出（名目・原値）"];
    const nominalComparisonValue = d["民間最終消費支出（名目・比較指数）"];
    if (typeof nominalRawValue === "number" && Number.isFinite(nominalRawValue)) {
      minkanNominalRawMap.set(ym, nominalRawValue);
    }
    if (typeof nominalComparisonValue === "number" && Number.isFinite(nominalComparisonValue)) {
      minkanNominalComparisonMap.set(ym, nominalComparisonValue);
    }
  });

  const minkanMAMap = ctiBasic.comparison;

  return {
    minkanMap: minkanMAMap,
    minkanNominalRawMap,
    minkanNominalComparisonMap,
    ctiBasicRawMap: ctiBasic.raw,
    ctiBasicStatus: ctiBasic.status,
    ctiBasicReason: ctiBasic.reason,
  };
}

export async function loadTotalEarningDataInternal(
  ctiOptions: CtiLoadOptions = {},
): Promise<CpiData[]> {
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
    const totalIdx = totalMap.get(ym202512);
    const contractualIdx = contractualMap.get(ym202512);
    const scheduledIdx = scheduledMap.get(ym202512);
    if (
      totalReal !== 0 &&
      totalIdx !== undefined &&
      contractualIdx !== undefined &&
      scheduledIdx !== undefined &&
      totalIdx !== 0 &&
      contractualIdx !== 0 &&
      scheduledIdx !== 0
    ) {
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
  const ctiData = await loadCtiDataInternal(ctiOptions);
  const cpiMap = new Map<string, number>();
  cpiData.forEach((d) => {
    if (typeof d.総合 === "number") cpiMap.set(d.年月, d.総合);
  });
  // Salary indices have an explicit, independent base year. This must not
  // follow CTI/CPI/GDP availability or their compatibility rollback year.
  const salaryComparisonYear = 2025;
  // The GDP display set is independently validated by the loader before it
  // emits this normalized key. Do not infer validity from CTI availability.
  const hasGdpComparison = ctiData.some(
    (item) =>
      typeof item["民間最終消費支出（名目・比較指数）"] === "number" &&
      Number.isFinite(item["民間最終消費支出（名目・比較指数）"]),
  );
  const {
    minkanMap,
    minkanNominalRawMap,
    minkanNominalComparisonMap,
    ctiBasicRawMap,
    ctiBasicStatus,
    ctiBasicReason,
  } = buildConsumptionMaps(ctiData);

  const comparisonYearKeys = [...keys]
    .filter((ym) => ym.startsWith(`${salaryComparisonYear}年`))
    .sort(compareYearMonth);
  const comparisonYearRequiredMaps = [contractualMap, scheduledMap, totalMap, cpiMap];
  const comparisonYearComplete =
    comparisonYearKeys.length === 12 &&
    comparisonYearKeys.every((ym, index) => {
      if (index === 0) return true;
      const previous = parseYearMonth(comparisonYearKeys[index - 1]);
      const current = parseYearMonth(ym);
      return (
        previous !== null &&
        current !== null &&
        current.year * 12 + current.month === previous.year * 12 + previous.month + 1
      );
    }) &&
    comparisonYearRequiredMaps.every((map) =>
      comparisonYearKeys.every((ym) => {
        const value = map.get(ym);
        return typeof value === "number" && Number.isFinite(value);
      }),
    );
  const hourlyBaseValues = comparisonYearKeys
    .map((ym) => {
      const h = hoursMap.get(ym);
      const t = totalMap.get(ym);
      return h !== undefined && t !== undefined && h > 0 && t > 0 ? t / h : undefined;
    })
    .filter((value): value is number => value !== undefined);
  const hourly2025 =
    comparisonYearComplete && hourlyBaseValues.length === 12
      ? hourlyBaseValues.reduce((acc, value) => acc + value, 0) / hourlyBaseValues.length
      : undefined;

  const findPopulationTotal = (ym: string): number | undefined => {
    if (populationDataMap.has(ym)) return populationDataMap.get(ym)?.total;
    const parsed = parseYearMonth(ym);
    if (!parsed) return undefined;
    const padded = `${parsed.year}年${String(parsed.month).padStart(2, "0")}月`;
    const unpadded = `${parsed.year}年${parsed.month}月`;
    return populationDataMap.get(padded)?.total ?? populationDataMap.get(unpadded)?.total;
  };

  const perCapitaBase2025 = (() => {
    const ratios = comparisonYearKeys
      .map((ym) => {
        const t = totalMap.get(ym);
        const e = employmentMap.get(ym);
        const p = findPopulationTotal(ym);
        return t !== undefined && e !== undefined && p !== undefined && t > 0 && e > 0 && p > 0
          ? (t * e) / p
          : undefined;
      })
      .filter((r): r is number => r !== undefined);
    return comparisonYearComplete && ratios.length === 12
      ? ratios.reduce((a, b) => a + b, 0) / ratios.length
      : undefined;
  })();

  const hourlyFactor = hourly2025 !== undefined && hourly2025 > 0 ? 100 / hourly2025 : undefined;
  const popFactor =
    perCapitaBase2025 !== undefined && perCapitaBase2025 > 0 ? 100 / perCapitaBase2025 : undefined;

  // Earnings' CPI reference is independent from the CPI dashboard base year,
  // while still using the fixed salary comparison year.
  // 12MAは基準変更前の生値から既存どおり計算し、出力時に同じ係数を適用する。
  const avgCpiComparison = comparisonAverageForYear(cpiMap, `${salaryComparisonYear}年`);
  const cpiFactor = avgCpiComparison ? 100 / avgCpiComparison : undefined;
  const cpiMAMap = computeTrailingMA12([...cpiMap.entries()]);

  const result: CpiData[] = [...keys].map((ym) => {
    const contractualVal = contractualMap.get(ym);
    const scheduledVal = scheduledMap.get(ym);
    const totalVal = totalMap.get(ym);
    const finalContractual =
      contractualVal === undefined ? null : contractualVal * factorContractual;
    const finalScheduled = scheduledVal === undefined ? null : scheduledVal * factorScheduled;
    return {
      年月: ym,
      所定内給与: finalScheduled,
      _契約給与: finalContractual,
      所定外給与:
        finalContractual === null || finalScheduled === null
          ? null
          : Math.max(0, finalContractual - finalScheduled),
      特別給与:
        totalVal === undefined || finalContractual === null
          ? null
          : Math.max(0, totalVal - finalContractual),
      総合: null,
      measurements: {},
    } as unknown as CpiData;
  });

  result.sort((a, b) => compareYearMonth(a.年月, b.年月));

  // 各フィールドの12か月移動平均を別フィールドに計算（生値は保持）
  for (const field of ["特別給与", "所定内給与", "所定外給与"] as const) {
    computeMovingAverageToField(result, field, `${field}(12MA)`, 12);
  }
  // 特別給与の生値を12か月移動平均で置き換え（所定内・所定外は生値のまま）
  for (const item of result) {
    const value = item["特別給与(12MA)"];
    item["特別給与"] = typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  const totals2025 = result
    .filter((r) => r.年月.startsWith(`${salaryComparisonYear}年`))
    .map((r) => calculateSmoothedTotal(r));
  const avg2025 =
    comparisonYearComplete && totals2025.length === 12
      ? totals2025.reduce((a, b) => a + b, 0) / totals2025.length
      : undefined;
  // A missing comparison year is not an index with factor 1.  Keep the
  // absence explicit so every dependent derived value remains null.
  const totalIndexFactor = avg2025 !== undefined && avg2025 > 0 ? 100 / avg2025 : undefined;

  result.forEach((item, index) => {
    const scale = (value: unknown): number | null =>
      typeof value === "number" && Number.isFinite(value) && totalIndexFactor !== undefined
        ? value * totalIndexFactor
        : null;
    // (12MA)フィールドのスケーリング
    item["所定内給与(12MA)"] = scale(item["所定内給与(12MA)"]);
    item["所定外給与(12MA)"] = scale(item["所定外給与(12MA)"]);
    item["特別給与(12MA)"] = scale(item["特別給与(12MA)"]);
    // 生値フィールドのスケーリング（所定内・所定外は生値、特別給与はMA値）
    item["所定内給与"] = scale(item["所定内給与"]);
    item["所定外給与"] = scale(item["所定外給与"]);
    item["特別給与"] = scale(item["特別給与"]);
    // 総合 = 生値所定内 + 生値所定外 + MA特別給与
    const smoothedTotal = calculateSmoothedTotal(item);
    item["総合"] = smoothedTotal;
    // 総合(12MA) = 全3系列の(12MA)合計（NewGraph用）
    const maValues = [item["所定内給与(12MA)"], item["所定外給与(12MA)"], item["特別給与(12MA)"]];
    const maTotal = maValues.every((value) => typeof value === "number" && Number.isFinite(value))
      ? (maValues as number[]).reduce((sum, value) => sum + value, 0)
      : null;
    item["総合(12MA)"] = maTotal;
    let sumHours = 0,
      sumEmp = 0,
      sumPop = 0,
      count = 0;
    let populationWindowComplete = true;
    let relatedWindowComplete = true;
    for (let i = Math.max(0, index - 11); i <= index; i++) {
      const ym = result[i].年月;
      const hours = hoursMap.get(ym);
      const employment = employmentMap.get(ym);
      if (
        hours === undefined ||
        !Number.isFinite(hours) ||
        employment === undefined ||
        !Number.isFinite(employment)
      ) {
        relatedWindowComplete = false;
      } else {
        sumHours += hours;
        sumEmp += employment;
      }
      const population = populationDataMap.get(ym)?.total;
      if (typeof population !== "number" || !Number.isFinite(population)) {
        populationWindowComplete = false;
      } else {
        sumPop += population;
      }
      count++;
    }
    const denom = count > 0 ? count : 1;
    const smoothedHours = sumHours / denom;
    const smoothedEmp = sumEmp / denom;
    const smoothedPop = populationWindowComplete ? sumPop / denom : Number.NaN;
    item["時間当たり給与"] =
      hasCompleteWindow(
        index,
        result.map((row) => row.年月),
        [totalMap, contractualMap, scheduledMap, hoursMap, employmentMap],
      ) &&
      relatedWindowComplete &&
      hourlyFactor !== undefined
        ? calculateAdjustedMetric(smoothedTotal, smoothedHours, hourlyFactor)
        : null;
    item["15歳以上国民当たり給与"] =
      hasCompleteWindow(
        index,
        result.map((row) => row.年月),
        [totalMap, contractualMap, scheduledMap, hoursMap, employmentMap],
      ) &&
      populationWindowComplete &&
      popFactor !== undefined
        ? calculateAdjustedMetric(smoothedTotal * smoothedEmp, smoothedPop, popFactor)
        : null;
    const rawCpi = cpiMap.get(item.年月);
    item["CPI総合(参考)"] =
      cpiFactor !== undefined && rawCpi !== undefined ? rawCpi * cpiFactor : null;
    const cpiMa = cpiMAMap.get(item.年月);
    item["CPI総合(12MA)"] =
      cpiFactor !== undefined && cpiMa !== undefined ? cpiMa * cpiFactor : null;
    // Plan37 CTI基本系列の12MA比較指数（通常/延長の境界だけ表示を分ける）。
    // 各系列は自身の期間のみ値を持ち、期間外は null（欠測）としてゼロ方向への誤った線引きを防ぐ。
    const ctiMonth = toCanonicalYearMonth(item.年月);
    const ctiMa = ctiMonth ? minkanMap.get(ctiMonth) : undefined;
    const ctiBasicRaw = ctiMonth ? ctiBasicRawMap.get(ctiMonth) : undefined;
    const minkanNominalRaw = ctiMonth ? minkanNominalRawMap.get(ctiMonth) : undefined;
    const minkanNominalComparison = ctiMonth ? minkanNominalComparisonMap.get(ctiMonth) : undefined;
    const parsedYear = parseYearMonth(item.年月)?.year;
    if (minkanNominalRaw !== undefined) item["民間最終消費支出（名目・原値）"] = minkanNominalRaw;
    if (ctiBasicRaw !== undefined) item["CTIミクロ基本系列（名目・原数値）"] = ctiBasicRaw;
    item["民間最終消費支出（名目・比較指数）"] =
      hasGdpComparison && minkanNominalComparison !== undefined ? minkanNominalComparison : null;
    item["CTIミクロ基本系列（名目・参考）"] =
      parsedYear !== undefined &&
      parsedYear <= 2017 &&
      ctiMa !== undefined &&
      Number.isFinite(ctiMa)
        ? ctiMa
        : null;
    item["CTIミクロ基本系列（名目・参考・延長）"] =
      parsedYear !== undefined &&
      parsedYear >= 2018 &&
      ctiMa !== undefined &&
      Number.isFinite(ctiMa)
        ? ctiMa
        : null;
    const measurements: Record<string, SeriesMeasurement> = Object.fromEntries(
      ctiBasicDescriptors(ctiBasicStatus, ctiBasicReason).map((descriptor) => {
        const value =
          descriptor.valueType === "raw"
            ? (ctiBasicRaw ?? null)
            : (item[descriptor.key] as number | null);
        const isRawPresent = descriptor.valueType === "raw" && value !== null;
        return [
          descriptor.key,
          {
            ...descriptor,
            status: isRawPresent ? "valid" : descriptor.status,
            reason: isRawPresent ? null : descriptor.reason,
            value,
          },
        ];
      }),
    );
    (item as unknown as { measurements: Record<string, SeriesMeasurement> }).measurements =
      measurements;
  });

  // Normalize each salary output independently to the same fixed 2025
  // calendar-year average. This accounts for the distinct 12-month windows
  // used by hourly and per-capita denominators without touching CPI/CTI/GDP.
  for (const field of ["総合", "時間当たり給与", "15歳以上国民当たり給与"] as const) {
    const baseValues = result
      .filter((item) => item.年月.startsWith("2025年"))
      .map((item) => item[field])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const baseAverage =
      baseValues.length === 12
        ? baseValues.reduce((sum, value) => sum + value, 0) / baseValues.length
        : undefined;
    if (baseAverage !== undefined && baseAverage > 0) {
      for (const item of result) {
        const value = item[field];
        (item as Record<string, unknown>)[field] =
          typeof value === "number" && Number.isFinite(value) ? (value * 100) / baseAverage : null;
      }
    }
  }

  // Build the displayed salary-index minus CPI-index difference only after
  // both component indices have been normalized to 2025 annual average = 100.
  result.forEach((item) => {
    const salaryIndex = item["総合"];
    const cpiIndex = item["CPI総合(参考)"];
    item["残差"] =
      typeof salaryIndex === "number" &&
      Number.isFinite(salaryIndex) &&
      typeof cpiIndex === "number" &&
      Number.isFinite(cpiIndex)
        ? calculateRawResidual(salaryIndex, cpiIndex)
        : null;
  });
  applyResidualMovingAverage(result);
  // Rebase after 2MA so the values actually shown for 2025 average to zero.
  rebaseResidualToYearAverage(result, salaryComparisonYear);
  return result;
}
