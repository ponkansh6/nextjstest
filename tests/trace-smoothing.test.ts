import { loadTotalEarningData } from "../src/lib/cpiData";

it("trace smoothing", async () => {
  const data = await loadTotalEarningData();
  console.log("TRACE: Array length:", data.length);
  console.log("TRACE: First item:", data[0].年月);
  console.log("TRACE: 2004-12 index:", data.findIndex(d => d.年月 === "2004年12月"));
  console.log("TRACE: 2005-01 index:", data.findIndex(d => d.年月 === "2005年1月"));
});
