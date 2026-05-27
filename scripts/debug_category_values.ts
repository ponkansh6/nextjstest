import { loadCpiData } from "../src/lib/cpiData";
import { computeChartData } from "../src/lib/chartLogic";
import { nominalKeys } from "../src/lib/chartConstants";

async function debug() {
  const data = await loadCpiData();
  const chartData = computeChartData(
    {
      data: data, // dummy
      nominalData: data,
      startYear: 2020,
      endYear: 2026,
      nominalKeys: nominalKeys,
      realKeys: [],
      maxCpiDate: { year: 2026, month: 1 },
    },
    [],
  );

  // chartDataの構造を確認（戻り値がオブジェクトの場合がある）
  console.log("chartData keys:", Object.keys(chartData));

  // nominalデータが含まれるリストを特定
  const list = (chartData as any).quarterlyNominalData || [];
  const sample = list[list.length - 1];

  if (sample) {
    console.log("Sample keys:", Object.keys(sample));
    console.log("Value for 'その他の消費支出（名目）':", sample["その他の消費支出（名目）"]);
    console.log(
      "Value for '諸雑費・CPI外支出等（名目）':",
      (sample as any)["諸雑費・CPI外支出等（名目）"],
    );
  }
}

debug();
