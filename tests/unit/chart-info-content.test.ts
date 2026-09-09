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

  it("民間最終消費支出（総合）およびCTI消費支出（総合）の説明が実際のデータソースと一致している", () => {
    const items = info.sections.flatMap((s) => s.items);
    const minkanItem = items.find((i) => i.text.startsWith("民間最終消費支出（総合）"));
    const ctiItem = items.find((i) => i.text.startsWith("CTI消費支出（総合）"));

    expect(minkanItem, "民間最終消費支出（総合）の説明が見つからない").toBeDefined();
    expect(ctiItem, "CTI消費支出（総合）の説明が見つからない").toBeDefined();

    // 家計調査は使用していないため説明に登場してはならない
    expect(minkanItem!.text).not.toContain("家計調査");
    expect(minkanItem!.text).toContain("四半期別GDP統計");
    expect(minkanItem!.text).toContain("民間最終消費支出");
    expect(minkanItem!.text).toContain("12か月移動平均");
    // 延長系列（2018年以降に実質的な新規データ、?adv=1で表示）は本文に統合し、短い注記のみ残す
    expect(minkanItem!.text).toContain("延長オプション");

    expect(ctiItem!.text).not.toContain("家計調査");
    expect(ctiItem!.text).toContain("分布調整済み原数値CTI");
    expect(ctiItem!.text).toContain("12か月移動平均");
  });
});

/**
 * CPI の説明は、静的な CHART_INFO をそのまま利用できることを保ちつつ、
 * 実際に選択された長期系列（2025年基準 / 2020年基準）で解決される必要がある。
 *
 * 現在は cpi_data2025_long.csv が未配置なので、画面に渡す解決済み説明は
 * 2020年基準を明示しなければならない。このテストは、
 * CPI ローダーの選択状態を受け取る chart-info の公開 API を対象にする。
 */
describe("CPI chart info data-source state", () => {
  it("2020年基準では e-Stat 出典と固定ウェイト試算を維持し、2020年基準を明示する", async () => {
    const { getChartInfoContent } = await import("@/lib/chartInfoContent");

    const info = getChartInfoContent("cpi-major", {
      baseYear: 2020,
      dataState: "2020-fallback",
    });
    const text = [
      info.source,
      ...info.sections.flatMap((section) =>
        section.items.flatMap((item) => [item.text, ...(item.subItems ?? [])]),
      ),
    ].join("\n");

    expect(info.source).toContain("e-Stat");
    expect(text).toContain("2020年基準");
    expect(text).toContain("2020年基準の指数データ");
    expect(text).not.toMatch(/フォールバック|fallback/i);
    expect(text).not.toContain("2025年平均=100の公式接続指数を表示");
    expect(text).toContain("固定して適用した試算");
    expect(info.url).toContain("tstat=000001150147");
  });

  it("2025 long が選択された場合は 2025年基準の公式接続指数として説明する", async () => {
    const { getChartInfoContent } = await import("@/lib/chartInfoContent");

    const info = getChartInfoContent("stacked-area", {
      baseYear: 2025,
      dataState: "2025-long",
    });
    const text = [
      info.source,
      ...info.sections.flatMap((section) =>
        section.items.flatMap((item) => [item.text, ...(item.subItems ?? [])]),
      ),
    ].join("\n");

    expect(info.source).toContain("e-Stat");
    expect(text).toContain("2025年基準");
    expect(text).toContain("公式接続指数");
    expect(text).not.toMatch(/フォールバック|fallback/i);
    expect(text).toContain("固定適用した加重指数水準を試算");
    expect(info.url).toContain("tstat=000001243876");
  });

  it("CPI unavailable では利用者向けの未取得状態を表示する", async () => {
    const { getChartInfoContent } = await import("@/lib/chartInfoContent");

    const info = getChartInfoContent("cpi-major", {
      baseYear: null,
      sourceMode: "unavailable",
    });
    const text = info.sections
      .flatMap((section) => section.items.map((item) => item.text))
      .join("\n");

    expect(text).toContain("CPIデータ未取得");
    expect(text).not.toContain("2020年基準");
    expect(text).not.toMatch(/フォールバック|fallback/i);
  });
});
