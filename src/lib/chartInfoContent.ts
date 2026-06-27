export interface ChartInfoSection {
  heading: string;
  items: string[];
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
          "総合：全品目を対象とした総合指数（ヘッドラインCPI）",
          "生鮮食品を除く総合：生鮮食品を除いたコア指数",
          "生鮮食品及びエネルギーを除く総合：生鮮食品とエネルギーを除いたコアコア指数",
          "食料（酒類を除く）及びエネルギーを除く総合",
        ],
      },
      {
        heading: "データ加工",
        items: [
          "e-Stat 提供のCSVに格納された値をそのまま使用（加重平均等の追加加工なし）",
          "表示期間：2004年〜最新月",
          "基準年：2020年（2020年平均 = 100）",
        ],
      },
    ],
  },
};
