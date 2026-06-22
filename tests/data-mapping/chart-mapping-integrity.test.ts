import { describe, it, expect } from "vitest";
import { stackedKeys, nominalColorMap } from "../../src/lib/chartConstants";

describe("Chart Constants Integrity", () => {
  it("should ensure every stackedKey that requires a nominal mapping is accounted for", () => {
    // 消費カテゴリーとして存在し、CPI名目マップ（データ変換）にもマッピングが必要なキー
    const keysRequiringMapping = stackedKeys.filter(
      (key) => !["外食", "通信", "交通・自動車等関係費", "外食以外食料", "諸雑費"].includes(key)
    );

    keysRequiringMapping.forEach((key) => {
      // 凡例キー（またはそれに対応するソースキー）が nominalColorMap に定義されているか
      const isMapped = Object.values(nominalColorMap).includes(key) || 
                       Object.keys(nominalColorMap).includes(key);
      
      expect(isMapped, `Key "${key}" requires a mapping in nominalColorMap but it was not found`).toBe(true);
    });
  });
});
