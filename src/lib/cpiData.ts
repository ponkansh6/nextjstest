import fs from "fs";
import path from "path";
import Papa from "papaparse";
import type { CpiData } from "../app/page";

/**
 * 給与指標を特定の分母（労働者数や人口など）で割り、基準年（2020年）を100としてスケーリングします。
 */
export function calculateAdjustedMetric(
  totalEarnings: number,
  denominator: number,
  scalingFactor: number,
): number {
  if (denominator <= 0) {
    return 0;
  }
  return (totalEarnings / denominator) * scalingFactor;
}

export const calculateCategorySum = (
  data: CpiData[],
  year: number,
  month: number,
  hiddenKeys: string[] = [],
  stackedKeys: string[] = [
    "外食以外食料",
    "外食",
    "住居",
    "光熱・水道",
    "家具・家事用品",
    "被服及び履物",
    "保健医療",
    "交通",
    "自動車等関係費",
    "通信",
    "教育",
    "教養娯楽用品",
    "教養娯楽サービス",
    "諸雑費",
  ],
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

export async function loadPopulationData(): Promise<
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
    const parsed = Papa.parse<string[]>(content, {
      header: false,
      skipEmptyLines: false,
    });

    const rows = parsed.data as string[][];

    // Find the header row containing year/month information
    let headerIndex = rows.findIndex((row) =>
      row.some(
        (cell) =>
          typeof cell === "string" &&
          (/^\s*年\s*月\s*$/.test(cell.trim()) || /Year\s*and\s*month/i.test(cell)),
      ),
    );

    if (headerIndex === -1) {
      // Try a looser match: find a row that contains both "年" and "月" anywhere
      const fallbackIndex = rows.findIndex((row) =>
        row.some((cell) => typeof cell === "string" && /年/.test(cell) && /月/.test(cell)),
      );
      if (fallbackIndex === -1) {
        return map;
      }
      // Use the fallback index found
      headerIndex = fallbackIndex;
    }

    // Determine which columns contain year/month and total population
    const headerRow = rows[headerIndex];
    // If header contains a single cell like "年　月", find its column index
    const yearCol = headerRow.findIndex((c) => typeof c === "string" && /年\s*月/.test(c));
    let separateYearCol = -1;
    let monthCol = -1;
    if (yearCol === -1) {
      // Look for separate "年" and "月" columns
      separateYearCol = headerRow.findIndex(
        (c) => typeof c === "string" && c.trim().endsWith("年"),
      );
      if (separateYearCol !== -1) {
        // Assume month is the next column
        monthCol = separateYearCol + 1;
      } else {
        // Fallback: try to find any column that looks like "年" or "Year"
        separateYearCol = headerRow.findIndex((c) => typeof c === "string" && /年|Year/i.test(c));
        if (separateYearCol !== -1) {
          monthCol = separateYearCol + 1;
        }
      }
    }

    // Find total population column by header labels ("総数" or "Total")
    let totalCol = headerRow.findIndex((c) => typeof c === "string" && /(総数|Total)/.test(c));
    // Fallback to conventional positions if not found
    if (totalCol === -1) {
      totalCol = 4;
    }

    // Extract data from rows after the header. Start a couple of lines after header to skip subheaders
    let currentYear = 0;
    for (let i = headerIndex + 2; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) {
        continue;
      }

      // Determine year value from either single-column or era format
      const yearCell = row[yearCol] || row[separateYearCol] || row[0];
      const yearStr = typeof yearCell === "string" ? yearCell.trim() : "";

      if (yearStr) {
        const yearMatch = yearStr.match(/(\d{4})|(\d+)年/);
        if (yearMatch) {
          if (yearMatch[1]) {
            currentYear = parseInt(yearMatch[1], 10);
          } else if (yearMatch[2]) {
            const eraYear = parseInt(yearMatch[2], 10);
            if (yearStr.includes("令和")) {
              currentYear = 2018 + eraYear;
            } else if (yearStr.includes("平成")) {
              currentYear = 1988 + eraYear;
            } else if (yearStr.includes("昭和")) {
              currentYear = 1925 + eraYear;
            } else {
              currentYear = eraYear;
            } // Best effort
          }
        }
      }

      if (currentYear < 2004) {
        continue;
      }

      // Month: prefer the dedicated month column if present, otherwise fallback to column 1
      const monthCell = row[monthCol] ?? row[1];
      const monthStr = typeof monthCell === "string" ? monthCell.trim() : "";
      const monthMatch = monthStr.match(/(\d+)月/);
      if (!monthMatch) {
        continue;
      }
      const month = parseInt(monthMatch[1], 10);

      const popCell = row[totalCol] ?? row[4] ?? row[5];
      const popStr = typeof popCell === "string" ? popCell.trim().replace(/,/g, "") : "";

      if (!popStr || popStr === "-" || popStr === "…") {
        continue;
      }

      const pop = parseFloat(popStr);
      if (isNaN(pop)) {
        continue;
      }

      const ym = `${currentYear}年${month}月`;
      map.set(ym, { index: 0, ma: 0, total: pop * 10000 }); // Data is in ten-thousands
    }

    // Calculate 2020 average as base (= 100)
    const year2020 = [...map.entries()]
      .filter(([_]) => _.startsWith("2020年"))
      .map(([, data]) => data.total);

    if (year2020.length === 0) {
      return map;
    }

    const avg2020 = year2020.reduce((a, b) => a + b, 0) / year2020.length;
    const indexFactor = avg2020 > 0 ? 100 / avg2020 : 1;

    // Apply indexing (2020 avg = 100) and calculate 12-month moving average
    const entries = [...map.entries()].toSorted((a, b) => {
      const ma = a[0].match(/^(\d{4})年(\d{1,2})月/);
      const mb = b[0].match(/^(\d{4})年(\d{1,2})月/);
      if (!ma || !mb) {
        return 0;
      }
      const ay = parseInt(ma[1], 10);
      const am = parseInt(ma[2], 10);
      const by = parseInt(mb[1], 10);
      const bm = parseInt(mb[2], 10);
      return ay !== by ? ay - by : am - bm;
    });

    // Apply index to all entries
    entries.forEach(([, data]) => {
      data.index = data.total * indexFactor;
    });

    // Calculate 12-month moving average
    entries.forEach((_entry, index) => {
      let sum = 0;
      let count = 0;
      for (let i = Math.max(0, index - 11); i <= index; i++) {
        sum += entries[i][1].index;
        count++;
      }
      _entry[1].ma = count > 0 ? sum / count : 0;
    });

    return map;
  } catch (error) {
    console.error("Error loading population data:", error);
    return map;
  }
}

export async function loadTotalEarningData(): Promise<CpiData[]> {
  // 既存の "total_earning.csv" ではなく、きまって支給する給与と所定内給与のCSVを読み込む
  const contractualPath = path.join(process.cwd(), "public/contractual_earnings.csv");
  const scheduledPath = path.join(process.cwd(), "public/scheduled_earnings.csv");

  if (!fs.existsSync(contractualPath) || !fs.existsSync(scheduledPath)) {
    console.error("Contractual or scheduled earnings data file not found");
    return [];
  }

  const parseIndexSection = (content: string) => {
    const parsed = Papa.parse<string[]>(content, {
      header: false,
      skipEmptyLines: false,
    });
    const rows = parsed.data;
    const startIndex = rows.findIndex(
      (row) => (row[0]?.trim() === "年" || row[0]?.trim() === "year") && row[8]?.trim() === "１月",
    );
    if (startIndex === -1) {
      return new Map<string, number>();
    }

    const map = new Map<string, number>();
    for (let i = startIndex + 2; i < rows.length; i++) {
      const row = rows[i];
      const year = row[0]?.trim();
      if (year && year.includes("毎月勤労統計調査")) {
        break;
      }
      if (!year || !/^\d{4}$/.test(year)) {
        continue;
      }
      const yearNum = parseInt(year, 10);
      if (yearNum < 2004) {
        continue;
      }

      for (let m = 1; m <= 12; m++) {
        const val = row[m + 7];
        if (val && val !== "-" && val.trim() !== "") {
          const numValue = val.trim().replace(/,/g, "");
          const num = parseFloat(numValue);
          if (!isNaN(num)) {
            map.set(`${year}年${m}月`, num);
          }
        }
      }
    }
    return map;
  };

  try {
    const contractualContent = fs.readFileSync(contractualPath, "utf8");
    const scheduledContent = fs.readFileSync(scheduledPath, "utf8");

    const contractualMap = parseIndexSection(contractualContent);
    const scheduledMap = parseIndexSection(scheduledContent);
    const totalContent = fs.readFileSync(
      path.join(process.cwd(), "public/total_earning.csv"),
      "utf8",
    );
    const totalMap = parseIndexSection(totalContent);

    const hoursPath = path.join(process.cwd(), "public/total_worked_hours.csv");
    const hoursMap = fs.existsSync(hoursPath)
      ? parseIndexSection(fs.readFileSync(hoursPath, "utf8"))
      : new Map<string, number>();

    const employmentPath = path.join(process.cwd(), "public/employment_indices.csv");
    const employmentMap = fs.existsSync(employmentPath)
      ? parseIndexSection(fs.readFileSync(employmentPath, "utf8"))
      : new Map<string, number>();

    // Hon-mks202601.csv から令和8年1月（2026年1月）のT行実額を取得
    let factorScheduled = 1;
    let factorContractual = 1;
    const honMksPath = path.join(process.cwd(), "public/hon-mks202512.csv");
    if (fs.existsSync(honMksPath)) {
      const content = fs.readFileSync(honMksPath, "utf8");
      const parsed = Papa.parse<string[]>(content, {
        header: false,
        skipEmptyLines: false,
      });
      // T,T,T で始まる行を探す
      const tRow = parsed.data.find((row) => row[0] === "T" && row[1] === "T" && row[2] === "T");
      if (tRow) {
        // [12]:総額, [13]:きまって支給する給与, [14]:所定内給与
        const totalReal = parseFloat(tRow[12].replace(/,/g, ""));
        const contractualReal = parseFloat(tRow[13].replace(/,/g, ""));
        const scheduledReal = parseFloat(tRow[14].replace(/,/g, ""));

        // 2025年12月の各指数を取得
        const ym202512 = "2025年12月";
        const totalIdx = totalMap.get(ym202512) || 0;
        const contractualIdx = contractualMap.get(ym202512) || 0;
        const scheduledIdx = scheduledMap.get(ym202512) || 0;

        if (totalReal !== 0 && totalIdx !== 0 && contractualIdx !== 0 && scheduledIdx !== 0) {
          // 指数1ポイントあたりの実額を計算し、現金給与総額の指数スケールに合わせる
          const baseUnit = totalReal / totalIdx;
          factorScheduled = scheduledReal / scheduledIdx / baseUnit;
          factorContractual = contractualReal / contractualIdx / baseUnit;
        } else if (totalReal !== 0) {
          // 指数が取得できない場合のフォールバック
          factorScheduled = scheduledReal / totalReal;
          factorContractual = contractualReal / totalReal;
        }
      }
    }

    // マージして配列化
    const keys = new Set<string>([
      ...[...contractualMap.keys()],
      ...[...scheduledMap.keys()],
      ...[...totalMap.keys()],
      ...[...hoursMap.keys()],
      ...[...employmentMap.keys()],
    ]);

    // 人口データを読み込み
    const populationDataMap = await loadPopulationData();

    // CPIデータを読み込み（残差計算用）
    const cpiData = await loadCpiData();
    const cpiMap = new Map<string, number>();
    cpiData.forEach((d) => {
      if (typeof d.総合 === "number") {
        cpiMap.set(d.年月, d.総合);
      }
    });

    // 2020年の平均を100とするためのベース計算
    const year2020 = [...keys].filter((ym) => ym.startsWith("2020年"));
    const hourly2020 =
      year2020.reduce((acc, ym) => {
        const h = hoursMap.get(ym) ?? 0;
        const t = totalMap.get(ym) ?? 0;
        const val = h > 0 ? t / h : 0;
        return acc + val;
      }, 0) / (year2020.length || 1);

    // Helper to tolerate different month zero-padding between datasets
    const findPopulationTotal = (ym: string): number | undefined => {
      const exact = populationDataMap.get(ym)?.total;
      if (exact) {
        return exact;
      }
      // Try zero-padded month (e.g., 2020年01月)
      const m = ym.match(/^(\d{4})年0?(\d{1,2})月$/);
      if (!m) {
        return undefined;
      }
      const padded = `${m[1]}年${String(m[2]).padStart(2, "0")}月`;
      const unpadded = `${m[1]}年${parseInt(m[2], 10)}月`;
      return populationDataMap.get(padded)?.total ?? populationDataMap.get(unpadded)?.total;
    };

    // 15歳以上国民一人当たり給与の計算用に2020年の「(給与×雇用)/人口」のベース比率を算出
    const perCapitaBase2020 = (() => {
      const year2020Keys = [...keys].filter((ym) => ym.startsWith("2020年"));
      if (year2020Keys.length === 0) {
        console.warn("Warning: 2020年データが給与データに見つかりません");
      }

      const ratios = year2020Keys
        .map((ym) => {
          const t = totalMap.get(ym) ?? 0;
          const e = employmentMap.get(ym) ?? 0;
          const p = findPopulationTotal(ym) ?? 0;
          return p > 0 ? (t * e) / p : 0;
        })
        .filter((r) => r > 0);

      const avgRatio = ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;

      console.log(
        `Calculation Stats: 2020Keys=${year2020Keys.length}, validRatios=${ratios.length}, avgRatio=${avgRatio}`,
      );
      return avgRatio;
    })();

    const hourlyFactor = hourly2020 > 0 ? 100 / hourly2020 : 1;
    const popFactor = perCapitaBase2020 > 0 ? 100 / perCapitaBase2020 : 1;

    const result: CpiData[] = [...keys]
      .map((ym) => {
        const contractualVal = contractualMap.get(ym) ?? 0;
        const scheduledVal = scheduledMap.get(ym) ?? 0;
        const totalVal = totalMap.get(ym) ?? 0;

        const finalTotal = totalVal;
        const finalContractual = contractualVal * factorContractual;
        const finalScheduled = scheduledVal * factorScheduled;

        return {
          年月: ym,
          // finalScheduled は所定内の実額に相当する値（尺度を後で調整）
          所定内給与: finalScheduled,
          // 一時的に契約上の給与実額を保持しておき、移動平均は契約給与に対して行ってから差分で所定外を算出する
          _契約給与: finalContractual,
          所定外給与: Math.max(0, finalContractual - finalScheduled),
          特別給与: Math.max(0, finalTotal - finalContractual),
          総合: 0,
        } as unknown as CpiData;
      })
      .toSorted((a, b) => {
        const ma = a.年月.match(/^(\d{4})年(\d{1,2})月/);
        const mb = b.年月.match(/^(\d{4})年(\d{1,2})月/);
        if (!ma || !mb) {
          return 0;
        }
        const ay = parseInt(ma[1], 10);
        const am = parseInt(ma[2], 10);
        const by = parseInt(mb[1], 10);
        const bm = parseInt(mb[2], 10);
        return ay !== by ? ay - by : am - bm;
      });

    // 12か月移動平均を計算して指標を追加
    // 移動平均の計算には生データを使用するため、計算用に元の結果を保持
    const rawResults = result.map((r) => ({ ...r }));

    // Compute 12-month smoothed series for components where smoothing is desired.
    result.forEach((item, index) => {
      const getMovingAverage = (
        key: keyof CpiData | "hours" | "emp" | "pop" | "cpi",
        isDataKey: boolean = true,
      ) => {
        let sum = 0;
        let count = 0;
        for (let i = Math.max(0, index - 11); i <= index; i++) {
          let val = 0;
          if (isDataKey) {
            val = (rawResults[i][key as keyof CpiData] as number) || 0;
          } else {
            const ym = rawResults[i].年月;
            if (key === "hours") {
              val = hoursMap.get(ym) || 0;
            } else if (key === "emp") {
              val = employmentMap.get(ym) || 0;
            } else if (key === "pop") {
              val = populationDataMap.get(ym)?.total || 0;
            } else if (key === "cpi") {
              val = cpiMap.get(ym) || 0;
            }
          }
          sum += val;
          count++;
        }
        // 指標については、窓内の実際の月数で平均を取る（初期のデータ不足時に過度に小さくならないようにする）。
        const divisor = count; // use actual count of months in the window (<=12)
        return divisor > 0 ? sum / divisor : 0;
      };

      // 移動平均は「特別給与」のみを適用し、所定内給与・所定外給与は生データを利用する
      const smoothedSpecial = getMovingAverage("特別給与");
      const rawScheduled = (rawResults[index]["所定内給与"] as number) || 0;
      const rawContractualTotal = (rawResults[index]["_契約給与"] as number) || 0;

      // 所定内・所定外は生データ（契約給与との差）を使う
      item["所定内給与"] = rawScheduled;
      item["所定外給与"] = Math.max(0, rawContractualTotal - rawScheduled);
      item["特別給与"] = smoothedSpecial;
    });

    // ここで、総合（現金給与総額）の2020年平均が100になるようスケーリングする。
    const totals2020 = result
      .filter((r) => r.年月.startsWith("2020年"))
      .map(
        (r) =>
          Number(r["所定内給与"] || 0) + Number(r["所定外給与"] || 0) + Number(r["特別給与"] || 0),
      );

    const avg2020 =
      totals2020.length > 0 ? totals2020.reduce((a, b) => a + b, 0) / totals2020.length : 0;
    const totalIndexFactor = avg2020 > 0 ? 100 / avg2020 : 1;

    // スケーリングを適用し、派生指標を計算
    result.forEach((item, index) => {
      item["所定内給与"] = Number(item["所定内給与"] || 0) * totalIndexFactor;
      item["所定外給与"] = Number(item["所定外給与"] || 0) * totalIndexFactor;
      item["特別給与"] = Number(item["特別給与"] || 0) * totalIndexFactor;

      const smoothedTotal =
        (item["所定内給与"] || 0) + (item["所定外給与"] || 0) + (item["特別給与"] || 0);
      item["総合"] = smoothedTotal;

      // 12か月移動平均の分母を再計算
      let sumHours = 0;
      let sumEmp = 0;
      let sumPop = 0;
      let count = 0;
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
      item["15歳以上国民一人当たり給与"] = calculateAdjustedMetric(
        smoothedTotal * smoothedEmp,
        smoothedPop,
        popFactor,
      );

      const rawCpi = cpiMap.get(item.年月) || 0;
      item["残差"] = rawCpi > 0 ? smoothedTotal - rawCpi : 0;
    });

    console.log(
      "Check for gaps or anomalies:",
      result.slice(-5).map((r) => ({
        ma: r["時間当たり給与"],
        perCapita: r["15歳以上国民一人当たり給与"],
        ym: r.年月,
      })),
    );

    return result;
  } catch (error) {
    console.error("Error loading earnings components:", error);
    return [];
  }
}

export async function loadCtiData(): Promise<CpiData[]> {
  const ctiFilePath = path.join(process.cwd(), "public/cti_data.csv");
  if (!fs.existsSync(ctiFilePath)) {
    console.error("CTI data file not found");
    return [];
  }

  try {
    const ctiContent = fs.readFileSync(ctiFilePath, "utf8");
    const parsed = Papa.parse<string[]>(ctiContent, {
      header: false,
      skipEmptyLines: false,
    });

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

    const mapped = dataRows
      .map((row) => {
        const obj: Record<string, string | number> = {};
        header.forEach((h, i) => {
          let val: string | number = row[i];
          if (typeof val === "string") {
            const trimmedVal = val.trim();
            if (h !== "月" && h !== "年月") {
              const numValue = trimmedVal.replace(/,/g, "");
              if (numValue === "-") {
                val = 0;
              } else {
                const num = parseFloat(numValue);
                val = isNaN(num) ? 0 : num;
              }
            } else {
              val = trimmedVal;
            }
          }
          obj[h] = val;
        });
        if (typeof obj["月"] === "string" && !obj.年月) {
          obj.年月 = obj["月"];
        }
        return obj as unknown as CpiData;
      })
      .filter((row) => {
        if (!row.年月) {
          return false;
        }
        const m = String(row.年月).match(/^(\d{4})年/);
        return m ? parseInt(m[1], 10) >= 2005 : false;
      });

    // 名目・実質それぞれの残差計算
    const nominalKeys = [
      "食料（名目）",
      "住居（名目）",
      "光熱・水道（名目）",
      "家具・家事用品（名目）",
      "被服及び履物（名目）",
      "保健医療 （名目）", // CSV上の空白あり
      "保健医療（名目）", // 念のため
      "交通・通信（名目）",
      "教育（名目）",
      "教養娯楽（名目）",
    ];

    mapped.forEach((row) => {
      // 名目の残差計算
      const nominalTotal = (row["消費支出（名目）"] as number) || 0;
      let nominalSum = 0;
      nominalKeys.forEach((k) => {
        if (k !== "その他の消費支出（名目）") {
          nominalSum += (row[k] as number) || 0;
        }
      });
      if (!row["その他の消費支出（名目）"] || row["その他の消費支出（名目）"] === 0) {
        row["その他の消費支出（名目）"] = Math.max(0, nominalTotal - nominalSum);
      }

      // 実質の残差計算
      const realTotal = (row["消費支出（実質）"] as number) || 0;
      const realKeys = nominalKeys.map((k) => k.replace("名目", "実質"));
      let realSum = 0;
      realKeys.forEach((k) => {
        if (k !== "その他の消費支出（実質）") {
          realSum += (row[k] as number) || 0;
        }
      });
      if (!row["その他の消費支出（実質）"] || row["その他の消費支出（実質）"] === 0) {
        row["その他の消費支出（実質）"] = Math.max(0, realTotal - realSum);
      }

      // キー名の変更: その他の消費支出（名目） -> 諸雑費・CPI外支出等
      row["諸雑費・CPI外支出等"] = row["その他の消費支出（名目）"];
      row["諸雑費・CPI外支出等（実質）"] = row["その他の消費支出（実質）"];
      delete row["その他の消費支出（名目）"];
      delete row["その他の消費支出（実質）"];
    });

    return mapped;
  } catch (error) {
    console.error("Error loading CTI data:", error);
    return [];
  }
}

export async function loadCpiData(): Promise<CpiData[]> {
  const cpiFilePath = path.join(process.cwd(), "public/cpi_data.csv");
  const contributionFilePath = path.join(process.cwd(), "public/contribution.csv");

  try {
    if (fs.existsSync(cpiFilePath) && fs.existsSync(contributionFilePath)) {
      const cpiContent = fs.readFileSync(cpiFilePath, "utf8");
      const contributionContent = fs.readFileSync(contributionFilePath, "utf8");

      // ウエイト情報の取得
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
          if (trimmedCat && !isNaN(weight)) {
            weights[trimmedCat] = weight;
          }
        });
      }

      const { data } = Papa.parse<CpiData>(cpiContent, {
        dynamicTyping: true,
        header: true,
        skipEmptyLines: true,
      });

      // データのクリーニング、ウエイトの掛け合わせ、派生データの計算
      const rawCleanedData = (data as CpiData[])
        .filter((row) => {
          if (!row["年月"]) {
            return false;
          }
          const yearMatch = (row["年月"] as string).match(/^(\d{4})年/);
          const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;
          return year >= 2004;
        })
        .map((row) => {
          const newRow: CpiData = { ...row };
          Object.keys(weights).forEach((key) => {
            const value = row[key];
            if (typeof value === "number") {
              // 寄与度 = (指数 * ウエイト) / 10000
              newRow[key] = (value * weights[key]) / 10_000;
            }
          });
          // 外食以外食料 = 食料 - 外食 をサーバー側で計算
          const foodTotal = typeof newRow.食料 === "number" ? newRow.食料 : 0;
          const dinedOut = typeof newRow.外食 === "number" ? newRow.外食 : 0;
          newRow["外食以外食料"] = foodTotal - dinedOut;

          // 交通・自動車等関係費 = 交通 + 自動車等関係費 をサーバー側で計算
          const transport = typeof newRow.交通 === "number" ? newRow.交通 : 0;
          const autoRelated =
            typeof newRow["自動車等関係費"] === "number" ? newRow["自動車等関係費"] : 0;
          newRow["交通・自動車等関係費"] = transport + autoRelated;

          // 不要な費目を除去
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
