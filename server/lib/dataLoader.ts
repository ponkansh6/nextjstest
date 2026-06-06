import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { unstable_cache } from "next/cache";
import type { CpiData } from "@/types";

import {
  calculateSmoothedTotal,
  calculateRawResidual,
  applyResidualMovingAverage,
  applyMovingAverage,
  calculateAdjustedMetric,
} from "./serverCalculations";

async function _loadPopulationData(): Promise<
  Map<string, { total: number; index: number; ma: number }>
> {
  const populationPath = path.join(process.cwd(), "public/population_statistics.csv");
  const map = new Map<string, { total: number; index: number; ma: number }>();
  if (!fs.existsSync(populationPath)) {
    console.error("Population statistics file not found");
    return map;
  }
  try {
    const content = fs.readFileSync(populationPath, "utf8");
    const parsed = Papa.parse<string[]>(content, { header: false, skipEmptyLines: false });
    const rows = parsed.data as string[][];
    let headerIndex = rows.findIndex((row) =>
      row.some(
        (cell) =>
          typeof cell === "string" &&
          (/^\s*年\s*月\s*$/.test(cell.trim()) || /Year\s*and\s*month/i.test(cell)),
      ),
    );
    if (headerIndex === -1) {
      const fallbackIndex = rows.findIndex((row) =>
        row.some((cell) => typeof cell === "string" && /年/.test(cell) && /月/.test(cell)),
      );
      if (fallbackIndex === -1) return map;
      headerIndex = fallbackIndex;
    }
    const headerRow = rows[headerIndex];
    const yearCol = headerRow.findIndex((c) => typeof c === "string" && /年\s*月/.test(c));
    let separateYearCol = -1;
    let monthCol = -1;
    if (yearCol === -1) {
      separateYearCol = headerRow.findIndex(
        (c) => typeof c === "string" && c.trim().endsWith("年"),
      );
      if (separateYearCol !== -1) {
        monthCol = separateYearCol + 1;
      } else {
        separateYearCol = headerRow.findIndex((c) => typeof c === "string" && /年|Year/i.test(c));
        if (separateYearCol !== -1) monthCol = separateYearCol + 1;
      }
    }
    let totalCol = headerRow.findIndex((c) => typeof c === "string" && /(総数|Total)/.test(c));
    if (totalCol === -1) totalCol = 4;
    let currentYear = 0;
    for (let i = headerIndex + 2; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      const yearCell = row[yearCol] || row[separateYearCol] || row[0];
      const yearStr = typeof yearCell === "string" ? yearCell.trim() : "";
      if (yearStr) {
        const yearMatch = yearStr.match(/(\d{4})|(\d+)年/);
        if (yearMatch) {
          if (yearMatch[1]) {
            currentYear = parseInt(yearMatch[1], 10);
          } else if (yearMatch[2]) {
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
  } catch (error) {
    console.error("Error loading population data:", error);
    return map;
  }
}

function maybeCache(fn: any, key: string, opts?: any) {
  if (process.env.VITEST || process.env.JEST_WORKER_ID || process.env.NODE_ENV === "test")
    return fn;
  try {
    if (typeof unstable_cache === "function") {
      return unstable_cache(fn, [key], opts);
    }
  } catch (error) {
    console.error("maybeCache unstable_cache error:", error);
    return fn;
  }
  return fn;
}

export const loadPopulationData = maybeCache(_loadPopulationData, "population-data", {
  revalidate: 3600,
});

async function _loadTotalEarningData(): Promise<CpiData[]> {
  const contractualPath = path.join(process.cwd(), "public/contractual_earnings.csv");
  const scheduledPath = path.join(process.cwd(), "public/scheduled_earnings.csv");
  const totalPath = path.join(process.cwd(), "public/total_earning.csv");
  const hoursPath = path.join(process.cwd(), "public/total_worked_hours.csv");
  const employmentPath = path.join(process.cwd(), "public/employment_indices.csv");
  if (
    !fs.existsSync(contractualPath) ||
    !fs.existsSync(scheduledPath) ||
    !fs.existsSync(totalPath)
  ) {
    console.error("Essential earnings data files not found");
    return [];
  }
  const parseIndexSection = (content: string) => {
    const parsed = Papa.parse<string[]>(content, { header: false, skipEmptyLines: false });
    const rows = parsed.data;
    const startIndex = rows.findIndex(
      (row) => (row[0]?.trim() === "年" || row[0]?.trim() === "year") && row[8]?.trim() === "１月",
    );
    if (startIndex === -1) return new Map<string, number>();
    const map = new Map<string, number>();
    for (let i = startIndex + 2; i < rows.length; i++) {
      const row = rows[i];
      const year = row[0]?.trim();
      if (year && year.includes("毎月勤労統計調査")) break;
      if (!year || !/^\d{4}$/.test(year)) continue;
      const yearNum = parseInt(year, 10);
      if (yearNum < 2004) continue;
      for (let m = 1; m <= 12; m++) {
        const val = row[m + 7];
        if (val && val !== "-" && val.trim() !== "") {
          const num = parseFloat(val.trim().replace(/,/g, ""));
          if (!isNaN(num)) map.set(`${year}年${m}月`, num);
        }
      }
    }
    return map;
  };
  try {
    const contractualMap = parseIndexSection(fs.readFileSync(contractualPath, "utf8"));
    const scheduledMap = parseIndexSection(fs.readFileSync(scheduledPath, "utf8"));
    const totalMap = parseIndexSection(fs.readFileSync(totalPath, "utf8"));
    const hoursMap = fs.existsSync(hoursPath)
      ? parseIndexSection(fs.readFileSync(hoursPath, "utf8"))
      : new Map<string, number>();
    const employmentMap = fs.existsSync(employmentPath)
      ? parseIndexSection(fs.readFileSync(employmentPath, "utf8"))
      : new Map<string, number>();
    let factorScheduled = 1;
    let factorContractual = 1;
    const honMksPath = path.join(process.cwd(), "public/hon-mks202512.csv");
    if (fs.existsSync(honMksPath)) {
      const content = fs.readFileSync(honMksPath, "utf8");
      const parsed = Papa.parse<string[]>(content, { header: false, skipEmptyLines: false });
      const tRow = parsed.data.find((row) => row[0] === "T" && row[1] === "T" && row[2] === "T");
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
    }
    const keys = new Set<string>([
      ...contractualMap.keys(),
      ...scheduledMap.keys(),
      ...totalMap.keys(),
      ...hoursMap.keys(),
      ...employmentMap.keys(),
    ]);
    const populationDataMap = await loadPopulationData();
    const cpiData = await loadCpiData();
    const cpiMap = new Map<string, number>();
    cpiData.forEach((d: any) => {
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
        sumPop += findPopulationTotal(ym) || 0;
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
  } catch (error) {
    console.error("Error loading earnings components:", error);
    return [];
  }
}

export const loadTotalEarningData = maybeCache(_loadTotalEarningData, "earnings-data", {
  revalidate: 3600,
});

async function _loadCtiData(): Promise<CpiData[]> {
  const ctiFilePath = path.join(process.cwd(), "public/cti_data.csv");
  const ctiSupportNominalPath = path.join(process.cwd(), "public/cti_support_nominal.csv");
  const ctiSupportRealPath = path.join(process.cwd(), "public/cti_support_real.csv");
  if (!fs.existsSync(ctiFilePath)) {
    console.error("CTI data file not found");
    return [];
  }
  const supportMap = new Map<string, number>();
  const supportMapReal = new Map<string, number>();

  const loadSupportMap = (filePath: string, targetMap: Map<string, number>) => {
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, "utf8");
        const parsed = Papa.parse<string[]>(content, { header: false, skipEmptyLines: false });
        const rows = (parsed.data || []) as string[][];
        const headerIndex = rows.findIndex(
          (r) =>
            Array.isArray(r) && r.some((c) => typeof c === "string" && /民間最終消費支出/.test(c)),
        );
        if (headerIndex !== -1) {
          const header = rows[headerIndex].map((c) => (typeof c === "string" ? c.trim() : c));
          const ymIndex = header.indexOf("時間軸（四半期）");
          // CSVのヘッダー名は「民間最終消費支出」のままであると想定
          const valueIndex = header.findIndex((h) => h === "民間最終消費支出");
          rows.slice(headerIndex + 1).forEach((row) => {
            const ym = row[ymIndex];
            const valStr =
              typeof row[valueIndex] === "string"
                ? row[valueIndex].trim().replace(/,/g, "")
                : String(row[valueIndex]);
            const num = parseFloat(valStr);
            if (ym && !isNaN(num)) targetMap.set(ym, num);
          });
        }
      } catch (err) {
        console.error(`Error loading support file ${filePath}:`, err);
      }
    }
  };

  loadSupportMap(ctiSupportNominalPath, supportMap);
  loadSupportMap(ctiSupportRealPath, supportMapReal);

  try {
    const ctiContent = fs.readFileSync(ctiFilePath, "utf8");
    const parsed = Papa.parse<string[]>(ctiContent, { header: false, skipEmptyLines: false });
    const rows = (parsed.data || []) as string[][];
    const headerIndex = rows.findIndex(
      (r) =>
        Array.isArray(r) &&
        r.some(
          (c) =>
            typeof c === "string" && (c.trim() === "月" || c.trim().includes("消費支出（名目）")),
        ),
    );
    if (headerIndex === -1) {
      console.error("CTI header not found");
      return [];
    }
    const header = rows[headerIndex].map((c) => c.trim());
    const dataRows = rows.slice(headerIndex + 1);
    const mapped = dataRows.map((row) => {
      const obj: Record<string, string | number> = {};
      header.forEach((h, i) => {
        let val: string | number = row[i];
        if (typeof val === "string") {
          const trimmedVal = val.trim();
          if (h !== "月" && h !== "年月") {
            const numValue = trimmedVal.replace(/,/g, "");
            if (numValue === "-") val = 0;
            else {
              const num = parseFloat(numValue);
              val = isNaN(num) ? 0 : num;
            }
          } else {
            val = trimmedVal;
          }
        }
        obj[h] = val;
      });
      if (typeof obj["月"] === "string" && !obj.年月) obj.年月 = obj["月"];
      // merge support value if available
      const ymStr = typeof obj.年月 === "string" ? obj.年月.trim() : String(obj.年月);
      const m = ymStr.match(/^(\d{4})年0?(\d{1,2})月/);
      if (m) {
        const year = m[1];
        const month = parseInt(m[2], 10);
        const q = Math.ceil(month / 3);
        const qStart = (q - 1) * 3 + 1;
        const qEnd = q * 3;
        const normYm = `${year}年${qStart}～${qEnd}月期`;
        if (supportMap.has(normYm)) {
          obj["民間最終消費支出（名目）"] = supportMap.get(normYm) as number;
        } else {
          obj["民間最終消費支出（名目）"] = 0;
        }
        if (supportMapReal.has(normYm)) {
          obj["民間最終消費支出（実質）"] = supportMapReal.get(normYm) as number;
        } else {
          obj["民間最終消費支出（実質）"] = 0;
        }
      } else {
        obj["民間最終消費支出（名目）"] = 0;
        obj["民間最終消費支出（実質）"] = 0;
      }

      // 差分計算: 「その他の消費支出」を計算する
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

      return obj as unknown as CpiData;
    });

    // 2005年～2016年の不足データを補完する
    const existingMonths = new Set(mapped.map((r) => r.年月));
    for (let y = 2005; y <= 2016; y++) {
      for (let m = 1; m <= 12; m++) {
        const ym = `${y}年${m}月`;
        if (!existingMonths.has(ym)) {
          const q = Math.ceil(m / 3);
          const qStart = (q - 1) * 3 + 1;
          const qEnd = q * 3;
          const normYm = `${y}年${qStart}～${qEnd}月期`;

          const dummyRow: CpiData = { 年月: ym } as CpiData;
          header.forEach((h) => {
            if (h !== "年月" && h !== "月") dummyRow[h as keyof CpiData] = 0;
          });

          if (supportMap.has(normYm)) {
            dummyRow["民間最終消費支出（名目）"] = supportMap.get(normYm) as number;
          } else {
            dummyRow["民間最終消費支出（名目）"] = 0;
          }
          if (supportMapReal.has(normYm)) {
            dummyRow["民間最終消費支出（実質）"] = supportMapReal.get(normYm) as number;
          } else {
            dummyRow["民間最終消費支出（実質）"] = 0;
          }

          // 差分計算: 「その他の消費支出」を計算する（補完行用）
          const nominalTotal = (dummyRow["消費支出（名目）"] as number) || 0;
          const realTotal = (dummyRow["消費支出（実質）"] as number) || 0;

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
          nominalKeysList.forEach(
            (k) => (nominalSum += (dummyRow[k as keyof CpiData] as number) || 0),
          );
          dummyRow["その他の消費支出（名目）"] = Math.max(0, nominalTotal - nominalSum);

          let realSum = 0;
          realKeysList.forEach((k) => (realSum += (dummyRow[k as keyof CpiData] as number) || 0));
          dummyRow["その他の消費支出（実質）"] = Math.max(0, realTotal - realSum);

          mapped.push(dummyRow);
        }
      }
    }

    // データを年月順にソート
    mapped.sort((a, b) => {
      const ma = String(a.年月).match(/^(\d{4})年(\d{1,2})月/);
      const mb = String(b.年月).match(/^(\d{4})年(\d{1,2})月/);
      if (a["民間最終消費支出（名目）"] === undefined) a["民間最終消費支出（名目）"] = 0;
      if (b["民間最終消費支出（名目）"] === undefined) b["民間最終消費支出（名目）"] = 0;
      if (!ma || !mb) return 0;
      const ay = parseInt(ma[1], 10);
      const am = parseInt(ma[2], 10);
      const by = parseInt(mb[1], 10);
      const bm = parseInt(mb[2], 10);
      return ay !== by ? ay - by : am - bm;
    });

    return mapped;
  } catch (error) {
    console.error("Error loading CTI data:", error);
    return [];
  }
}

export const loadCtiData = maybeCache(_loadCtiData, "cti-data", { revalidate: 3600 });

async function _loadCpiData(): Promise<CpiData[]> {
  const cpiFilePath = path.join(process.cwd(), "public/cpi_data.csv");
  const contributionFilePath = path.join(process.cwd(), "public/contribution.csv");
  try {
    if (fs.existsSync(cpiFilePath) && fs.existsSync(contributionFilePath)) {
      const cpiContent = fs.readFileSync(cpiFilePath, "utf8");
      const contributionContent = fs.readFileSync(contributionFilePath, "utf8");
      const contributionLines = contributionContent.split("\n");
      const categoryLine = contributionLines.find((line) => line.startsWith("類・品目"));
      const weightLine = contributionLines.find((line) => line.startsWith("ウエイト"));
      const weights: Record<string, number> = {};
      if (categoryLine && weightLine) {
        const categories = categoryLine.split(",");
        const weightValues = weightLine.split(",");
        categories.forEach((cat, i) => {
          const trimmedCat = cat.trim();
          const weight = parseFloat(weightValues[i]);
          if (trimmedCat && !isNaN(weight)) weights[trimmedCat] = weight;
        });
      }
      const { data } = Papa.parse<CpiData>(cpiContent, {
        dynamicTyping: true,
        header: true,
        skipEmptyLines: true,
      });
      const rawCleanedData = (data as CpiData[])
        .filter((row) => {
          if (!row["年月"]) return false;
          const yearMatch = (row["年月"] as string).match(/^(\d{4})年/);
          const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;
          return year >= 2004;
        })
        .map((row) => {
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
          const autoRelated =
            typeof newRow["自動車等関係費"] === "number" ? newRow["自動車等関係費"] : 0;
          newRow["交通・自動車等関係費"] = transport + autoRelated;
          delete newRow["教養娯楽サービス"];
          delete newRow["教養娯楽用品"];
          delete newRow["交通"];
          delete newRow["自動車等関係費"];
          return newRow;
        });
      return rawCleanedData;
    } else {
      console.error("Data files not found");
      return [];
    }
  } catch (error) {
    console.error("Error loading CPI data:", error);
    return [];
  }
}

export const loadCpiData = maybeCache(_loadCpiData, "cpi-data", { revalidate: 3600 });
