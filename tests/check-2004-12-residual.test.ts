import { loadTotalEarningData, loadCpiData } from "../src/lib/cpiData";

it("check 2004-12 residual", async () => {
    const data = await loadTotalEarningData();
    const d200412 = data.find(d => d.年月 === "2004年12月");
    console.log("2004-12 Data Residual:", d200412!["残差"]);
});
