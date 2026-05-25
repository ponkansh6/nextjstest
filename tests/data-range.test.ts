import { loadTotalEarningData } from "../src/lib/cpiData";

describe("data range sufficiency", () => {
  it("provides at least 12 months of historical data before the UI start year (2005)", async () => {
    // データ全体をロード（2004年からのデータを含むはず）
    const allData = await loadTotalEarningData();
    
    // 2005年1月のデータが含まれているか確認
    const firstUiMonth = allData.find(d => d.年月 === "2005年1月");
    expect(firstUiMonth).toBeDefined();

    // 2004年1月のデータが含まれているか確認（移動平均の計算に必要）
    const firstHistoryMonth = allData.find(d => d.年月 === "2004年1月");
    expect(firstHistoryMonth).toBeDefined();

    // 2004年1月から2005年1月までデータが途切れていないことを簡易確認
    const index200401 = allData.findIndex(d => d.年月 === "2004年1月");
    const index200501 = allData.findIndex(d => d.年月 === "2005年1月");
    
    expect(index200401).toBeGreaterThanOrEqual(0);
    expect(index200501).toBeGreaterThan(index200401);
  });
});
