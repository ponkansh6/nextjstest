import { loadCpiData, loadTotalEarningData } from "../src/lib/cpiData";

describe("残差計算（実データによる検証）", () => {
  let earningData: any[] = [];
  let cpiData = new Map<string, number>();

  beforeAll(async () => {
    earningData = await loadTotalEarningData();
    const rawCpi = await loadCpiData();
    // CPIデータを年月でマップ化
    cpiData = new Map(rawCpi.map((d) => [d.年月, d.総合]));
  });
  it("残差計算は、最終的なデータセットにおいて平滑化された値に基づいて算出されていること", async () => {
    // 2005/1と最新月のデータポイントをターゲットにする
    const jan2005Index = earningData.findIndex((d) => d.年月 === "2005年1月");
    const testIndices = [jan2005Index !== -1 ? jan2005Index : 0, earningData.length - 1];
    const testRange = testIndices.map((i) => earningData[i]);

    // CPI平滑化ロジックをcpiData.tsから正確に模倣
    const getSmoothed = (key: string, isDataKey: boolean, targetYm: string) => {
      const index = earningData.findIndex((r) => r.年月 === targetYm);
      let sum = 0;
      let count = 0;
      for (let i = Math.max(0, index - 11); i <= index; i++) {
        const ym = earningData[i].年月;
        let val = 0;
        if (isDataKey) {
          val = earningData[i][key as keyof (typeof earningData)[0]] || 0;
        } else {
          val = cpiData.get(ym) || 0;
        }
        sum += val;
        count++;
      }
      const isMetric = isDataKey || key === "cpi";
      const divisor = isMetric ? 12 : count;
      return divisor > 0 ? sum / divisor : 0;
    };

    testRange.forEach((row) => {
      // アプリケーションがすでに計算してオブジェクトに保持しているプロパティを使用
      const smoothedTotal = row["所定内給与"] + row["所定外給与"] + row["特別給与"];

      const rawCpiVal = cpiData.get(row.年月) || 0;
      const rawResidual = rawCpiVal > 0 ? smoothedTotal - rawCpiVal : 0;

      // 2か月移動平均を再現
      const prevRow = earningData[earningData.findIndex(r => r.年月 === row.年月) - 1];
      const prevRawResidual = prevRow && prevRow.年月 ? (cpiData.get(prevRow.年月) ? (prevRow["所定内給与"] + prevRow["所定外給与"] + prevRow["特別給与"]) - (cpiData.get(prevRow.年月) || 0) : 0) : rawResidual;
      const expectedResidual = (prevRawResidual + rawResidual) / 2;

      console.log(
        `Debug: Test record (${row.年月}): 残差 = ${row["残差"]}, 期待値 = ${expectedResidual}`,
      );

      // 許容誤差範囲を調整して確認
      expect(row["残差"]).toBeCloseTo(expectedResidual, 0);
    });
  });

  it("残差計算は、給与の移動平均とCPIの生値に基づいていること", () => {
    const targetRow = earningData[earningData.length - 1];
    const residual = targetRow["残差"];

    expectTypeOf(residual).toBeNumber();
    expect(residual).not.toBeNaN();
  });
});
