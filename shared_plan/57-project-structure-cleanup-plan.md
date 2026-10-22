# プロジェクト構造・ファイル整理計画

> **状態:** 本文は2026-10-21の調査を基準にした計画。計画策定時点では構成変更・ファイル移動・削除を実施していなかった。Stage 2は2026-10-21のfollow-upで実際に移動し、この下の実施記録に追記した。Stage 3/4の現位置維持・保全判断はそのままで、各段階を個別の差分と受入条件に沿って扱う。

## 目的

プロジェクトの入口、責務境界、運用資料の置き場を説明可能にし、新規ファイルの配置と既存物の保全判断を容易にする。まず資料・設定・運用スクリプトの整理から始め、コードの全面的なfeature再分割や機能変更は対象にしない。

現行の動作、公開URL、Next.jsの規約、import境界、検証範囲を保ちながら、一度に一つのファイル群を扱う。移動の利益が確認できないファイルは現在位置を維持し、少数のファイルだけのために階層を増やさない。

## 調査基準と現状

- 調査基準日は **2026-10-21**。インストール済み Next.js は **16.3.8**。現地の Next.js ガイドとして `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md` と `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md` を参照した。実装時には対象APIの現地ガイドを再確認する。
- アプリケーションは `src/app` に置かれ、route handler は `src/app/api` にある。アプリの主要コードを `src` に置く構成は既に導入済みである。`src` の導入を理由に `server/`、`shared/`、`public/`、`data/`、`results/` の現在の境界を一括で変更しない。
- `tsconfig.json` の `@/*` は `src/*`、`@server/*` は `server/*` を指す。`shared/` は独立したトップレベル領域であり、これらのaliasに含めない。
- Next.js、TypeScript、package manager、環境・lint・format、CI、テストランナー、デプロイ用のroot設定はツールがroot配置を前提にする場合がある。移動候補とせず、参照関係を調べる。
- `scripts/`、`results/`、`data/` には生成物とGit追跡対象の証跡が混在する。`shared_plan/` には計画、監査記録、分析用資料がある。用途・追跡状態をファイル単位で確認し、領域をまとめて再配置・削除しない。
- `.github/workflows/main.yml.bak` はGit追跡対象として確認されている。バックアップらしい名前だけを根拠に削除しない。
- 旧計画、監査記録、ログ、比較結果には現行の参照先・再現手順・判断根拠が残っている可能性がある。追跡状態、参照、再生成可能性、保存意図を調べるまで保全する。
- [Plan55「重要経路に絞ったリファクタリング」](./55-critical-path-refactoring-plan.md) と [Plan56「消費推計情報」](./56-consumption-estimate-info-plan.md) は既存の計画対象として扱う。どちらの進捗もこの計画から推定しない。CTI/CPIの実装・検証を重複して計画しない。Plan55/56やその成果物を移動対象にせず、必要な依存があれば所有者へ確認する。

## 整理後の目標配置

次は配置の役割を示す目標であり、既存ディレクトリの全面移動を意味しない。

| 領域                                | 役割と配置方針                                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/`                          | Next.js App Router のページ、layout、route handler、UI。URLとspecial fileの構造を維持する。                                                                                   |
| `src/`                              | Server/Client Components、route handler、表示補助などのアプリコード。既存のサブ領域を基準に局所整理する。                                                                     |
| `server/`                           | サーバー専用処理。`@server/*` の解決先を維持し、client側からのimportを防ぐ。                                                                                                  |
| `shared/`                           | クライアント・サーバーの双方で安全に共有できる処理。現在の明示的なimportを維持する。                                                                                          |
| `public/`                           | Next.jsが配信する公開アセット。URLパスを維持する。                                                                                                                            |
| `data/`                             | 入力データとデータ更新の基点。公開データやfixtureとの関係を保つ。                                                                                                             |
| `results/`                          | 分析・計測結果。既存の参照可能性を維持し、生成物と保存成果物を区別する。                                                                                                      |
| `scripts/`                          | データ更新、CI/開発運用、検証、用途が特定できる分析スクリプト。既存の `scripts/data-refresh/` などの境界を優先する。                                                          |
| `tests/`                            | unit、integration、browser、build等のテストとテスト専用設定。実際の参照を確認したブラウザー設定だけを任意で集約する。                                                         |
| `docs/`                             | 人向けの現行プロジェクト案内。候補として `docs/project-structure.md` を新設し、領域・配置判断・更新責務を記載する。                                                           |
| `openspec/specs/nextjstest/spec.md` | 正式なプロダクト仕様のcanonical path。物理分割・移動をしない。                                                                                                                |
| `shared_plan/`                      | 計画・監査の既存canonical path。名称の異なる `shared-plan/` 等を新設しない。                                                                                                  |
| root設定                            | `package.json`、lockfile、workspace、`tsconfig.json`、`next.config.ts`、`vitest*.config.ts`、Playwright、lint/format、`next-env.d.ts`等は参照関係に従いroot維持を基本とする。 |

## 移動・整理候補と判定条件

「確定」は整理方針であり、変更を本計画と同時に実行する意味ではない。「条件付き」は調査結果が受入条件を満たす場合のみ実施する。

| 現在                                                                                                  | 候補先・方針                                                                | 区分                         | 変更前の参照確認・受入                                                                                                                                                                                                        | 戻し方                                                                                     |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 該当なし                                                                                              | `docs/project-structure.md` を追加                                          | 確定（文書追加）             | 実ディレクトリとalias、設定入口を説明し、未確定の移動を既成事実として書かない。                                                                                                                                               | 文書追加だけをrevertする。                                                                 |
| rootの `vitest.browser*.config.ts` 群                                                                 | 任意候補を `tests/config/browser/` に統一                                   | 条件付き                     | package scripts、Vitestのconfig解決、`root`/cwd、include、setupFiles、alias、coverage、CI、Husky、他configからの継承・参照を全件確認。全参照を更新し、旧pathから実行できる必要があれば互換ラッパーを検討する。                | 設定と参照を同じ変更内でrootへ戻し、CIで比較する。                                         |
| `scripts/` の業務・データ運用                                                                         | 既存の `scripts/data-refresh/` 等の分類を利用                               | 条件付き（個別）             | 業務運用コマンド、文書、CI、package scriptが示す固定pathを確認する。不要な新規分類を作らない。                                                                                                                                | 対象ファイルと参照を同じ変更で元のpathへ戻す。                                             |
| `scripts/plan39/`、`shared_plan/scripts/` の分析                                                      | 用途確認後、候補 `scripts/analysis/planNN/`。少数なら現位置と配置規約を維持 | 条件付き                     | Plan番号や用途を名前から推測しない。入力・出力path、コマンド、結果への参照、再現性、所有計画を確認する。候補階層が認知負荷を減らす場合だけ移す。                                                                              | path参照とともに一群を戻し、生成物を比較する。                                             |
| `scripts/python_backup/`、`scripts/batch2_verification_worklog.txt`、`scripts/comparison_results.log` | 初期保全。必要ならファイル群ごとに `archive/` を個別検討                    | 保全（移動・削除は条件付き） | Python backupは旧変換・比較・検証スクリプト群、worklogと比較logは作業記録・結果候補として扱う。tracked/ignored/未追跡、参照、再現手順、復旧・証跡価値を確認し、移動先が明確で利益がある場合だけ変更する。秘密値を出力しない。 | 移動・削除は候補群ごとの一差分とし、path・参照・生成結果を同時に戻す。                     |
| `scripts/ts_converters/`                                                                              | 現状維持を初期案とし、必要なら個別に移動を検討                              | 保全（移動は条件付き）       | `tsconfig.json` のexcludeと `package.json` の `lint:fast` にある除外、および `scripts/ts_converters/codemap.md` の入出力説明を確認する。移動する場合は各設定・参照・出力先を一緒に更新し、変換契約を維持する。                | 元pathへ戻し、tsconfig/lint参照と生成先を復元する。                                        |
| `docs/refactoring-plan.md`                                                                            | 履歴文書として現位置を保全                                                  | 保全（移動・削除は条件付き） | Plan55では `docs/refactoring-plan.md` を現行実装の根拠としないとされているため、履歴文書として区別する。現在の参照と保存意図を確認して個別判断する。                                                                          | 文書単体で戻し、現行案内との区別を保つ。                                                   |
| `log/`、`results/`、その他の旧文書・backup候補                                                        | 保全を初期状態とし、必要なら `archive/` を個別検討                          | 保全（削除判定のみ条件付き） | Git追跡状態、用途・再生成可能性、文字列・スクリプト・CI参照、証跡・復旧価値、秘密情報の有無を確認する。アクセス制約を変えず秘密値を出力しない。                                                                               | 削除は実施単位で隔離・復元可能にする。追跡ファイルは削除前のcommitを戻せる状態で判定する。 |
| `.github/workflows/main.yml.bak`                                                                      | 移動または削除せず、CIとの相違と保全理由を確認してから個別判定              | 保全（追跡確認済み）         | 現行 `main.yml` との差分、過去の復旧価値、参照を確認。秘密値を表示しない。                                                                                                                                                    | Git履歴から復元可能な状態を保ち、削除変更を単独で戻す。                                    |
| `shared_plan/` 内の既存計画・`results/` 一式                                                          | 現行pathを維持                                                              | 保全                         | Plan55/56との対象重複がないこと、現行参照があることを前提にする。                                                                                                                                                             | 移動・削除を行わない。                                                                     |

## テクニカルキーポイント

### Next.jsとimport境界

- App Router の `page`、`layout`、`route`、loading/error等のspecial fileとroute groupはフレームワーク規約であり、ファイル移動がURL・評価順・境界に与える影響を個別に確認する。フォルダーの整理をURL変更につなげない。
- client/server境界を維持する。`'use client'` を起点とするimport graphを確認し、`server/` 専用moduleや秘密情報を含む処理をclient graphへ取り込まない。ディレクトリ名やaliasだけでは実行境界は強制されないため、既存の `server-only` 等のガードがある箇所も確認する。Server ComponentからClient Componentへ渡すpropsも既存契約を保つ。
- `@`、`@server`、aliasを持たない `shared/` の役割を維持する。`tsconfig.paths` はTypeScriptの解決設定であり、実行時バンドラー・テスト設定のaliasと自動的に同一とはみなさない。移動だけを理由にruntime module resolutionを書き換えない。
- `src/` への移動はNext.jsが許容する範囲でも、既存root領域を自動的に移す必要はない。16.3.8に同梱の文書と現在の `next.config.ts` を根拠にする。最新版Web文書との相違をローカルに機械的に適用しない。

### 設定・参照の更新

- Vitest設定を動かす場合は設定ファイルの場所による相対解決、`root`、実行cwd、include/exclude、setupFiles、alias、coverage対象・閾値・除外を確認する。ブラウザー設定の移動ではPlaywright設定、CI workflow、Husky hook、package scripts、他設定からのextends/import、READMEや計画書の固定path、結果・snapshotの生成先も検索する。
- 旧pathの文字列検索だけで完了としない。動的な `require`/import、glob、`process.cwd()`起点の合成path、shell/Node子プロセス、外部CI入力、生成先を確認する。移動と全参照更新は同一差分にする。
- root設定はIDE・Next・TypeScript・package manager・CIが暗黙に期待する場合がある。各ツールの明示的な設定がないrootファイルを便宜的に `config/` に集めない。
- Git追跡状態（tracked、ignored、未追跡）と用途・再生成可能性（証跡、入力、生成物等）を別々に把握する。ディレクトリ全体の `git add`/削除を前提にしない。調査ログに環境変数や秘密値を表示しない。
- 現行のcoverage対象である `src/**/*.{ts,tsx}` と `server/**/*.ts` のper-file/statement/branch/function/line 100%閾値、および明示された除外を維持する。対象・閾値・除外を弱めて合格させず、移動による検出漏れがないか設定とreportを照合する。

## 段階的な実施計画

### 0. 現状台帳を作る

- canonical path、root設定、各ディレクトリの責務、代表的な参照元、Git追跡状態、生成物の扱いを短い台帳にする。
- 過去計画・ログ・backupの参照と保持理由を個別に記録する。ファイル内容の秘密値は台帳に複写しない。
- **成果物:** `docs/project-structure.md` の初版と、候補ごとの参照・保全台帳。
- **受入:** 説明対象の配置が実在し、canonical path・alias・tracked/ignored区分が一致する。Plan55/56の進捗や用途を推定で記載しない。
- **ロールバック:** 新規文書と台帳を削除すれば元の構成へ戻る。

### 1. 配置規約を確定する

- 現在位置を維持するroot設定、既存責務を尊重する原則、分析スクリプト・生成結果・保全資料の配置基準を記す。
- 新しい階層は、複数の実ファイルと明瞭な保守責務がある場合に限定する。
- **成果物:** 合意可能な配置表と、後続で扱う最大一群の優先候補。
- **受入:** 各候補に実在する参照・配置理由・戻し方がある。移動が不要な候補は現状維持と記録する。
- **ロールバック:** 規約文書のみを戻し、コード・設定pathには手を入れない。

### 2. 設定群を一つだけ整理する

- ブラウザー設定の参照確認が十分な場合に限り、一群として移動する。条件が揃わない場合はroot維持とし、別群へ自動的に範囲を広げない。
- **成果物:** 設定path変更と関連参照をまとめた一差分、および実行結果。
- **受入:** 同じテスト集合・root/cwd・setup・alias・coverage範囲を維持し、既存の対象コマンドとCI経路が解決する。
- **ロールバック:** path変更と参照を同じ差分で戻す。coverage対象や除外を戻し漏れなく照合する。

### 3. 用途が明瞭なscript群を一つだけ整理する

- 業務運用と分析を混ぜず、一群ずつ扱う。既存 `data-refresh` 等を優先し、Plan番号を推測して新設ディレクトリを命名しない。
- **成果物:** 移動する場合は参照更新と再現手順を含む差分。移動しない場合は現位置を採る理由。
- **受入:** package script、CI、文書、入力・出力path、生成結果が同じ動作を示す。
- **ロールバック:** 元pathへ戻し、参照と成果物の再現性を再確認する。

### 4. 保全資料を判定し、仕様・案内を同期する

- backup、log、旧文書のうち、追跡・参照・復旧価値を確認できたものだけを個別にarchive/削除候補とする。証拠が不足するものは保全する。
- 実装によって構成・データ契約・API・コンポーネント構造が変わる場合、`openspec/specs/nextjstest/spec.md` の Data Sources / Data Flow / Component Tree / Requirements と各要件のWHEN/THENを実装に同期する。既存codemapも更新する。全体案内の `codemap.md`、script群の `scripts/codemap.md`、変換領域の `scripts/ts_converters/codemap.md` が存在する。`src/`、`server/` の配置図やimport説明を変える場合は、既存の `src/codemap.md`、`server/codemap.md`、`server/lib/codemap.md` 等の該当案内も同じ差分で更新する。仕様ファイルの物理分割はしない。
- **成果物:** 個別判定記録、最新の `docs/project-structure.md`、必要な場合のみOpenSpec更新。
- **受入:** 削除対象の非参照・再生成可能性・保全要否を説明でき、実装差分と仕様が一致する。整理で仕様契約に変更がなければspecを変更しない。
- **ロールバック:** 削除・移動はファイル単位で戻し、案内とOpenSpecを同じ変更単位で復元する。

## 検証マトリクス

| 変更                                        | 対象確認                                                             | ゲート選択の考え方                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 今回の計画Markdown追加                      | diff、リンク先、記載path、表・Markdown形式                           | 今回は文書追加のみ。構成・コードのテストは対象外。                                                                                                                                                                                                                                                                                                                                                                      |
| 規約・案内文書のみ                          | diff、リンク、実在path、canonical path、説明と現状の一致             | 文書に書いたコマンドや設定名を実在値と照合する。専用のspec-refsスクリプトは存在しない。対象ファイルを検索して参照整合を確認する。                                                                                                                                                                                                                                                                                       |
| Vitest設定の移動                            | config解決、root/cwd、include、setupFiles、alias、coverage、呼出参照 | `pnpm test:all` または関連する `pnpm test:coverage` と、差分に関係する browserコマンドを選ぶ。                                                                                                                                                                                                                                                                                                                          |
| script移動                                  | コマンド・入力・出力・CI・再現結果                                   | `pnpm lint:fast`、`pnpm type-check`、対象script、必要に応じ `pnpm build` / `pnpm security-check` から選ぶ。                                                                                                                                                                                                                                                                                                             |
| Next.js route・client/server・公開URLへ影響 | route/build、import境界、URL、ブラウザー契約                         | `pnpm build`、`pnpm test:browser:next-route-poc:built:all`、`pnpm test:e2e`、`pnpm test:prod` 等から変更依存で選ぶ。                                                                                                                                                                                                                                                                                                    |
| 最終統合                                    | 差分全体・通常CIとhook                                               | 変更範囲に応じ `pnpm lint:fast`、`pnpm type-check`、`pnpm test:all`、`pnpm test:coverage`、`pnpm build`、`pnpm test:browser:component:all`、`pnpm test:browser:prepush:component`、`pnpm test:browser:next-route-poc:built:all`、`pnpm test:build-parity`、`pnpm test:e2e`、`pnpm test:prod`、`pnpm security-check` を選択する。全フェーズで全コマンドを機械的に実行しない。最終的には既存CIとHuskyの必須ゲートに従う。 |

参照整合は `rg` 等で旧path・新pathを検索し、package script・設定継承・CI・hook・動的参照・生成先を目視確認する。架空のspec-refsコマンドを追加しない。挙動差がなければテストを増やさず、挙動差や未カバー契約が明確な場合だけ最小テストを検討する。テスト実装はfixer、検証実行はOrchestratorが担当する。Git hookは常に有効にし、迂回しない。

## 参考資料

以下は2026-10-21に参照する一次資料と、この計画に適用する要点。Web文書は更新されるため、採用時はNext.js 16.3.8の同梱文書と実際の設定を優先する。ここでは内容を要約し、最新版へのアップグレードは計画に含めない。

| 資料                                                                                                                                   | 適用点                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [Next.js: Project structure](https://nextjs.org/docs/app/getting-started/project-structure)（参照日 2026-10-21）                       | ルート・`src`・App Router内の構成と命名の確認。任意の配置整理をフレームワーク必須と誤認しない。 |
| [Next.js: `src` folder](https://nextjs.org/docs/app/api-reference/file-conventions/src-folder)（参照日 2026-10-21）                    | `src` 配置の意味とrootに残る設定・公開資産の区別。                                              |
| [Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)（参照日 2026-10-21） | server/client module境界とimport graphの維持。                                                  |
| [TypeScript: `paths`](https://www.typescriptlang.org/tsconfig/paths.html)（参照日 2026-10-21）                                         | `paths` がimport解決の型付けに関わる設定であり、runtime解決を自動設定するものではない点。       |
| [Vitest: `setupFiles`](https://vitest.dev/config/setupfiles)（参照日 2026-10-21）                                                      | setup pathの解決と設定移動時の実行順確認。                                                      |
| [Vitest: `config`](https://vitest.dev/config/file)（参照日 2026-10-21）                                                                | config pathと実行時の設定読み込み、root/cwdを実際のCLIと合わせて確認。                          |
| [ESLint: Configuration files](https://eslint.org/docs/latest/use/configure/configuration-files)（参照日 2026-10-21）                   | 設定ファイルの探索場所と適用範囲を移動前に確認。                                                |

## 現状台帳の記録項目

台帳は移動候補ごとに次の情報を記録し、候補の判断に使う。網羅性を装うために全ファイルを手で列挙せず、ディレクトリ単位の責務と例外だけを書く。

| 項目         | 記録する内容                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------- |
| 現在path     | Git上のpath。大文字小文字を含め実際の表記を維持する。                                               |
| Git追跡状態  | tracked、ignored、未追跡を記録する。複数状態が混在するディレクトリはファイル単位で扱う。            |
| 用途・再生成 | 保存証跡、入力、手生成、生成物、再現可能性などを別軸で記録する。Git追跡状態と同じ分類にまとめない。 |
| 役割         | 現行の呼出側・利用者が分かる範囲の用途。ファイル名だけで断定しない。                                |
| 参照元       | package scripts、workflow、hook、config import、コード、文書、動的pathの確認結果。                  |
| 入出力       | 読み込むdata、書き出すresults、外部取得先、cwd前提。秘密値は記録しない。                            |
| 配置判断     | 維持、文書化、移動検討、保全、削除検討のいずれかと根拠。                                            |
| 受入条件     | 移動後に同一であるべきコマンド、対象、生成先、URL、coverage、公開契約。                             |
| 復元手順     | path・参照・生成先を元に戻す方法。追跡物の復元元を記録する。                                        |
| 関連計画     | 実在する計画番号や文書に限る。対応状況や完了を推定しない。                                          |

台帳の調査では、まずディレクトリ境界と設定入口を確認し、次に文字列参照を検索する。その後、スクリプトが組み立てるpath、shell経由の呼び出し、glob、cwd依存、CIで渡される引数を個別に確認する。検索に出なかった事実だけから「未使用」とは判定しない。

## 移動判断の基準

- 配置先の責務が既存文書や設定から明らかで、今後の追加ファイルにも同じ規則を適用できることを確認する。
- 既存pathに依存する呼出元と生成先を列挙でき、移動による固定pathの更新範囲が限定できることを確認する。
- 何も移動しない場合と比較し、重複する概念や誤配置を減らせる具体的な理由を説明できる場合に限って移動する。
- 単独の一時ファイル・一度限りの分析結果のためだけに、恒久的なディレクトリ階層を設けない。
- 実験途中、結果不明、所有者不明の場合は保全し、削除・改名を先送りする。
- `shared_plan/` 内の既存番号・canonical pathは維持する。整理対象の都合で計画名・番号・階層を再採番しない。
- `results/` は検証・再現・報告から利用される可能性を前提にする。用途不明のファイルを「生成物」とみなして一括削除しない。
- 既にGit追跡されているファイルは `.gitignore` の追加だけでは追跡対象から外れない。追跡状態を変える変更は別途明示し、ignore規則を追加する場合は新規対象と再生成手順を記載する。

## 実装差分の進め方

後続実装では、一差分が一つの責務を表すようにする。移動、参照更新、案内修正、テスト変更を別々の未完了変更として積み残さない。

1. 変更前に対象pathの追跡状態と参照元を保存し、基準となるコマンドの対象・出力を確認する。
2. 変更対象だけを移動し、全参照を更新する。ファイル内容や挙動を同時にリファクタリングしない。
3. 旧path・新path双方を検索し、動的参照、include、生成先、文書例、CI・hookを確認する。
4. 変更した機能の最小の既存コマンドを実行し、終了値だけでなくテスト対象数、出力path、coverage範囲を確認する。
5. 必要な上位ゲートを追加し、差分と受入条件を比較する。最終統合では既存CIとHuskyの規則を満たす。
6. 失敗時はその場で除外・閾値・テスト対象を緩めず、移動差分を戻して原因を分離する。
7. 完了記録には、変更path、更新した参照、選んだ検証、結果、残った保全判断を記載する。

設定移動時に互換ラッパーを使う場合も、旧pathが暗黙に残る期間と削除条件を文書にする。互換期間を設ける合理性がなければ、同じ差分ですべての利用者を新pathへ更新する。

## 仕様・文書の更新境界

`docs/project-structure.md` はリポジトリの配置と作業入口を説明する案内であり、プロダクト仕様の代替にはしない。実際の `src/`、`server/`、`shared/` の配置図やimport説明を変える場合は、該当する既存 `codemap.md` も同じ変更で同期する。計画書は将来の作業候補であり、実装済みの事実として書かない。

単に資料を追加する段階では、`openspec/specs/nextjstest/spec.md` に変更を加える必要はない。後続の実装でコンポーネント、データモデル、API、アーキテクチャ、データソース、データフローが変わる場合は、該当セクションを同じ実装作業に合わせて更新する。

要件を新設・変更する場合は `openspec/config.yaml` のrulesに従い、各要件にWHEN/THENシナリオを記述する。単なるディレクトリ移動で要件の意味が変わらなければ、要件を形式的に増やさない。

仕様のcanonical pathは `openspec/specs/nextjstest/spec.md` のままにする。断片化や重複管理を避けるため、今回の整理計画の範囲では仕様ファイルの分割・移動を行わない。

## 計画の完了条件

この計画自体の完了は、実際のファイル再配置を意味しない。次の条件を満たしたら、構造整理の計画成果物がレビュー可能な状態とする。

- 役割表が現存する主要ディレクトリとcanonical pathを正しく示す。
- 各候補に区分、参照確認、検証方法、戻し方がある。
- 既存の設定・package script名を勝手に作らず、必要な検証を差分に結び付けている。
- 保全資料とGit追跡状態・用途/再生成可能性を別軸で記録し、曖昧な物の削除を保留する。
- 既存計画の進捗を推定せず、[Plan55](./55-critical-path-refactoring-plan.md) / [Plan56](./56-consumption-estimate-info-plan.md)との作業重複を発生させない。
- 計画文書を実装完了と表現せず、実際の移動・削除は後続の個別変更として扱う。
- ローカルNext.js 16.3.8文書とWeb一次資料の適用範囲を区別し、フレームワーク更新を含めない。

このファイルの追加だけをもってコード・設定・OpenSpec仕様の変更が完了したとは扱わない。Stage 2は下記follow-upで実装済み。その他の実装に進む際は現行状態を再調査し、ここに書いたpath・コマンドがまだ正しいことを確認する。

## 実施記録（2026-10-21、Stage 2 follow-up）

ユーザー要請に基づき、計画時のStage 2受入条件に沿ってbrowser config群の実配置を行った。元の計画スコープ、受入条件、Stage 3/4の判断は変更しない。

- trackedのroot `vitest.browser*.config.ts` 20本を `tests/config/browser/` に移動した。各configに `root: path.resolve(__dirname, "../../..")` を設定し、`@`/`@server` alias、include/setup/excludeのrepository-root基準の対象とroute command等のimportを維持した。
- live runtime参照、package script、runner、prepush selection JSON、関連unit test、OpenSpec、route POC文書、`docs/project-structure.md` を新pathへ同期した。`results/plan46/phase4/vitest-selector-route-probe.config.ts` はignoredのまま `results/` に保持し、aggregate configへのimportだけ新pathに更新した。更新前のコピーを `/tmp/vitest-selector-route-probe.config.ts.before-browser-config-move` に保管した。
- ignored root `vitest.browser.phase6-aggregate-chromium.config.ts` はrootに維持した。`vitest.config.ts` もunit baseとしてrootに維持した。historical snapshotsや履歴資料に記録された旧pathは過去時点の記録として維持し、一括書換えしていない。
- `.github/workflows/main.yml` とHusky hookはrunner経由の間接参照のため変更していない。

検証結果は次のとおり。

- focused unit tests: 26 passed。
- `pnpm test:browser:component:all`: 23 files, 76 passed, 6 skipped。
- `pnpm test:browser:next-route-poc:prepush:built`: exit 0。
- `pnpm test:browser:prepush:component`: exit 0。
- WebKit configとnext-route configの `vitest list`: exit 0。
- `pnpm lint:fast`: exit 0。
- 最初の `pnpm type-check` はignored probeに残っていた旧importを検出した。そのimportを更新した後の `pnpm type-check`: exit 0。

これによりStage 2は移動・参照更新・記録済みの検証を完了した。これはStage 3の `scripts/data-refresh/` やStage 4の保全資料群を移動したことを意味しない。Stage 3/4は計画本文に記した現位置維持・保全判断のままである。

## 監査追補（2026-10-21、Stage 4 保全候補群）

Stage 4の現位置保全判断を、継続監査で得た追跡状態・参照・リスクに基づき更新する。以下は候補群単位の調査結果であり、全ファイルの内容・provenance・再現性・archive適性を確認したものではない。対象群は現位置に保持し、削除・archive・実行は行わない。

- `shared_plan/scripts/cti_basic_cpi_vs_official.py` と `cti_cpi_display_impact.py` は両方tracked。`cti_basic_cpi_vs_official.py` はcaller未発見。`cti_cpi_display_impact.py` はPlan48 measurement noteに再現コマンドがあり、`shared_plan/48-real-consumption-from-displayed-nominal-plan.md` から参照される。両方の全I/Oと再現性は未確認のためkeepとする。trackedなので必要時はGitから復元できる。以前のuntracked/copy-only扱いは誤りとして訂正する。
- `results/` の確認対象は合計732 files。plan39は38 trackedで、spec/test/runtime validator/script referencesを持ち、一部がlive contractに関わる。plan42は39 trackedのhistorical E2E evidence。plan45は464 files（434 tracked、30 ignored）でPlan45からevidenceへの直接リンクがある。plan46は191 files（32 tracked、159 ignored）でspeedup evidenceとignored probeを含む。各群をkeepとする。これらの参照と追跡内訳は群単位で確認したが、全artifactのprovenance・生成条件・再現性確認は未完了。
- `log/` は8 ignored files。今回のscoped searchで直接参照は見つからなかったが、未使用の証拠とはしない。個別内容、producer、retentionは未確認のためkeepとし、再生成可能性も断定しない。
- `.github/workflows/main.yml.bak` はtrackedかつclean。secret-safe structural compareでは旧Node20/npm workflowで、現行Node24/pnpm workflowよりchecks、permissions、artifact summariesが少ない。runtime callerは見つからず、歴史文書の削除推奨だけでは削除根拠にならない。keepとし、archive判断は保留する。trackedでGit historyから復元可能。秘密値はこの記録に含めない。
- `scripts/python_backup/` は25 tracked。group-level static refsでは自身のdocs/spec以外に現行Python runtime callerなし。各scriptは `public/economics_source` を入力に使い、public配下へ出力する。CTI/BM01はoverwrite前に旧targetをrenameし、`convert_cpi` は `data/converted_cpi` へ出力する。5つの比較variantはtracked `scripts/head_vs_ts_comparison.md` をtruncate/writeするため実行しない。保全し、file-levelの全I/O・intent・provenance・reproは未確認とする。
- `docs/refactoring-plan.md` はtrackedの履歴文書。Plan55は現行実装の根拠としない旨を記しているため、keepとする。

したがってStage 4は、上記候補群ごとのkeep-in-place判断を完了した状態とする。これはfile-by-file archive/content/repro auditの完了ではない。Stage 3の `scripts/data-refresh/` 維持判断も変更せず、Stage 3/4の候補群は再配置していない。

## 最終監査・完了記録（2026-10-21）

計画全体をCompletion Conditions、Stages 0–4、Technical Key Pointsに照らして実装・仕様・案内文書と再確認した。各項目の要求と現在の状態に矛盾はなく、必須の未完了項目は見つからなかったため、Plan 57を完了とする。

- Completion Conditionsは、主要ディレクトリとcanonical path、候補別の区分・参照確認・検証・復元方針、Git追跡状態と用途の区別、保全判断、Plan55/56との境界、Next.js 16.3.8資料の適用範囲を満たしている。計画の完了を全候補の移動・削除とは扱わない。
- Stages 0–1の台帳と配置規約は `docs/project-structure.md` に反映済み。Stage 2はtracked browser config 20本の移動、参照・設定維持、関連spec/docs更新および実施記録済みの検証を完了した。Stage 3は `scripts/data-refresh/` の用途・参照・入出力を踏まえて現位置維持を決定・記録した。Stage 4は候補群ごとのkeep判断と根拠を記録し、曖昧な資産を保持した。
- Technical Key Pointsは、Next.jsの配置規約とURL境界、server/clientおよびalias境界、Vitestのroot/cwd・対象path・setup・除外・参照更新、追跡状態と再生成可能性の区別、coverage条件を、該当する計画・移動実装・仕様・案内文書で照合した。実装変更に伴うOpenSpecと案内文書の更新も同期している。

ファイル単位での全archive候補の内容・provenance・再現性調査は、未確認資産をすべて現位置に保持したため本計画の必須完了条件ではなく、必要が生じた際の任意の後続調査とする。削除・archiveを承認または実施したものではない。現時点でPlan 57に残る必須作業はない。

## 完了後の再検討記録（2026-10-21、Plan39スクリプト配置）

完了後のレビューで `scripts/plan39/` は用途を示さずPlan番号に結び付いた過度に狭い名前であると判断した。Stage 4の当時の「現位置維持」はその時点の調査結果として保持し、この追補で一部のcanonical source pathを個別に再配置した。これは過去の記録を遡及修正するものではない。

- 14のtracked canonical files（READMEと13 `.mjs`）を `scripts/cti-adjusted/` に移動した。package scripts、runtime adapter、直接実行するテスト、OpenSpec、構成ガイドはcanonical pathを参照する。
- `scripts/plan39/*.mjs` は旧CLI呼出しを転送し、既存のnamed exportsを再公開する互換wrapperとして残した。`plan39:*` package command aliasesも維持する。
- `results/plan39/`、`data/source/cti-adjusted/snapshots/plan39-*`、既存artifact schema、loader fallbackは変更しない。履歴資料・保存済みresultsのpath記述も書き換えない。
- この再配置の実行検証は未実施。canonical/compatibility CLI、named-export import、runtime adapter、関連tests、type-check、lint、isolated result/hash comparisonを完了ゲートとする。

### 互換層の再検討（2026-10-21）

ユーザー確認により旧pathからの外部利用はないと判明したため、上記の互換維持判断を更新した。`scripts/plan39/` の13 CLI/import wrappersとREADME、および `plan39:*` package command aliasesを削除した。現行の内部参照・テストは `scripts/cti-adjusted/` と `cti-adjusted:*` commandを使う。旧参照を含む履歴資料は証跡として保持するが、現行案内・仕様から互換性を約束する記述を除いた。`results/plan39/`、snapshot名、artifact schema、loader fallback pathはデータ契約のため変更していない。
