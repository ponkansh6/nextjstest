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
  baseYear: 2025 | null;
  sourceMode?: "official-long" | "unavailable";
  label?: string;
  reason?: string | null;
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
  status?: "valid" | "invalid";
  reason?: string | null;
  baseline?: number | null;
  artifactRoot?: string | null;
  artifactStatus?: "ready" | "unavailable";
  artifactReason?: string | null;
  source?: string;
  unit?: string;
  series?: {
    raw: CtiPublicSeriesState;
    comparison: CtiPublicSeriesState;
  };
}

export interface CtiPublicSeriesState {
  key: string;
  valueType: "raw" | "comparison";
  unit: string;
  source: string;
  status: "valid" | "invalid";
  reason: string | null;
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
    source: "e-Stat「消費動向指数（CTIミクロ基本系列・調整系列）」",
    url: "https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=000040499087",
    sections: [
      {
        heading: "対象と見方",
        items: [
          {
            text: "二人以上の世帯の消費支出を四半期ごとに表示します。名目はその時点の金額、実質は消費者物価指数（CPI）で物価変動を調整した額（2025年基準）です。",
          },
          {
            text: "名目データは、2016年第4四半期までは推計値、2017年第1四半期以降はe-Statの公式四半期値です。",
          },
          {
            text: "「その他」は総額から他の9費目を差し引いて算出しています。",
          },
        ],
      },
      {
        heading: "実質値の見方",
        items: [
          {
            text: "「その他」には対応する物価指数がないため、総合CPI（持家の帰属家賃を除く）を代用した概算です。",
          },
          {
            text: "実質総額は内訳とは別に計算するため、9費目と「その他」の実質値を足しても総額とは一致しません。",
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
          { text: "すべての給与系列は2025年基準で指数化（2025年平均 = 100）" },
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
      "e-Stat「毎月勤労統計調査」／e-Stat「消費者物価指数 長期時系列データ」／消費系列の月次データ（家計調査およびe-Stat公式系列）",
    url: "https://www.e-stat.go.jp/stat-search/files?page=1&toukei=00200573&tstat=000001150147",
    sections: [
      {
        heading: "3つの動き",
        items: [
          {
            text: "給与：定期給与・残業代・賞与などを含む給与の動き",
          },
          {
            text: "消費：家計の名目消費支出の動き",
          },
          {
            text: "物価：全国の消費者物価指数（総合）の動き",
          },
        ],
      },
      {
        heading: "読み方と注意",
        items: [
          {
            text: "2025年を基準に指数化し、3系列の変化を比較します。季節変動をならすため、各月の値はその月を含む直近12か月の平均です。",
          },
          {
            text: "給与と消費支出は、物価変動を差し引いていない名目値です。",
          },
          {
            text: "消費の元データは、2016年以前が推計値、2017年以降がe-Statの公式月次値です。",
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
          { text: "計算式：給与指数 − 物価指数" },
          { text: "残差系列は2か月移動平均（2MA）で平滑化" },
          {
            text: "給与指数・物価指数とも2025年平均 = 100に基準化し、2か月移動平均後の差分を2025年平均 = 0に再基準化",
          },
          {
            text: "給与指数（総合）：所定内給与 + 所定外給与 + 特別給与12か月移動平均を指数化（2025年平均 = 100）",
          },
          {
            text: "物価指数（総合）：消費者物価指数総合を指数化（2025年平均 = 100）",
          },
        ],
      },
    ],
  },
};

export function getCpiUnavailableLabel(reason?: string | null): string {
  switch (reason) {
    case "cpi_source_missing":
      return "CPIデータの元ファイルが見つかりません。";
    case "cpi_metadata_invalid":
      return "CPIデータのメタデータが不正です。";
    case "cpi_hash_mismatch":
      return "CPIデータの整合性チェックに失敗しました。";
    case "cpi_schema_invalid":
      return "CPIデータの形式が不正です。";
    case "cpi_period_invalid":
      return "CPIデータの期間が不正です。";
    case "cpi_value_invalid":
      return "CPIデータの値が不正です。";
    default:
      return "CPIデータは現在利用できません。";
  }
}

/**
 * Resolves CPI explanatory text from the same source selection used by the
 * server loader. Non-CPI charts retain their static descriptions.
 */
export function getChartInfoContent(
  chartKey: keyof typeof CHART_INFO,
  cpiState?: CpiChartInfoState,
  _ctiState?: CtiChartInfoState,
): ChartInfoContent {
  const content = CHART_INFO[chartKey];
  if (chartKey === "consumption-expenditure") {
    // This chart always shows quarterly household expenditure. Monthly CTI
    // selection/status details do not describe the series shown here.
    return content;
  }
  if (!cpiState || (chartKey !== "cpi-major" && chartKey !== "stacked-area")) return content;

  const isUnavailable = cpiState.sourceMode === "unavailable" || cpiState.baseYear === null;
  if (isUnavailable) {
    const items: ChartInfoItem[] = [{ text: "CPIデータ未取得" }];
    if (cpiState.reason) {
      items.push({ text: getCpiUnavailableLabel(cpiState.reason) });
    }
    return {
      ...content,
      sections: [{ heading: "データ状態", items }],
    };
  }

  const label = "2025年基準の公式接続指数";
  const sections = content.sections;

  return {
    ...content,
    source: `${content.source}（${label}）`,
    url: content.url,
    sections: [{ heading: "データ状態", items: [{ text: label }] }, ...sections],
  };
}
