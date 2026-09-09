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

/**
 * Selected CTI compatibility-set state passed from the server.  The loader is
 * the source of truth: the UI must not infer a series variant from a filename
 * or describe an unverified 2025 input as selected.
 */
export interface CtiChartInfoState {
  baseYear: 2020 | 2025 | null;
  sourceMode: "official-connected" | "rollback" | "unavailable";
  seriesLabel?: string;
  supportLabel?: string;
  comparisonNormalization?: "2025-annual-average" | "unavailable";
  unavailableReason?: string;
  /** GDP comparison state is independently validated by the server loader. */
  gdp?: GdpChartInfoState;
}

export interface GdpChartInfoState {
  availability: "available" | "unavailable";
  displayNormalizationYear?: 2025;
  reason?: string;
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
          { text: "表示期間：2005年〜最新月" },
          { text: "基準年：2025年（2025年平均 = 100、2024年以前は接続指数）" },
        ],
      },
    ],
  },
  "consumption-expenditure": {
    source: "e-Stat「消費動向指数（CTIミクロ）」／e-Stat「四半期別GDP統計」",
    url: "https://www.e-stat.go.jp/stat-search/files?toukei=00100409&tstat=000001014470",
    sections: [
      {
        heading: "データの内訳",
        items: [
          {
            text: "GDP参考値：四半期別GDP統計の「民間最終消費支出」を公式金額のまま使用",
          },
          {
            text: "CTIミクロ：選択済みの総世帯公式系列を使用。公式提供範囲は2017年以降で、旧CTI系列との接続は行いません。",
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
            text: "消費支出（名目・実質）と費目別の値は、選択済みCTI公式系列の公表値を表示。GDP参考値はCTI費目合計に加算しません。",
          },
          {
            text: "GDP参考値の名目は公式金額（current prices、固定の基準年なし）、実質は前暦年基準連鎖方式の公式値（2020暦年連鎖価格が参照年）です。実質連鎖系列は非加法的なため、内訳を足し上げません。",
          },
          {
            text: "GDPとCTIは調査定義と作成方法が異なるため、両者を統計的な係数で接続していません。",
          },
          {
            text: "「諸雑費・CPI外支出」は、総消費支出から各費目（住居、食料等）の合計を差し引いた差分として別途算出",
          },
          {
            text: "表、CSV、ツールチップのGDP参考値は公式金額として、名目・実質と価格概念を区別して表示します。ツールチップの「合計」は、その時点で表示中（凡例で非表示にしていない）のCTI費目のみの合計値です。",
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
      "e-Stat「毎月勤労統計調査」／e-Stat「消費者物価指数」／e-Stat「消費動向指数（CTIミクロ）」／e-Stat「四半期別GDP統計」",
    url: "https://www.e-stat.go.jp/stat-search/files?page=1&toukei=00200573&tstat=000001150147",
    sections: [
      {
        heading: "表示している系列",
        items: [
          {
            text: "給与（総合）：所定内給与 + 所定外給与 + 特別給与の12か月移動平均を指数化",
          },
          {
            text: "民間最終消費支出（総合）：四半期別GDP統計の公式金額を比較用に2025年の4四半期平均=100へ換算した指数。2017年までを表示し、2017年以降は延長オプションとして参考表示に切り替え可能です。",
          },
          {
            text: "CTI消費支出（総合）：選択済みの総世帯CTIミクロ「消費支出（名目）」を12か月移動平均で表示。公式提供範囲は2017年以降で、旧CTI系列との接続は行いません。",
          },
          {
            text: "物価指数（総合）：消費者物価指数総合を12か月移動平均で指数化",
          },
        ],
      },
      {
        heading: "データ加工",
        items: [
          {
            text: "12か月移動平均（12MA）は各系列の生値から、連続する12か月がそろう場合だけ計算します。",
          },
          {
            text: "GDP比較線は、名目・実質それぞれの公式金額を2025年の4四半期平均=100へ換算した比較指数だけを使用します。この換算は表示尺度をそろえるだけで、公式GDPの単位、価格概念、基準・参照年を変更しません。",
          },
          {
            text: "GDPの2025年4四半期または来歴を確認できない場合、GDP比較線は表示しません。表示可否はCTIの基準年とは独立して判定し、直近値による補完、CTI係数の流用、GDPとCTIの境界接続は行いません。",
          },
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
      "全国・月次の2020年平均=100の指数データを表示",
    )
    .replace(/2025年基準ウェイト/g, "2020年基準ウェイト")
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
  ctiState?: CtiChartInfoState,
): ChartInfoContent {
  const content = CHART_INFO[chartKey];
  if (chartKey === "consumption-expenditure" || chartKey === "new-graph") {
    return resolveCtiChartInfo(content, ctiState, chartKey === "new-graph");
  }
  if (!cpiState || (chartKey !== "cpi-major" && chartKey !== "stacked-area")) return content;

  const isUnavailable = cpiState.sourceMode === "unavailable" || cpiState.baseYear === null;
  if (isUnavailable) {
    const label = "CPIデータ未取得";
    return {
      ...content,
      sections: [{ heading: "データ状態", items: [{ text: label }] }],
    };
  }

  const isFallback = cpiState.sourceMode === "fallback" || cpiState.dataState === "2020-fallback";
  const label = isFallback ? "2020年基準の指数データ" : "2025年基準の公式接続指数";
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

function resolveCtiChartInfo(
  content: ChartInfoContent,
  ctiState: CtiChartInfoState | undefined,
  isComparison: boolean,
): ChartInfoContent {
  const gdpItem = isComparison ? getGdpComparisonInfoItem(ctiState?.gdp) : undefined;
  if (!ctiState || ctiState.sourceMode === "unavailable" || ctiState.baseYear === null) {
    return {
      ...content,
      sections: [
        {
          heading: "データ状態",
          items: [
            {
              text: ctiState?.unavailableReason
                ? `消費データを表示できません：${ctiState.unavailableReason}`
                : "消費データは現在利用できません。",
            },
          ],
        },
        ...(gdpItem ? [{ heading: "GDP比較の状態", items: [gdpItem] }] : []),
        ...(isComparison ? content.sections : []),
      ],
    };
  }

  const isOfficial = ctiState.sourceMode === "official-connected";
  const series = ctiState.seriesLabel ?? "選択済みの公式系列";
  const stateItems: ChartInfoItem[] = [
    {
      text: isOfficial
        ? `総世帯の2025年基準CTIミクロ（${series}）を使用しています。2024年以前は、総務省統計局が2025年基準へ接続して公表した系列です。`
        : "現在は2020年基準の互換データを表示しています。",
    },
    {
      text: "CTIミクロは、家計調査、家計消費状況調査、家計消費単身モニター調査の結果を合成して作成されます。",
    },
  ];
  if (ctiState.supportLabel) stateItems.push({ text: ctiState.supportLabel });
  if (gdpItem) stateItems.push(gdpItem);

  return {
    ...content,
    source: `${content.source}（${isOfficial ? "2025年基準の公式接続系列" : "2020年基準の互換データ"}）`,
    sections: [{ heading: "データ状態", items: stateItems }, ...content.sections],
  };
}

function getGdpComparisonInfoItem(gdpState: GdpChartInfoState | undefined): ChartInfoItem {
  if (gdpState?.availability === "available") {
    return {
      text: "GDP比較線は、GDPの公式金額を2025年の4四半期平均=100へ換算した表示用の指数です。これはCTIの基準年とは別の表示尺度です。",
    };
  }
  return {
    text: gdpState?.reason
      ? `GDP比較線は利用できません。${gdpState.reason}`
      : "GDP比較線は利用できません。GDP比較に必要なデータを確認中です。",
  };
}
