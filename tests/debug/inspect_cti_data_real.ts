
import { it } from "vitest";
import { loadCtiData } from "../../server/lib/dataLoader";
import { CpiData } from "../../src/app/page";

it("inspect CTI data", async () => {
  const data = await loadCtiData();
  console.log("Total records loaded:", data.length);
  
  if (data.length > 0) {
    // 最初の数件を表示
    console.log("Sample records:", JSON.stringify(data.slice(0, 3), null, 2));
    
    // Q1の合計を確認するためのテストデータ（2017年1月-3月）
    const q1Keys = ["2017年1月", "2017年2月", "2017年3月"];
    const q1Data = data.filter((d: CpiData) => q1Keys.includes(d.年月));
    
    console.log("--- Q1 Data (2017) ---");
    q1Data.forEach((d: CpiData) => {
        console.log(`${d.年月}: 消費支出（名目）=${d["消費支出（名目）"] as number}, 食料（名目）=${d["食料（名目）"] as number}`);
    });
  }
});

inspectCtiData();
