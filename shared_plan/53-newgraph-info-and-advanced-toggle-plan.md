# 3種比較のinfoを実態に合わせ、延長系列チェックを削除する計画

> **[状態]** 実装・仕様同期・対象テスト更新・最終検証完了。

## 目的

NewGraph（3種比較）のinfo説明を、現在表示される比較系列の定義・データ来歴と一致させる。比較専用UIにある「参考・延長系列」のチェックを削除し、3種比較の利用者に延長系列を選択させない。

## 対象範囲

- `new-graph` のinfo本文および、実装が必要とする場合は状態反映処理。
- NewGraphに渡される「参考・延長系列」チェックと、そのチェックの表示状態・URL状態の伝播。
- 上記の公開契約を記述するOpenSpecと、該当する既存テスト。

比較info、NewGraphのtoggle/advanced state、共有URL parser/serializer、対応する仕様・テストを対象とする。追加調査により、Plan38の四半期CTI名目系列builder/APIはproduction consumerがなく、Plan40の公開四半期projectionにも流れないこと、またGDP support loader/APIは読み込み後に公開projection consumerがないことを確認したため、これらの未使用経路も削除対象に加える。Plan40の四半期公開projection・画面・テーブル・CSV出力、active CPIとpayrollの計算、Plan37の月次CTI source/extension compatibility dataは使用中なので維持する。Plan21 GDP support artifactsおよび`shared_plan/21...` / `shared_plan/38...` はコード・data artifactとしては削除対象、計画書は履歴資料として維持する。

## 現状と変更案

- `src/lib/chartInfoContent.ts` の `CHART_INFO["new-graph"]` は、消費を「12か月移動平均」とだけ説明し、3系列の加工をいずれも単純な12か月移動平均としている。確認済みの実態では、消費比較系列はPlan49の月次合計 `消費(総合)` を2025年の月次平均=100に基準化した比較系列であり、CTI延長系列ではない。infoは系列ごとの実際の定義・基準・来歴を記載する。
- `resolveCtiChartInfo` による動的なinfo反映が比較infoに与える影響を確認し、静的文面と状態由来の文面が食い違わないようにする。
- `src/app/components/CpiChartSections.tsx` のNewGraph向け `advancedToggle`（「参考・延長系列」）を削除する。
- NewGraph固有のadvanced表示・絞り込みは比較UIの経路から整理する。共有URL stateの `from` / `to` / `hidden` は維持し、四半期チャートの独立契約も維持する。
- リポジトリ全体の参照を調査した結果、`adv` を消費する独立したチャート機能は残っていない。共有parser/serializerから `adv` のstate契約を除去し、legacy `?adv=1` は表示に使わない。通常のURL同期時に `adv` を削除し、無関係なquery parameterは保持する。
- Plan38の `buildPlan38CtiNominalRows` / `buildPlan38CtiNominalRowsFromRecords` と `aggregateCtiBasicNominalQuarterly` は定義・専用テスト以外のproduction consumerがない。未使用builder/APIとその専用tests/spec契約を削除し、Plan40の四半期公開経路を変えない。
- GDPのannual loaderは内部でGDP値を読み、CTI/earnings行へ設定する段階まではあるが、公開projection後にGDP fields/keysを読むconsumerがない。quarterly GDP loader/APIもproduction callerがない。loaderから公開projectionまでのdata flowを確認し、annual/quarterly GDP support loader・API・fields・artifactsと、それらに依存するcode/tests/spec/scripts/refresh pinsを一括して削除する。公開ページにGDP keysが残らないことを確認する。

## 想定変更ファイル

- `src/lib/chartInfoContent.ts`
- `src/app/components/CpiChartSections.tsx`
- `src/app/components/CpiChart.tsx` および `src/app/components/NewGraph.tsx` の比較状態・系列選択経路
- `src/hooks/useUrlState.ts` と `src/lib/urlState.ts` の共有URL parser/serializer
- `openspec/specs/nextjstest/spec.md`
- Plan38未使用四半期APIと専用testsおよび対応するOpenSpec契約
- unused annual/quarterly GDP support loader・API・fields・artifactsと関連code/tests/spec/scripts/refresh pins（Plan21のGDP support artifactsを含む）
- 対象契約を検証する既存テスト（新規テストの要否は現状テストを確認して決める）

## テクニカルキーポイント

- 比較infoの実装位置は `CHART_INFO["new-graph"]`。消費・CPI・給与の3系列すべてについて、入力データから比較表示値に至る生成ロジックをコード上で照合してから文言を確定する。消費はPlan49の「消費(総合)」月次合計を2025年平均で先に基準化し、その後、欠損のない連続12暦月だけを平均する。CPIは生CPIの2025暦年平均から求めた係数を、先に算出した12か月移動平均へ適用する。給与比較系列は所定内・所定外・特別給与の各12か月移動平均の合計に共通係数を適用するが、その係数は所定内・所定外の月次生値と特別給与12MAの和である「総合」の2025年平均から求める。実装と異なり、給与3系列の12MA合計から係数を求めるとは説明しない。
- `resolveCtiChartInfo` は四半期消費チャート向けの動的説明に限定し、NewGraph comparison infoをこのresolverやquarterly page propsのstatusで差し替えない。quarterly resolverとinfoは維持する。
- NewGraph向けの切替は `CpiChartSections.tsx` の `NewGraph` に渡される `advancedToggle` と、比較系列のadvanced絞り込み（同ファイル内）を追跡する。トグルだけを消して延長系列が別経路から表示されたり、比較系列が消えたりしないよう、registry・凡例・チャート・table/CSV投影への影響を調べる。
- 全リポジトリの参照調査では独立した `adv` consumerは見つからなかった。URL parserは `adv` を読まず、serializer valuesからも除去する。URL同期時は現在のqueryを複製したうえで `adv` を削除し、その他のqueryとhistory stackを保持する `history.replaceState` を使う。
- 比較registryは固定3系列とし、NewGraphの表示・凡例・tooltip・table/CSV投影は `adv` による絞り込みを行わない。旧 `?adv=1` は比較内容に影響しない。
- 四半期の延長相当機能はPlan38未使用builder/APIとPlan40公開projectionを区別する。production callsiteがゼロのPlan38 `buildPlan38CtiNominalRows` / `buildPlan38CtiNominalRowsFromRecords` および `aggregateCtiBasicNominalQuarterly` とその専用test/spec契約は削除する。production consumerがあるか確認し、Plan40の公開四半期projection・画面・テーブル・CSV出力は保持して出力が変わらないことを確認する。
- GDP supportのloader-to-consumer全経路を監査する。annual loaderはGDPを読みCTI/earnings行へ設定するが、その後公開projectionのGDP fields/keysを消費するproduction consumerがないこと、quarterly GDP loader/APIにもproduction callerがないことを確認し、annual/quarterly GDP support loader/API/fields/artifactsと関連code/tests/spec/scripts/refresh pinsを除去する。公開ページと公開projectionにGDP keysを残さない。active CPI/payroll calculations、Plan37 monthly CTI source/extension compatibility data、Plan40 quarterly public projectionは維持し、`shared_plan/21...` と `shared_plan/38...` は歴史資料として残す。
- OpenSpecの比較info・表示系列・advancedのWHEN/THEN要件を実態へ同期する。Data Sources / Data Flow / Component Tree / Requirementsのうち変更のある箇所を更新し、各要件は `openspec/config.yaml` のspecルールに沿ってWHEN/THENで記載する。
- Next.js関連コードを変更する前に、このリポジトリにインストールされたNext.jsのバージョンに対応する `node_modules/next/dist/docs/` の関連ガイドを読む。既存のagent rulesも確認する。

## 受け入れ条件

- WHEN 利用者が3種比較のinfoを開く THEN 消費・CPI・給与の説明が実装上の系列定義、基準期間、データ来歴と一致し、消費を誤って単純な12か月移動平均またはCTI延長系列と説明しない。
- WHEN 比較系列のデータ状態によりinfoが動的に変わる THEN 有効・利用不能等の状態説明と系列の実態説明が矛盾しない。
- WHEN 利用者が3種比較を表示する THEN 「参考・延長系列」チェックが表示されず、チェック操作によって比較の系列構成が変化しない。
- WHEN legacy `?adv=1` を含むURLで3種比較を開きURL同期が行われる THEN `adv` は比較内容に影響せず、同期後のURLから除去され、その他のquery parameterは保持される。
- WHEN URL共有stateを同期する THEN 共有parser/serializerに `adv` のstate契約はなく、`from`・`to`・`hidden`と無関係なquery parameterの既存契約が維持される。
- WHEN 実装で四半期系列/APIの削除候補を判定する THEN production callsiteがないPlan38の未使用builder/APIとその専用tests/spec契約を削除し、Plan40の公開四半期projectionのseries・画面・テーブル・CSV出力は変更しない。
- WHEN annual/quarterly GDP support loaderのconsumerを監査する THEN loader出力が公開projection以降で消費されないことを確認し、GDP support loader/API/fields/artifactsおよび関連code/tests/spec/scripts/refresh pinsを除去し、公開ページにGDP keysを含めない。
- WHEN CPI/payroll計算、Plan37 monthly CTI data、またはPlan40 quarterly public projectionを利用する THEN active consumerを維持し、既存公開outputを保つ。
- WHEN OpenSpecを更新する THEN 比較info・系列表示・advanced挙動が実装と同期し、変更した要件にWHEN/THENシナリオがある。

## 実装時の検証案

- 対象テストを確認し、NewGraph info文面・固定3系列・延長系列チェックの不在・旧 `adv` の同期時削除と無関係queryの保持を検証する。Plan38 APIのproduction callsiteがゼロであること、専用tests/specだけから旧API参照が除かれたこと、Plan40四半期公開outputが変わらないことを確認する。GDP loader-to-consumer監査でdownstream consumerがないこと、公開page/projectionにGDP keysがないこと、関連tests/spec/scripts/refresh pins/artifactsを片付けたことを確認する。active CPI/payroll、Plan37 monthly CTI data、Plan40 quarterly projectionは残存・動作を確認する。
- type-check、lint、および関連するユニット／コンポーネント／ブラウザテストを実施する。検証対象は実際に変更した経路に合わせる。
- OpenSpecの参照先・WHEN/THENと実装の対応を確認する。

## Implementation outcome

- Comparison info now describes the implemented order precisely: CPI's coefficient comes from raw CPI's 2025 calendar-year average and is applied after the moving average; salary's common factor is based on the 2025 average of raw scheduled + raw unscheduled + special-pay 12MA, then applied to the three 12MAs; Plan49 consumption is normalized before strict complete 12-calendar-month averaging. The NewGraph info no longer receives the quarterly CTI info resolver state.
- Removed the NewGraph “参考・延長系列” toggle, its advanced filtering/state/localStorage hookup, and the `adv` parser contract. URL synchronization removes legacy `adv` with `history.replaceState` while preserving unrelated query parameters.
- Repository-wide reference review found no separate `adv` chart consumer. Removed unused Plan38 quarterly nominal builder APIs (`buildPlan38CtiNominalRows`, `buildPlan38CtiNominalRowsFromRecords`, and `aggregateCtiBasicNominalQuarterly`) and their dedicated test/spec contract after confirming there are no production callsites. GDP support loader/API/fields/artifacts and related code/tests/spec/scripts/refresh pins are also removed after tracing annual and quarterly loader outputs and confirming no downstream published-projection consumer; no GDP keys remain in the published page. The Plan40 quarterly public projection and screen/table/CSV output, active CPI/payroll calculations, and Plan37 monthly CTI source remain unchanged; `shared_plan/21...` and `shared_plan/38...` remain historical documentation.
- Updated the OpenSpec Data Sources, Data Flow, Component Tree, and WHEN/THEN requirements, plus applicable unit/component/browser-mode assertions.
- Updated the targeted tests and completed the requested verification gates. The technical key points and acceptance criteria are achieved; gate results are recorded below.

### Completion and verification record

- **Technical key points achieved:** NewGraph information text matches the implemented CPI, salary, and Plan49 consumption calculation order and source basis; the quarterly CTI info resolver remains separate. The NewGraph advanced toggle and `adv` state contract are removed, while URL synchronization retains unrelated query parameters. Unused Plan38 quarterly APIs and GDP-only loaders, fields, artifacts, tests, specification references, and refresh pins are removed. Plan40's ten-category quarterly public output and Plan37's monthly CTI source remain current. OpenSpec and retained historical plans identify the retired paths as historical.
- **Acceptance criteria achieved:** the published comparison remains fixed to its three registered series without an advanced toggle; legacy `adv` does not change comparison output and is removed during URL synchronization; Plan40 quarterly projection and its browser-visible output remain present; no GDP keys are published; CPI/payroll, Plan37 monthly CTI, and Plan40 quarterly consumers remain covered.
- **Vitest:** `pnpm exec vitest run` exited 0: 117 files, 1359 passed, 1 skipped. The Vitest process also emitted a `[hook] gate failed ... exit 23` warning. This warning is recorded separately from Vitest's exit status; the direct next-route pre-push browser gate subsequently passed.
- **Other gates:** `pnpm type-check`, `pnpm lint:fast`, and `pnpm run build` passed.
- **Built browser gates:** `pnpm test:browser:phase6-b03:built` passed (3/3); `pnpm test:browser:phase6-b06:built` passed (1/1); direct `pnpm test:browser:next-route-poc:prepush:built` passed.
