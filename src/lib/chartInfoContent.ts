export interface ChartInfoItem {
  text: string;
  subItems?: string[];
}

export interface ChartInfoSection {
  heading: string;
  items: ChartInfoItem[];
}

export interface ChartInfoContent {
  source: string;
  url?: string;
  sections: ChartInfoSection[];
}

/** CPI loader state passed from the Server Component to the chart information UI. */
export interface CpiChartInfoState {
  baseYear: 2020 | 2025 | null;
  sourceMode?: "fallback" | "official-long" | "unavailable";
  label?: string;
  /** Compatibility with the initial chart-info contract. */
  dataState?: "2020-fallback" | "2025-long";
}

export const CHART_INFO: Record<string, ChartInfoContent> = {
  "cpi-major": {
    source: "e-Stat「消費者物価指数 長期時系列データ（2025年基準）」",
    url: "https://www.e-stat.go.jp/stat-search/files?cycle=0&layout=datalist&page=1&tclass1=000001243880&tclass2=000001243881&tclass3=000001243883&tclass4=000001243886&toukei=00200573&toukei_kind=9&tstat=000001243876",
    sections: [
      {
        heading: "表示している指数",
        items: [
          { text: "総合：全品目を対象とした総合指数（ヘッドラインCPI）" },
          { text: "生鮮食品を除く総合：生鮮食品を除いたコア指数" },
          {
            text: "生鮮食品及びエネルギーを除く総合：生鮮食品とエネルギーを除いたコアコア指数",
          },
          { text: "食料（酒類を除く）及びエネルギーを除く総合" },
        ],
      },
      {
        heading: "データ加工",
        items: [
          { text: "全国・月次の2025年平均=100の公式接続指数を表示" },
          {
            text: "2024年以前は旧基準の公表指数を2025年基準へ換算して接続した系列を使用",
          },
          {
            text: "費目別の加重表示は2025年基準ウェイトを全期間に固定して適用した試算であり、公式の前年比寄与度ではありません。総合への影響は通常小さい一方、個別費目では差が生じる場合があります。",
          },
          {
            text: "2025年基準の長期接続CSVが未配置の場合は、連続表示を維持するため既存の長期CSVへフォールバックします。",
          },
          { text: "表示期間：2005年〜最新月" },
          { text: "基準年：2025年（2025年平均 = 100）" },
        ],
      },
    ],
  },
  "stacked-area": {
    source: "e-Stat「消費者物価指数 長期時系列データ（2025年基準）」",
    url: "https://www.e-stat.go.jp/stat-search/files?cycle=0&layout=datalist&page=1&tclass1=000001243880&tclass2=000001243881&tclass3=000001243883&tclass4=000001243886&toukei=00200573&toukei_kind=9&tstat=000001243876",
    sections: [
      {
        heading: "表示している費目",
        items: [
          {
            text: "大分類（8品目）：住居、家具・家事用品、被服及び履物、保健医療、教育、光熱・水道、教養娯楽、諸雑費",
          },
          {
            text: "中分類（4品目）：通信、交通・自動車等関係費、外食、外食以外食料",
          },
        ],
      },
      {
        heading: "データ加工",
        items: [
          {
            text: "e-Stat 提供のCSVデータに対し、以下の加工を実施：",
            subItems: [
              "2025年基準ウェイトを各月の接続指数へ固定適用した加重指数水準を試算（公式の前年比寄与度ではありません）",
              "「外食以外食料」は、加重後の「食料」から加重後の「外食」を差し引いて算出（加重値では 食料 = 外食以外食料 + 外食）",
              "「交通」と「自動車等関係費」を合算して「交通・自動車等関係費」を算出",
            ],
          },
          {
            text: "10大費目の比較は、公表ウェイトの丸め差を保持し、実際の合計（10002）で正規化",
          },
          {
            text: "2025年基準の長期接続CSVが未配置の場合は、連続表示を維持するため既存の長期CSVへフォールバック",
          },
          { text: "表示期間：2005年〜最新月" },
          { text: "基準年：2025年（2025年平均 = 100、2024年以前は接続指数）" },
        ],
      },
    ],
  },
  "consumption-expenditure": {
    source: "e-Stat「四半期別GDP統計」／e-Stat「分布調整済み原数値CTIミクロ」",
    url: "https://www.e-stat.go.jp/stat-search/files?toukei=00100409&tstat=000001014470",
    sections: [
      {
        heading: "データの内訳",
        items: [
          {
            text: "2005年〜2017年：四半期別GDP統計の「民間最終消費支出」を使用",
          },
          {
            text: "2018年〜最新：分布調整済み原数値CTIミクロを使用",
          },
          {
            text: "内訳は9大費目（食料、住居、光熱・水道、家具・家事用品、被服及び履物、保健医療、交通・通信、教育、教養娯楽）と諸雑費・CPI外支出に分類して表示",
          },
        ],
      },
      {
        heading: "データ加工",
        items: [
          {
            text: "月次原系列データ（名目・実質）を四半期ごと（1-3月、4-6月、7-9月、10-12月）に平均化",
          },
          {
            text: "2020年基準で指数化（2020年平均 = 100）",
          },
          {
            text: "2017年まではサポート系列（民間最終消費支出）をCTIミクロの2020年水準にスケーリングして結合",
          },
          {
            text: "「諸雑費・CPI外支出」は、総消費支出から各費目（住居、食料等）の合計を差し引いた差分として別途算出",
          },
          {
            text: "ツールチップの「合計」は、その時点で表示中（凡例で非表示にしていない）の系列の合計値",
          },
        ],
      },
    ],
  },
  earnings: {
    source: "e-Stat「毎月勤労統計調査」（厚生労働省）",
    url: "https://www.e-stat.go.jp/stat-search/files?page=1&toukei=00450071&tstat=000001011791",
    sections: [
      {
        heading: "データの内訳",
        items: [
          {
            text: "所定内給与（エリア）：基本給等の月次実値を指数化",
          },
          {
            text: "所定外給与（エリア）：残業代等の月次実値を指数化",
          },
          {
            text: "特別給与（エリア）：賞与等の12か月移動平均を指数化",
          },
          {
            text: "時間当たり給与（ライン）：総給与 ÷ 総労働時間を指数化",
          },
          {
            text: "15歳以上国民当たり給与（ライン）：総給与×就業者数÷15歳以上人口を指数化",
          },
          {
            text: "CPI総合(参考)（ライン）：消費者物価指数総合",
          },
        ],
      },
      {
        heading: "データ加工",
        items: [
          { text: "すべての給与系列は2020年基準で指数化（2020年平均 = 100）" },
          { text: "所定内給与・所定外給与：月次実値を使用" },
          { text: "特別給与：12か月移動平均を使用" },
          {
            text: "時間当たり給与：(所定内給与実値 + 所定外給与実値 + 特別給与12か月移動平均) ÷ 総労働時間12か月移動平均",
          },
          {
            text: "15歳以上国民当たり給与：((所定内給与実値 + 所定外給与実値 + 特別給与12か月移動平均) × 就業者数) ÷ 15歳以上人口",
          },
        ],
      },
    ],
  },
  "new-graph": {
    source:
      "e-Stat「毎月勤労統計調査」／e-Stat「消費者物価指数」／e-Stat「分布調整済み原数値CTIミクロ」／e-Stat「四半期別GDP統計」",
    url: "https://www.e-stat.go.jp/stat-search/files?page=1&toukei=00200573&tstat=000001150147",
    sections: [
      {
        heading: "表示している系列",
        items: [
          {
            text: "給与（総合）：所定内給与 + 所定外給与 + 特別給与の12か月移動平均を指数化",
          },
          {
            text: "民間最終消費支出（総合）：2005年〜2017年、四半期別GDP統計の「民間最終消費支出（名目原系列）」を12か月移動平均で指数化（※2018年以降の延長オプションを用意）",
          },
          {
            text: "CTI消費支出（総合）：2018年以降、分布調整済み原数値CTIミクロの「消費支出（名目）」を12か月移動平均で指数化",
          },
          {
            text: "物価指数（総合）：消費者物価指数総合を12か月移動平均で指数化",
          },
        ],
      },
      {
        heading: "データ加工",
        items: [
          { text: "すべての系列は2020年基準で指数化（2020年平均 = 100）" },
          { text: "12か月移動平均（12MA）により季節変動を除去" },
          { text: "給与・消費・物価を同一スケールで比較可能" },
        ],
      },
    ],
  },
  residual: {
    source: "e-Stat「毎月勤労統計調査」／e-Stat「消費者物価指数」",
    url: "https://www.e-stat.go.jp/stat-search/files?page=1&toukei=00200573&tstat=000001150147",
    sections: [
      {
        heading: "データ加工",
        items: [
          { text: "給与指数から物価指数を差し引いた値を表示（給与 − 物価）" },
          { text: "残差系列は2か月移動平均（2MA）で平滑化" },
          { text: "差分は2020年平均 = 0 となる" },
          {
            text: "給与指数（総合）：所定内給与 + 所定外給与 + 特別給与12か月移動平均を指数化（2020年平均 = 100）",
          },
          {
            text: "物価指数（総合）：消費者物価指数総合を指数化（2020年平均 = 100）",
          },
        ],
      },
    ],
  },
};

const fallbackCpiText = (text: string) =>
  text
    .replace(
      "全国・月次の2025年平均=100の公式接続指数を表示",
      "全国・月次の2020年平均=100の既存長期CSV（フォールバック）を表示",
    )
    .replace(/2025年基準ウェイト/g, "2020年基準ウェイト")
    .replace(
      "2025年基準の長期接続CSVが未配置の場合は、連続表示を維持するため既存の長期CSVへフォールバックします。",
      "2025年基準の長期接続CSVが未配置のため、2020年基準のフォールバックCSVを使用しています。",
    )
    .replace(
      "2025年基準の長期接続CSVが未配置の場合は、連続表示を維持するため既存の長期CSVへフォールバック",
      "2025年基準の長期接続CSVが未配置のため、2020年基準のフォールバックCSVを使用",
    )
    .replace(
      /基準年：2025年（2025年平均 = 100、2024年以前は接続指数）/,
      "基準年：2020年（2020年平均 = 100）",
    )
    .replace(/基準年：2025年（2025年平均 = 100）/, "基準年：2020年（2020年平均 = 100）");

/**
 * Resolves CPI explanatory text from the same source selection used by the
 * server loader. Non-CPI charts retain their static descriptions.
 */
export function getChartInfoContent(
  chartKey: keyof typeof CHART_INFO,
  cpiState?: CpiChartInfoState,
): ChartInfoContent {
  const content = CHART_INFO[chartKey];
  if (!cpiState || (chartKey !== "cpi-major" && chartKey !== "stacked-area")) return content;

  const isUnavailable = cpiState.sourceMode === "unavailable" || cpiState.baseYear === null;
  if (isUnavailable) {
    const label = cpiState.label ?? "CPIデータは現在利用できません";
    return {
      ...content,
      sections: [{ heading: "データ状態", items: [{ text: label }] }],
    };
  }

  const isFallback = cpiState.sourceMode === "fallback" || cpiState.dataState === "2020-fallback";
  const label =
    cpiState.label ?? (isFallback ? "2020年基準のフォールバックCSV" : "2025年基準の公式接続指数");
  const sections = content.sections.map((section) => ({
    ...section,
    items: section.items
      .filter((item) => !isFallback || !item.text.startsWith("2024年以前は旧基準"))
      .map((item) => ({
        ...item,
        text: isFallback ? fallbackCpiText(item.text) : item.text,
        subItems: item.subItems?.map((subItem) =>
          isFallback ? fallbackCpiText(subItem) : subItem,
        ),
      })),
  }));

  return {
    ...content,
    source: `${isFallback ? content.source.replace("（2025年基準）", "（2020年基準）") : content.source}（${label}）`,
    url: isFallback
      ? "https://www.e-stat.go.jp/stat-search/files?page=1&toukei=00200573&tstat=000001150147"
      : content.url,
    sections: [{ heading: "データ状態", items: [{ text: label }] }, ...sections],
  };
}
