import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { CpiData } from "../app/page";

export async function loadTotalEarningData(): Promise<CpiData[]> {
  // 既存の "total_earning.csv" ではなく、きまって支給する給与と所定内給与のCSVを読み込む
  const contractualPath = path.join(
    process.cwd(),
    "public/contractual_earnings.csv",
  );
  const scheduledPath = path.join(
    process.cwd(),
    "public/scheduled_earnings.csv",
  );

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
      (row) =>
        (row[0]?.trim() === "年" || row[0]?.trim() === "year") &&
        row[8]?.trim() === "１月",
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

    // hon-mks202601.csv から令和8年1月（2026年1月）のT行実額を取得
    let factorScheduled = 1;
    let factorContractual = 1;
    const honMksPath = path.join(process.cwd(), "public/hon-mks202601.csv");
    if (fs.existsSync(honMksPath)) {
      const content = fs.readFileSync(honMksPath, "utf8");
      const parsed = Papa.parse<string[]>(content, {
        header: false,
        skipEmptyLines: false,
      });
      // T,T,T で始まる行を探す
      const tRow = parsed.data.find(
        (row) => row[0] === "T" && row[1] === "T" && row[2] === "T",
      );
      if (tRow) {
        // [12]:総額, [13]:きまって支給する給与, [14]:所定内給与
        const totalReal = parseFloat(tRow[12].replace(/,/g, ""));
        const contractualReal = parseFloat(tRow[13].replace(/,/g, ""));
        const scheduledReal = parseFloat(tRow[14].replace(/,/g, ""));

        // 2026年1月の各指数を取得
        const ym202601 = "2026年1月";
        const totalIdx = totalMap.get(ym202601) || 0;
        const contractualIdx = contractualMap.get(ym202601) || 0;
        const scheduledIdx = scheduledMap.get(ym202601) || 0;

        if (
          totalReal !== 0 &&
          totalIdx !== 0 &&
          contractualIdx !== 0 &&
          scheduledIdx !== 0
        ) {
          // 指数1ポイントあたりの実額を計算し、現金給与総額の指数スケールに合わせる
          // 補正後所定内 = 所定内指数 * (所定内実額 / 所定内指数) / (総額実額 / 総額指数)
          // 補正後きまって = きまって指数 * (きまって実額 / きまって指数) / (総額実額 / 総額指数)
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
      ...Array.from(contractualMap.keys()),
      ...Array.from(scheduledMap.keys()),
      ...Array.from(totalMap.keys()),
    ]);

    const result: CpiData[] = Array.from(keys)
      .map((ym) => {
        const contractualVal = contractualMap.get(ym) ?? 0;
        const scheduledVal = scheduledMap.get(ym) ?? 0;
        const totalVal = totalMap.get(ym) ?? 0;

        const finalTotal = totalVal;
        const finalContractual = contractualVal * factorContractual;
        const finalScheduled = scheduledVal * factorScheduled;

        return {
          年月: ym,
          所定内給与: finalScheduled,
          所定外給与: Math.max(0, finalContractual - finalScheduled),
          特別給与: Math.max(0, finalTotal - finalContractual),
        } as unknown as CpiData;
      })
      .sort((a, b) => {
        const ma = a.年月.match(/^(\d{4})年(\d{1,2})月/);
        const mb = b.年月.match(/^(\d{4})年(\d{1,2})月/);
        if (!ma || !mb) return 0;
        const ay = parseInt(ma[1], 10);
        const am = parseInt(ma[2], 10);
        const by = parseInt(mb[1], 10);
        const bm = parseInt(mb[2], 10);
        return ay !== by ? ay - by : am - bm;
      });

    // 12か月移動平均を計算して調整済み特別給与を追加
    result.forEach((item, index) => {
      let sum = 0;
      let count = 0;

      // その月を含む直前12か月を集計
      for (let i = Math.max(0, index - 11); i <= index; i++) {
        sum += (result[i].特別給与 as number) || 0;
        count++;
      }

      item["調整済み特別給与"] =
        count > 0 ? sum / count : (item.特別給与 as number);
    });

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
            typeof c === "string" &&
            (c.trim() === "月" || c.trim().includes("消費支出（名目）")),
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
        if (typeof obj["月"] === "string" && !obj.年月) obj.年月 = obj["月"];
        return obj as unknown as CpiData;
      })
      .filter((row) => {
        if (!row.年月) return false;
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
      if (
        !row["その他の消費支出（名目）"] ||
        row["その他の消費支出（名目）"] === 0
      ) {
        row["その他の消費支出（名目）"] = Math.max(
          0,
          nominalTotal - nominalSum,
        );
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
      if (
        !row["その他の消費支出（実質）"] ||
        row["その他の消費支出（実質）"] === 0
      ) {
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
  const contributionFilePath = path.join(
    process.cwd(),
    "public/contribution.csv",
  );

  try {
    if (fs.existsSync(cpiFilePath) && fs.existsSync(contributionFilePath)) {
      const cpiContent = fs.readFileSync(cpiFilePath, "utf8");
      const contributionContent = fs.readFileSync(contributionFilePath, "utf8");

      // ウエイト情報の取得
      const contributionLines = contributionContent.split("\n");
      const categoryLine = contributionLines.find((line) =>
        line.startsWith("類・品目"),
      );
      const weightLine = contributionLines.find((line) =>
        line.startsWith("ウエイト"),
      );

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
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
      });

      // データのクリーニング、ウエイトの掛け合わせ、派生データの計算
      const cleanData = (data as CpiData[])
        .filter((row) => {
          if (!row["年月"]) return false;
          const yearMatch = (row["年月"] as string).match(/^(\d{4})年/);
          const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;
          return year >= 2005;
        })
        .map((row) => {
          const newRow: CpiData = { ...row };
          Object.keys(weights).forEach((key) => {
            const value = row[key];
            if (typeof value === "number") {
              // 寄与度 = (指数 * ウエイト) / 10000
              newRow[key] = (value * weights[key]) / 10000;
            }
          });
          // 外食以外食料 = 食料 - 外食 をサーバー側で計算
          const foodTotal = typeof newRow.食料 === "number" ? newRow.食料 : 0;
          const dinedOut = typeof newRow.外食 === "number" ? newRow.外食 : 0;
          newRow["外食以外食料"] = foodTotal - dinedOut;

          // 交通・自動車等関係費 = 交通 + 自動車等関係費 をサーバー側で計算
          const transport = typeof newRow.交通 === "number" ? newRow.交通 : 0;
          const autoRelated =
            typeof newRow["自動車等関係費"] === "number"
              ? newRow["自動車等関係費"]
              : 0;
          newRow["交通・自動車等関係費"] = transport + autoRelated;

          // 不要な費目を除去
          delete newRow["教養娯楽サービス"];
          delete newRow["教養娯楽用品"];
          delete newRow["交通"];
          delete newRow["自動車等関係費"];

          return newRow;
        });

      return cleanData;
    } else {
      console.error("Data files not found");
      return [];
    }
  } catch (error) {
    console.error("Error loading CPI data:", error);
    return [];
  }
}
