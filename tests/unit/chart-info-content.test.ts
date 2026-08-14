import { describe, it, expect } from "vitest";
import { CHART_INFO } from "@/lib/chartInfoContent";

/**
 * 3種比較（new-graph）の info 説明文が、実際のデータソースと一致していることを検証する。
 * 消費支出（参考）は家計調査ではなく、
 * - 2018年以降: 分布調整済み原数値CTIの消費支出（名目）（server/lib/data-loader/earnings.ts buildConsumptionMap）
 * - 2017年以前: 四半期別GDP統計の民間最終消費支出（cti_support_nominal.csv、スケーリングして結合）
 * を12か月移動平均で指数化したもの。
 */
describe("new-graph chart info (3種比較)", () => {
  const info = CHART_INFO["new-graph"];

  it("source に CTI と四半期別GDP統計の両方を記載している", () => {
    expect(info.source).toContain("分布調整済み原数値CTI");
    expect(info.source).toContain("四半期別GDP統計");
  });

  it("民間最終消費支出（参考）およびCTI消費支出（参考）の説明が実際のデータソースと一致している", () => {
    const items = info.sections.flatMap((s) => s.items);
    const minkanItem = items.find((i) => i.text.startsWith("民間最終消費支出（参考）"));
    const minkanExtItem = items.find((i) => i.text.startsWith("民間最終消費支出（参考・延長）"));
    const ctiItem = items.find((i) => i.text.startsWith("CTI消費支出（参考）"));

    expect(minkanItem, "民間最終消費支出（参考）の説明が見つからない").toBeDefined();
    expect(minkanExtItem, "民間最終消費支出（参考・延長）の説明が見つからない").toBeDefined();
    expect(ctiItem, "CTI消費支出（参考）の説明が見つからない").toBeDefined();

    // 家計調査は使用していないため説明に登場してはならない
    expect(minkanItem!.text).not.toContain("家計調査");
    expect(minkanItem!.text).toContain("四半期別GDP統計");
    expect(minkanItem!.text).toContain("民間最終消費支出");
    expect(minkanItem!.text).toContain("12か月移動平均");

    expect(minkanExtItem!.text).toContain("四半期別GDP統計");
    expect(minkanExtItem!.text).toContain("12か月移動平均");
    expect(minkanExtItem!.text).toContain("参考・延長");

    expect(ctiItem!.text).not.toContain("家計調査");
    expect(ctiItem!.text).toContain("分布調整済み原数値CTI");
    expect(ctiItem!.text).toContain("12か月移動平均");
  });
});
