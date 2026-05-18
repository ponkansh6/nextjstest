import { test, expect } from "@playwright/test";
import { loadTotalEarningData } from "../src/lib/cpiData";

test("verify wage correction and per-capita metrics match production logic", async () => {
  const data = await loadTotalEarningData();

  expect(data.length).toBeGreaterThan(0);
  const latest = data[data.length - 1];

  console.log(`--- Latest entry (${latest.年月}) ---`);
  console.log(
    "調整済み15歳以上国民一人当たり給与:",
    latest["調整済み15歳以上国民一人当たり給与"],
  );

  // 15歳以上国民一人当たり給与は2020年基準で約100になるはず
  expect(latest["調整済み15歳以上国民一人当たり給与"]).toBeGreaterThan(80);
  expect(latest["調整済み15歳以上国民一人当たり給与"]).toBeLessThan(150);
});
