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
  "consumption-expenditure": {
    source: "総務省統計局「家計調査（二人以上の世帯）」",
    url: "https://www.stat.go.jp/data/kakei/",
    sections: [
      {
        heading: "データの内訳",
        items: [
          {
            text: "2005年〜2016年：四半期別GDP統計の「民間最終消費支出」を使用",
          },
          {
            text: "2017年〜最新：分布調整済み原数値CTIミクロを使用",
          },
          {
            text: "内訳はCPI10大費目と諸雑費・CPI外支出に分類して表示",
          },
        ],
      },
      {
        heading: "データ加工",
        items: [
          {
            text: "月次原データ（名目・実質）から四半期平均を算出",
            subItems: ["月次原系列データを四半期ごと（1-3月、4-6月、7-9月、10-12月）に平均化"],
          },
          {
            text: "2020年基準で指数化（2020年平均 = 100）",
          },
          { text: "表示期間：2005年第1四半期〜最新四半期" },
          {
            text: "「諸雑費・CPI外支出」は、総消費支出から各費目（住居、食料等）の合計を差し引いた差分として別途算出",
          },
        ],
      },
    ],
  },
};
