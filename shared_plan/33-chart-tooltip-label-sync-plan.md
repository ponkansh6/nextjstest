# チャート別ツールチップ表示名・構成同期計画

作成日: 2026-09-16  
状態: 未実施（計画のみ）  
対象: CPI費目別、消費支出、給与、3種比較の凡例・ツールチップ表示契約と関連仕様・検証

## 1. 背景・現状課題

チャートごとにツールチップの行構成、系列名の取得元、長い表示名の扱いが揃っていない。CPI費目別は消費支出と視覚的な情報階層が異なり、給与は系列名・項目名が省略される可能性がある。3種比較では凡例が `COMPARISON_SERIES_REGISTRY` を基準にしていても、ツールチップが `payload.name` や Recharts の自動系列名に依存すると、凡例と異なる名称・順序・色になる。

この計画では、表示名契約を固定したうえで、給与の完全表示、3種比較の凡例／ツールチップ同期、CPI費目別ツールチップの消費支出形式への統一を順に実装する。

### スコープ

- `StackedAreaChart`、`SpendingBarChart`、`EarningsBreakdownChart`、`NewGraph` と共通ツールチップ／凡例の表示契約を整理・実装する。
- `CPI_CATEGORIES`、`getLegendLabel`、`EARNINGS_SERIES_REGISTRY`、`COMPARISON_SERIES_REGISTRY` を表示名・色・順序の契約として利用する。
- マウス／タッチの既存 `trigger`、active dot、ガイド線、dismiss、スクロール抑制を維持したまま表示だけを調整する。
- 実装と並行して `openspec/specs/nextjstest/spec.md` の Data Sources / Data Flow / Component Tree / Requirements を同期する。

### 非スコープ

- 給与・CPI・消費支出・GDP・CTI の計算、基準化、データソース、系列値の変更。
- チャートの軸、期間選択、凡例クリックによる表示／非表示、色パレット自体の刷新。
- ツールチップの表示トリガ、dismiss、active dot、ガイド線、プログラムスクロール抑制など既存入力挙動の再設計。
- 仕様書以外のアプリ本体・テストコードの変更（これは計画段階の非スコープであり、実装時は関連テストの追加・更新を許可する）。

## 2. 表示契約と受け入れ方針

- 表示名の正本はチャートごとの registry／定数とし、描画ライブラリが生成する名前を正本にしない。キー、完全表示名、色、順序を一つの契約から凡例とツールチップへ渡す。
- CPI tooltip は消費支出を参照モデルとし、実装時に既存 `SpendingBarChart` の実際の props／DOM／CSS を確認したうえで、DOM／表示階層を「日付／見出し → 費目行（色・完全ラベル・値・単位） → 合計行」とする。CPI固有の現行意味、入力単位、丸めは維持し、汎用 `CustomTooltip` の一律 formatter に吸収しない。計画上、CPI用 formatter の名称・入力単位・合計への適用方法を決め、formatter 単体テストを追加する。既存表示との互換を基本とする。
- CPI の `0` は既存の「0を表すフォーマット」で表示し、行を落とさない。`null`／`undefined` は `—` と表示し、合計計算から除外する。既存仕様と差がある場合は実装前に `spec.md` で確定する注記を置く。費目行集合はチャートが適用する費目一覧を正本とし、Recharts payload の有無だけで欠落させない。凡例クリックで hidden になった系列の表示方針は既存 visibility 契約を引き継ぐが、payload 欠落とは別状態として扱う。CPI合計は既存の費目合計定義を維持し、GDP系列を含めず、2018Q1以降はCTI費目のみとする。
- `CPI_CATEGORIES` と `stackedColors` が別配列である現状は無理に移行しない。キー／完全ラベル／色／順序を同じ投影から取得する不変条件を置き、実装時に配列長、配列順、各キーと色の対応を契約テストまたは開発時検証で確認する。
- 給与の対象は給与 tooltip の系列名、給与区分／項目名、日付見出しの可視テキストとする。tooltip 以外の凡例／表の短縮表示は既存互換を基本とするが、tooltip は `EARNINGS_SERIES_REGISTRY` の完全名称を使い、`payload.name` を正本にしない。DOM文字列だけでなく CSS の ellipsis／no-wrap／fixed width を解除し、日本語を自然に折り返す。既定値は横スクロールではなく `overflow-wrap: anywhere` 等の折返し、tooltip は viewport 内配置を優先し、375px／430px幅で完全表示を E2E 計測する。値列が潰れない grid／flex 設計にする。
- 3種比較は `COMPARISON_SERIES_REGISTRY` を正本とし、registry projection に `key`、`tooltipLabel`、`legendLabel`、`color`、数値 `order`、`enabledWhen`／`advanced` 相当を定義する。現行に `order` がなければ既存配列順を初期 order として数値化し、重複を契約テストで検出する。3種比較では `tooltipLabel` と `legendLabel` を同じ完全名称にする（給与だけは別要件として tooltip は完全名称、凡例は既存短縮を許容）。`adv=1`、advanced flag、描画／tooltip payload／凡例の表示条件は同じ可視系列集合にする。`payload.name`／Recharts 自動名には依存せず、未登録キーは本番では元キーを可視化する互換 fallback とし、テストで未登録を検出する。
- 全体の受入では、給与の全系列を行欠落なしで表示し、計算、給与独自基準化、値／色／順序を変更しない。CPI・比較系列も同様に表示契約だけを変更対象とする。

## 3. 実装フェーズ

### Phase 1 — 表示名契約の固定

**目的**  
凡例とツールチップが同じキーから同じ完全表示名・色・順序を取得できる土台を作る。

**変更対象**

- `src/lib/chartConstants.ts`（`CPI_CATEGORIES`、`getLegendLabel`、`EARNINGS_SERIES_REGISTRY`、`COMPARISON_SERIES_REGISTRY`）
- `src/app/components/CustomTooltip.tsx`
- `src/app/components/ChartLegend.tsx`
- `src/app/components/charts/useChartTooltipProps.tsx`
- 必要に応じて型定義と契約テスト

**テクニカルキーポイント**

- registry を `seriesKey -> { label, color, order, ... }` の解決元として扱い、`payload.name` や Recharts 自動名への直接依存を除去する。
- 完全表示名と凡例表示名を同一の解決関数／データから得る。未登録キーは黙って自動名へフォールバックせず、既存互換を壊さない明示的なフォールバック方針を決め、登録漏れを検出可能にする。
- `null`・ゼロ値・非active系列の意味を表示契約と混同せず、値の有無による系列定義の欠落と、値行の表示判断を分離する。
- 共通 tooltip props の `trigger`、active dot、ガイド線、dismiss、スクロール抑制に触れず、表示メタデータだけを渡す。

**完了条件**

- CPI・給与・3種比較で、凡例とツールチップが同一系列キーから完全表示名・色・順序を解決できる。
- `payload.name`／Recharts 自動名を正本として使う箇所がなく、登録漏れを契約テストで検出できる。
- ゼロ値・欠損・非active系列を後続フェーズで扱える表示対象一覧の境界が文書化されている。

### Phase 2 — 給与ツールチップの完全表示

**目的**  
給与ツールチップの系列名・項目名を省略なしで読める状態にする。計算値と基準化ロジックは一切変えない。

**変更対象**

- `src/app/components/EarningsBreakdownChart.tsx`
- `src/app/components/CustomTooltip.tsx`
- `src/app/components/ChartLegend.tsx`
- `src/app/components/CpiChart.module.css`
- `tests/components/CustomTooltip.test.tsx`、必要な給与／契約テスト

**テクニカルキーポイント**

- `EARNINGS_SERIES_REGISTRY` の完全表示名を可視テキストとして出力し、tooltip の幅・行レイアウトが文字列を切り詰めないようにする。
- `text-overflow: ellipsis`、`white-space: nowrap`、固定幅を解除し、横スクロールではなく `overflow-wrap: anywhere` 等で日本語を自然に折り返す。tooltip は viewport 内配置を優先し、値列が潰れない grid／flex 設計にする。
- 375px と 430px の viewport で、系列名・給与区分／項目名・日付見出しの全文を DOM と bounding box で E2E 計測する。既存のタッチ dismiss、スクロール抑制、`preventDefault` は維持する。
- salary の計算、12か月窓、基準化、`null` の伝播、ゼロ値の扱いには変更を加えない。

**完了条件**

- 長い給与系列名・項目名が desktop とモバイルで省略されず、ユーザーが全文を確認できる。
- 全給与系列の行が欠落せず、計算・給与独自基準化・値／色／順序が変わらない。
- 短い名称、欠損値、ゼロ値、既存の表示順に回帰がない。
- tooltip のタッチ／マウス操作と表示位置が従来どおり機能する。

### Phase 3 — 3種比較の凡例／tooltip同期

**目的**  
3種比較の凡例とツールチップを `COMPARISON_SERIES_REGISTRY` の完全な系列契約へ揃える。

**変更対象**

- `src/app/components/NewGraph.tsx`
- `src/app/components/CustomTooltip.tsx`
- `src/app/components/ChartLegend.tsx`
- `src/lib/chartConstants.ts`
- `tests/components/chart-tooltip-legend-contract.test.tsx`
- `tests/unit/series-registry.test.ts`、`tests/e2e/advanced-series.e2e.spec.ts`

**テクニカルキーポイント**

- registry projection の `key`／`tooltipLabel`／`legendLabel`／`color`／数値 `order`／`enabledWhen`（または `advanced`）を凡例と tooltip の両方へ渡す。order の重複を契約テストで検出し、配列順、`payload.name`、Recharts 自動名を比較基準にしない。
- 高度系列の表示／非表示フラグを registry と描画条件で共有し、非表示系列が tooltip だけに残る、または凡例だけに残る状態を防ぐ。
- `adv=1`、advanced flag、描画／tooltip payload／凡例を同じ可視系列集合にする。GDP/CTI境界（`2017Q4`／`2018Q1`）、通常／高度系列、hidden 状態の期待行を受入表にする。
- 未登録キーは本番では元キーを可視化する fallback とし、開発時または契約テストで検出する。登録済み系列は tooltipLabel／legendLabel を同一完全名称にする。
- `active dot`、ガイド線、既存の hover／touch trigger、dismiss、スクロール抑制は変更しない。

**完了条件**

- registry に登録された表示系列について、凡例と tooltip のキー・完全名・色・順序・高度系列状態が一致する。
- 高度系列オン／オフ、GDP/CTI境界、欠損期間でも不正な自動名・余分な行・色不一致がない。
- 契約テストと E2E で同期条件を機械的に検出できる。
- `2017Q4`／`2018Q1`、advanced on/off、hidden、未登録キーの期待行が受入表と DOM 検証で固定されている。

### Phase 4 — CPI tooltip の消費支出形式への統一

**目的**  
CPI費目別 tooltip の視覚階層と行構成を `SpendingBarChart` に倣わせ、比較可能性を高める。

**変更対象**

- `src/app/components/StackedAreaChart.tsx`
- `src/app/components/SpendingBarChart.tsx`（参照形式の確認と必要最小限の共通化）
- `src/app/components/CustomTooltip.tsx`
- `src/app/components/CpiChart.module.css`
- `src/lib/chartConstants.ts`
- `tests/components/CustomTooltip.test.tsx`
- `tests/components/chart-tooltip-legend-contract.test.tsx`
- `tests/components/SpendingBarChart.test.tsx`
- `tests/e2e/cpi-chart-categories.e2e.spec.ts`

**テクニカルキーポイント**

- 実装時に `SpendingBarChart` の props／DOM／CSS を確認し、日付／見出し → 費目行（色・完全ラベル・値・単位） → 合計行の階層を受入契約にする。
- CPI用 formatter の名称、入力単位、丸め、合計への適用を決めて `CustomTooltip` の一律 formatter から分離する。`0` は既存の0表示、`null`／`undefined` は `—`、合計からは除外し、差分は実装前に `spec.md` で確定する。
- チャートが適用する費目一覧を行生成の正本にし、payload の有無だけで落とさない。hidden は既存 visibility 契約に従い、payload 欠落とは区別する。合計対象は既存費目合計定義、GDP除外、2018Q1以降CTI費目のみを維持する。
- `CPI_CATEGORIES`／`stackedColors` の別配列は維持し、同一 projection のキー／完全ラベル／色／順序という不変条件、配列長・順序・色対応を検証する。
- 既存の `trigger`、active dot、ガイド線、dismiss、スクロール抑制と、合計行の formatter を保つ。

**完了条件**

- CPI tooltip が消費支出と同じ視覚階層・行構成になり、CPI の単位・formatter・合計行は維持される。
- 適用費目一覧のゼロ値・欠損・非active系列が仕様どおりに残り、行順・色・名称が凡例と一致する。
- CPI費目別の desktop／モバイル、マウス／タッチ表示に回帰がない。
- 適用費目の全行、0／null／undefined／payload欠落／hidden、合計、単位、丸めが受入表と formatter 単体テストで確認できる。

### Phase 5 — 仕様同期・検証

**目的**  
実装、仕様書、単体・契約・E2E の受け入れ条件を一致させ、表示契約の退行を防ぐ。

**変更対象**

- `openspec/specs/nextjstest/spec.md`
- `tests/components/CustomTooltip.test.tsx`
- `tests/components/chart-tooltip-legend-contract.test.tsx`
- `tests/components/SpendingBarChart.test.tsx`
- `tests/unit/series-registry.test.ts`
- `tests/e2e/cpi-chart-categories.e2e.spec.ts`
- `tests/e2e/legend-color-sync.e2e.spec.ts`
- `tests/e2e/advanced-series.e2e.spec.ts`

候補パスは実装時にリポジトリの実在ファイルを確認して確定し、存在しない候補を断定しない。

**テクニカルキーポイント**

- Data Sources に `CPI_CATEGORIES` と各 registry が表示契約の正本であること、Data Flow に「registry → 凡例／tooltip」の流れを記載する。
- Component Tree に `StackedAreaChart`、`EarningsBreakdownChart`、`NewGraph`、`CustomTooltip`、`ChartLegend`、`useChartTooltipProps` の契約関係を反映する。
- Requirements に、完全表示名、凡例／tooltip同期、CPIの消費支出形式、合計行、ゼロ／欠損保持、タッチ／マウス互換、モバイル可読性を WHEN/THEN Scenario として列挙する。`openspec/config.yaml` の rules.spec に従い、各要件に少なくとも1つの Scenario を置く。
- 単体では表示名解決・省略なし・ゼロ／欠損を扱い、契約テストではキー／名前／色／順序を扱い、E2E では実DOMの行構成・境界・高度系列・モバイル可読性を扱う。
- 既存 Scenario を先に調査し、重複する R 番号は増やさない。既存要件を改訂し、不可避な場合だけ新規番号を採番する。Data Sources には registry、CPI適用費目、CPI formatter の出所を、Data Flow には registry → legend／tooltip projection を、Component Tree には共有 props 契約を記載する。
- WHEN/THEN は個別に列挙する: CPI の 0／null／payload欠落／hidden、給与の長い名称（375／430px）、3種比較の未登録キー、advanced on/off、`2017Q4`／`2018Q1`、hover／click／touch／dismiss／scroll抑制。テスト対応は formatter 単体、metadata contract（key／label／color／order／advanced）、DOM の legend／tooltip 一致、CPI全行／合計、給与全文 CSS 測定、E2E 境界を各項目に対応付ける。

**完了条件**

- 仕様書の Data Sources / Data Flow / Component Tree / Requirements が実装と一致し、すべての追加要件に WHEN/THEN Scenario がある。
- 単体・契約・E2E の検証項目が、ゼロ値、欠損、長い名称、系列登録漏れ、行順／色不一致、GDP/CTI境界、高度系列、モバイル可読性をカバーする。
- 実装変更と仕様変更の差分を確認し、今回のスコープ外の計算・操作仕様に変更がない。
- `shared_plan` 内の状態は未実施のまま維持し、次担当と検証ゲート（lint／type-check／test／coverage／spec refs／smoke／E2E）を明記する。今回の計画作成ではテストを実行しない。

## 4. 検証計画とリスク

### 仕様書へ反映する個別 Scenario（WHEN / THEN）

- **CPI zero** — WHEN 適用費目の値が `0` のとき、THEN 既存の0表示 formatter で費目行を表示し、行を除外しない。
- **CPI null** — WHEN 値が `null` または `undefined` のとき、THEN 値を `—` と表示し、合計計算から除外する（既存仕様との差は実装前に確定）。
- **CPI payload欠落** — WHEN 適用費目が Recharts payload にないとき、THEN 費目一覧を正本として行を表示し、payload 欠落だけでは除外しない。
- **CPI hidden** — WHEN 凡例クリックで系列が hidden のとき、THEN 既存 visibility 契約に従う表示を行い、payload 欠落とは別に扱う。
- **給与全文** — WHEN 375px または 430px 幅で長い給与系列名・給与区分／項目名・日付見出しを表示するとき、THEN ellipsis／no-wrap／固定幅で切らず、日本語を折り返して全文を viewport 内で表示する。
- **比較未登録キー** — WHEN 3種比較に未登録キーが渡されたとき、THEN 本番は元キーを可視化する fallback を使い、契約テストは未登録として検出する。
- **advanced** — WHEN `adv=1` または advanced flag が on／off のとき、THEN 描画・tooltip payload・凡例が同じ可視系列集合になり、期待行だけを表示する。
- **GDP/CTI境界** — WHEN 時点が `2017Q4` または `2018Q1` のとき、THEN GDP／CTI の境界、行順、色、合計対象が既存定義どおりになる。
- **操作互換** — WHEN hover／click／touch／dismiss またはページスクロールを行ったとき、THEN tooltip の表示・終了、active dot、ガイド線、スクロール抑制が既存契約どおりに動作する。

### 境界受入表

| 対象    | 条件                         | 期待する tooltip／凡例                                                           |
| ------- | ---------------------------- | -------------------------------------------------------------------------------- |
| CPI     | 0／null／payload欠落／hidden | 全適用費目行、0／`—`、null は合計除外、hidden は既存 visibility 契約、合計行あり |
| 給与    | 長い名称、375px／430px       | 全系列の行、完全名称・日付見出し、折返し、値列を維持                             |
| 3種比較 | `2017Q4`                     | GDP系列境界前の既存系列集合・順序・色                                            |
| 3種比較 | `2018Q1`                     | CTI費目のみの境界後集合・順序・色、GDPを合計対象にしない                         |
| 3種比較 | advanced on／off、hidden     | 描画・payload・凡例が同じ可視集合、hidden は payload 欠落と区別                  |
| 3種比較 | 未登録キー                   | 本番は元キー fallback、テストは未登録検出                                        |

### 検証マトリクス

| 層       | 主な対象                                        | 確認内容                                                                                                                          |
| -------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 単体     | 実装時に存在確認する tooltip／chart テスト      | CPI formatter（名称・単位・合計）、0／null、完全表示名、行構成、合計、長い名称                                                    |
| 契約     | 実装時に存在確認する契約テスト                  | metadata の key／label／color／order／advanced、重複 order、未登録検出、legend／tooltip DOM一致                                   |
| E2E      | 実装時に存在確認する CPI／legend／advanced spec | CPI全行／合計、`2017Q4`／`2018Q1`、GDP/CTI、advanced on/off、hidden、375／430px CSS測定、hover／click／touch／dismiss／scroll抑制 |
| 操作回帰 | 既存 tooltip 経路                               | touch／mouse の trigger、active dot、ガイド線、dismiss、スクロール抑制                                                            |

### 明記するリスクと対策

- ゼロ値を falsy 判定で消すリスク: `value !== undefined` 等の明示判定と固定された適用費目一覧で確認する。
- 欠損をゼロへ置換するリスク: `null`／missing のまま行と formatter の仕様をテストする。
- 長い名称が CSS の ellipsis、固定幅、折返しで再び欠けるリスク: desktop／375px・430px の実DOM計測で全文と viewport 内配置を確認する。
- 系列登録漏れ・自動名混入のリスク: registry 全件と描画 payload のキーを契約テストで突合する。
- 行順・色不一致のリスク: registry の `order` と色を凡例／tooltip双方で比較する。
- GDP/CTI 境界の系列切替リスク: `2017Q4` と `2018Q1` の前後を E2E で確認する。
- 高度系列の状態不一致リスク: 高度系列オン／オフの凡例・tooltip双方を検証する。
- モバイルでの可読性・操作退行リスク: touch 環境で tooltip の全文、dismiss、ページスクロール抑制を確認する。

## 5. 実装順序・依存関係・段階コミット案

依存関係は Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 とする。Phase 2〜4 は Phase 1 の表示名解決契約に依存し、Phase 5 は各実装差分を反映してから行う。各フェーズは目的・変更対象・テクニカルキーポイント・完了条件を持ち、次フェーズ開始前に完了条件と差分を確認する。テスト実装は次担当、検証ゲートの実行は検証担当が行う。

段階コミット案:

1. `refactor(chart): 表示名解決契約をregistry基準に固定`
2. `fix(chart): 給与ツールチップの系列名を完全表示`
3. `fix(chart): 3種比較の凡例とtooltipをregistry同期`
4. `fix(chart): CPI費目別tooltipを消費支出形式に統一`
5. `docs(test): ツールチップ表示契約と検証を仕様同期`

各コミット前に対象ファイルの差分だけを確認し、既存の未関連変更を戻さない。問題が出た場合は直前のフェーズ単位で表示メタデータ変更のみを戻せるようにし、計算・データ変換・入力操作の変更を混在させない。

ロールバックは直前のフェーズのコミット単位で行い、共有 projection を先に戻してから各チャート差分を戻す。spec とテストの差分は対応する実装コミットと同じ段階で戻せるよう分離する。

## 6. 実施状況

- [ ] 本計画は作成済み。
- [ ] Phase 1〜5 の実装・仕様同期・検証は未着手。
- [ ] テストは未実行（計画作成の依頼範囲外）。

## 7. 次のアクション

1. Phase 1 の対象コードを確認し、registry から凡例／tooltipへ渡す表示契約と未登録キーの扱いを実装する。
2. Phase 2〜4を順序どおりに実装し、各段階で対応する単体・契約テストを追加または更新する。
3. Phase 5 で仕様書の4セクションと WHEN/THEN Scenario を実装結果へ同期し、単体・契約・E2E の検証を実行する。
