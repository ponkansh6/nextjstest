import { loadTotalEarningData } from "../src/lib/cpiData";

async function trace() {
  const data = await loadTotalEarningData();

  // result配列の全データを確認
  console.log("Total Data Length:", data.length);
  console.log("First Date in Result:", data[0].年月);
  console.log("Second Date in Result:", data[1]?.年月);

  const d200412 = data.find((d) => d.年月 === "2004年12月");
  const d200501 = data.find((d) => d.年月 === "2005年1月");

  console.log("2004年12月 exists:", !!d200412);
  console.log("2005年1月 exists:", !!d200501);
}

trace();
