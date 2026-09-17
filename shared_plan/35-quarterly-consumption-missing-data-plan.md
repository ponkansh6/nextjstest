# 消費支出の不完全四半期をグラフから除外する計画

作成日: 2026-09-17
状態: 実施済み（監査完了）
対象: 四半期消費支出データの欠損四半期表示制御

## 1. 目的

現在の四半期集計は、月次CTIデータに欠損月がある四半期を行として残し、欠損を0で補完している。その結果、実データが揃っていない四半期が0値の棒としてグラフに現れる。

本計画では、2018Q1以降のCTI消費支出費目について、構成する3か月の元観測が揃わない四半期をチャート入力から除外する。欠損四半期を値0へ置換せず、チャート・データ表・CSVで同じ四半期行集合を共有する。

## 2. 対象と非対象

### 対象

- 2018Q1以降のCTI消費支出（名目・実質）の四半期集計行。
- `CONSUMPTION_NOMINAL_KEYS` / `CONSUMPTION_REAL_KEYS` の費目系列。
- 月次CTIの正規化済み年月キーを使った四半期完全性判定。
- `loadQuarterlyPublicData()`から公開されるnominal/real、チャート、表、CSVの行集合。

### 非対象

- 2017Q4以前のGDP四半期系列。GDPの公式四半期行はCTI月次完全性で除外しない。
- `SpendingBarChart`のBar、Tooltip、凡例描画そのものの再設計。
- `hiddenQuarters`のQ1〜Q4トグル仕様、startYear/endYearの期間フィルタ仕様。
- CPI、給与、3種比較、月次チャートの欠損処理。
- loaderのデータソース、12か月移動平均、基準化、CSVの値formatter。

## 3. 完全性・表示契約

- CTI四半期は、対象四半期の3か月すべてに元の月次CTIレコードが存在するときだけ完全とする。
- 判定は0値ではなく、0埋め前の元観測の存在情報で行う。実際の有効値0は欠損扱いにしない。
- 月次レコードが存在しても、名目・実質の対象費目値が欠落または非有限の場合は不完全として扱うか、既存のフィールド欠損契約に委ねるかを実装前に固定する。推奨は、CTI費目の全対象値が有限数値（0を含む）であることを完全性条件に含めること。
- 名目・実質は同じ元月次行と対象キー集合で判定し、公開四半期行集合を一致させる。
- 不完全な2018Q1以降の四半期はnominal/realの双方から除外し、0行を生成しない。
- 完全な四半期は値が0でも行を保持し、既存の0表示・合計・formatterを変更しない。
- 2017Q4以前はGDP系列のexact `YYYY-Qn` joinと既存のCTI/GDP境界を維持する。GDPの欠損はCTI完全性と混同しない。
- `hiddenQuarters`で隠した行は従来どおり共通フィルタし、欠損四半期を復活させない。
- 欠損四半期にはチャート上の棒・tooltip対象点を作らない。表・CSVも同じ行集合から除外し、空セルや0行を代替生成しない。

## 4. 現状のデータフロー

```text
loadCtiData()
  → quarterlyAggregation.computeQuarterlyAggregates()
     ├─ 欠損月をfilledDataで0補完
     ├─ 3か月を加算し、validMonthsCount !== 3 ならCTI費目を0化
     └─ nominal / real QuarterlyRow[] を返す
  → quarterlyProjection.buildQuarterlyPublicViews()
  → CpiChart / useCpiChartDisplayData()
     ├─ SpendingBarChart
     ├─ DataTablesSection
     └─ ChartExportButton / CSV
```

旧クライアント経路の`src/lib/math/clientCalculations.ts`にも同様の0補完・0化があるため、公開SSR経路だけでなく、互換計算経路の契約も同期する。

## 5. 実装フェーズ

### Phase 1 — 完全性境界とデータ契約の固定

**テクニカルキーポイント**

- 2018Q1以降だけをCTI完全性判定の対象とし、2017Q4以前のGDP行を保護する。
- 月次年月を`normalizeYearMonth()`で正規化した後、元レコードの集合を判定に使う。
- `filledData`の0値、集計後の0値、公開投影後の`null`を完全性判定に使わない。
- 名目・実質の両対象キーについて、月次3行と値の完全性を同じ判定へ入力する。
- 公開`QuarterlyView`を不要に拡張せず、内部の`Set<string>`または純粋な完全性ヘルパーで表現する。公開metadataを追加する場合は`src/types/chart.ts`へ反映する。

**完了条件**

- 完全四半期、不完全四半期、実値0、2017Q4/2018Q1境界のルールをテスト可能な純粋関数または明示的なaggregation条件として参照できる。
- loader入力や元CSVを変更せずに判定できる。

### Phase 2 — サーバー四半期集計の修正

**変更候補**

- `server/lib/view-models/quarterlyAggregation.ts`
- 必要なら`src/lib/math/quarterlyCompleteness.ts`
- `server/lib/view-models/quarterlyProjection.ts`

**テクニカルキーポイント**

- 現在の`validMonthsCount !== 3`時のCTI費目0化を、2018Q1以降では四半期行の除外へ置き換える。
- 不完全判定は集計後ではなく、元月次レコードを参照できる位置で行う。
- 0埋め用の`filledData`はGDP境界や既存互換処理への影響を確認したうえで、CTI完全性判定より後に限定するか、判定用の元データmapと集計用mapを分離する。
- nominal/realの両配列から同じ四半期ラベルを除外し、`applySupportSeriesScaling`の対象集合も不完全行なしで処理する。
- 最新月が四半期途中（例: 7月のみのQ3）の場合、そのQ3を生成せず、直前の完全四半期を表示末端とする。

**完了条件**

- 月次1か月欠損のCTI四半期がnominal/real双方の`QuarterlyRow[]`に存在しない。
- 3か月揃った四半期の値、0値、サポート系列、GDP境界に回帰がない。

### Phase 3 — 旧計算経路と公開3面の行集合同期

**変更候補**

- `src/lib/math/clientCalculations.ts`
- `src/lib/clientCalculations.ts`
- `src/hooks/useCpiChartDisplayData.ts`
- `src/app/components/CpiChart.tsx`
- `src/app/components/DataTablesSection.tsx`
- `src/lib/csvExport.ts`（必要な場合のみ）

**テクニカルキーポイント**

- 旧クライアント計算でも、元月次の完全性を見て不完全CTI四半期をskipし、0行を返さない。
- `useCpiChartDisplayData`の年範囲・`hiddenQuarters`フィルタ順を維持し、追加の値ベース除外を行わない。
- チャート、表、CSVは同じ完全性済みnominal/real行集合を使う。チャートだけで`filter(value !== 0)`しない。
- GDP support列の`null`はCTI四半期の不完全性とは独立に扱い、2017Q4/2018Q1境界を壊さない。
- Q1〜Q4凡例は既存の表示・操作契約を維持し、不完全四半期は行が存在しないため表示対象にならず、トグル操作でも復活しない。disabled UIなど未要求の凡例再設計は追加しない。

**完了条件**

- chart/table/CSVで不完全四半期の行が一致して除外される。
- nominal/realの公開行ラベル集合が一致する。
- 表・CSVの数値formatter、null/空セル規則、Qトグル、年範囲切替に変更がない。

### Phase 4 — 単体・統合・実ブラウザ受入

**テクニカルキーポイント**

- aggregation単体で、3か月完全、1か月欠損、複数月欠損、最新途中四半期、実値0、名目/実質共通除外を固定する。
- 2017Q4のGDP行保持と2018Q1以降のCTI完全性除外を境界テストする。
- `chart-table-csv-parity`で、欠損四半期の行が3面すべてに出ないことを確認する。
- `hiddenQuarters`、start/end年、Q1〜Q4切替後も不完全四半期が復活しないことを確認する。
- E2Eで不完全な最新四半期に0高の棒・tooltip・表行が表示されず、直前の完全四半期が表示末端であることを確認する。
- nominal/real両チャートの同一行集合、2017Q4/2018Q1境界、空データ時の既存メッセージを実DOMで確認する。

**完了条件**

- 不完全四半期が0として見えないだけでなく、グラフのデータ点・tooltip・表・CSVから除外される。
- 完全な0値は残り、0を欠損判定する実装がない。
- 既存の消費支出の操作・境界・parity回帰がない。

### Phase 5 — OpenSpec同期・全検証・最終監査

**テクニカルキーポイント**

- Data SourcesにCTI元月次観測と四半期完全性判定の出所を記載する。
- Data Flowに`loadCtiData → quarterly aggregation completeness filter → public projection → chart/table/CSV`を記載する。
- Component Treeに、SpendingBarChartが完全性済み行だけを受け取ること、GDP supportは独立であることを反映する。
- RequirementsへWHEN/THENを追加し、完全四半期、不完全四半期、実値0、nominal/real一致、GDP境界、hiddenQuarters、年範囲、tooltip/table/CSV parityを対応付ける。
- `openspec/config.yaml`の重複しないR番号と仕様書ルールに従い、非機能要件としてデータ意味、アクセシビリティ、操作互換を明記する。
- `lint`、`type-check`、関連Vitest、全Vitest、build、build parity、security、E2E、spec refs、`git diff --check`を実行し、欠損四半期の0化が残っていないことを監査する。

**完了条件**

- 実装・仕様・単体・統合・E2Eが同じ完全性条件と同じ四半期行集合を参照する。
- loader、元データ、基準化、12か月移動平均、GDPの公式データは変更されない。
- 最終監査でBlocker/High/Mediumが残らない。

## 6. 必須WHEN / THEN受入シナリオ

- **完全四半期** — WHEN CTI対象四半期の3か月の元月次レコードと対象値が揃うとき、THEN nominal/realのチャート、表、CSVにその四半期を1行表示する。
- **不完全四半期** — WHEN 3か月のうち1か月以上の元観測または対象値が欠けるとき、THEN nominal/realのチャート、tooltip、表、CSVから同じ四半期を除外し、0行を生成しない。
- **実値0** — WHEN 3か月の元観測が揃い、値が正当な0のとき、THEN欠損扱いにせず、既存の0値表示・集計規則を維持する。
- **途中で終わる最新四半期** — WHEN最新月が四半期の途中までしか存在しないとき、THEN未完了の最新四半期を表示せず、直前の完全四半期を末端にする。
- **名目・実質一致** — WHEN nominal/realが同じCTI月次入力から集計されるとき、THEN公開行ラベル集合を一致させる。
- **GDP境界** — WHEN 2017Q4以前を表示するとき、THEN CTI完全性でGDP行を除外せず、2018Q1以降ではCTI完全四半期だけを費目棒として表示する。
- **GDP欠損独立性** — WHEN GDP support値だけが欠損するとき、THEN CTI完全性判定で四半期全体を0化せず、既存のGDP `null`／tooltip `—`／CSV空セル契約を維持する。
- **四半期非表示** — WHEN `hiddenQuarters`でQ番号を非表示にするとき、THEN完全性済み行だけを従来どおり除外し、不完全四半期を復活させない。
- **期間切替** — WHEN startYear/endYearを変更するとき、THEN完全性判定後の同じ行集合を期間で絞り、chart/table/CSVの行集合を一致させる。
- **tooltip** — WHEN完全四半期のチャート点を操作するとき、THEN既存の系列・値・null表示を維持し、不完全四半期にはtooltipを表示しない。
- **空状態** — WHEN対象期間に完全四半期がない、または全系列をlegendで非表示にするとき、THEN既存の空状態表示と操作を維持する。

## 7. 検証マトリクス

| 層             | 対象                                         | 確認内容                                                 |
| -------------- | -------------------------------------------- | -------------------------------------------------------- |
| 単体           | `quarterlyAggregation` / completeness helper | 3か月完全、不完全、実値0、途中四半期、GDP境界            |
| 互換計算       | `clientCalculations`                         | SSRと同じ不完全四半期除外、hiddenQuarters維持            |
| 統合           | quarterly public projection                  | nominal/realの同一行集合、GDP exact join、null境界       |
| parity         | chart/table/CSV                              | 不完全四半期の共通除外、完全0値・formatter維持           |
| コンポーネント | `SpendingBarChart`                           | 完全性済み行のみ描画、凡例・tooltip・空状態維持          |
| E2E desktop    | 消費支出                                     | 最新不完全四半期の棒・tooltip・表行がないこと、直前Q表示 |
| E2E mobile     | 消費支出                                     | 375px/430pxの行集合・末端・操作・overflow回帰            |
| データ品質     | CTI loader/source                            | 元CSV、loader、基準化、12MA、GDP sourceの不変性          |

## 8. リスクと対策

- **欠損を0値と誤判定するリスク**: 元月次レコードの存在と対象値の有限性を判定し、集計後の0を使わない。
- **GDP行まで消すリスク**: 完全性フィルタを2018Q1以降のCTI費目へ限定し、GDP supportのnull判定と分離する。
- **nominal/realの行ずれ**: 共通の完全性判定結果を両配列へ適用し、公開projectionで行集合を再検証する。
- **chartだけとtable/CSVがずれるリスク**: `SpendingBarChart`内部で後付けfilterせず、aggregation/public projectionで行を除外する。
- **有効な0を消すリスク**: 値ではなく元観測の有無を判定し、0は完全な3か月観測の有効値として保持する。
- **最新四半期の末端が不安定になるリスク**: `maxCpiDate`の月と元月次集合から完全四半期を判定し、途中Qを明示的に除外する。
- **Q凡例と実データの意味がずれるリスク**: Q1〜Q4凡例は既存の表示・操作契約を維持し、不完全四半期は行が存在しないため表示対象にならず、トグル操作でも復活しないことを確認する。disabled UIなど未要求の凡例再設計は追加しない。
- **既存fixture破損リスク**: 0化を前提にしたテストを、完全性と表示行集合の契約へ更新し、元データ品質テストは別途維持する。

## 9. 実装順序

1. CTI四半期完全性の判定基準と2017Q4/2018Q1境界を固定する。
2. server aggregationで不完全CTI四半期の0行生成を止める。
3. 旧client計算経路と公開chart/table/CSVの行集合を同期する。
4. 単体・統合・parity・desktop/mobile E2Eで完全、不完全、0値、境界、操作を検証する。
5. OpenSpecを同期し、全検証ゲート・監査を完了する。

実装完了。検証結果:

- 関連Vitest: 8 files / 63 tests pass
- 全Vitest: 60 files / 591 tests pass
- build: pass
- build parity: 3 pass
- security: pass
- E2E full: 125 pass / 19 skipped / 1 flaky was passed by single rerun
- audit:validation-detection: pass
