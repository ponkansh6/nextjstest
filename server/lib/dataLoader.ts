import fs from "fs";
import Papa from "papaparse";
import { unstable_cache } from "next/cache";
import type { CpiData } from "@/types";
import {
  parseCsvFile,
  buildPopulationFilePath,
  buildEarningsFilePaths,
  buildCtiFilePaths,
  buildCpiFilePaths,
  parseIndexSection,
} from "./data-io";
import { processPopulationData } from "./data-processor";
import {
  calculateSmoothedTotal,
  applyMovingAverage,
  applyResidualMovingAverage,
  calculateRawResidual,
  calculateAdjustedMetric,
} from "./serverCalculations";

const testCache = new Map<string, any>();

export function clearTestCache() {
  testCache.clear();
}

function maybeCache(fn: any, key: string, opts?: any) {
  if (process.env.VITEST || process.env.JEST_WORKER_ID || process.env.NODE_ENV === "test") {
    return async (...args: any[]) => {
      const cacheKey = key + JSON.stringify(args);
      if (testCache.has(cacheKey)) return testCache.get(cacheKey);
      const result = await fn(...args);
      testCache.set(cacheKey, result);
      return result;
    };
  }
  try {
    if (typeof unstable_cache === "function") return unstable_cache(fn, [key], opts);
  } catch (error) {
    console.error("maybeCache unstable_cache error:", error);
    return fn;
  }
  return fn;
}

async function _loadPopulationData(): Promise<
  Map<string, { total: number; index: number; ma: number }>
> {
  const filePath = buildPopulationFilePath();
  const rows = await parseCsvFile<string[][]>(filePath);
  if (rows.length === 0) return new Map();

  let headerIndex = rows.findIndex((row) =>
    row.some(
      (cell) =>
        typeof cell === "string" &&
        (/^\s*年\s*月\s*$/.test(cell.trim()) || /Year\s*and\s*month/i.test(cell)),
    ),
  );
  if (headerIndex === -1) {
    headerIndex = rows.findIndex((row) =>
      row.some((cell) => typeof cell === "string" && /年/.test(cell) && /月/.test(cell)),
    );
  }
  if (headerIndex === -1) return new Map();

  const headerRow = rows[headerIndex];
  const yearCol = headerRow.findIndex((c) => typeof c === "string" && /年\s*月/.test(c));
  let separateYearCol = -1;
  let monthCol = -1;
  if (yearCol === -1) {
    separateYearCol = headerRow.findIndex((c) => typeof c === "string" && c.trim().endsWith("年"));
    if (separateYearCol !== -1) monthCol = separateYearCol + 1;
    else {
      separateYearCol = headerRow.findIndex((c) => typeof c === "string" && /年|Year/i.test(c));
      if (separateYearCol !== -1) monthCol = separateYearCol + 1;
    }
  }
  const totalCol =
    headerRow.findIndex((c) => typeof c === "string" && /(総数|Total)/.test(c)) !== -1
      ? headerRow.findIndex((c) => typeof c === "string" && /(総数|Total)/.test(c))
      : 4;

  return processPopulationData(rows, headerIndex, yearCol, separateYearCol, monthCol, totalCol);
}

async function _loadTotalEarningData(): Promise<CpiData[]> {
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
  const populationDataMap = await _loadPopulationData();
  const cpiData = await _loadCpiData();
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

async function _loadCtiData(): Promise<CpiData[]> {
  const paths = buildCtiFilePaths();
  const ctiContent = fs.readFileSync(paths.main, "utf8");
  const nominalSupportContent = fs.readFileSync(paths.supportNominal, "utf8");
  const realSupportContent = fs.readFileSync(paths.supportReal, "utf8");

  const supportMap = new Map<string, number>();
  const supportMapReal = new Map<string, number>();

  const loadSupportMap = (content: string, targetMap: Map<string, number>) => {
    const rows = Papa.parse<string[]>(content, { header: false, skipEmptyLines: false }).data;
    const headerIndex = rows.findIndex(
      (row: any) =>
        Array.isArray(row) &&
        row.some((c: any) => typeof c === "string" && /民間最終消費支出/.test(c)),
    );
    if (headerIndex === -1) return;
    const header = rows[headerIndex].map((c: any) => (typeof c === "string" ? c.trim() : c));
    const ymIndex = header.indexOf("時間軸（四半期）");
    const valueIndex = header.findIndex((h: any) => h === "民間最終消費支出");
    rows.slice(headerIndex + 1).forEach((row: any) => {
      const ym = row[ymIndex];
      const valStr =
        typeof row[valueIndex] === "string"
          ? row[valueIndex].trim().replace(/,/g, "")
          : String(row[valueIndex]);
      const num = parseFloat(valStr);
      if (ym && !isNaN(num)) targetMap.set(ym, num);
    });
  };

  loadSupportMap(nominalSupportContent, supportMap);
  loadSupportMap(realSupportContent, supportMapReal);

  const rows = Papa.parse<string[]>(ctiContent, { header: false, skipEmptyLines: false }).data;
  const headerIndex = rows.findIndex(
    (row: any) =>
      Array.isArray(row) &&
      row.some(
        (c: any) =>
          typeof c === "string" && (c.trim() === "月" || c.trim().includes("消費支出（名目）")),
      ),
  );
  if (headerIndex === -1) return [];
  const header = rows[headerIndex].map((c: any) => c.trim());
  const dataRows = rows.slice(headerIndex + 1);
  const mapped = dataRows
    .map((row: any) => {
      const obj: Record<string, string | number> = {};
      header.forEach((h: any, i: any) => {
        let val: string | number = row[i];
        if (typeof val === "string") {
          const trimmedVal = val.trim();
          if (h !== "月" && h !== "年月") {
            const numValue = trimmedVal.replace(/,/g, "");
            val = numValue === "-" ? 0 : isNaN(parseFloat(numValue)) ? 0 : parseFloat(numValue);
          } else val = trimmedVal;
        }
        obj[h] = val;
      });
      if (typeof obj["月"] === "string" && !obj.年月) obj.年月 = obj["月"];
      const ymStr = String(obj.年月 || "").trim();
      const m = ymStr.match(/^(\d{4})年0?(\d{1,2})月/);
      if (m) {
        const year = m[1];
        const month = parseInt(m[2], 10);
        const q = Math.ceil(month / 3);
        const normYm = `${year}年${(q - 1) * 3 + 1}～${q * 3}月期`;
        obj["民間最終消費支出（名目）"] = supportMap.get(normYm) ?? 0;
        obj["民間最終消費支出（実質）"] = supportMapReal.get(normYm) ?? 0;
      } else {
        obj["民間最終消費支出（名目）"] = 0;
        obj["民間最終消費支出（実質）"] = 0;
      }
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
    })
    .filter((row) => {
      if (!row.年月) return false;
      const m = String(row.年月).match(/^(\d{4})年/);
      return m ? parseInt(m[1], 10) >= 2005 : false;
    });

  const existingMonths = new Set(mapped.map((r) => r.年月));
  for (let y = 2005; y <= 2016; y++) {
    for (let m = 1; m <= 12; m++) {
      const ym = `${y}年${m}月`;
      if (!existingMonths.has(ym)) {
        const q = Math.ceil(m / 3);
        const normYm = `${y}年${(q - 1) * 3 + 1}～${q * 3}月期`;
        const dummyRow: any = { 年月: ym };
        header.forEach((h: any) => {
          if (h !== "年月" && h !== "月") dummyRow[h] = 0;
        });
        dummyRow["民間最終消費支出（名目）"] = supportMap.get(normYm) ?? 0;
        dummyRow["民間最終消費支出（実質）"] = supportMapReal.get(normYm) ?? 0;
        const nominalTotal = dummyRow["消費支出（名目）"] || 0;
        const realTotal = dummyRow["消費支出（実質）"] || 0;
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
        nominalKeysList.forEach((k) => (nominalSum += dummyRow[k] || 0));
        dummyRow["その他の消費支出（名目）"] = Math.max(0, nominalTotal - nominalSum);
        let realSum = 0;
        realKeysList.forEach((k) => (realSum += dummyRow[k] || 0));
        dummyRow["その他の消費支出（実質）"] = Math.max(0, realTotal - realSum);
        mapped.push(dummyRow as any);
      }
    }
  }
  mapped.sort((a, b) => {
    const ma = String(a.年月).match(/^(\d{4})年(\d{1,2})月/);
    const mb = String(b.年月).match(/^(\d{4})年(\d{1,2})月/);
    if (!ma || !mb) return 0;
    const ay = parseInt(ma[1], 10);
    const am = parseInt(ma[2], 10);
    const by = parseInt(mb[1], 10);
    const bm = parseInt(mb[2], 10);
    return ay !== by ? ay - by : am - bm;
  });
  return mapped;
}

async function _loadCpiData(): Promise<CpiData[]> {
  const paths = buildCpiFilePaths();
  if (!fs.existsSync(paths.main) || !fs.existsSync(paths.contribution)) {
    console.error("Data files not found");
    return [];
  }
  const cpiContent = fs.readFileSync(paths.main, "utf8");
  const contributionContent = fs.readFileSync(paths.contribution, "utf8");
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
  return (data as CpiData[])
    .filter((row) => {
      if (!row["年月"]) return false;
      const yearMatch = (row["年月"] as string).match(/^(\d{4})年/);
      return yearMatch ? parseInt(yearMatch[1], 10) >= 2004 : false;
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
}

export const loadPopulationData = maybeCache(_loadPopulationData, "population-data", {
  revalidate: 3600,
});
export const loadTotalEarningData = maybeCache(_loadTotalEarningData, "earnings-data", {
  revalidate: 3600,
});
export const loadCtiData = maybeCache(_loadCtiData, "cti-data", { revalidate: 3600 });
export const loadCpiData = maybeCache(_loadCpiData, "cpi-data", { revalidate: 3600 });
