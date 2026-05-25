import { loadTotalEarningData, loadCpiData } from "../src/lib/cpiData";

it("check 2004-12", async () => {
    const data = await loadTotalEarningData();
    const cpi = await loadCpiData();
    const d200412 = data.find(d => d.年月 === "2004年12月");
    console.log("2004-12 Data:", d200412);
    console.log("2004-12 CPI:", cpi.find(d => d.年月 === "2004年12月"));
});
