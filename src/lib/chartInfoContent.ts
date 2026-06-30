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
        heading: "表示している指標",
        items: [
          {
            text: "消費支出（名目）：調査時点の価格で集計した支出額。インフレ・デフレの影響を受けたままの金額",
          },
          {
            text: "消費支出（実質）：物価変動の影響を除去した支出額。2020年基準の消費者物価指数でデフレートした実質値",
            subItems: [
              "「二人以上の世帯」は、単身世帯を除く一般世帯を対象とした調査結果",
              "単身世帯（単身世帯調査）とは調査対象・集計方法が異なるため、単純合算不可",
              "農林漁家世帯を除く「勤労者世帯」「無職世帯」等の内訳も公表されているが、本チャートでは「二人以上の世帯」全体を表示",
            ],
          },
        ],
      },
      {
        heading: "データ加工",
        items: [
          {
            text: "月次原データ（名目・実質）から四半期平均を算出",
            subItems: [
              "月次原系列データを四半期ごと（1-3月、4-6月、7-9月、10-12月）に平均化",
              "季節調整済み系列（季節調整値）は公表されていないため、原系列の四半期平均を使用",
            ],
          },
          {
            text: "2020年基準で指数化（2020年平均 = 100）",
            subItems: [
              "各四半期の実質消費支出を、2020年四半期平均で除して指数化（2020年平均 = 100）",
              "名目消費支出についても同様に2020年平均で指数化し、名目・実質の乖離を可視化",
            ],
          },
          { text: "表示期間：2005年第1四半期〜最新四半期" },
          { text: "基準年：2020年（2020年平均 = 100）" },
        ],
      },
    ],
  },
};