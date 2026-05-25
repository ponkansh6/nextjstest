import { loadTotalEarningData, loadCpiData } from "../src/lib/cpiData";

it("verify 2005/01 smoothing logic", async () => {
  const data = await loadTotalEarningData();
  const cpiData = await loadCpiData();
  
  // 2004年12月と2005年1月を探す
  const d200412 = data.find(d => d.年月 === "2004年12月");
  const d200501 = data.find(d => d.年月 === "2005年1月");
  
  const cpi200412 = cpiData.find(d => d.年月 === "2004年12月")?.総合 || 0;
  const cpi200501 = cpiData.find(d => d.年月 === "2005年1月")?.総合 || 0;

  // 計算の再現 (残差 = 総合給与 - CPI)
  const getRawRes = (d: any, cpi: number) => 
    (d["所定内給与"] + d["所定外給与"] + d["特別給与"]) - cpi;

  const rawRes200412 = getRawRes(d200412, cpi200412);
  const rawRes200501 = getRawRes(d200501, cpi200501);
  
  const expectedSmoothed200501 = (rawRes200412 + rawRes200501) / 2;

  console.log("2004-12 Raw Residual:", rawRes200412);
  console.log("2005-01 Raw Residual:", rawRes200501);
  console.log("Expected Smoothed 2005-01:", expectedSmoothed200501);
  console.log("Actual in data 2005-01:", d200501!["残差"]);
});
