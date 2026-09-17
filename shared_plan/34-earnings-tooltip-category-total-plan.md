# 給与ツールチップの給与区分合計表示計画

作成日: 2026-09-17
状態: 未実施（計画のみ）
対象: 給与チャートのツールチップにおける「所定内・所定外・特別」の合計表示

## 1. 背景・目的

給与チャートのツールチップは、現在6系列を表示しているが、給与区分である「所定内給与」「所定外給与」「特別給与」の合計行を持たない。時間当たり給与、15歳以上国民当たり給与、CPI総合(参考)は比較用の補助系列であり、給与区分の合計へ混ぜてはいけない。

本計画では、給与チャートの既存6系列表示、給与独自の2025年平均=100基準化、特別給与の12か月移動平均、既存のhover／click／touch／dismiss／スクロール抑制を維持したまま、対象3系列だけの合計をツールチップへ追加する。

### 対象系列

| 区分               | 正確なキー               | 合計 | 備考                           |
| ------------------ | ------------------------ | ---: | ------------------------------ |
| 所定内             | `所定内給与`             | 対象 | 給与区分の表示値を使用         |
| 所定外             | `所定外給与`             | 対象 | 給与区分の表示値を使用         |
| 特別               | `特別給与`               | 対象 | 12か月移動平均後の表示値を使用 |
| 時間当たり         | `時間当たり給与`         | 除外 | 比較用補助系列                 |
| 15歳以上国民当たり | `15歳以上国民当たり給与` | 除外 | 比較用補助系列                 |
| CPI参考            | `CPI総合(参考)`          | 除外 | 物価比較用補助系列             |

## 2. スコープと非スコープ

### スコープ

- 給与ツールチップに、対象が明示された`給与区分合計（所定内＋所定外＋特別）`行を追加する。単に`合計`とだけ表示せず、3系列の合計であることをユーザーがtooltip上で判断できるようにする。
- 合計対象を`EARNINGS_SERIES_REGISTRY`由来の3キーとして明示する。
- 合計を現在表示中の対象系列だけで算出する。凡例で対象系列をhiddenにした場合、その行を除外し、合計も表示中の対象系列だけで再計算する。
- `0`は`0.00`として合計へ含め、`null`／`undefined`／payload欠落／非有限値は行を残したまま`—`表示とし、合計へ含めない。
- tooltipの全6系列、完全な系列名、表示順、色、日付見出し、モバイルでの折返しとviewport内配置を維持する。
- 実装と並行して`openspec/specs/nextjstest/spec.md`のData Sources / Data Flow / Component Tree / Requirementsを同期する。

### 非スコープ

- `server/lib/data-loader/earnings.ts`の計算、12か月窓、欠損伝播、2025年平均=100基準化、データソースの変更。
- 給与の6系列の追加・削除、キー・ラベル・色・順序の変更。
- 給与表、CSV、API、loaderの返却値の変更。
- CPI、CTI、GDP、消費支出の合計ロジックの変更。
- tooltipの表示トリガ、active dot、ガイド線、dismiss、Escape、タッチ操作、ページスクロール抑制の再設計。
- `shared_plan/33-chart-tooltip-label-sync-plan.md`および既存計画の変更。

## 3. 表示・計算契約

- 合計はloaderの生値や円額を再計算せず、`CustomTooltip`へ渡された給与の表示値（2025年平均=100）をキーで解決して加算する。
- `CustomTooltip`の全体合計へ依存して補助系列を偶然加算しないよう、給与専用の対象キー契約を設ける。既存`totalExcludedKeys`を使う場合も、対象3キーが将来増えても誤加算されないテストを置く。可能なら意図が明確な`totalIncludedKeys`相当のAPIを優先する。
- `seriesMeta`と同じvisible projectionを合計対象の基礎にし、hidden状態とRecharts payload欠落を区別する。
- metadataに存在する対象系列はpayloadに値がなくても行を維持する。値は`null`／`undefined`／非有限値を欠損として表示し、有限数値だけを合計する。
- 合計行は既存消費支出／CPI tooltipと同じroot内に置き、日付見出しの直下または既存の合計行位置に表示する。給与ではラベルを`給与区分合計（所定内＋所定外＋特別）`とし、3系列の合計であることを表示上明示する。給与6系列行の順序・ラベル・色は変更しない。
- 合計表示は既存給与値と同じ丸め規則（原則小数第2位）を使用し、個別行と合計でformatterの単位を混在させない。

## 4. 実装フェーズ

### Phase 1 — 合計対象と既存給与契約の固定

**目的**

合計対象3系列と除外3系列をregistry基準で固定し、現在の給与tooltip表示契約を明文化する。

**変更候補**

- `src/lib/chartConstants.ts`
- `src/types/chart.ts`
- `src/app/components/CpiChartSections.tsx`
- `src/app/components/CustomTooltip.tsx`
- `openspec/specs/nextjstest/spec.md`

**テクニカルキーポイント**

- `EARNINGS_SERIES_REGISTRY`のキーを再定義せず、対象キー集合だけをregistryから投影する。
- 合計対象は`所定内給与`、`所定外給与`、`特別給与`に限定し、補助3系列を含めない。
- hidden系列のvisibility projectionとtooltipのmetadata projectionを同じ入力から作る。
- 6系列の完全ラベル、色、順序、advanced状態、給与独自基準化を変更しない。

**完了条件**

- 合計対象3キーと補助3キーの境界が定数または明示的projectionとして参照できる。
- 既存の給与6系列tooltip契約に回帰がない。
- 合計対象の単位・値の出所が仕様書に記載される。

### Phase 2 — 合計APIとformatterの実装

**目的**

対象キーを誤って全payloadへ拡張しない共通tooltip APIを実装する。

**変更候補**

- `src/app/components/CustomTooltip.tsx`
- `src/types/chart.ts`
- `src/app/components/charts/useChartTooltipProps.tsx`
- `tests/components/CustomTooltip.test.tsx`

**テクニカルキーポイント**

- `totalIncludedKeys`等の対象キー指定を追加する場合、既存`totalExcludedKeys`との優先順位を定義する。
- `seriesMeta`がある場合はmetadata順・キー照合で値を取得し、`payload.name`を正本にしない。
- 合計は有限数値のみを加算する。`0`は有効値、`null`／`undefined`／非有限値・missingは合計から除外する。
- formatterを個別行と合計へ同じ単位で適用し、補助系列を合計へ混入させない。
- CPI・消費支出の既存`showTotal`、除外キー、値formatterの挙動を変えない。

**完了条件**

- 6系列payloadから対象3系列だけを合計できる。
- 対象0、null、undefined、missing、非有限値と補助系列の混在を単体テストで固定できる。
- 既存チャートの合計テストが維持される。

### Phase 3 — 給与チャートへの接続

**目的**

給与bindingへ合計設定を接続し、実際の表示値から合計行を描画する。

**変更候補**

- `src/app/components/CpiChartSections.tsx`
- 必要な場合のみ`src/app/components/EarningsBreakdownChart.tsx`
- 必要な場合のみ`src/app/components/CustomTooltip.tsx`
- `tests/components/chart-tooltip-legend-contract.test.tsx`

**テクニカルキーポイント**

- 給与bindingに`showTotal: true`、`totalLabel: "給与区分合計（所定内＋所定外＋特別）"`相当の表示契約、対象3キーの契約を渡す。`totalLabel`を共通APIへ追加する場合は既存チャートの既定値を`合計`として後方互換を保つ。
- 6系列の`showAllPayload: true`とmetadata projectionを維持する。
- 合計値は給与loaderを再呼び出しせず、tooltip payloadの基準化済み表示値を合算する。
- `所定内給与`等がhiddenの場合は行と合計から除外し、補助系列のhidden／表示状態は合計対象へ影響させない。
- tooltip root、合計行、個別行のDOM階層とCSSを消費支出／CPIの契約に合わせ、既存給与の省略なし表示を保つ。

**完了条件**

- 通常の給与tooltipに6系列行と`給与区分合計（所定内＋所定外＋特別）`行が同時に表示される。
- 合計が3給与区分だけの値と一致し、補助3系列を含まない。
- 既存の系列名、色、順序、日付見出し、基準化値が不変である。

### Phase 4 — 欠損・hidden・モバイル受入

**目的**

合計行追加後も値の意味とモバイル可読性を保証する。

**変更候補**

- `tests/components/CustomTooltip.test.tsx`
- `tests/components/chart-tooltip-legend-contract.test.tsx`
- `tests/e2e/consumption-mobile-readability.e2e.spec.ts`
- 必要なら給与専用E2E spec

**テクニカルキーポイント**

- desktop、375px、430pxで合計行がviewport内に収まり、6系列の完全ラベルと値列が潰れないことをbounding boxで確認する。
- 対象系列の0は`0.00`で行を残し、null／undefined／missingは`—`で行を残す。
- hidden操作後はvisible対象だけで合計が再計算されることを実DOMで確認する。
- 合計行追加で既存の内部スクロール、閉じるボタン、touch dismiss、ページスクロール抑制が壊れないことを確認する。
- テストのラベル取得は表示テキストとdata attributeの責務を分け、補助系列が合計へ入らないことを行単位で検証する。

**完了条件**

- 375px／430pxで6系列＋合計が読み取れる。
- hidden、0、null、undefined、payload欠落の期待が機械的に検出できる。
- 既存の給与mobile tooltipと操作回帰がない。

### Phase 5 — OpenSpec同期・検証・最終監査

**目的**

実装、仕様、テストの給与合計契約を一致させ、計算ロジックへの波及がないことを監査する。

**変更候補**

- `openspec/specs/nextjstest/spec.md`
- 給与関連の単体・契約・E2Eテスト

**テクニカルキーポイント**

- Data Sourcesに`EARNINGS_SERIES_REGISTRY`と給与独自基準化済み表示値の出所を記載する。
- Data Flowに`earnings loader → normalized rows → CpiChartSections projection → CustomTooltip`と、対象3キーのみを合計する流れを記載する。
- Component Treeに`EarningsBreakdownChart → CustomTooltip`の`showTotal`／対象キー／metadata契約を反映する。
- RequirementsへWHEN/THENを個別に追加し、6系列表示、合計対象3系列、補助系列除外、0/null/missing、hidden再計算、375/430pxを対応付ける。
- `openspec/config.yaml`のrules.specに従い、既存R番号を重複させず、関連要件の改訂または適切な新規番号を使う。
- 検証担当がlint、type-check、関連Vitest、全体test、build、build parity、security、E2E、spec refsを実行し、実装差分とplanの受入条件を突合する。

**完了条件**

- 給与合計の仕様・実装・単体・E2Eが同じキー集合と欠損規則を参照する。
- 給与計算・基準化・loader・表・CSVに差分がない。
- CPI・消費支出・3種比較の既存合計と表示契約に回帰がない。
- 全検証ゲートが成功し、監査でblocker/high/mediumが残らない。

## 5. WHEN / THEN受入シナリオ

- **給与合計の基本表示** — WHEN 給与tooltipを表示するとき、THEN `所定内給与`、`所定外給与`、`特別給与`の有限な表示値だけを加算した`給与区分合計（所定内＋所定外＋特別）`行を表示し、3系列合計であることがわかる。
- **6系列の同時表示** — WHEN 6系列が表示対象のとき、THEN tooltipには従来どおり6系列の完全ラベル・色・順序を表示し、`給与区分合計（所定内＋所定外＋特別）`には補助3系列を含めない。
- **表示値の単位** — WHEN 給与が2025年平均=100の基準化値で表示されるとき、THEN 合計も同じ基準化済み値から算出し、生の円額やloader再計算値を使わない。
- **対象系列のhidden** — WHEN 所定内・所定外・特別のいずれかを凡例でhiddenにするとき、THEN hidden行を除外し、残る表示中の対象系列だけで合計を再計算する。
- **補助系列のhidden** — WHEN 時間当たり給与、15歳以上国民当たり給与、CPI総合(参考)を表示／hiddenにするとき、THEN 合計対象3系列の算出結果は補助系列の状態に影響されない。
- **ゼロ値** — WHEN 対象系列の値が`0`のとき、THEN 行は`0.00`で残り、合計には0として含める。
- **欠損値** — WHEN 対象系列の値が`null`、`undefined`、payload欠落、または非有限値のとき、THEN 行は`—`で残り、その値は合計へ含めない。
- **表示契約維持** — WHEN 合計行を追加した後も、THEN 6系列の完全名称、色、順序、日付見出し、既存のhover／touch／dismiss／スクロール抑制を変更しない。
- **モバイル可読性** — WHEN viewport幅が375pxまたは430pxのとき、THEN 6系列行と`給与区分合計（所定内＋所定外＋特別）`行のラベル・値列が省略されずviewport内で読み取れる。

## 6. 検証マトリクス

| 層             | 対象                | 確認内容                                                                   |
| -------------- | ------------------- | -------------------------------------------------------------------------- |
| 単体           | `CustomTooltip`     | 対象3系列のみ合計、補助3系列除外、0/null/undefined/missing/非有限、2桁表示 |
| 契約           | registry / metadata | 6系列のkey・label・color・order不変、対象キー集合の一致、hidden projection |
| コンポーネント | 給与binding         | `showTotal`、対象キー、formatter、6系列payloadの伝播                       |
| E2E desktop    | 給与tooltip         | 6行＋明示ラベル付き合計、合計値、補助系列除外、label/color/order           |
| E2E mobile     | 375px / 430px       | 6行＋明示ラベル付き合計、全文ラベル、値列、root/row/totalのbounding box    |
| 回帰           | 既存全チャート      | CPI／消費支出／比較のtooltip合計、値・操作・境界を維持                     |
| データ品質     | earnings loader     | 2025=100、12か月移動平均、欠損伝播、元データ不変                           |

## 7. リスクと対策

- **補助系列を合算するリスク**: 除外リストの増減ではなく、対象3キーの明示契約を優先し、6系列混在テストで検出する。
- **生値と基準化値を混同するリスク**: loaderを変更せず、tooltip payloadの表示値だけを合算する。
- **特別給与の12MAを再計算するリスク**: `特別給与`のpayload値をそのまま使い、12か月窓の責務をloaderに残す。
- **nullを0表示するリスク**: 行formatterと合計加算条件を分離し、欠損は`—`、有限数値だけ加算する。
- **hiddenとpayload欠落を混同するリスク**: series metadataとvisibility projectionを正本とし、hiddenは行集合から除外、payload欠落は行を維持する。
- **合計行によるモバイルoverflow**: 375px／430pxのroot・row・値列を実DOMで計測し、内部スクロールと自然折返しを維持する。
- **共通APIの既存チャート回帰**: 給与専用の対象キーを明示し、CPI・消費支出の既存`showTotal`テストを必ず再実行する。

## 8. 実装順序と次アクション

依存関係は Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 とする。各段階でテクニカルキーポイントと完了条件を確認し、給与計算・基準化・操作仕様に差分がないことを確認してから次段階へ進む。

1. 合計対象3系列とvisibility契約を確定する。
2. 共通tooltipの対象キー指定と欠損・有限値の合計規則を実装する。
3. 給与bindingへ接続し、6系列＋`給与区分合計（所定内＋所定外＋特別）`を表示する。
4. 単体・契約・desktop／375px／430px E2Eで受入条件を検証する。
5. OpenSpecを同期し、全検証ゲートと最終監査を完了する。

計画作成段階では、既存実装・仕様・テストを変更せず、テストも実行しない。
