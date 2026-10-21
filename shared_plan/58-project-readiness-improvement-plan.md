# プロジェクト完成度レビューに基づく改善計画

> **状態:** 完了。作成日: 2026-10-21。最終監査と検証ゲートで全項目の完了を確認した。

## 完了時の検証記録

最終監査と検証ゲート（`test:hook-smoke`を含む）で完了を確認した。`spec-refs`専用scriptは存在しない。build後route browserは、直近の完了済み結果がChromium 22 files / 96 passed、WebKit 4 files / 14 passed / 5 skipped。ChartFiltersの動作に影響しないfallback簡素化後に行った最新2回の再実行は最終summaryがなく、成功結果としては扱っていない。

## 目的

レビューで見つかった品質上の問題を、データ更新ゲート、依存関係、URL入力、テーマ復旧、CPIの月次更新契約、利用者向け説明の順に改善し、通常の更新作業と利用者操作で失敗から復旧できる状態にする。各改修は小さな差分として実施し、既存のfail-closedデータ保護、URL互換性、アクセシビリティ、OpenSpec契約を維持する。

## レビュー時点の検証記録

以下は前回レビュー時に記録された事実であり、実装着手時に現在の作業ツリーで再確認する。

| 検証                                | レビュー時点の結果                                                                                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lint、型チェック、本番webpack build | 成功                                                                                                                                                                                    |
| `test:coverage`                     | 122 files中121 passed / 1 failed、1406 passed / 5 failed / 1 skipped。5失敗はすべてruntime-validatorの`package.json`固定hash不一致。Statements / Branches / Functions / Linesは各100%。 |
| 本番build後のroute browser          | Chromium `built:all`: 22 files / 95 tests成功。WebKit: 4 files / 14 passed / 5 skipped。                                                                                                |
| build parity                        | 3 tests成功                                                                                                                                                                             |
| `security-check`                    | auditのHigh 1 / Moderate 2によりexit 1。secretlintは`&&`のため未到達。secretlintを別途実行した結果は成功。                                                                              |
| 未実施の確認                        | ライブeStat/API接続、全統計値の照合、性能計測、専用Playwright全E2E。                                                                                                                    |

固定hashのテスト失敗は、`scripts/data-refresh/cli.mjs:28-35`から`runner.mjs:353-365`へ進むruntime品質ゲートも止めるため、単なるテストの不一致として扱わない。レビュー時に記録されたVite advisoryの詳細は依存更新着手時に公式advisoryと現在のauditで再確認する。

## 改修項目

### 1. 高: runtime-validatorの固定hashを正当な状態へ同期する

**対象:** `scripts/data-refresh/runtime-validator.mjs:393`の`PINNED_PROJECT_FILES`、`:641-656`の検証処理、および期待hashを保持する関連fixture/test。package manifestとlockfileは同じ固定対象群に含まれる。

**作業:**

- 現在の差分と固定対象ファイルの変更理由をレビューし、正当な変更と意図しない編集を区別する。固定リストが対象とするdependency closureやruntime検査の役割を確認する。
- 正当と確認できた対象の期待SHAだけを、ファイル内容との照合可能な形で同期する。`package.json`や`pnpm-lock.yaml`を安易に固定対象から外さない。
- 手順を明示するhash生成・照合方法を用意し、変更後に別の担当者が再現できるようにする。
- hash検査の削除・無効化・無条件の自動追認は行わない。hash mismatch検出とsymlink / underlay拒否の既存保護テストを維持する。

**受入条件:**

- 正当なproject file変更だけが期待値へ反映され、未承認の内容変更・symlink・underlayは引き続き拒否される。
- 現行のruntime-validator対象テストが成功し、通常テストの5失敗とデータ更新runtime品質ゲートのhash不一致が解消する。
- hash更新手順で対象path、実ファイルhash、固定値の一致を再現できる。

### 2. 高: 依存関係のaudit指摘を修正する

**対象:** `package.json`、`pnpm-lock.yaml`（Vite解決箇所はレビュー時点で`:2820`付近）、security-check関連script。

**作業:**

- 更新直前にaudit、公式advisory [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm)、利用経路、現在のVite/Next互換性を確認する。レビュー時点のViteは`8.0.16`で、指摘はWindowsの`launch-editor`経路に条件付きの影響と記録されている。実運用での被害は確認されていない。
- advisory上の修正バージョンとして記録されたVite 8.1.6以上を候補に、実装時点の最新修正とプロジェクト互換性を確認する。無条件のmajor更新は行わない。
- package managerを使って依存とlockfileを一緒に更新する。依存treeを手編集で偽造しない。
- Moderate 2件も個別に影響、到達可能性、修正有無を再評価し、修正または残置理由を記録する。
- 項目1では不一致の原因、保護契約、再現可能な更新手順を先に確認し、固定hash値の更新は保留できる。依存更新後、最終状態の`package.json`と`pnpm-lock.yaml`をレビューしてから固定hashを一度だけ同期し、hashゲートとsecurity-checkの両方を正常化する。

**受入条件:**

- advisoryに対する解決済みバージョンがlockfileに解決され、package manifestとlockfileに不整合がない。
- `security-check`が成功し、Highは0件である。Moderateに残件がある場合は個別の影響・対応状況・残置理由が記録されている。
- lint、型チェック、build、および依存に関係するテストが成功する。

### 3. 中: URL期間の不正値を安全に正常化する

**対象:** `src/hooks/useUrlState.ts:19-20`、`CpiChart.tsx`の初期状態、`chartUtils.ts:49`の年filter、`tests/unit/useUrlState.test.ts:56-64`および関連チャートテスト。

**作業:**

- 実データの利用可能年範囲を確認し、URL値の正常化方針を決める。不正文字列と開始年>終了年は既定期間へ戻し、範囲外の整数は利用可能範囲へクランプする案を基本とする。仕様決定時に既定値とクランプの境界を明記する。
- 正常な既存URLの形式と意味を保ち、URLから復元したstateと表示期間が一致するようにする。
- `NaN`、`2024tail`、範囲外、逆転、空dataを入力し、誤った空チャートや`NaN`年表示から利用者が回復できるテストへ更新する。現状の不正値を期待するテストは正常化の契約に置き換える。

**受入条件:**

- `?from=not-a-number`等の不正値で`NaN`がstateやチャートに残らない。
- 逆転期間と範囲外値が定めた規則で正常化され、正当な既存URLは同じ期間を再現する。
- 利用可能データが空でも例外や不正な期間表示を起こさず、正常化処理が空配列に対応する。

### 4. 中: テーマ保存値の破損・読み取り失敗から復旧する

**対象:** `src/app/components/ThemeToggle.tsx:41-46`、先行テーマscriptがある`src/app/layout.tsx`、`tests/components/ThemeToggle.test.tsx:79-100`。

**作業:**

- `localStorage`読み取りを例外安全にし、保存値を`light` / `dark` / `system`の許可値に照合する。不正値または読み取り失敗は`system`へ復帰させる。
- 保存処理が失敗してもテーマ切替UIの表示と操作は継続する。
- layoutの先行theme scriptとテーマ値・復帰ルールを一致させる。保存値がある状態で実browserの描画と切替を確認する。
- 既存テストの「破損値/throwをそのまま期待する」ケースを、fallback表示、操作継続、ラベルとARIAの有効性を確認するケースに直す。

**受入条件:**

- localStorageが空、破損値、読み取り例外、書き込み例外の各状態で画面をrenderでき、操作可能である。
- すべての状態でボタンの可視ラベルとARIAラベルが有効なテーマを示す。
- 保存済みテーマと初回描画が整合し、SSR/client hydration差分の有無を実browserで確認して結果を記録する。hydration問題は未検証のリスクと既知不具合を区別する。

### 5. 中: CPIの月次更新契約をレビュー済みvintageと同期する

**対象:** `server/lib/data-loader/cpiSource.ts:52-89`、特に`:78-88`、`scripts/data-refresh/registry/index.mjs:64-70`、関連manifest/runtime/fixture。

**作業:**

- CPI sourceが2026-07〜08のレビュー済みvintageだけを受理し、June replayとSeptember futureを拒否する現行fail-closed契約を確認する。registryがlatest-publishedを取得することとのずれを明記する。
- 本計画でいう「レビュー・明示承認済みvintage」は、人間の追加承認フローを新設する意味ではなく、データ更新の運用上、検証・レビュー済みとして管理されるvintageを指す。
- レビュー・明示承認済みvintageをregistry、metadata、runtime、manifestへ同期する単一の管理箇所、または明示的な更新手順を設計する。受理範囲を無制限に広げない。
- 次月fixtureでstageからquality判定までの遷移を検証する。未承認future、replay、破損hashが拒否されることを確認する。
- この変更はCPI sourceの月次承認契約に限定し、全source共通方式の変更へ広げない。実dataのpublishは別途明示実行とし、本計画内では行わない。

**受入条件:**

- 承認済み次月vintageが明示された手順でstageされ、品質判定後にだけruntimeへ進める。
- 未承認future、replay、hash破損は拒否され、既存のfail-closed挙動を維持する。
- `latest-published`取得とruntime許容範囲の関係が文書・metadata・テストで矛盾しない。

### 6. 低: 利用者向け説明と運用文書を実装に揃える

**対象:** `src/app/layout.tsx:15-30`、`src/app/page.tsx:63-66`、`README.md`、`openspec/config.yaml`、`openspec/specs/nextjstest/spec.md`。

**作業:**

- 実データの基準契約を確認し、metadata description / Open Graph / Twitterの「2020年基準」と画面説明の「2025年平均=100」の不一致を解消する。
- READMEをcreate-next-app初期案内から実アプリの案内へ更新する。概要、Node 24 / pnpm 11.9、必要な環境変数名`ESTAT_APP_ID`（値は記載しない）、ローカル同梱データとeStat API利用時の要否、起動、データ更新、checkとpublish、検証手順を説明する。
- `openspec/config.yaml`の古い技術記述（レビュー時点ではTypeScript 6 / Redux / ESLint等）を実依存に合わせる。実装時に`package.json`等を再確認し、TypeScript 5.9.3、Oxlint、Redux不採用などの現状を確かめてから記載する。
- OpenSpecの変更箇所は`openspec/specs/nextjstest/spec.md`のRequirements、Data Sources、Data Flow、Component Treeの現行契約へ同期する。要件変更には`openspec/config.yaml`の規則に沿ったWHEN/THENシナリオを付ける。
- 約5000行のspec履歴整理はこの改修の必須範囲に含めず、将来候補として別途扱う。

**受入条件:**

- ページ、metadata、README、OpenSpecの基準年と説明が実データ契約に一致する。
- READMEに起動・更新・check/publish・検証の実在する手順があり、秘密値を含まない。
- OpenSpecの変更が実装されたdata source / flow / component / requirementsだけを反映し、変更要件にはWHEN/THENがある。
- 文書のみの差分に、実装を機械的に写すための不要なテストを追加しない。

## 実施順序と依存関係

1. **着手時baselineと差分保全:** 作業ツリー、既存差分、対象テスト、実在するpackage scripts、現行runtime hashを記録する。Plan57等の既存変更を戻さず、対象ファイルの所有差分を分ける。
2. **項目1の診断:** hash不一致の原因と対象closureを確定し、保護テストを含む固定hash契約と再現可能な更新手順を確認する。この段階では固定hash値の更新を保留してよい。
3. **項目2の依存更新とhash同期:** security advisoryと互換性を確認後、package managerでpackage/lockを更新する。最終状態の`package.json`と`pnpm-lock.yaml`をレビューし、固定hashを一度だけ同期する。これによりhashゲートとsecurity-checkを同じ最終依存状態で正常化し、hashの二重更新を避ける。
4. **項目3・4の独立改修:** URL正常化とテーマ復旧をそれぞれ小さな変更単位で実施し、既存の正常動作と不正状態からの回復を確認する。
5. **項目5のCPI更新契約:** 承認済みvintageの管理点を決め、次月fixtureのstage / quality gateを実装する。実データpublishは別作業として扱う。
6. **項目6の説明文書同期:** 実データ契約と最終コードを確認してmetadata、README、`openspec/config.yaml`を同期する。OpenSpecのRequirements、Data Sources、Data Flow、Component Treeは、各実装変更と並行して該当範囲を更新し、この段階で最終コードとの整合を確認する。
7. **統合検証と差分照合:** 受入条件、実装差分、仕様、テスト結果を照合し、下記ゲートを通す。失敗が残れば合格扱いにしない。

並行作業が有効な場合も同時agentは最大3つとし、依頼単位を独立した小成果物に分ける。コード変更は実装を`@fixer`、UI判断・実装は`@designer`、探索は`@explorer`に委譲できる。`@oracle`は事前に渡された根拠に基づく見解のみを返す。テストの実装と検証実行は分離し、Orchestratorが実装差分と委譲内容の一致、および検証ゲート結果を確認する。Next.jsコード変更前には、ルートから解決する`node_modules/next/dist/docs/`の該当ガイドを読む。本ファイル作成ではアプリ実装・仕様書変更・テスト実行を行わない。

## 検証手順

変更を小さく進め、各段階で対象テストを実行してから全体ゲートを確認する。下記コマンドはレビュー時点で記録された実在script名であり、着手時に`package.json`から再確認する。

1. 対象テストを実行する。URLは`useUrlState` unitと期間表示のcomponent/integration、テーマは`ThemeToggle` componentおよび実browser確認、CPI/runtimeはruntime-validatorとdata-refresh registry/quality gateを対象にする。
2. `pnpm run lint:fast`、`pnpm run type-check`、`pnpm run test:coverage`を実行する。
3. `pnpm run build`後に`pnpm run test:browser:next-route-poc:built:all`を実行する。必要なUI・操作確認に`pnpm run test:browser:component:all`を使う。
4. `pnpm run test:build-parity`と`pnpm run security-check`を実行する。secretlintがsecurity-checkに含まれるか、前段audit失敗で短絡されないかも確認し、必要ならsecretlintを個別に実行する。
5. 専用Playwright E2Eが変更範囲に必要な場合は、実在するscriptを確認して実行する。global setupが既存portのNext serverを終了する可能性があるため、port競合と共有`.next`の同時buildを避け、他者のserverを停止しない。
6. OpenSpecの差分と実装参照を目視で照合する。`spec-refs`専用scriptの存在は未確認のため架空コマンドを作らない。JEvはlint / type-check / testの代替にしない。

件数増加を許容し、固定のpass件数ではなく全失敗0、skipで失敗を隠さないこと、既存coverage閾値維持を受入とする。秘密情報や実データを不用意に出力・変更せず、git hooksを無効化しない。

## 全体の完了条件

- 6項目の対象差分とそれぞれの受入条件が確認済みである。未実施項目を完了扱いにしない。
- 固定hash保護、security audit、URL/テーマ復旧、CPI fail-closed、利用者向け説明とOpenSpecが一貫している。
- lint、型チェック、coverage test、本番build、build後route browser、必要なcomponent browser、build parity、security-checkが成功する。skipは説明可能であり、失敗を隠すために増やしていない。
- 実データpublish、全統計値の独立照合、ライブeStat/API接続、性能計測は本計画の自動完了条件ではない。必要なら別途明示した検証記録を追加する。
- 完了時にのみ本計画の状態を更新し、計画作成だけで改修済みと記載しない。
