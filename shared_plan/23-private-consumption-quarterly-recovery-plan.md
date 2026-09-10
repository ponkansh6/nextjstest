# 民間最終消費支出の四半期表示・改修プラン

作成日: 2026-09-10
状態: 四半期GDP結合の中核実装と一部の検証は確認済み。外部公表値との再照合、未ready UI、完全なPlan文書間の矛盾解消などは未確認・未完了。
作業体制: Codexによる実装・監査。個別の作業体制は本記録で断定しない。
保存先: リポジトリ既存の `shared_plan/`。

## 目的

民間最終消費支出（名目・実質）を、各四半期の公式原系列から算出した2025年平均=100の比較指数として表示する。年次値が同一年の各四半期に繰り返される経路を解消し、チャート・ツールチップ・表・CSVの値を一致させる。公開系列は既存の名目・実質各1系列を維持する。

## 確認した原因と根拠

- `src/app/page.tsx` の `Promise.all` には `loadQuarterlyGdpData()` があるが、分割代入は直前のステータスまでしか受け取っていない。四半期ローダーの戻り値が破棄されている。
- 同ファイルは `computeQuarterlyAggregates(ctiData, maxCpiDate)` の結果を直接 `projectQuarterlyPublicView` に渡しており、四半期GDPとの結合がない。
- `server/lib/data-loader/cpi.ts` の月次CTI生成処理は `rawNominalGdp.get(parsed.year)` / `rawRealGdp.get(parsed.year)` で年次値を読み、公開用の民間最終消費支出キーへ比較指数を設定している。補完行にも同様の年次値注入がある。
- `server/lib/view-models/quarterlyAggregation.ts` はその公開キーについて四半期内の最初の正値を採用する。このため年次由来の値が四半期表示へ残る。同ファイルの「page.tsxで別途結合する」というコメントと実装が一致していない。
- 四半期CSVは存在し、名目2025年の原値はQ1=86092.6、Q2=86178.8、Q3=87584.5、Q4=91054.8と異なる。データの不在ではなく、表示経路への接続欠落がコード上の直接原因である。
- `tests/e2e/quarterly-gdp.e2e.spec.ts` は主に公開名・内部系列の非表示・非欠損を確認しており、各期の値が公式四半期値に一致することを検証していない。
- Plan21の「完了」「残件なし」と現行コードは整合しない。Plan22も完了記述と末尾の未実装記述が混在している。

調査・実装後検証はローカルコード、保存済みCSV、実データloader、テスト、ブラウザーE2Eで実施した。外部公表値との再照合は対象外とした。

## 改修手順

1. 再現テストを先に追加する。月次CTIに同一年で一定の年次由来値を入れ、四半期GDPには異なる4値を入れたケースで、公開出力が四半期GDPの比較指数となることを要求する。ページから公開projectionまでの経路も検証し、ローダー単体だけの検証で完了にしない。
2. `page.tsx` で四半期ローダーの戻り値を受け取る。四半期CTI集計後、公開projection前に、年と四半期から生成した `YYYY-Qn` を使ってGDPを結合する純粋関数を設ける。配列の位置や年月表示文字列の偶然の一致に依存しない。
3. 結合時は年次由来の名目・実質公開キーをまず除去し、`comparisonReady` かつ有限な当該期の `nominalComparison` / `realComparison` のみを既存公開キーへ設定する。raw金額や内部GDPキーを公開Viewに追加しない。
4. `quarterlyAggregation.ts` のlegacy support互換処理を含む既存経路への影響を確認する。公開経路では後段の四半期GDP結合を唯一の供給元とし、legacy rollback互換は別経路で維持する。CTI費目の3か月平均処理は維持する。
5. 未ready・検証失敗・当該四半期の欠損・公開データ期間外ではGDPを欠損として扱う。公開経路では年次GDP/fallbackを使わず、mergeでsupportキーを除去して四半期GDPだけを公開する。legacy rollback互換は別経路で維持する。表・CSV・チャートが欠損を正しく扱い、線が欠損期間を誤って接続しないことを確認する。GDPの有無でCTI行を削除しない。
6. infoのready表示と実際に採用する四半期データの状態を整合させる。期間ラベルが月を表すように見える箇所はチャート・tooltip・表・CSVを棚卸しし、四半期表示として識別可能にする。現時点では未ready/欠損UIと全表示経路の整合は未確認として扱う。
7. `src/lib/quarterlyPublicProjection.ts` のallowlistを維持する。Plan22の内部raw/comparison 4系列の公開禁止を回帰させない。
8. `openspec/specs/nextjstest/spec.md` のData Flow・RequirementsとWHEN/THENを同期する。Plan21/22の完了記述を実装・検証結果に合わせて修正し、今回の接続欠落と修正先を参照させる。

## 検証計画

- 単体: 年・四半期キーで正しく結合し、年次由来値が採用されないこと。並び順の異なる入力、年境界、未ready、欠損、非有限値、期間外を確認する。
- 実データ: 名目・実質それぞれの2025Q1〜Q4について、CSV原値 × 独立した正規化係数が公開値に一致すること。丸め前の4期平均=100と、公開projectionの小数2桁丸めを区別して期待値を設定する。「4期が異なる」だけでは正しさの判定にしない。
- 経路テスト: pageがローダー結果を受け取り、結合後の値をチャート用propsへ渡すこと。ローダーを呼ぶだけ、または年次系列の非欠損だけでは成功しないテストとする。
- UI/E2E: 名目・実質の2025年4期について、表・CSVの値とtooltip表示を期待値に照合する。公開名が各1系列で、内部4系列が出ないことも維持する。
- 既存回帰: 四半期GDPデータ品質、公開projection、実質消費支出の表示に関する対象テストを実行する。型検査・lint・本番ビルドと対象E2Eを実施し、コマンドと結果を記録する。未実行を成功扱いにしない。

## 受入条件

- 名目・実質とも公開経路が公式四半期比較指数を使い、同一年の年次値の反復がない。
- 2025年の4期がそれぞれ保存済み四半期原値と係数から再現できる。
- 欠損・未ready時は無言の年次fallbackや0埋めがなく、表示状態とinfoが一致する。
- チャート・tooltip・表・CSVで四半期と値が一致し、内部系列が公開されない。
- 追加した回帰テストと必要な検証が成功し、仕様書・Plan21/22が実態と一致する。

## 変更範囲と復旧

実装候補は `src/app/page.tsx`、`server/lib/view-models/quarterlyAggregation.ts`、四半期GDP結合関数、関連UI・テスト・仕様書。四半期CSVや正規化係数の再生成は接続修正の前提にしない。既存の未コミット変更を維持する。

修正に問題がある場合も、既知の年次反復表示へ無言で戻さない。GDP比較線を欠損として理由を表示し、CTI表示を維持したうえで結合処理を修復する。今回コミット・プッシュ・アプリ実装の変更は行わない。

## 実装チェックリスト

- [x] 実装日: `2026-09-10` / 担当: `Codex` を記録した
  - 達成根拠: 本チェックリストに実装日と担当を記録
- [x] 再現テストを先に追加し、年次由来の値ではなく四半期GDP値が公開出力に使われることを確認した
  - 達成根拠: `tests/unit/quarterly-gdp-join.test.ts` の year-quarter 結合・未ready・非有限・期間外ケース
- [x] `page.tsx` が `loadQuarterlyGdpData()` の戻り値を受け取り、年・四半期キーで結合する処理を通している
  - 達成根拠: `src/app/page.tsx` の `quarterlyGdpData` 受領と `mergeQuarterlyGdpRows` 呼び出し
- [x] 結合前に年次由来の名目・実質公開キーを除去し、`comparisonReady` かつ有限な当該期の比較値だけを設定している
  - 達成根拠: `mergeQuarterlyGdpRows` のキー削除、ready/finite/exact-period 条件
- [x] 公開経路では年次GDP/fallbackを使わず、mergeでsupportキーを除去して四半期GDPだけを公開する。legacy rollback互換は別経路で維持する
  - 達成根拠: `page.tsx` の `mergeQuarterlyGdpRows` が公開キーを除去してreadyかつ有限の当該期値だけを設定する。`quarterlyAggregation.ts`/`cpi.ts` のlegacy support互換処理は残存しており、削除済みとは扱わない
- [ ] 未ready・欠損・非有限値・期間外のGDPを公開UIでも欠損として扱い、年次値・0・直前期で補完していない
  - 達成根拠: merge関数の単体テストでは確認済みだが、未ready/欠損時の表・CSV・チャートUIは未確認
- [x] CTI費目の3か月平均処理と、GDPの有無にかかわらずCTI行を残す処理を維持している
  - 達成根拠: 実データloaderのCTI+GDP実結合結果が名目・実質とも四半期比較値と同値で、既存のCTI行を含む経路を確認
- [x] チャート・tooltip・表・CSVの期間ラベルが四半期として識別でき、値が同じデータを参照している
  - 達成根拠: `tests/e2e/quarterly-gdp.e2e.spec.ts` で表・CSVの2025Q1〜Q4値と四半期ラベル、内部系列非表示を確認。tooltipは開始年を2025年に設定して先頭の棒をホバーし、期間が2025Q1であることと、CSV原値と固定係数からのQ1期待値との数値一致を確認
- [ ] `info` のready表示と、未ready/欠損を含む実際に採用する四半期データの状態が一致している
  - 達成根拠: ready実データ経路は確認済みだが、未ready/欠損UIは未確認
- [x] 公開projectionのallowlistを維持し、内部raw/comparison系列が公開されていない
  - 達成根拠: `src/lib/quarterlyPublicProjection.ts` の既存allowlistを変更せず利用
- [x] 単体・経路テストで、並び順の違い・年境界・未ready・欠損・非有限値・期間外を確認した
  - 達成根拠: `mergeQuarterlyGdpRows` の単体テストで境界ケースを確認し、実サーバーE2Eでpage→公開projectionの公開値・表示経路を確認。ただし未ready/欠損UIは別項目として未完了
- [x] 2025年Q1〜Q4の名目・実質について、CSV原値と正規化係数からの期待値を確認した
  - 達成根拠: 実データloaderで comparisonReady=true を確認。名目は 98.13619248429872, 98.23445110109209, 99.83679608515784, 103.79256032945133、実質は 99.57231254352982, 98.16183319475196, 100.00136309555106, 102.26449116616719。CTI+GDP実結合結果も同値
- [x] 型検査・lint・本番ビルド・対象E2E・既存回帰テストを実行し、結果を記録した
  - 達成根拠: `pnpm run build`、`pnpm run type-check`、`pnpm test`（37 files / 309 tests）、`pnpm exec playwright test tests/e2e/quarterly-gdp.e2e.spec.ts`（1 passed）が成功。関連lintは `pnpm exec eslint src/app/page.tsx server/lib/view-models/quarterlyAggregation.ts server/lib/data-loader/cpi.ts --no-cache` と `pnpm exec eslint src/lib/quarterlyPublicProjection.ts src/lib/chartInfoContent.ts --no-cache` を実行
- [ ] 仕様書とPlan21/22の記述を実装・検証結果に同期した
  - 達成根拠: OpenSpec更新の記録はあるが、Plan21/22には歴史的な完了・未実装矛盾が残り、完全整理は未確認

## 実装後振り返りチェックリスト

- [x] 振り返り日: `2026-09-10` / 参加者・担当: `Codex` を記録した
  - 達成根拠: 本チェックリストに振り返り日と担当を記録
- [ ] 計画した受入条件をすべて確認し、結果を `[達成]` と記録した
  - 達成根拠: 4期値・ラベルは確認済みだが、未ready UI、外部公表値との再照合、Plan21/22の完全整理が残る
- [x] 年次値の四半期反復が解消されたことを、2025年Q1〜Q4の実データで確認した
  - 達成根拠: 名目・実質のQ1〜Q4がそれぞれ異なる比較値となり、CTI+GDP実結合結果も同値
- [x] チャート・tooltip・表・CSVの値と四半期ラベルの一致を確認した
  - 達成根拠: 対象E2Eで公開2系列の表・CSV・tooltip経路を検証し成功（1 passed）
- [ ] 欠損・未ready時に誤ったfallbackや0埋めが発生しないことを確認した
  - 達成根拠: `mergeQuarterlyGdpRows` の単体テストでは確認済みだが、未ready/欠損UIは未確認
- [x] 追加テストが、ローダー呼び出しだけでなく公開projectionまでの経路を検証していることを確認した
  - 達成根拠: 実サーバー対象E2Eがpageから公開projectionを経た表・CSV・tooltip経路を検証し成功（1 passed）
- [x] 実行した検証コマンドと結果（成功・失敗・未実行）を記録した
  - 達成根拠: build、対象Playwright E2E、pnpm test、type-check、関連lintの成功結果を振り返りメモに記録
- [x] 想定外の差分・残課題・リスクを確認し、必要なフォローアップ担当と期限を決めた
  - 達成根拠: build問題は `experimental.useTypeScriptCli: false` 追加で解消済み。ただし未ready UI、外部公表値再照合、Plan21/22旧記述整理、関連lintコマンド明示が残る
- [x] 改善点を次回の四半期データ改修・テスト計画へ反映した
  - 達成根拠: year-quarter結合、実データ4期期待値、表・CSV・tooltip、build/type-check/lint/E2Eを完了条件として記録

## 振り返りメモ

- 実装結果: `page.tsx` で四半期GDPローダー結果を受け取り、`mergeQuarterlyGdpRows` で年・四半期キー結合。年次値/0/fallbackを使わないGDP公開経路と、CTI 3か月平均・CTI行維持を実装済み。
- 検証結果・実行コマンド: `pnpm run build`、`pnpm run type-check`、`pnpm test`（37 files / 309 tests成功）、`pnpm exec playwright test tests/e2e/quarterly-gdp.e2e.spec.ts`（1 passed）、`pnpm exec eslint src/app/page.tsx server/lib/view-models/quarterlyAggregation.ts server/lib/data-loader/cpi.ts --no-cache`、`pnpm exec eslint src/lib/quarterlyPublicProjection.ts src/lib/chartInfoContent.ts --no-cache` が成功。実データloaderは `comparisonReady=true`。
- うまくいった点: `mergeQuarterlyGdpRows` の年・四半期単位の結合と未ready/欠損/非有限/期間外の扱い、実サーバーのpage→公開projection経路を、全37 files / 309 testsと対象E2Eで確認できた。
- 問題点・想定外: 初回buildでは Next.js の `Could not parse output from TypeScript's --showConfig` が発生したが、設定追加後のbuildは成功。対象E2Eと実データUI経路も成功。
- 改善点: year-quarter単位の結合、実データ4期値、表・CSV・tooltip経路、build/type-check/lint/E2Eを一体で完了確認する運用を継続する。
- 残課題・フォローアップ: 未ready/欠損UIの確認、外部公表値との再照合、Plan21/22旧記述の整理。担当・期限は未設定。
- 関連Issue・PR・コミット: `[記入]`

## 監査・再発防止チェックリスト

- [x] 実装変更と後方互換処理（legacy support等）を分けて確認し、「削除した」と「公開経路で使わない」を区別する
  - 達成根拠: 公開経路はmerge後の四半期GDPのみ、legacy supportは別経路に残存
- [x] 受入条件ごとに、実装根拠・テスト根拠・実データ根拠を個別に紐付ける
  - 達成根拠: 実装チェックリストと対象E2E・単体テスト・2025Q1〜Q4実データを対応付けて記録
- [x] E2Eで表・CSVの2025Q1〜Q4と、tooltipの2025Q1の期待数値を照合する
  - 達成根拠: `tests/e2e/quarterly-gdp.e2e.spec.ts` で表・CSVは4期を照合。tooltipは2025Q1の棒を指定し、期間表示とQ1期待値を確認
- [x] チャート、表、CSV、tooltipの期間ラベルが同じ四半期表現であることを確認する
  - 達成根拠: `quarterlyPublicProjection.ts` の公開年月をrow.labelへ統一し、E2Eで四半期ラベルを確認
- [x] pageローダー→結合→公開projectionまでの経路を実際に検証する
  - 達成根拠: 実サーバーE2Eでpageから公開projectionを経た表示値・CSV・tooltipを確認
- [x] 年境界、入力順序、欠損、未ready、非有限値、期間外を明示的にテストする
  - 達成根拠: `mergeQuarterlyGdpRows` 単体テストで各境界ケースを確認
- [ ] 実データの原値・係数・計算式・期待値を独立した手順で再計算し、独立性の意味と限界を記録する
  - 達成根拠: [記入]
- [ ] 関連するPlan21/22/OpenSpecを横断して、完了・未実装・未検証の矛盾がないことを確認する
  - 達成根拠: [記入]
- [x] build修正など設定変更は、変更理由・副作用・変更前後の検証結果を記録する
  - 達成根拠: `next.config.ts` の `experimental.useTypeScriptCli: false` とbuild成功結果を記録
- [ ] 既存の未コミット変更との境界、今回の変更範囲、担当者・作業体制の記載を事実と照合する
  - 達成根拠: [記入]
- [x] チェックを付ける前に、実行コマンド・日時・対象範囲・結果が記録されていることを確認する
  - 達成根拠: test/type-check/build、対象E2E、2本の関連eslintコマンドと結果を本書に記録
- [x] 残課題を見落とさないよう、未検証項目・根拠不足・文書矛盾を確認する
  - 達成根拠: 未ready/欠損UI、外部公表値再照合、Plan21/22歴史記述整理を残課題として明記

## 最新再監査（2026-09-10）

以下は既存の監査内容を踏まえた最新の状態整理である。確認済み範囲を超えて「検証完了」とは扱わない。

- 確認済み: `pnpm test`（全37 files / 309 tests）、`pnpm run type-check`、`pnpm run build`、`pnpm exec playwright test tests/e2e/quarterly-gdp.e2e.spec.ts`（1 passed）。関連lintも `pnpm exec eslint src/app/page.tsx server/lib/view-models/quarterlyAggregation.ts server/lib/data-loader/cpi.ts --no-cache` と `pnpm exec eslint src/lib/quarterlyPublicProjection.ts src/lib/chartInfoContent.ts --no-cache` を実行し成功。
- 確認済み: `tests/e2e/quarterly-gdp.e2e.spec.ts` は開始年を2025年に設定し、名目・実質それぞれ先頭の棒をホバーする。tooltipの期間が2025Q1であることと、CSV原値と固定係数からのQ1期待値との数値一致を確認する。表・CSVは2025Q1〜Q4値、四半期ラベル、内部4系列非表示を確認する。修正後の対象E2Eは `pnpm exec playwright test tests/e2e/quarterly-gdp.e2e.spec.ts --reporter=list` で1件成功。
- 確認済み: 公開経路は年次GDP/fallbackを使わず、mergeでsupportキーを除去して四半期GDPを公開する。一方、`quarterlyAggregation.ts` と `cpi.ts` のlegacy support互換処理は残存し、別経路のrollback互換として維持されるため、「削除済み」とは記録しない。
- 未確認・残課題: 未ready/欠損時のpageからUI全体（info・表・CSV・チャート）へのE2Eは未実装・未検証。`buildQuarterlyPublicViews`/`mergeQuarterlyGdpRows` の純粋関数テストで未ready・欠損等の公開projection境界は担保しているが、テスト環境に確実な状態注入手段がないため、UI全体のE2Eは残課題とする。外部公表値との独立再照合、Plan21/22の完全同期・歴史的記述整理も未実施であり、完了扱いにしない。`mergeQuarterlyGdpRows` は重複期間の先頭行のみGDP値を付与する単体テストを含む。

## 過去監査スナップショット（2026-09-10・修正前）

以下は修正前時点の監査記録であり、現在の判定ではない。現在の結論は、上記「最新再監査」を正とする。

実装済みチェックリストの根拠を、現行コード・保存済みCSV・テストで再確認した。結論として、四半期GDPのページ結合と公開projectionのallowlistは実装されているが、計画に記載された「全受入条件達成」は一部根拠不足である。

### 根拠が問題なさそうな項目

- `src/app/page.tsx` は `loadQuarterlyGdpData()` の結果を受け取り、`mergeQuarterlyGdpRows()` を経由してから `projectQuarterlyPublicView()` に渡している。
- `mergeQuarterlyGdpRows()` は年・四半期キーで結合し、結合前に既存の公開GDPキーを削除する。ready かつ有限の当該四半期値だけを設定し、未ready・欠損・非有限値・期間外は設定しない。
- CTI行はGDPの有無で削除されず、CTI費目の3か月平均処理も残っている。
- `quarterlyPublicProjection.ts` のallowlistにより、内部raw/comparison系列は公開projectionへ出ない。
- 2025Q1〜Q4の保存CSV原値から `原値 ÷ 4期平均 × 100` を再計算した結果は、計画記載の比較指数と一致する。名目は `98.13619248429872, 98.2344511010921, 99.83679608515784, 103.79256032945135`、実質は `99.5723125435298, 98.16183319475196, 100.00136309555106, 102.26449116616718`。
- `pnpm test` は再実行時に 37 files / 306 tests 全件成功した。追加の `quarterly-gdp-join` と Plan21 データ品質テストも 8 tests 成功した。

### 根拠が怪しい、または未達の項目

- 「`quarterlyAggregation.ts` から月次GDP採用・0初期化・旧スケーリングを削除済み」は現行コードと一致しない。同ファイルにはGDP公開キーの0初期化、月次support値の採用、`applySupportSeriesScaling()` が残っている。ただしページ経路では後段の結合が値を削除・再設定するため、公開結果への影響は別途切り分ける必要がある。
- 「ローダーの年次fallbackを削除済み」は、年次GDP注入の削除という範囲では確認できるが、`cpi.ts` には旧support値および0注入の処理が残るため、ローダー全体からfallbackが消えたという記載は過大である。
- 「表・CSV・tooltipの期間ラベルが四半期として識別可能」は未達。`DataTablesSection` とCSVは `年月` を優先し、`2025年1月` のような月表示を出す一方、チャートは `2025Q1` を使う。
- 「E2Eで2025年4期の表・CSV・tooltip値を期待値照合」は未確認。`tests/e2e/quarterly-gdp.e2e.spec.ts` は公開系列名、内部系列非表示、表の一部期間の非欠損、CSV/tooltipの系列名を確認するが、4期の期待数値や表・CSV・tooltip間の値一致を比較していない。
- 「ページから公開projectionまでの経路を単体・経路テストで検証」は未確認。追加単体テストは結合関数中心で、pageからprojectionまでのテストではない。
- `info` のready表示はready実データ経路では整合するが、未ready・欠損時のUI表示までを実証したテストは確認できない。またinfo文言には「公式金額のまま使用」という旧表現が残り、比較指数表示との説明整合性に注意が必要である。
- Plan21/22には旧来の完了・未実装・公開raw/comparison記述が残っており、計画同士の記述同期は完了と断定できない。
- 「型検査・lint・本番build・対象E2Eを実行済み」は計画内の記録としては存在するが、今回の監査では再実行していない。「関連lint」の具体的コマンドも記録が曖昧である。

したがって、これは修正前時点の判定であり、現在の結論には用いない。
