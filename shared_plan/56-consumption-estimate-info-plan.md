# 消費支出infoに2016年以前の推計方法を開示する計画

> **[状態]** 2026-10-20時点で計画作成済み。実装・仕様同期・テストは未着手。

## 目的

消費支出チャートの既存infoダイアログに、2016年以前の推計値がどのように作られるかを知りたい利用者向けの任意開示を加える。通常の説明は読みやすい長さに保ち、詳細は利用者が自ら展開した場合に読めるようにする。名目系列の2016Q4までの推計と2017Q1以降の公式四半期系列という境界、および既存の名目・実質両チャートを維持する。

## 対象範囲

- 既存 `consumption-expenditure` infoの説明文と、その詳細開示。
- `ChartInfoContent` の任意 disclosure データと `ChartInfoContentRenderer` のデータ駆動描画。
- info本文・開閉・dialog操作を確認する既存テスト。
- 実装に合わせたOpenSpec更新。今回は計画作成のみのため、仕様書・実装・テストは変更しない。

追加モーダル、数値計算・データ・API変更、月次NewGraphのinfo変更は対象外。既存概要、出典、名目・実質の両チャート、推計と公式値の境界を保つ。

## 推奨UIと表示文案

既存info dialogの末尾に、初期状態を閉じたネイティブ `<details><summary>2016年以前の推計方法</summary>…</details>` を1段だけ置く。追加のポップアップや多段アコーディオンは設けない。概要は従来どおり短く保ち、年次式、四半期配分、Otherと実質値の説明は展開後にだけ表示する。

**既存概要本文案（常時表示）**

> 名目値は2016Q4まで推計値、2017Q1以降は公式の四半期値です。実質値は消費者物価指数で調整しています。

**詳細の導入文案**

> 2016年以前の年次名目指数は、CTI基本系列を2017年の調整系列との接続点に合わせ、二人以上世帯の構成割合の2017年との差による費目別補正を加えて推計します。2017年以降の年次値には公式の調整系列を使います。2016年以前の値は公式の過去値ではありません。

詳細は読みやすい番号付き説明とし、次を含める。

1. 年次推計値を、2017年の接続と二人以上世帯構成割合に応じた費目別補正から作ること。推計済み9費目と「その他の消費支出」を合算して総合を作ること。
2. 四半期の各名目指数は、年次推計値（名目指数）に、その四半期の3か月の月次名目CTI平均を同年12か月の月次名目CTI平均で割った比率を掛けて配分すること。
3. 月次の「その他の消費支出」は総合から9費目を差し引いて、配分用の動きを求めること。2016年以前の四半期Otherには、その費目の年次推計値と月次比率を使うこと。2017年以降の公式四半期Otherは総合から9費目を差し引くこと。実質値は各四半期の名目値に100を掛け、当該3か月のCPI平均で割ること。「その他」の実質化には持家の帰属家賃を除く総合CPIを近似指標として使い、実質総合も独立に調整するため実質費目の合計とは一致しない場合があること。

欠測時は値を出さない旨を既存表示と矛盾しない範囲で記す。内部の計画番号、成果物名、検証ゲート、raw/metadata等の開発用語はUIへ出さない。表示に具体的な数値例を含める場合は架空例であることを明示し、誤読を招く精密そうな数値は避ける。

## テクニカルキーポイント

- 第一候補は `ChartInfoContent` 型に任意の `disclosures?: { summary: string; sections: ChartInfoSection[] }[]` を足し、既存のSection/Item表現を再利用すること。`ChartInfoContentRenderer` が配列を描画し、`chartKey` 固有の条件分岐に説明文を埋め込まない。disclosureがない既存チャートinfoの出力を保つ。
- 公開経路の年次式は金額ではなく**2025年基準の名目指数**。費目 `i`、年 `y` について、`A`をCTI調整系列、`B`をCTI基本系列、`Pi`を二人以上世帯の構成割合として、`base_i,y = B_i,y × (A_i,2017 / B_i,2017)`、`Gamma_i = (A_i,2025 − base_i,2025) / (Pi_2025 − Pi_2017)`、`annual_i,y = base_i,y + Gamma_i × (Pi_y − Pi_2017)`。総合は推計済み9費目と「その他」の和。公開経路は `loadCtiAdjustedV2Estimate({ inputContract: 'annual-public', requireAnnualAnchorValidation: true })` から年次計算coreへ入り、`quarterly-annual-anchor` との比較を行うため、Pi補正は年次推計の前段に適用済みである。Piの分子・分母の詳細は根拠が確定していないためUI・計画で定義を断定しない。Pi補正なしの別contractと取り違えない。
- 対象コード上の確認根拠は年次式の `server/lib/ctiAdjustedConnectionEstimateV2.ts`、公開経路を呼び出す `server/lib/data-loader/ctiAdjusted.ts`、月次比率と配分の `server/lib/view-models/quarterlyAggregation.ts`、実質化の `server/lib/view-models/quarterlyProjection.ts` である。公開経路は `loadCtiAdjustedV2Estimate({ inputContract: 'annual-public', requireAnnualAnchorValidation: true })` を使う。実装時にも公開経路の呼び出し引数を維持し、Pi補正なしのcontractを誤って使わない。
- 四半期名目指数は `annual_i,y × (当該四半期3か月の月次名目CTI平均 / 同年12か月の月次名目CTI平均)`。年次値を金額と説明しない。月次Otherは総合−9費目として配分用の動きを作る。2016年以前の四半期Otherはその費目の年次推計値と月次比率を使い、2017年以降の公式四半期Otherは総合−9費目として作る。推計と公式四半期の境界は2016Q4/2017Q1で維持する。
- 実質化の照合元は `server/lib/view-models/quarterlyProjection.ts`。変換は `名目値 × 100 ÷ 当該四半期3か月のCPI平均`。Otherの近似CPIは持家の帰属家賃を除く総合系列であり、実質総合は独立調整される。
- `<details>` / `<summary>` の標準開閉・キーボード操作を使う。開閉用のReact stateや独自 `aria-expanded` を追加せず、info dialogのClient Component境界も広げない。既存Next.jsガイドはイベントハンドラやstateがClient Componentを必要とするケースとして説明しているため、このネイティブ開閉は追加のclient boundaryを要しない。
- info dialog内でsummaryの可視フォーカス、詳細のスクロール、Escapeによるdialog終了とフォーカス復帰を確認する。ネイティブdetailsに追加のfocus trapを設けない。infoを閉じて再度開いたとき詳細が閉じた初期状態であることを確認する。

## 対象ファイルと段階

### 1. 内容と公開経路の照合

- `server/lib/ctiAdjustedConnectionEstimateV2.ts` の年次指数式、`server/lib/data-loader/ctiAdjusted.ts` の公開経路、`server/lib/view-models/quarterlyAggregation.ts` の月次比率とOther生成、`server/lib/view-models/quarterlyProjection.ts` の実質化を照合する。
- 現行の `src/lib/chartInfoContent.ts`、`src/app/components/ChartInfoContentRenderer.tsx`、`src/app/components/ChartInfoButton.tsx` と既存infoテストから、文章・dialog・focusの契約を記録する。
- 成果物: UI文案と実装経路が一致する根拠メモ。計画上の式と公開経路に差があれば実装開始前に文案を直す。

### 2. disclosureデータと描画

- `src/lib/chartInfoContent.ts` に消費支出infoの詳細セクションを追加し、概要と展開後の説明を分離する。
- `src/app/components/ChartInfoContentRenderer.tsx` を任意disclosureに対応させ、既存の非disclosureコンテンツを保持する。
- 必要な場合のみ `src/app/components/ChartInfoButton.tsx` を修正する。既存dialogのEscape・focus trap・focus復帰へ影響する変更は避ける。

### 3. テストとOpenSpec同期

- `tests/unit/chart-info-content.test.ts`、`tests/components/ChartInfoButton.test.tsx` の既存構成に合わせたrenderer/buttonテスト、および `tests/integration/plan40-quarterly-runtime-evidence.test.ts` の関連契約を更新する。
- `openspec/specs/nextjstest/spec.md` の消費支出info要件は、概要に数式・詳細CPI分類・欠測処理を列挙しない制約を保ちつつ、利用者がdetailsを展開した場合の年次推計・四半期配分・Other/実質化の説明を許す形へ直す。Data Sources / Data Flow / Component Tree / Requirements のうち変更がある節を実装に同期し、変更要件には `openspec/config.yaml` の規則に従ったWHEN/THENシナリオを記載する。今回の計画作成では仕様を変更しない。

## 受け入れ条件

- WHEN 消費支出infoを開く THEN 既存の概要、出典、名目・実質の説明と2016Q4/2017Q1の境界が維持され、詳細は初期状態で閉じている。
- WHEN 利用者が「2016年以前の推計方法」を開く THEN 年次名目指数推計、四半期への月次動向による配分、Other生成、CPIによる実質化とOtherの近似指標が読みやすく説明され、金額推計や公式の過去値との誤認を招かない。
- WHEN 2017年以降の年次値を説明する THEN 公式の調整系列を使うと示し、2016年以前の推計手順と混同させない。
- WHEN 詳細を開閉する THEN ネイティブsummaryのキーボード操作と可視フォーカスが機能し、独自state/ARIA管理や追加focus trapを導入しない。
- WHEN 利用者が詳細を開いた状態でinfoを閉じ、再度開く THEN 詳細は閉じた初期状態となり、Escapeでdialogを閉じた後に起点へフォーカスが戻る。
- WHEN 他のチャートのinfoを表示する THEN disclosure未指定の既存コンテンツとdialog操作は変わらない。
- WHEN 対象変更を実装する THEN OpenSpecのData Sources / Data Flow / Component Tree / Requirementsを変更範囲に合わせ、WHEN/THENシナリオを含めて同期する。
- WHEN 実装を検証する THEN 説明文テストで概要と詳細を分け、概要だけには2005Q1等の詳細文字列を含めず、展開後の詳細では対象年・計算説明を確認する。既存の月次NewGraph info R6eは変更しない。

## 実装時の検証案

テストが必要な場合、テスト実装はfixer、テスト実行と検証ゲートはOrchestratorが担当する。変更後の実在するscriptと対象テストを着手時に再確認する。

- `pnpm exec vitest run tests/unit/chart-info-content.test.ts tests/components/ChartInfoButton.test.tsx tests/integration/plan40-quarterly-runtime-evidence.test.ts` と、追加・更新したrendererテストを実行する。
- `pnpm type-check` でTypeScript型を、`pnpm lint:fast` でlintを確認する。
- dialog内部のdetails操作、Escape、focus復帰、再オープン時の閉状態を対象とした既存component/browser gateがある場合は、その実在するgateを実行する。必要なbuild/smoke確認は対象Next.js境界に応じて選ぶ。
- OpenSpecの該当要件とData Sources / Data Flow / Component Tree、実装、テストの説明範囲が一致することを確認する。`spec-refs`というpackage scriptは確認できないためコマンドとして仮定しない。coverageは既存coverage要件または変更内容に応じて適用する。
- 今回はshared_plan文書のみを作成し、実装・OpenSpec変更・テスト実行をしていない。
