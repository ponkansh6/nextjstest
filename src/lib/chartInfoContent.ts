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

export const CHART_INFO: Record<string, ChartInfoContent> = {
  "cpi-major": {
    source: "e-Stat「消費者物価指数 長期時系列データ（2020年基準）」",
    url: "https://www.e-stat.go.jp/",
    sections: [
      {
        heading: "表示している指数",
        items: [
          { text: "総合：全品目を対象とした総合指数（ヘッドラインCPI）" },
          { text: "生鮮食品を除く総合：生鮮食品を除いたコア指数" },
          { text: "生鮮食品及びエネルギーを除く総合：生鮮食品とエネルギーを除いたコアコア指数" },
          { text: "食料（酒類を除く）及びエネルギーを除く総合" },
        ],
      },
      {
        heading: "データ加工",
        items: [
          {
            text: "e-Stat 提供のCSVデータに対し、以下の加工を実施：",
            subItems: [
              "「食料」から「外食」を差し引いて「外食以外食料」を算出",
              "「交通」と「自動車等関係費」を合算して「交通・自動車等関係費」を算出",
            ],
          },
          { text: "表示期間：2004年〜最新月" },
          { text: "基準年：2020年（2020年平均 = 100）" },
        ],
      },
    ],
  },
  "stacked-area": {
    source: "e-Stat「消費者物価指数 長期時系列データ（2020年基準）」",
    url: "https://www.e-stat.go.jp/",
    sections: [
      {
        heading: "費目別寄与度の解釈",
        items: [
          { text: "各費目が全体の物価上昇にどれだけ寄与しているかを示します" },
          { text: "積み上げ棒グラフは、各カテゴリーの寄与度を合計し、全体像を把握できます" },
          { text: "凡例の項目をクリックして、特定の費目の表示/非表示を切り替えることができます" },
        ],
      },
      {
        heading: "データ加工",
        items: [
          {
            text: "e-Stat 提供のCSVデータに対し、以下の加工を実施：",
            subItems: [
              "「食料」から「外食」を差し引いて「外食以外食料」を算出",
              "「交通」と「自動車等関係費」を合算して「交通・自動車等関係費」を算出",
            ],
          },
          { text: "表示期間：2004年〜最新月" },
          { text: "基準年：2020年（2020年平均 = 100）" },
        ],
      },
    ],
  },
};
