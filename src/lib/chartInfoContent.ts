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
          { text: "e-Stat 提供のCSVデータを読み込んで表示" },
          { text: "表示期間：2005年〜最新月" },
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
        heading: "表示している費目",
        items: [
          {
            text: "大分類（8品目）",
            subItems: [
              "住居",
              "家具・家事用品",
              "被服及び履物",
              "保健医療",
              "教育",
              "光熱・水道",
              "教養娯楽",
              "諸雑費",
            ],
          },
          {
            text: "中分類（4品目）",
            subItems: ["通信", "交通・自動車等関係費", "外食", "外食以外食料"],
          },
        ],
      },
      {
        heading: "データ加工",
        items: [
          {
            text: "e-Stat 提供のCSVデータに対し、以下の加工を実施：",
            subItems: [
              "各費目の物価変動にウェイト（相対重要度）を乗じて寄与度を算出",
              "「食料」から「外食」を差し引いて「外食以外食料」を算出",
              "「交通」と「自動車等関係費」を合算して「交通・自動車等関係費」を算出",
            ],
          },
          { text: "表示期間：2005年〜最新月" },
          { text: "基準年：2020年（2020年平均 = 100）" },
        ],
      },
    ],
  },
};
