import { test, expect } from "@playwright/test";

// テスト用のダミーデータ
const mockCpiData = [
  {
    年月: "2020年01月",
    総合: 100.5,
    生鮮食品を除く総合: 100.2,
    生鮮食品及びエネルギーを除く総合: 100.0,
    外食以外食料: 101.0,
    外食: 99.5,
    住居: 100.0,
    "光熱・水道": 98.5,
    "家具・家事用品": 100.2,
    被服及び履物: 99.8,
    保健医療: 101.5,
    交通: 102.0,
    自動車等関係費: 101.8,
    通信: 99.2,
    教育: 100.5,
    教養娯楽用品: 100.1,
    教養娯楽サービス: 100.3,
    諸雑費: 100.0,
  },
  {
    年月: "2020年06月",
    総合: 101.2,
    生鮮食品を除く総合: 100.9,
    生鮮食品及びエネルギーを除く総合: 100.8,
    外食以外食料: 102.5,
    外食: 100.2,
    住居: 100.1,
    "光熱・水道": 99.8,
    "家具・家事用品": 100.5,
    被服及び履物: 100.1,
    保健医療: 102.0,
    交通: 103.2,
    自動車等関係費: 102.5,
    通信: 99.5,
    教育: 100.8,
    教養娯楽用品: 100.4,
    教養娯楽サービス: 100.6,
    諸雑費: 100.3,
  },
  {
    年月: "2025年01月",
    総合: 105.5,
    生鮮食品を除く総合: 105.2,
    生鮮食品及びエネルギーを除く総合: 105.0,
    外食以外食料: 106.0,
    外食: 104.5,
    住居: 105.0,
    "光熱・水道": 103.5,
    "家具・家事用品": 105.2,
    被服及び履物: 104.8,
    保健医療: 106.5,
    交通: 107.0,
    自動車等関係費: 106.8,
    通信: 104.2,
    教育: 105.5,
    教養娯楽用品: 105.1,
    教養娯楽サービス: 105.3,
    諸雑費: 105.0,
  },
  {
    年月: "2025年06月",
    総合: 106.2,
    生鮮食品を除く総合: 105.9,
    生鮮食品及びエネルギーを除く総合: 105.8,
    外食以外食料: 107.5,
    外食: 105.2,
    住居: 105.1,
    "光熱・水道": 104.8,
    "家具・家事用品": 105.5,
    被服及び履物: 105.1,
    保健医療: 107.0,
    交通: 108.2,
    自動車等関係費: 107.5,
    通信: 104.5,
    教育: 105.8,
    教養娯楽用品: 105.4,
    教養娯楽サービス: 105.6,
    諸雑費: 105.3,
  },
];

// 計算関数（コンポーネントから抽出したロジック）
const calculateCategorySum = (
  data: (typeof mockCpiData)[number][],
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
  const targetYearMonth = `${year}年${monthStr}月`;

  const dataPoint = data.find((item) => item.年月 === targetYearMonth);
  if (!dataPoint) {
    throw new Error(
      `指定された年月のデータが見つかりません: ${targetYearMonth}`,
    );
  }

  let sum = 0;
  stackedKeys.forEach((key) => {
    if (!hiddenKeys.includes(key)) {
      const value = (dataPoint as unknown as Record<string, number>)[key];
      if (typeof value === "number") {
        sum += value;
      }
    }
  });
  return sum;
};

test.describe("CAGR計算", () => {
  test("データが見つかる場合、正常に合計を計算する", () => {
    const sum = calculateCategorySum(mockCpiData, 2020, 1);
    expect(sum).toBeGreaterThan(0);
    expect(sum).toBeLessThan(2000); // 合理的な範囲内か確認
  });

  test("2020年1月と2025年1月のデータが両方見つかる", () => {
    const sum2020 = calculateCategorySum(mockCpiData, 2020, 1);
    const sum2025 = calculateCategorySum(mockCpiData, 2025, 1);

    expect(sum2020).toBeGreaterThan(0);
    expect(sum2025).toBeGreaterThan(0);
    expect(sum2025).toBeGreaterThan(sum2020); // 2025年の方が大きい
  });

  test("指定された年月にデータがない場合、エラーを投げる", () => {
    expect(() => {
      calculateCategorySum(mockCpiData, 2021, 3);
    }).toThrow("指定された年月のデータが見つかりません: 2021年03月");
  });

  test("月の指定が2桁でない場合も正しく処理される", () => {
    const sum1 = calculateCategorySum(mockCpiData, 2020, 1);
    const sum9 = calculateCategorySum(mockCpiData, 2020, 6);

    expect(sum1).toBeGreaterThan(0);
    expect(sum9).toBeGreaterThan(0);
  });

  test("非表示項目は合計から除外される", () => {
    const sumAll = calculateCategorySum(mockCpiData, 2020, 1);
    const sumWithHidden = calculateCategorySum(mockCpiData, 2020, 1, ["外食"]);

    expect(sumWithHidden).toBeLessThan(sumAll);
  });

  test("CAGR計算が正しく機能する（データが存在する場合）", () => {
    const startValue = calculateCategorySum(mockCpiData, 2020, 1);
    const endValue = calculateCategorySum(mockCpiData, 2025, 1);
    const years = 2025 - 2020;

    const cagr = Math.pow(endValue / startValue, 1 / years) - 1;

    expect(cagr).toBeGreaterThan(0); // CPI は通常上昇
    expect(cagr).toBeLessThan(0.1); // 年10%以上の上昇はない想定
  });

  test("存在しない年月でのCAGR計算は失敗する", () => {
    expect(() => {
      calculateCategorySum(mockCpiData, 2021, 1);
    }).toThrow();
  });
});
