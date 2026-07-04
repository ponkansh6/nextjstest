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
    source: "e-Stat「四半期別GDP統計」／「分布調整済み原数値CTI」",
    url: "https://www.e-stat.go.jp/",
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
            text: "2017年以前はサポート系列（民間最終消費支出）をCTIの2020年水準にスケーリングして結合",
          },
          {
            text: "「諸雑費・CPI外支出」は、総消費支出から各費目（住居、食料等）の合計を差し引いた差分として別途算出",
          },
        ],
      },
    ],
  },
  earnings: {
    source: "厚生労働省「毎月勤労統計調査」",
    url: "https://www.mhlw.go.jp/toukei/list/30-1.html",
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
};
