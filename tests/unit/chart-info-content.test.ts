import { describe, it, expect } from "vitest";
import { CHART_INFO } from "@/lib/chartInfoContent";

/**
 * 3種比較（new-graph）の info 説明文が、実際のデータソースと一致していることを検証する。
 */
describe("new-graph chart info (3種比較)", () => {
  const info = CHART_INFO["new-graph"];

  it("source に毎月勤労統計・CPI長期時系列・消費の月次データを記載している", () => {
    expect(info.source).toContain("毎月勤労統計調査");
    expect(info.source).toContain("消費者物価指数 長期時系列データ");
    expect(info.source).toContain("消費系列の月次データ（家計調査およびe-Stat公式系列）");
  });

  it("3種比較の生成元と基準化の実態を説明する", () => {
    const items = info.sections.flatMap((s) => s.items);
    const text = items.map((item) => item.text).join("\n");
    expect(text).toContain("家計調査・e-Stat公式系列を用いた月次消費合計「消費(総合)」");
    expect(text).toContain("2025年の月次平均=100");
    expect(text).toContain("連続12暦月の厳密な移動平均");
    expect(text).toContain("所定内給与・所定外給与・特別給与");
    expect(text).toContain("各12か月移動平均に共通の係数を適用");
    expect(text).toContain("全国CPI総合の12か月移動平均");
    expect(text).toContain("CPI生値の2025暦年平均が100となる係数");
    expect(text).toContain("基準係数は移動平均から算出しない");
    expect(text).not.toContain("消費動向指数");
  });
});

describe("new-graph chart info data-source state", () => {
  it("検証済み2025セットでは採用系列と三調査合成を説明する", async () => {
    const { getChartInfoContent } = await import("@/lib/chartInfoContent");
    const info = getChartInfoContent("new-graph", undefined, {
      baseYear: 2025,
      sourceMode: "official-connected",
      seriesLabel: "基本系列（原数値）",
    });
    const text = [info.source, ...info.sections.flatMap((s) => s.items.map((i) => i.text))].join(
      "\n",
    );

    expect(text).toContain("消費(総合)");
    expect(text).not.toContain("公式CTI名目原数値");
    expect(text).not.toContain("2005Q1〜2017Q4");
  });

  it("データなしでは利用者向けの状態だけを表示し、基準年を推測しない", async () => {
    const { getChartInfoContent } = await import("@/lib/chartInfoContent");
    const info = getChartInfoContent("consumption-expenditure", undefined, {
      baseYear: null,
      sourceMode: "unavailable",
      unavailableReason: "必要な消費データを確認中です。",
    });
    const text = info.sections.flatMap((s) => s.items.map((i) => i.text)).join("\n");

    expect(text).toContain("消費データを表示できません");
    expect(text).not.toContain("2020年基準");
    expect(text).not.toMatch(/metadata|CSV|fallback/i);
  });

  it("reports missing CTI state and supports omitted official labels and optional support details", async () => {
    const { getChartInfoContent } = await import("@/lib/chartInfoContent");
    const missing = getChartInfoContent("consumption-expenditure");
    expect(missing.sections[0]?.items[0]?.text).toBe("消費データは現在利用できません。");

    const official = getChartInfoContent("consumption-expenditure", undefined, {
      baseYear: 2025,
      sourceMode: "official-connected",
      status: "invalid",
    });
    const officialState = official.sections[0]?.items.map((item) => item.text).join("\n");
    expect(official.source).toContain("2025年基準・名目原数値／12MA、2025年raw平均=100");
    expect(officialState).toContain("選択済みの公式系列");
    expect(officialState).toContain("CTI名目四半期系列の状態：invalid、理由：、単位：指数");
    expect(officialState).not.toContain("CTI基本系列の状態");

    const rollback = getChartInfoContent("consumption-expenditure", undefined, {
      baseYear: 2020,
      sourceMode: "rollback",
      reason: "fixture reason",
      supportLabel: "Plan39接続系列",
    });
    const rollbackState = rollback.sections[0]?.items.map((item) => item.text).join("\n");
    expect(rollback.source).toContain("利用不可");
    expect(rollbackState).toContain("fixture reason");
    expect(rollbackState).toContain("単位：指数、出典：e-Stat 公式CTI長期artifact 000040499070");
    expect(rollbackState).toContain("Plan39接続系列");
  });

  it.each([
    ["理由あり", "feed unavailable", "理由：feed unavailable"],
    ["理由なし", null, "理由："],
  ])(
    "unavailable CTI state includes raw series details (%s)",
    async (_label, reason, expectedReason) => {
      const { getChartInfoContent } = await import("@/lib/chartInfoContent");
      const info = getChartInfoContent("consumption-expenditure", undefined, {
        baseYear: null,
        sourceMode: "unavailable",
        series: {
          raw: {
            key: "cti_nominal_raw",
            valueType: "raw",
            unit: "指数",
            source: "e-Stat CTI",
            status: "invalid",
            reason,
          },
          comparison: {
            key: "cti_nominal_comparison",
            valueType: "comparison",
            unit: "指数",
            source: "e-Stat CTI",
            status: "invalid",
            reason: null,
          },
        },
      });
      const stateItems = info.sections[0]?.items.map((item) => item.text);

      expect(stateItems).toContain("消費データは現在利用できません。");
      expect(stateItems).toContain(
        `CTI基本系列の状態：invalid、${expectedReason}、単位：指数、出典：e-Stat CTI`,
      );
    },
  );
});

describe("new-graph and residual chart info wording", () => {
  it("explains the pre-2017 connection estimate and post-2017 official series in clear terms", () => {
    const info = CHART_INFO["consumption-expenditure"];
    const text = [
      info.source,
      ...info.sections.flatMap((section) => section.items.map((item) => item.text)),
    ].join("\n");

    expect(text).toContain("2016Q4以前");
    expect(text).toContain("各費目のCTI基本系列の年次値");
    expect(text).toContain("2017年の「調整系列の年次値÷基本系列の年次値」の比率");
    expect(text).toContain("世帯構成別の月次季節パターン");
    expect(text).toContain("非公式");
    expect(text).toContain("2017Q1以降");
    expect(text).toContain("調整系列・分布調整値（原数値）の公式名目四半期値");
    expect(text).not.toContain("A/B");
    expect(text).not.toContain("名目B");
  });

  it("describes the actual comparison series and does not substitute quarterly CTI wording", () => {
    const text = [
      ...CHART_INFO["new-graph"].sections.flatMap((section) =>
        section.items.map((item) => item.text),
      ),
    ].join("\n");

    expect(text).toContain("家計調査・e-Stat公式系列を用いた月次消費合計「消費(総合)」");
    expect(text).toContain("2025年の月次平均=100");
    expect(text).toContain("全国CPI総合");
    expect(text).toContain("所定内給与・所定外給与・特別給与");
    expect(text).toContain("各12か月移動平均に共通の係数を適用");
    expect(text).toContain("CPI生値の2025暦年平均が100となる係数");
    expect(text).toContain("基準係数は移動平均から算出しない");
    expect(text).not.toMatch(/Plan22|raw値|内部保持|月次原系列|9大費目（/);
  });

  it("describes residual rebasing to a 2025 annual average of zero", () => {
    const text = CHART_INFO.residual.sections
      .flatMap((section) => section.items.map((item) => item.text))
      .join("\n");

    expect(text).toContain("2か月移動平均後の差分を2025年平均 = 0に再基準化");
  });
});

/**
 * CPI の説明は、静的な CHART_INFO をそのまま利用できることを保ちつつ、
 * 2025年基準の単独入力や unavailable の理由コードに基づいた動的説明文で解決される必要がある。
 * このテストは、CPI ローダーの選択状態を受け取る chart-info の公開 API を対象にする。
 */
describe("CPI chart info data-source state", () => {
  it.each([
    ["cpi_metadata_invalid", "CPIデータのメタデータが不正です。"],
    ["cpi_hash_mismatch", "CPIデータの整合性チェックに失敗しました。"],
    ["cpi_schema_invalid", "CPIデータの形式が不正です。"],
    ["cpi_period_invalid", "CPIデータの期間が不正です。"],
    ["cpi_value_invalid", "CPIデータの値が不正です。"],
    ["unknown_reason", "CPIデータは現在利用できません。"],
  ])("shows the safe unavailable label for %s", async (reason, expectedLabel) => {
    const { getChartInfoContent } = await import("@/lib/chartInfoContent");
    const info = getChartInfoContent("cpi-major", {
      baseYear: null,
      sourceMode: "unavailable",
      reason,
    });
    const text = [
      info.source,
      ...info.sections.flatMap((section) =>
        section.items.flatMap((item) => [item.text, ...(item.subItems ?? [])]),
      ),
    ].join("\n");

    expect(text).toContain(expectedLabel);
  });

  it("unavailable では reason code 由来の利用者向け文言を表示する", async () => {
    const { getChartInfoContent } = await import("@/lib/chartInfoContent");

    const info = getChartInfoContent("cpi-major", {
      baseYear: null,
      sourceMode: "unavailable",
      reason: "cpi_source_missing",
    });
    const text = [
      info.source,
      ...info.sections.flatMap((section) =>
        section.items.flatMap((item) => [item.text, ...(item.subItems ?? [])]),
      ),
    ].join("\n");

    expect(text).toContain("CPIデータ未取得");
    expect(text).toContain("CPIデータの元ファイルが見つかりません。");
    expect(text).not.toContain("2020年基準");
    expect(text).not.toMatch(/フォールバック|fallback/i);
  });

  it("理由がある CPI unavailable 状態では利用者向け理由を追加表示する", async () => {
    const { getChartInfoContent } = await import("@/lib/chartInfoContent");
    const info = getChartInfoContent("cpi-major", {
      baseYear: null,
      sourceMode: "unavailable",
      reason: "cpi_hash_mismatch",
    });
    const stateItems = info.sections[0]?.items.map((item) => item.text);

    expect(info.sections[0]?.heading).toBe("データ状態");
    expect(stateItems).toEqual(["CPIデータ未取得", "CPIデータの整合性チェックに失敗しました。"]);
  });

  it("理由未指定の CPI unavailable 状態では未取得表示だけにする", async () => {
    const { getChartInfoContent } = await import("@/lib/chartInfoContent");
    const info = getChartInfoContent("cpi-major", {
      baseYear: null,
      sourceMode: "unavailable",
    });

    expect(info.sections[0]?.items).toEqual([{ text: "CPIデータ未取得" }]);
  });

  it("2025 long が選択された場合は 2025年基準の公式接続指数として説明する", async () => {
    const { getChartInfoContent } = await import("@/lib/chartInfoContent");

    const info = getChartInfoContent("stacked-area", {
      baseYear: 2025,
      sourceMode: "official-long",
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
      reason: "cpi_source_missing",
    });
    const text = info.sections
      .flatMap((section) => section.items.map((item) => item.text))
      .join("\n");

    expect(text).toContain("CPIデータ未取得");
    expect(text).toContain("CPIデータの元ファイルが見つかりません。");
    expect(text).not.toContain("2020年基準");
    expect(text).not.toMatch(/フォールバック|fallback/i);
  });
});
