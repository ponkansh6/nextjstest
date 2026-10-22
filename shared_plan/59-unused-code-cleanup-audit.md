# Plan 59 実施監査

> **監査日:** 2026-10-22
> **対象計画:** [`59-unused-code-cleanup-plan.md`](./59-unused-code-cleanup-plan.md)
> **結論:** 月次CTI info state の未消費経路と、独立した未使用CLI `scripts/compare.ts` を削除した。計画に挙げた他の候補と保全対象は判断を記録して維持した。限定したコード監査と直接gateは完了したが、計画が対象とする全領域・全入口の網羅監査および専用の手動browser確認は完了していない。

この文書は実施結果の記録であり、計画原文の状態欄や本文は変更しない。Plan本文の初期状態文（実装未着手・削除未実施）は実装後の現状を反映しないが、依頼に従い原文を保存している。現在の実施状態は本監査記録を参照する。ここでの「完了」は候補ごとの判断と適用gateの結果を指し、リポジトリ全体の未使用要素を網羅したという意味ではない。

## 計画全体との照合

| 計画の章・論点       | 達成度                       | 実施結果・根拠                                                                                                                                                                                                                                                                                                                                               | 未解決範囲                                                                                                 |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 目的と対象           | 部分達成                     | 月次CTI info stateは未消費データ経路を根拠に専用状態生成・prop・resolver引数・型を同じ変更範囲で除去。追加監査ではstandalone `scripts/compare.ts` のrepo内consumerがないことを確認して削除した。四半期説明、月次CTI本体と比較系列、共有loader/fetch/計算、チャート状態は維持。                                                                               | 目的に含まれる他領域の候補監査は限定探索に留まり、全体完了ではない。                                       |
| 初期確認・baseline   | 部分達成                     | 実装中の状態と差分を確認して変更した。Nextガイド5件は先行して読了済み。baseline PNPM gate は `node_modules` の削除確認で中断され、baseline成功として扱っていない。                                                                                                                                                                                           | この結果から変更前のlint/type/test状態を推定しない。                                                       |
| 入口・対象範囲       | 部分達成                     | 対象機能では `page.tsx` → `CpiChart` → `getChartInfoContent` の本番経路を追跡。限定的なscript/CI/package/Husky参照調査で `scripts/compare.ts` のrepo内呼出し・実行対象登録は見つからず、後述の証拠と制約を記録して削除。探索手順と例は「探索範囲と再現性」に記載。追加の限定監査として `server/`・`shared/`・`src/` を調べ、追加削除候補なしとの報告を得た。 | 計画記載の全route、CLI、CI、hook、cron/手動運用、public/data、root設定等の入口を網羅列挙したものではない。 |
| 静的参照・外部参照   | 部分達成                     | `ctiInfoState`、`CtiChartInfoState`、`CtiPublicSeriesState` を `src/`・`tests/`・対象specで再検索し残存なし。`getCtiBasicConsumptionStatus` の他利用も検索し、server側の利用は保持。hook helperはrepo内のcaller未確認だけで削除せず、外部source契約を排除できないため保留。                                                                                  | 全dynamic import、reflection、外部script、利用者/運用契約の網羅確認はしていない。                          |
| Data flow・出口      | 候補経路について達成         | 削除したinfo-state objectのfieldはresolverへ渡る以外に消費されていなかった。page生成からresolverまでを確認し、resolverが第3引数を読まず四半期静的説明を返すことを確認。元のCTI data/loaderは別用途で保持し、月次seriesの取得・比較計算・`consumptionSeriesState` と四半期rowの `ctiMetadata` も維持。                                                        | 他の機能・data flowについて計画所定のproducer-to-exit台帳は作成していない。                                |
| Browser到達性        | 自動化gateは部分達成         | push時のpre-pushでcomponent browser gateと選択されたNext-route browser gateが成功したとのOrchestrator報告がある。削除根拠自体はresolver実装・参照経路の静的追跡と仕様記述による。                                                                                                                                                                            | 独立した手動browser sessionやviewport/state別の専用確認は未実施。全route網羅でもない。                     |
| 候補判断             | 対象候補は判定、他候補は保留 | 候補台帳の要約は下表。hiddenな `ChartDataContract` は意図的なproduction契約として保持。backupやfixture等は見た目・古さ・参照検索だけで消していない。                                                                                                                                                                                                         | 依存・設定・asset・fixtureを含む全候補台帳の作成には至っていない。                                         |
| Technical key points | 個別照合（下表）             | 各キーポイントの実施範囲と証拠を次の対応表に記録。                                                                                                                                                                                                                                                                                                           | 全tree・全利用条件での達成を意味しない。                                                                   |
| 段階計画             | 部分達成                     | 下記「段階計画の進捗」に各段階を照合。                                                                                                                                                                                                                                                                                                                       |
| 完了基準             | 部分達成                     | 対象の最小差分、仕様照合、直接gate、未解決点を記録。全体入口一覧・全候補の証拠台帳・browser確認は未達なので計画全体の監査完了とはしない。                                                                                                                                                                                                                    | 全対象領域への完了基準の適用。                                                                             |
| Safety               | 今回の手順について達成       | CTI実装は対象6ファイル、追加CLI削除はscriptとcodemapの2ファイル、監査記録は本ファイルに限定。禁止git option/hook無効化による変更は行っていない。テストは実装者が実行せず、gateはOrchestratorが実行・報告する。                                                                                                                                               | Plan全体の将来作業の安全性を認証するものではない。                                                         |

### テクニカルキーポイント個別照合

| Plan 59のキーポイント                                                                  | 達成度                            | 照合結果・証拠                                                                                                                                                                                                                                                                                                                        | 未解決範囲                                                                                                                                                      |
| -------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 到達性とデータフロー：参照有無と最終消費先を区別し、入口から出口・分岐・副作用まで追う | 対象経路で達成、全体は未達        | CTI info stateはpage生成からprop、resolverまで追跡し、resolverが値を読まないことを確認。削除前の `scripts/compare.ts` は固定値のFibonacci数列をstdoutへ出すだけで、import、file/network/env/argv/API利用がなく、調査したrepo内の呼出し箇所もなかった。                                                                                | 全機能のproducer-to-exit台帳や全分岐追跡は未実施。外部・手動利用は否定できない。                                                                                |
| 外部契約：公開API、URL、CLI、環境変数、外部データ等は内部参照不在だけで消さない        | 部分達成                          | hook並列helperは外部 `source` 契約を排除できず保持。公開/data/backup等も用途不明は保留。                                                                                                                                                                                                                                              | repo外consumer、cron、手動運用、production/実サービスを確認できないため明示的に除外（後述）。                                                                   |
| Next.jsとServer/Client境界・serializable props・special files・ローカルガイド          | 対象CTI変更で達成、全体は部分達成 | Next 16.3.8のローカルガイド5件を変更前に確認。CTI変更でApp Router special file、Server/Client境界、props serialization、component構造を変更せず、選択されたNext-route browser gateが通過したとの報告を記録。                                                                                                                          | 全route/special-file/metadata/dynamic importの網羅監査や全route browser確認は未達。                                                                             |
| CSS、可視性、accessibility、keyboard、metadata等の非視覚用途                           | 判定保留／今回の変更には非該当    | `ChartDataContract` hidden DOMを意図的data-contractとして保持。今回削除したCLIはUI/DOMを持たない。push時の自動browser gate報告は記録した。                                                                                                                                                                                            | 対象tree全体のCSS cascade、responsive/flag/state別visibility、a11y tree、keyboard、metadata監査と人間による視覚評価は未実施。人間の全viewport評価は明示的除外。 |
| 削除と仕様同期：関連caller/test/config更新、OpenSpec要件をWHEN/THENで同期              | 対象変更で達成                    | CTIの専用prop/APIテスト期待を更新。OpenSpec line 88の四半期説明と月次選択・可用性の独立契約を維持。CLI削除はアプリ/API/data model/利用者操作の仕様変更ではないためOpenSpec更新不要と判断。                                                                                                                                            | repo全域の仕様要件同期監査は未実施。要件変更を伴う候補が見つかった場合は `openspec/config.yaml` のWHEN/THEN規則を適用する。                                     |
| ツールと検出限界：lint/type-check/depcheckを網羅的unused証明にしない                   | 達成（限界を記録）                | lintとTypeScriptは選択したgateとして記録し、候補の根拠には限定参照調査と実コードの性質を使った。TypeScript 5.9.3のroot-relative exclude semanticsでは `tsconfig.json` の `compare.ts` はroot `/repo/compare.ts` のみを指し、nested `scripts/compare.ts` には一致しない。したがって、この設定はCLI削除の根拠にも反証にも使っていない。 | TypeScript未使用検査は未設定。全treeのAST/type-aware consumer graph、dynamic/reflective/CLI/config contract解析は未実施。                                       |

## 探索範囲と再現性

探索は以下のrootと検索種別に限定した。`rg --files` によるファイル列挙と `rg -n` による識別子・参照検索を使い、候補の定義からcaller/consumerを辿った。各領域を全件走査・意味解析したという主張ではない。

| root / 領域                                                      | 検索種別・対象の例                                                                                                                                                                                                                                         | 結果と限界                                                                                                                                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/`, `server/`, `shared/`, `tests/`                           | ファイル一覧、CTI info-stateの宣言・参照検索（`ctiInfoState`, `CtiChartInfoState`, `CtiPublicSeriesState`）、`getChartInfoContent(` と `getCtiBasicConsumptionStatus` のcaller検索。ChartDataContract/四半期metadataおよびpage/componentテスト期待も参照。 | CTI専用prop/API経路の残存なし。`server/`・`shared/`・`src/` の限定監査報告では追加削除候補なし。文字列検索対象外のalias/reflection等は網羅していない。                               |
| `scripts/`, `.github/workflows/`, `.husky/`, root package/config | ファイル名・入口候補の列挙、script/command/function/helper宣言と呼出・文字列参照の検索。`package.json` scripts、Oxlint/TypeScript設定、Husky source/callerを確認。                                                                                         | hookの並列helperはrepo内caller未確認だが、外部 `source` 契約が排除できず保留。CI・script・設定の全entry/動的選択を監査したわけではない。                                             |
| `data/`, `public/`, `tests/fixtures/`, backup候補                | ファイル一覧とURL/source path、manifest/metadata、fixture/backup名・参照の限定検索。データmanifest類と `public/economics_source/`、テストfixtureの存在も確認。                                                                                             | データ、public asset、fixture、backupを削除しない判断。全producer/consumer/hash/再生成手順を個別照合していないため、用途不明分は保留。`CI backups` と `python_backup` も削除対象外。 |

上記は対象rootを挙げた限定探索の記録であり、全ファイルのURL/manifestまたは全CI backup等を一件ずつレビューしたという意味ではない。候補判断は検索不在だけでなく実際に追跡できた経路と外部契約の不確実性に基づく。

## 候補の判断台帳

| 候補                                                                         | 分類・判断                       | 実施・保持内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/page.tsx` → `CpiChart` → `chartInfoContent.ts` の月次CTI info state | 消費先なしを確認。削除           | `ctiInfoState` の構築、info表示専用status取得、`CpiChart` prop、resolver第3引数を削除。削除したinfo-state objectのfieldはresolverへ渡る以外に消費されない。元のCTI data/loaderは月次データの別用途で保持。                                                                                                                                                                                                                                                                                                                                                                                                          |
| `scripts/compare.ts`                                                         | 限定調査でrepo内呼出しなし・削除 | 削除前の実体は固定値 `n=10` のFibonacci数列をstdoutに出すだけのstandalone CLI。import/export、argv/env、file/data writeはなく、package scripts、CI、Husky、test、shell、dispatcher、現在のrepo呼出しを確認できなかった。codemapには役割カテゴリの記載のみで実行・利用契約はなかった。TypeScript 5.9.3のexclude semantics上、`tsconfig.json` のroot-relative `compare.ts` はnested pathに一致せず、削除根拠に使用していない。文書化されたsupported CLI contractやrepo-local consumerがなく、単純なstandalone sampleであることを根拠に削除した。外部・手動利用は否定できず未確認。Python backupと履歴snapshotは保持。 |
| 専用型とテスト契約                                                           | 削除対象に追随                   | `CtiChartInfoState` / `CtiPublicSeriesState` を削除。`home-page-coverage` からprop形状期待、`chart-info-content` から月次CTI stateを複数状態に変えても同一になることを確かめる専用テスト自体、`cpi-chart-coverage` から未使用prop/fixtureを除いた。新規テストは追加していない。                                                                                                                                                                                                                                                                                                                                     |
| `.husky/lib/hook-common.sh` の並列gate helpers                               | 外部契約の疑い・保留             | 静的callerが見つからないことだけでは安全に削除できず、外部 `source` 契約を排除できない。helperと周辺の逐次gate、安全処理を保持。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ChartDataContract` hidden DOM                                               | 意図的な非視覚利用・保持         | data-contract consumerが利用する隠し契約として維持。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `server/`・`shared/`・`src/` の限定追加探索                                  | 追加候補なし                     | 報告された限定範囲では削除候補なし。リポジトリ全体の不在証明には用いない。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `data/public`、テストfixture、backup、CI backups、`python_backup`            | 判断材料不足・保留               | 今回削除せず保全。参照が見えないことや古さだけを根拠にしない。用途・再生成性・証跡価値を個別に確認する追加調査が必要。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### `scripts/compare.ts` 個別証拠

削除対象は `scripts/compare.ts`（履歴上の削除前位置）である。削除前の23行のscriptは `fibonacci(n)`（L3）と `main()`（L14）を定義し、固定値 `n = 10` で数列を `console.log` するだけだった。import/export、CLI argument/environment input、file/network access、data write、API callはなく、実行時の効果は標準出力に限られていた。

再現可能な限定検索範囲はrepo内の `package.json`/package scripts、`.github/workflows/`、`.husky/`、`tests/`、shell scripts、script dispatch/runner、およびsource/設定全体の文字列参照である。検索語は候補名 `compare.ts` と `compare`、`fibonacci` を使って呼出し・登録箇所を探し、関連script定義をファイル内容で追跡した。結果は、package command、CI/Husky/test/shell/dispatcherからの起動、その他の現在repo内呼出しは見つからなかった。`scripts/codemap.md` の記載はcompare/measureの目的分類だけで、起動方法・引数・利用契約を示していなかったため、その一項目を更新した。個別の完全な検索ログは保存しておらず、この説明は網羅的意味解析を主張しない。

削除はアプリ実行、公開API、data model、データ生成、利用者向けUI/操作、OpenSpec要件に影響しないと判断し、OpenSpecは更新していない。candidate-specific verificationは上記のコード形状と参照範囲の静的確認であり、CLI実行テストは不要なstdout-only sampleとして追加していない。TypeScript 5.9.3の `exclude: ["compare.ts"]` はroot相対の `compare.ts` にだけ一致し、`scripts/compare.ts` には一致しないことを確認した。設定は保持し、削除根拠には使っていない。

ただし、repo外の別repo、user shell alias、cron、手動実行や利用者のローカル手順から呼ばれていた可能性は排除できない。これらはこのworkspaceから確認不能なため明示的に未確認・除外とし、削除判断は「文書化されたsupported CLI contractとrepo-local consumerがなく、単純なstandalone sampleであった」ことに限定する。外部・手動の利用が存在しないとは結論しない。

### 保持した機能・契約

- 月次CTI本体、比較系列、共有loader/fetch/計算処理、グラフのstateは変更していない。
- 四半期CTIのPlan40 metadataと四半期説明を維持した。`ChartDataContract` を含む四半期rowのmetadata経路も変更していない。
- `consumptionSeriesState` は月次比較系列の可用性を表す独立propとして維持した。
- 四半期説明が月次選択・可用性から独立する記述は [OpenSpec `spec.md` line 88](../openspec/specs/nextjstest/spec.md) にあり、変更後も成立する。削除したのは未消費stateの受け渡しだけで、表示内容・コンポーネント構造・データソースの契約を変えていないため、仕様更新は不要と判断した。

更新後のテスト契約は次の既存assertionに残る。`chart-info-content.test.ts` は静的な四半期説明・source URL・disclosure内容と説明内に `raw` / `12MA` / `metadata` 等の内部語が混ざらないことを検証する。削除したのは「月次CTI stateを複数状態に変えても返り値が同一」という専用invariance testである。`home-page-coverage.test.tsx` はmeasurement sidecar由来の `consumptionSeriesState` がchart propへ渡ることを検証し、`cpi-chart-coverage.test.tsx` はquarterly row由来の `ctiMetadata` が維持されることを確認する。これらは月次比較系列・四半期metadataの契約を対象とし、削除したinfo-state prop/API shapeの再検査ではない。

## 段階計画の進捗

| 段階                        | 状態             | 記録                                                                                                                                                                                                                  |
| --------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 初期調査と計画保存       | 完了（先行作業） | Plan 59を保存。                                                                                                                                                                                                       |
| 2. 実装時baselineと範囲確定 | 部分達成         | 対象差分を確認。baseline PNPMは `node_modules` 削除確認で中断。全入口一覧は未作成。                                                                                                                                   |
| 3. 静的候補と経路台帳       | 部分達成         | CTI dead pathの完全な参照経路と専用契約を照合し、限定script/CI/package/Husky参照調査でstandalone `scripts/compare.ts` のrepo内consumerなしを確認。限定 `src/server/shared` 監査では追加候補なし。全tree台帳ではない。 |
| 4. 証拠と仕様による判定     | 部分達成         | CTI経路の実装とOpenSpec独立契約を照合。自動化browser gateはpush時に通過したとの報告があるが、専用の手動確認は未実施。hook外部sourceと保全物は保留。                                                                   |
| 5. 小分けの削除             | 対象分完了       | CTI state専用経路を削除し、専用prop/APIテスト契約を更新。repo内consumerなしと判定した `scripts/compare.ts` とcodemap項目も削除。ほかの保留候補は削除していない。                                                      |
| 6. 仕様差分と検証           | 対象分完了       | OpenSpec更新不要と判定し、直接gate結果を下記に記録。全体監査の完了条件は未達。                                                                                                                                        |

## Baselineと検証記録

- **Pre-install baseline PNPM:** 初回の `pnpm lint:fast` / `pnpm type-check` 呼出しは、PNPMによる `node_modules` purge確認でno-TTY中断し、task実行前に終了した。pre-install baseline passとは数えない。
- **実装中の初回Vitest:** `home-page-coverage` に4 failures。全件が実装途中の古い `ctiInfoState` prop期待に起因し、baseline失敗ではない。実装とテスト契約更新後の最終結果で判断する。
- **最終直接gate（Orchestrator実行報告、全件exit 0）:** 次のコマンドが報告された。独立監査者による再実行ではない。

  ```sh
  ./node_modules/.bin/oxlint --ignore-pattern 'tests/**' --ignore-pattern 'scripts/ts_converters/**' --ignore-pattern '**/.plan42*' --ignore-pattern '**/.plan42*/**' --nextjs-plugin --react-plugin --react-perf-plugin
  ./node_modules/.bin/tsc --noEmit
  ./node_modules/.bin/vitest run tests/unit/chart-info-content.test.ts tests/unit/home-page-coverage.test.tsx tests/unit/husky-hook-common.test.ts tests/components/cpi-chart-coverage.test.tsx
  node scripts/hook-smoke.mjs
  git diff --check
  ```

- **最終結果（Orchestrator報告）:** Oxlint、TypeScript、Vitest、hook smokeがexit 0。Vitestは対象4ファイルで59 tests pass。差分形式確認もpass。
- **Browser:** 実装者による個別の手動browser inspectionは未実施。後述するpush時のpre-push自動化browser gateは通過したとの報告がある。
- **仕様照合:** OpenSpec line 88の四半期説明と月次CTIの独立契約を維持。仕様変更なし。

上記の成功結果はOrchestrator実行報告の記録であり、独立監査者はこれらのgateを再実行していない。今回変更と対象gateに限る結果であり、baseline PNPM中断、browserの手動確認未実施、および限定探索の範囲を埋める証拠としては扱わない。

## Commit後のpush gate記録

push時に通常のpre-push hookが実行され、以下のgateが成功したとのexecutor/Orchestrator報告を受けた。監査者は独立再実行していない。

- clean worktree、lint、typecheck
- coverage: 122 files、1423 tests passed、1 skipped。coverage 100%と報告
- browser component gate、選択されたNext-route browser gate
- production build、build parity、security-check

この結果はpush時の自動化gateの証拠であり、個別の手動browser sessionや全browser routeの観察を意味しない。Plan全体の監査は依然として部分達成であり、全入口一覧、全領域の候補台帳、外部契約の解決、manual browser確認は未完了である。

## コーディングエージェントが実行できない作業の除外

以下はこの作業treeから証拠を確定できないため、Plan 59の今回の実施対象から明示的に除外した。これらを完了したものとは数えず、計画全体の達成度は部分達成のままとする。

- `.husky/lib/hook-common.sh` のhelperをrepo外から `source` するconsumerの有無。外部repoや利用者のshell設定を調べられないため、helperは保持。
- repo外cron、手動運用、およびproduction/実サービス上の実行・データ公開影響。外部環境へアクセスして影響を確認する作業は行わず、repo内から証明できない契約は保留。
- 全viewport、feature flag、状態を通した人間による視覚的評価。push時の自動browser gate報告はあるが、手動visual evaluationは未実施・除外。

## 作業差分

実装差分は `src/app/page.tsx`、`src/app/components/CpiChart.tsx`、`src/lib/chartInfoContent.ts` と、専用API契約を持つ3テストファイル、および独立した未使用CLI `scripts/compare.ts` とその `scripts/codemap.md` 項目。監査記録として本ファイルを追加した。計画原文とOpenSpecは変更していない。上記技術キーポイントの未解決範囲を含むため、計画全体の達成度は部分達成である。

この監査は計画59の限定実施記録であり、全リポジトリの網羅監査を宣言しない。保留候補を再評価する場合は、呼出経路・外部source/運用契約・用途・再生成性を対象ごとに確認してから判断する。
