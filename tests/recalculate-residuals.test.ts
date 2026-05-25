import { loadTotalEarningData, loadCpiData } from "../src/lib/cpiData";

it("recalculate residuals carefully", async () => {
  const earnings = await loadTotalEarningData();
  const cpi = await loadCpiData();

  const getRes = (ym: string) => {
    const e = earnings.find(d => d.年月 === ym);
    const c = cpi.find(d => d.年月 === ym);
    if (!e || !c) return 0;
    const total = (e["所定内給与"] as number) + (e["所定外給与"] as number) + (e["特別給与"] as number);
    return total - (c["総合"] as number);
  };

  const raw200412 = getRes("2004年12月");
  const raw200501 = getRes("2005年1月");

  console.log("Raw 2004-12:", raw200412);
  console.log("Raw 2005-01:", raw200501);
  console.log("Expected Avg:", (raw200412 + raw200501) / 2);
  
  const actual200501 = earnings.find(d => d.年月 === "2005年1月")!["残差"];
  console.log("Actual 2005-01:", actual200501);
});
