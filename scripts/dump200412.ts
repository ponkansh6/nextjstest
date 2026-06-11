import { loadTotalEarningData, loadCpiData } from "../server/lib/dataLoader";

async function dump() {
  const earnings = await loadTotalEarningData();
  const cpi = await loadCpiData();

  const d200412 = earnings.find((d: any) => d.年月 === "2004年12月");
  const cpi200412 = cpi.find((d: any) => d.年月 === "2004年12月");

  console.log("Earnings 2004-12:", JSON.stringify(d200412, null, 2));
  console.log("CPI 2004-12:", JSON.stringify(cpi200412, null, 2));
}
dump();
