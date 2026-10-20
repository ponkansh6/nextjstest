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
    expect(info.url).toBe(
      "https://www.e-stat.go.jp/stat-search/files?page=1&toukei=00200573&tstat=000001150147",
    );
  });

  it("3系列の意味、比較方法、名目値と消費データの境界を説明する", () => {
    const items = info.sections.flatMap((s) => s.items);
    const text = items.map((item) => item.text).join("\n");
    expect(text).toContain("定期給与・残業代・賞与などを含む給与の動き");
    expect(text).toContain("家計の名目消費支出の動き");
    expect(text).toContain("全国の消費者物価指数（総合）の動き");
    expect(text).toContain("2025年を基準に指数化");
    expect(text).toContain("季節変動をならすため");
    expect(text).toContain("その月を含む直近12か月の平均");
    expect(text).toContain("給与と消費支出は、物価変動を差し引いていない名目値です。");
    expect(text).toContain("2016年以前が推計値、2017年以降がe-Statの公式月次値です。");
    expect(text).not.toContain("消費動向指数");
    expect(text).not.toMatch(/係数|生値|12暦月|加工順序/);
  });
});

describe("new-graph chart info data-source state", () => {
  it("月次比較の説明にCTI選択状態を混ぜない", async () => {
    const { getChartInfoContent } = await import("@/lib/chartInfoContent");
    const info = getChartInfoContent("new-graph", undefined, {
      baseYear: 2025,
      sourceMode: "official-connected",
      seriesLabel: "基本系列（原数値）",
      reason: "monthly CTI state detail",
    });
    const text = [info.source, ...info.sections.flatMap((s) => s.items.map((i) => i.text))].join(
      "\n",
    );

    expect(text).toContain("家計の名目消費支出の動き");
    expect(text).toContain("季節変動をならすため");
    expect(text).not.toContain("公式CTI名目原数値");
    expect(text).not.toContain("2005Q1〜2017Q4");
    expect(text).not.toContain("monthly CTI state detail");
  });
});

describe("consumption-expenditure chart info", () => {
  it("presents the quarterly expenditure series, estimate boundary, and user-facing meaning", () => {
    const info = CHART_INFO["consumption-expenditure"];
    const text = [
      info.source,
      ...info.sections.flatMap((section) => section.items.map((item) => item.text)),
    ].join("\n");

    expect(text).toContain("二人以上の世帯の消費支出");
    expect(text).toContain("四半期");
    expect(text).toContain("2016年第4四半期までは推計値");
    expect(text).toContain("2017年第1四半期以降はe-Statの公式四半期値");
    expect(text).toContain("名目データは");
    expect(text).toContain("名目はその時点の金額");
    expect(text).toContain("実質は消費者物価指数（CPI）で物価変動を調整した額");
    expect(text).toContain("2025年基準");
    expect(text).toContain("総額から他の9費目を差し引いて算出");
    expect(text).toContain("対応する物価指数がないため");
    expect(text).toContain("総合CPI（持家の帰属家賃を除く）を代用した概算");
    expect(text).toContain("実質総額は内訳とは別に計算");
    expect(text).toContain("実質値を足しても総額とは一致しません");
    expect(info.source).toContain("e-Stat");
    expect(info.url).toBe(
      "https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=000040499087",
    );
    expect(text).not.toMatch(/2005Q1|2017Q4|raw|12MA|metadata|CSV|fallback/i);
  });

  it("keeps this quarterly explanation fixed across monthly CTI states and omits loader metadata", async () => {
    const { getChartInfoContent } = await import("@/lib/chartInfoContent");
    const defaultInfo = getChartInfoContent("consumption-expenditure");
    const states = [
      {
        baseYear: 2025 as const,
        sourceMode: "official-connected" as const,
        seriesLabel: "CTI名目raw 12MA 2005Q1〜2017Q4",
        status: "invalid" as const,
        reason: "official fixture detail",
        source: "internal artifact source",
        unit: "指数",
      },
      {
        baseYear: null,
        sourceMode: "unavailable" as const,
        unavailableReason: "monthly feed unavailable",
        series: {
          raw: {
            key: "cti_nominal_raw",
            valueType: "raw" as const,
            unit: "指数",
            source: "internal monthly source",
            status: "invalid" as const,
            reason: "raw state detail",
          },
          comparison: {
            key: "cti_nominal_comparison",
            valueType: "comparison" as const,
            unit: "指数",
            source: "internal monthly source",
            status: "invalid" as const,
            reason: "comparison state detail",
          },
        },
      },
      {
        baseYear: 2020 as const,
        sourceMode: "rollback" as const,
        reason: "rollback fixture detail",
        supportLabel: "internal support label",
        artifactRoot: "internal artifact root",
      },
    ];

    for (const state of states) {
      expect(getChartInfoContent("consumption-expenditure", undefined, state)).toEqual(defaultInfo);
    }

    const visibleText = [
      defaultInfo.source,
      ...defaultInfo.sections.flatMap((section) => section.items.map((item) => item.text)),
    ].join("\n");
    expect(visibleText).not.toMatch(
      /CTI名目raw|12MA|2005Q1|2017Q4|metadata|internal|fixture detail/i,
    );
  });
});

describe("new-graph and residual chart info wording", () => {
  it("describes the actual comparison series and does not substitute quarterly CTI wording", () => {
    const text = [
      ...CHART_INFO["new-graph"].sections.flatMap((section) =>
        section.items.map((item) => item.text),
      ),
    ].join("\n");

    expect(text).toContain("定期給与・残業代・賞与などを含む給与の動き");
    expect(text).toContain("家計の名目消費支出の動き");
    expect(text).toContain("全国の消費者物価指数（総合）の動き");
    expect(text).toContain("その月を含む直近12か月の平均");
    expect(text).toContain("給与と消費支出は、物価変動を差し引いていない名目値です。");
    expect(text).toContain("2016年以前が推計値、2017年以降がe-Statの公式月次値です。");
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
