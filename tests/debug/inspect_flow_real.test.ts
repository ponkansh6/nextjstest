import { it, expect } from "vitest";
import { loadCtiData } from "../../server/lib/dataLoader";
import { computeChartData } from "../../src/lib/chartLogic";
import { nominalKeys } from "../../src/lib/chartConstants";

it("inspect real data flow from load to rendering", async () => {
  // 1. Load: 実データの読み込み
  const data = await loadCtiData();
  console.log("Loaded data records:", data.length);
  
  // 2. Process: computeChartData でクォーター合算を実行
  // これはまさにレンダリング直前のデータ構造を生成するプロセスです
  const result = computeChartData(
    {
      data: data,
      nominalData: data,
      startYear: 2017,
      endYear: 2017,
      nominalKeys: nominalKeys,
      realKeys: [],
      maxCpiDate: { year: 2017, month: 12 },
    },
    []
  );

  // 3. Inspect: レンダリング直前のデータ（quarterlyNominalData）を確認
  const quartersToInspect = ["2017年Q1", "2018年Q1", "2020年Q1", "2025年Q1"];
  
  quartersToInspect.forEach(label => {
    const qData = result.quarterlyNominalData.find(d => d.label === label);
    console.log(`${label} (Rendering Input):`, JSON.stringify(qData, null, 2));
  });
});
