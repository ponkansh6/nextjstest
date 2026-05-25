import { loadTotalEarningData } from "../src/lib/cpiData";

async function check() {
  const data = await loadTotalEarningData();
  const idx200501 = data.findIndex((d) => d.年月 === "2005年1月");

  // 移動平均後の値ではなく、計算直後の「残差」を確認する
  // 修正前のコードを見る必要があるため、今度は一時的なデバッグログを追加して実行する
  console.log("残差(2004年12月):", data[idx200501 - 1]["残差"]);
  console.log("残差(2005年1月):", data[idx200501]["残差"]);
}
check();
