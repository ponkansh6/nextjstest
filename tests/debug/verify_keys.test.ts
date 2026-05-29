import { it } from "vitest";
import { loadCtiData } from "../../server/lib/dataLoader";

it("verify month formats", async () => {
  const data = await loadCtiData();
  const sample = data.slice(100, 110); // データ後半を確認
  sample.forEach(d => console.log(`'${d.年月}'`));
});
