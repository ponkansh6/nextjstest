import mockCpiData from "../fixtures/cpi-data.json";
import { calculateCategorySum } from "../../src/lib/cpiData";
import type { CpiData } from "../../src/app/page";
import { createCpiDataList } from "../factories/cpiDataFactory";

const cpiData = createCpiDataList(mockCpiData as Partial<CpiData>[]);

describe("cAGR計算", () => {
  it("データが見つかる場合、正常に合計を計算する", () => {
    const sum = calculateCategorySum(cpiData, 2020, 1);
    expect(sum).toBeGreaterThan(0);
    expect(sum).toBeLessThan(2000);
  });

  it("2020年1月と2025年1月のデータが両方見つかる", () => {
    const sum2020 = calculateCategorySum(cpiData, 2020, 1);
    const sum2025 = calculateCategorySum(cpiData, 2025, 1);

    expect(sum2020).toBeGreaterThan(0);
    expect(sum2025).toBeGreaterThan(0);
    expect(sum2025).toBeGreaterThan(sum2020);
  });

  it("指定された年月にデータがない場合、エラーを投げる", () => {
    expect(() => {
      calculateCategorySum(cpiData, 2021, 3);
    }).toThrow("指定された年月のデータが見つかりません: 2021年03月");
  });

  it("月の指定が2桁でない場合も正しく処理される", () => {
    const sum1 = calculateCategorySum(cpiData, 2020, 1);
    const sum9 = calculateCategorySum(cpiData, 2020, 6);

    expect(sum1).toBeGreaterThan(0);
    expect(sum9).toBeGreaterThan(0);
  });

  it("非表示項目は合計から除外される", () => {
    const sumAll = calculateCategorySum(cpiData, 2020, 1);
    const sumWithHidden = calculateCategorySum(cpiData, 2020, 1, ["外食"]);

    expect(sumWithHidden).toBeLessThan(sumAll);
  });

  it("cAGR計算が正しく機能する（データが存在する場合）", () => {
    const startValue = calculateCategorySum(cpiData, 2020, 1);
    const endValue = calculateCategorySum(cpiData, 2025, 1);
    const years = 2025 - 2020;

    const cagr = (endValue / startValue) ** (1 / years) - 1;

    expect(cagr).toBeGreaterThan(0);
    expect(cagr).toBeLessThan(0.1);
  });

  it("存在しない年月でのCAGR計算は失敗する", () => {
    expect(() => {
      calculateCategorySum(cpiData, 2021, 1);
    }).toThrow();
  });
});
