# リファクタリング基盤整備計画 — 経済指標ダッシュボード

作成日: 2026-09-14
更新日: 2026-09-14
状態: Phase 0〜1-6（fixture比較ゲート）、Phase 2-1〜2-5、Phase 3-1〜3-3、Phase 4-1〜4-4は完了（実装・監査・検証済み）。Phase 4-5〜6は未着手
対象: `src/app/components/CpiChart.tsx`、`server/lib/data-loader/cpi.ts`、`server/lib/math/supportSeries.ts`、`src/lib/clientCalculations.ts`、関連する `src/lib/` / `src/hooks/` / `server/lib/` / `tests/`、および実装時に同期する `codemap.md` と `openspec/specs/nextjstest/spec.md`

## Purpose（目的）

現行の挙動と外部契約を保ったまま、表示オーケストレーション、データロード、純粋計算、チャート共通化、状態同期の責務を段階的に分離する。URLを優先する設計を新たに導入する計画ではなく、Phase 0で現行の復元・保存契約を状態ごとに確定し、差異が見つかった場合は別の仕様変更として切り離す。各変更単位をレビュー可能にし、直近の変更単位を戻せる状態を保ちながら、将来のデータ更新やチャート追加時に変更箇所を局所化できる構成を作る。

## 背景

- `src/app/components/CpiChart.tsx` は約754行で、初期化、URL/localStorage復元、系列切替、期間移動、CAGR計算、セクションナビゲーション、7チャートの描画定義を同時に担っている。
- `server/lib/data-loader/cpi.ts` は約1,144行で、ファイル選択、CPI/CTI/GDPのロードと検証、四半期変換、公開エントリポイントが混在している。
- `src/lib/clientCalculations.ts` が `@server/lib/math/supportSeries` をimportしており、clientからserver配下への依存境界が曖昧である。共有純粋関数とserver専用処理の依存方向を明示する必要がある。
- 複数チャートに軸、tooltip、legend、series変換の重複がある。一方、見た目や責務が同じに見えても実際の契約が異なる箇所があるため、共通化は一致が確認できる範囲に限定する。
- URLによる共有状態と、個人設定としてのlocalStorageの責務・同期方向が状態ごとに確認されていないため、共有リンクと端末設定の復元順序で回帰が起きやすい。

## 現状の構成 / 課題

### 現行のデータと表示の流れ

1. `src/app/page.tsx` がサーバー側データを受け取り、`CpiChart`へ渡す。
2. `server/lib/data-loader/cpi.ts` がCPI、CTI、GDPおよび四半期系列の入力選択・検証・変換を行う。
3. `src/hooks/useCpiChartData.ts` と `src/lib/clientCalculations.ts` が表示期間、系列、月次/四半期データを派生させる。
4. `src/app/components/CpiChart.tsx` が `MajorIndicesChart`、`StackedAreaChart`、`SpendingBarChart` 等の7チャート、CAGR、表、セクションナビゲーションを構成する。
5. `src/hooks/useUrlState.ts` が期間・非表示系列等をURLへ同期し、CpiChart内のlocalStorage処理が個人設定を保持する。

### 主な課題

- 巨大なcomposition rootにロジックとJSXが集中し、変更の影響範囲とレビュー単位が大きい。
- loader内の入力ファイル選択、異常系、データ変換を安全に個別テストしにくい。
- 純粋計算の実行環境がclient/serverにまたがり、依存方向を静的に保証できない。
- 共通化の候補とチャート固有の差異が同じ場所にあり、過剰抽象化または挙動差分を招きやすい。
- 現行 `codemap.md` が実装の状態管理・責務分割を十分に反映していないため、実装後に現行構成へ同期する必要がある。

## 優先順位

| 優先度 | 方針                                                      | 理由                                                     |
| ------ | --------------------------------------------------------- | -------------------------------------------------------- |
| P0     | 現行挙動の固定（Phase 0）                                 | リファクタリング前後の比較基準を先に作る                 |
| P1     | `CpiChart` の分割（Phase 1）、loaderの内部分割（Phase 2） | 変更リスクとレビュー負荷が最も大きい箇所を先に局所化する |
| P1     | 純粋計算のdomain/math移設（Phase 3）                      | client/server境界を明確にする                            |
| P2     | 実証済みのチャート共通化（Phase 4）                       | 重複削減を行うが、固有仕様を優先する                     |
| P2     | 状態所有者・codemap整理（Phase 5）                        | 共有状態と個人設定の契約を明文化する                     |
| P3     | API共通化の再評価（Phase 6）                              | 実装後の重複と効果を確認してから最小限に行う             |

## スコープ

### 対象

- `CpiChart`の責務分割と、7チャートの構成定義の整理。
- CPI/CTI/GDP loaderの内部分割。ただし公開関数、引数、戻り値、エラー時の契約は維持する。
- `server/lib/math/supportSeries.ts`、`src/lib/clientCalculations.ts` 等の環境非依存な計算をdomain/mathへ移設し、clientからserver配下importをなくす。domain/mathは論理層として扱い、既存の `src/lib/math/` を移設先の第一候補とする。新しいルート階層は必要性を確認してから設ける。
- 実際に一致する軸/tooltip/legend/series変換の共通化と、型付きregistryへの系列メタデータ集約。
- URL/localStorageの状態所有者と同期方向の整理、およびcodemapの現行構成への同期。
- fixture、特性テスト、単体テスト、integration、E2Eによる挙動同値の固定・検証。

### Data Model（変更なし）

`src/types/data.ts` の `CpiData`、`src/types/index.ts` の `PopulationData`、APIレスポンス型は変更しない。四半期表示の共有`QuarterlyRow`は`src/types/chart.ts`へ移設し、Server側adapterは互換re-exportを維持する。loaderの内部型やdomain計算用の中間型を追加する場合も、公開データモデルへの変換境界を明示し、JSON形状・キー・欠損値表現・期間ラベルを維持する。

## 実装方針

- 最初に着手する単位はPhase 0 のサブタスク 0-1の「CpiChartの状態契約表と既存テストの対応付け」とする。Phase 0〜3は必須基盤、Phase 4は同一契約を2箇所以上で確認できた場合だけ実施、Phase 5は最終整合、Phase 6は任意の再評価とする。
- 1〜2時間は目安であり、超える場合は責務ごとに再分割する。検証を省略せず、1コミットまたは1レビュー単位で責務を移す。
- 変更単位ごとに差分と対象テストを確認し、Phase完了時に影響範囲のlint/type-checkを行う。節目・最終ではproduction build、full test、関連E2Eを行い、parityは対象時に実施する。coverage/spec-refsは既存運用に従う。テスト実装はfixer、検証実行はOrchestratorが担当し、未実行項目は完了扱いにせず代替証跡と残課題を記録する。
- Phase 1〜3では副作用の境界化を機械的に進め、Phase 5で所有者と同期フローを整理する。同じ抽出を複数Phaseで繰り返さない。
- `CpiChart.tsx` はcomposition rootとして残し、データ・状態・セクション・描画部品を組み立てる役割に限定する。チャート7本を1つに統合しない。
- pure関数は入力・出力を明示し、`window`、`localStorage`、Next.js server専用API、React hookを参照しないdomain/mathへ移す。
- loaderの分割は内部実装に限定し、既存の公開エントリポイントと戻り値をアダプターで保つ。
- 共通化は、複数チャートで実際に同一のデータ契約・表示契約・相互作用契約があるものだけを対象にする。差異は各チャート側のオプションまたは固有実装として残す。
- URL/localStorageの優先順位は新設せず、Phase 0で状態ごとの契約（URL key、storage key、default、現行優先順位、復元・保存タイミング、popstate対応）を表に固定する。実装が契約と異なる場合は、挙動維持のリファクタリングから分離した仕様変更として扱う。
- ピクセル完全一致は要求しない。ただし、系列、期間、数値、異常系、操作結果、URL/storage互換は同値であることを要求する。

## 段階的な実装タスク

### Phase 0 — 現行挙動の固定（1〜2時間/件を目安）

目的: リファクタリング前の受入基準をテストとして固定する。

進捗: Phase 0 のサブタスク 0-1〜0-3、Phase 1 のサブタスク 1-1〜1-5、およびPhase 1-6（fixture比較ゲート）は完了（[x]）。Phase 2-1（入力ファイル選択・metadata解決分離）、Phase 2-2（CPIロード・検証分離）、Phase 2-3（CTI/GDPロード・検証分離）、Phase 2-4（四半期変換・連続性検証）、Phase 2-5（公開エントリポイントadapter整理）は完了（[x]）。Phase 3-1（shared support-series domain移設と追加共有型境界）、Phase 3-2（client calculationsのshared math移設）、Phase 3-3（domain/math検証）は完了（実装・監査・検証済み）（[x]）。Phase 4-1〜4-4、Phase 5-1〜5-3は完了（実装・監査・検証済み）、Phase 6-1は完了（任意再評価記録済み）（[x]）。Phase 4-5〜6、Phase 6-2は未実施（[ ]）。

- [x] **0-1（1.5時間目安）** 既存テストを先に棚卸しし、初期表示、系列切替、期間移動、CAGR、表、7チャートの代表入力・出力と対応付ける。状態ごとに `URL key`、`storage key`、default、現行優先順位、復元・保存タイミング、`popstate` 対応を表にする。未確認の現状は推測で埋めない。
  - 受入条件: 既存テストで確認できる契約と未確認項目が区別され、仕様変更候補が挙動維持の作業から分離される。

#### Phase 0 のサブタスク 0-1 実装記録（現行コード・既存テストの棚卸し）

以下は `src/app/components/CpiChart.tsx`、`src/hooks/useUrlState.ts`、`src/hooks/useCpiChartData.ts` と既存テストを読み取った時点の記録である。ここでは仕様を追加せず、コードまたはテストで確認できた事実と未確認事項を分けている。

##### CpiChart 状態契約表

| 状態                                                | URL key                                                                                                       | storage key                                                                 | default                                                                                                                                                   | 復元タイミング                                                                                                     | 保存タイミング                                                                                                                                                             | 現行優先順位                                                                                                                                                          | `popstate` 対応                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 開始年 (`from`)                                     | `from`。省略時は `initialStartYear`（`MIN_DISPLAY_YEAR` 以上の最初の年、なければデータ先頭、最終的に `2025`） | 未確認（対象コードに開始年のstorage keyアクセスなし）                       | 上記の動的default                                                                                                                                         | `useUrlState` の初回評価でURLから復元し、`CpiChart`の `startYear` 初期値になる                                     | `startYear` 等の変更を監視するeffectで、defaultと異なる場合のみ `history.replaceState`                                                                                     | URL値を `startYear` の初期値に使用。storageとの競合規則は未確認                                                                                                       | 未確認。`useUrlState` は `popstate` listenerを登録せず、`replaceState` を使う |
| 終了年 (`to`)                                       | `to`。省略時はデータ中の最終年、データなし/不確定時は `2025`                                                  | 未確認（対象コードに終了年のstorage keyアクセスなし）                       | 上記の動的default                                                                                                                                         | `useUrlState` の初回評価                                                                                           | `startYear` 等の変更を監視するeffectで保存（defaultならkey削除）                                                                                                           | URL値を `endYear` の初期値に使用。storageとの競合規則は未確認                                                                                                         | 未確認。`popstate` listenerなし                                               |
| 非表示系列 (`hidden`)                               | `hidden`（カンマ区切り、空要素除去。積み上げ系列のみ）                                                        | 未確認（対象コードに系列非表示のstorage keyアクセスなし）                   | `[]`。`stackedHiddenKeys` の初期値にURL値を使用し、通常凡例`hiddenKeys`・移動平均凡例`maHiddenKeys`・nominal/real stateはReact初期値                      | `useUrlState` の初回評価後、`useToggleSet(urlHiddenKeys)` に渡される                                               | 積み上げ系列の変更時に `history.replaceState`。空配列ならkey削除                                                                                                           | URL値が積み上げ系列の初期値。storageとの競合規則は未確認                                                                                                              | 未確認。URL再読込用の `popstate` listenerなし                                 |
| advanced (`adv`)                                    | `adv=1` が `true`、それ以外/省略は `false`                                                                    | `newGraphShowAdvanced`。値は `1`/`0` として保存するが、初期復元には使わない | `false`（URLの `adv=1` のみで初期判定）                                                                                                                   | `useUrlState` の初回評価でURLから復元                                                                              | `showAdvanced`、`startYear`、`endYear`、hidden-key依存の変更でeffectが再実行されるが、localStorageへ保存するのはadvanced stateのみ。`setItem`例外は無視し、URLは変更しない | 初期値はURLのみ。localStorageは復元しないことを指定unit testで確認                                                                                                    | 未確認。`popstate` listenerなし                                               |
| theme / touch・viewport判定                         | theme用URL keyは使用しない                                                                                    | `theme`。`light`/`dark`を保存し、systemでは削除する                         | theme未保存時はsystem。touch・viewportは`useChartTheme`の`useSyncExternalStore`によるSSR snapshot `isMobile=false` / `isTouch=false`、clientはmedia query | `ThemeToggle`の初期評価で`theme`を読む。layoutのinline scriptはpaint前に保存済み`light`/`dark`を`data-theme`へ適用 | `ThemeToggle`の切替時に`light`/`dark`を保存し、systemでkeyを削除するとともに`data-theme`を更新する。storage write例外は吸収する                                            | URLは使用しない。storage read failureは現行の初期化経路でthrowし、write failureは切替時に吸収することを指定component testで確認。旧値は指定testで現行の表示結果を確認 | 未確認。実リロードと`popstate`は未確認（media query購読は`popstate`ではない） |
| 四半期toggle (`hiddenQuarters`)                     | 未確認（URL keyなし）                                                                                         | 未確認（storage keyなし）                                                   | `[]`                                                                                                                                                      | `useCpiChartData` の `useState` 初期化                                                                             | 保存処理なし。クリック時にメモリ状態をtoggle                                                                                                                               | URL/storageとの優先順位なし。対象四半期番号だけをフィルタ                                                                                                             | 未確認（URL/storage復元も `popstate` listenerもなし）                         |
| CAGR（開始年・終了年・月・結果・エラー）            | 未確認（URL keyなし）                                                                                         | 未確認（storage keyなし）                                                   | 年は表示範囲の初期年、月は `1`、結果/エラーは `null`                                                                                                      | `CpiChart` のstate初期化。入力変更時は結果をreset                                                                  | 保存処理なし。計算ボタンで結果またはエラーをstateへ設定                                                                                                                    | URL/storageとの優先順位なし                                                                                                                                           | 未確認（URL/storage同期なし）                                                 |
| セクション状態（activeId、range sheet、scroll抑制） | 未確認（セクション状態のURL keyなし）                                                                         | 未確認（storage keyなし）                                                   | `activeId` は7セクションの先頭、range sheetは閉、scroll抑制はfalse                                                                                        | `CpiChart` のstate初期化。scroll eventでactiveIdを更新                                                             | 保存処理なし。タブクリックはsmooth scroll、期間変更はsheetを閉じる                                                                                                         | URL/storageとの優先順位なし                                                                                                                                           | 未確認（scroll/scrollend対応はあるが `popstate` 対応ではない）                |

この表で「未確認」とした箇所は、現行コードから契約を断定できないためであり、新しい優先ルールやfail-closed挙動を意味しない。

##### 既存テスト対応表

| 観点                       | 対応するテストファイル                                                                                                                                                                                        | 証明範囲                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 初期表示                   | `tests/e2e/range-change.e2e.spec.ts`、`tests/components/all.test.tsx`                                                                                                                                         | E2Eで主要な操作対象と初期チャートを表示できること、component testで各チャート/フィルタの代表props描画。CpiChart全体の初期fixtureは未確認                                                                                                                                                                                                                                     |
| advanced / themeの状態境界 | `tests/unit/useAdvancedPreference.test.ts`、`tests/components/ThemeToggle.test.tsx`                                                                                                                           | advancedのURL `adv=1`初期値はhook単体ではなく`useUrlState`経路の実装と既存テストで確認し、指定unit testはstorage非読取、`1`/`0`保存、期間・hidden-key変更時の再実行、`setItem`例外無視、URL不変を確認。themeは`theme`の`light`/`dark`保存、system削除、DOM属性、SSR相当、read failureのthrow、write failureの吸収、旧値の現行結果を確認。URL-storage競合と実リロードは未確認 |
| 系列切替                   | `tests/e2e/cpi-chart-categories.e2e.spec.ts`、`tests/e2e/spending-filter.e2e.spec.ts`、`tests/e2e/advanced-series.e2e.spec.ts`、`tests/components/all.test.tsx`、`tests/components/SpendingBarChart.test.tsx` | 費目・名目系列・上級系列の凡例操作、棒数/表示系列、legend callbackとhidden style。URLの `hidden`/`adv` 全競合は未確認                                                                                                                                                                                                                                                        |
| 期間変更                   | `tests/e2e/range-change.e2e.spec.ts`、`tests/components/all.test.tsx`                                                                                                                                         | 開始/終了年、表示件数・棒数、単年/複数年、default範囲、URL key削除、変更時のスクロール維持を確認                                                                                                                                                                                                                                                                             |
| CAGR                       | `tests/components/CagrPanel.test.tsx`、`tests/e2e/cagr-sheet.e2e.spec.ts`、`tests/unit/client-calculations.test.ts`                                                                                           | sheetの開閉、入力制約、結果/エラー表示、モバイル寸法、計算値の単体確認。CpiChart全体との接続fixtureは未確認                                                                                                                                                                                                                                                                  |
| データテーブル             | `tests/e2e/range-change.e2e.spec.ts`、`tests/components/all.test.tsx`                                                                                                                                         | E2Eの表示・期間変更に伴うデータ状態、componentの各チャート代表データ。7テーブルの完全な列/値対応は未確認                                                                                                                                                                                                                                                                     |
| 7チャート                  | `tests/components/all.test.tsx`、`tests/components/SpendingBarChart.test.tsx`、`tests/computation-contract/client-chart-output.test.ts`、`tests/computation-contract/calculation-logic.test.ts`               | 各チャート部品の代表描画、四半期棒、計算出力の系列キー/期間/値。CpiChartでの7本の実データ表示順と一体fixtureは未確認                                                                                                                                                                                                                                                         |
| tooltip / legend           | `tests/components/all.test.tsx`、`tests/components/SpendingBarChart.test.tsx`、`tests/e2e/cpi-chart-categories.e2e.spec.ts`、`tests/e2e/accessibility.e2e.spec.ts`                                            | tooltip props、legendラベル/クリック/hidden状態、凡例操作後のdismissとコントラスト。accessibilityの一部describeはskipであり全面的なpointer契約ではない                                                                                                                                                                                                                       |
| アクセシビリティ           | `tests/e2e/accessibility.e2e.spec.ts`、`tests/components/CagrPanel.test.tsx`、`tests/e2e/cagr-sheet.e2e.spec.ts`                                                                                              | CAGR/凡例のアクセシブル名・コントラスト、dialog/ボタン構造、フォーカス関連の一部。skip対象のキーボード/animation範囲を含め未網羅                                                                                                                                                                                                                                             |
| スクロール                 | `tests/e2e/range-change.e2e.spec.ts`、`tests/e2e/cpi-chart-categories.e2e.spec.ts`、`tests/e2e/cagr-sheet.e2e.spec.ts`                                                                                        | 期間変更時の位置維持、凡例操作でのスクロール挙動、section移動、375/667等のsheet表示。全7セクションのactiveId/scrollend契約は未確認                                                                                                                                                                                                                                           |

##### 不足 / 未確認項目

- CpiChart全体を実データまたは固定入力で描画するfixtureと、初期表示から7チャート・テーブル・セクションまでを一体で比較する証跡。
- URLの `adv=1` と `newGraphShowAdvanced` の値を同時に持つ場合の競合・復元順序（advanced testはstorageを初期復元しないこととURLを変更しないことを個別に確認したが、組合せの優先順位は未確認）。
- themeの実リロードでlayout inline scriptがpaint前に適用されること（実DOM初期化、保存済み値の再読込、リロードの一体テストは未確認）。
- ブラウザの戻る/進むを含む `popstate` による状態再同期。現行 `useUrlState` は `popstate` listenerを持たないことまでは確認済み。
- SSRでの `window` 不在（`useUrlState` の更新callback、localStorage保存、スクロール処理を含む）の実行時契約。
- `hidden` のURL状態とCpiChart内の系列stateの再同期、およびURL変更後の stale state の有無（hidden再同期）。
- 7チャートの代表データ、描画順、各チャートに対応するデータテーブルの全列・系列キー・表示可否。

##### 挙動維持の境界と次Phase再利用情報

今回のPhase 0 のサブタスク 0-1では、仕様変更、新しいURL優先ルール、fail-closed挙動、テストコード追加を行っていない。テスト追加はPhase 0 のサブタスク 0-3の候補として残す。`openspec/specs/nextjstest/spec.md` は挙動・公開契約を変更していないため編集しない。判断根拠は、今回の成果物が計画書内の現行コード/既存テストの記録だけであり、コンポーネント、データモデル、API、公開状態契約を変更していないことである（spec.md更新不要〔契約不変〕）。

次Phaseでは、次の情報を比較基準として再利用する。

- fixture: `tests/components/all.test.tsx` のCPI/CTI/GDP・月次/四半期のmock入力を起点に、`tests/unit/client-calculations.test.ts` と `tests/computation-contract/client-chart-output.test.ts` の代表入力/出力を固定する。7本一体fixtureは未作成のため、Phase 0 のサブタスク 0-3候補として補う。
- 比較対象: `src/app/components/CpiChart.tsx` の7セクション定義・`dataTables`、`src/hooks/useUrlState.ts` の `from/to/hidden/adv` URL形式、`src/hooks/useCpiChartData.ts` の四半期除外結果、各既存E2EのDOM/棒数/URL/scroll assertion。
- テスト実行方法: 実行時は `package.json` の実在scriptを確認し、対象unit/componentはVitest、対象E2Eは既存fixture経由のPlaywrightで実行する。この棚卸しの実装担当時点では具体的な実行・検証を行っていなかったが、後続の監査ゲートでOrchestratorが実行済みである。
- [x] **0-2（1.5時間目安）** 既存の正常系・異常系fixtureをCPI/CTI/GDP、四半期変換、loader公開戻り値の契約に対応付け、穴だけを追加する。空入力、欠損、不正期間、非連続四半期、ファイル選択失敗などは現行で確認できるエラー分類・fallbackを固定する。
  - 受入条件: 数値は同一演算なら完全一致し、既存契約に許容誤差がある場合だけ明示する。新たなfail-closed挙動は導入しない。

#### Phase 0 のサブタスク 0-2 実装記録（loader現行契約・fixture対応表）

本記録は `server/lib/data-loader/cpi.ts` と `server/lib/dataIo.ts` の現行実装、および既存テスト・fixtureから確認できる契約だけを記録したものである。本Phaseでは本番コード、テストコード、fixtureを追加・変更していない。直接exportされていない検証関数も、公開loader/statusの結果を通じて確認する内部契約として扱う。

##### Loader契約表

| 領域          | 対象シンボル                                                                                                                                            | 現行契約（確認済み）                                                                                                                                                                                                                                                                                                                                                             | 対応テスト / fixture                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPI           | `validateContribution`、`validate2025Metadata`、`validateCpiPair`、`selectCpiPair`、`getCpiDataStatus`、`getCpiMajorWeightTotal`、`loadCpiDataInternal` | 2025 pairを優先する。2025 pairが不完全なら完全な2020 pairへfallbackし、両方成立しない場合は空配列と `valid: false`。ロード対象は2004年以降。欠損値は `undefined` のまま扱い、欠損系列を0で補完しない。2025年の `総合` 平均は99.9以上100.1以下、major weight合計は10002、総合weightは10000。2025の系列map/official snapshotで対応付ける派生系列を維持し、削除系列を復活させない。 | `tests/unit/server/lib/data-loader.test.ts`（空入力、正常CSV、2025優先、2020 fallback、metadata不整合、pair不成立、major weight）／`tests/data-quality/cpi-data-integrity.test.ts`（2004年以降、2025平均、SHA、78系列map/snapshot、weight）／`tests/fixtures/csv/cpi_data.csv`、`tests/fixtures/csv/contribution.csv`／`data/source/cpi_data2025_long.csv`、`data/source/contribution2025.csv`、`data/source/cpi_data.csv`、`data/source/contribution.csv`、`data/source/cpi_data2025_long.metadata.json`、`data/source/cpi-2025-series-map.csv`、`data/source/cpi-2025-official-series.csv`                                                                                                                                                                                     |
| CTI           | `validateCtiMetadata`、`validateCtiPair`、`selectCtiPair`、`getCtiDataStatus`、`loadCtiDataInternal`                                                    | 検証済み2025 pairを優先し、不成立時は2020 pairへfallbackする。明示的な2020 rollback fixtureの結果は `source: "rollback-2020"`。pairが成立しない場合は空配列と `valid: false`。2025 metadata、CSV SHA、series map、official snapshot、代表値を相互検証する。support系列は現行どおり、2025通常ロードでは存在する値だけを付与し、2020 rollbackでは既存support系列の挙動を維持する。 | `tests/data-quality/cti-data-integrity.test.ts`（`rollback-2020`、support系列、2005–2016の非ゼロ/50–150互換）／`tests/data-quality/cti-gdp-source-integrity.test.ts`（2025 map/snapshot、metadata/SHA、候補の連続性、公開キーへのalias）／`tests/data-quality/cti-gdp-source-artifacts.test.ts`（2025 artifactのidentity、列、hash）／`tests/utils/cti-2020-rollback-fixture.ts`／`tests/fixtures/csv/cti_data.csv`、`tests/fixtures/csv/cti_support_nominal.csv`、`tests/fixtures/csv/cti_support_real.csv`／`data/source/cti_data2025.csv`、`data/source/cti_data2025.metadata.json`、`data/source/cti_data.csv`、`data/source/cti_support_nominal.csv`、`data/source/cti_support_real.csv`、`data/source/cti-2025-series-map.csv`、`data/source/cti-2025-official-series.csv` |
| GDP（年次）   | `parseGdpSupport`、`validateGdpSupport`、`getGdpSupportStatus`                                                                                          | nominal/realを分離して読み込み、raw値を保持し、比較用の2025正規化を別に計算する。年次は1994–2025の32年連続。metadata、SHA、series、period、2025値、normalizationを検証する。入力欠損・metadata不整合等は既存のstatusエラー分類に従い、loaderの公開戻り値を変更しない。                                                                                                           | `tests/data-quality/cti-gdp-source-integrity.test.ts`（年次32年、2025値、normalization、status）／`tests/data-quality/cti-gdp-source-artifacts.test.ts`（nominal/real列、raw値、hash、1994–2025）／`tests/unit/server/lib/data-loader.test.ts`（GDP display set不存在時の `valid: false`）／`data/source/cti_support_nominal2025.csv`、`data/source/cti_support_nominal2025.metadata.json`、`data/source/cti_support_real2025.csv`、`data/source/cti_support_real2025.metadata.json`、`data/source/cti-gdp-display-normalization2025.json`                                                                                                                                                                                                                                       |
| GDP（四半期） | `gdpSupport.ts`内の非公開`validateQuarterlySeries`、公開API `validateQuarterlyGdpSupport`、`getQuarterlyGdpSupportStatus`、`loadQuarterlyGdpData`       | nominal/realを分離し、raw値とcomparison値を別フィールドで保持する。四半期は2005Q1〜2025Q4の84行で連続し、比較係数は2025Q1〜2025Q4のCSV観測値から計算する。異常時は空配列相当と `comparisonReady: false` を返す。metadata/CSV/official/e-Stat artifactのSHA-256整合性と内容比較が一致して初めてcomparison readyとなる。四半期ラベルは `YYYYQn`（例: `2025Q1`）とする。            | `tests/data-quality/plan21-quarterly-gdp.test.ts`（84行、raw/comparison分離、official/e-Stat、comparisonReady）／`tests/unit/quarterly-gdp-join.test.ts`（loader結果のjoin）／`tests/e2e/quarterly-gdp.e2e.spec.ts`（表示契約）／`data/source/cti_support_nominal_quarterly2025.csv`、`data/source/cti_support_nominal_quarterly2025.metadata.json`、`data/source/cti_support_nominal_quarterly2025.official.csv`、`data/source/cti_support_nominal_quarterly2025.estat.csv`、`data/source/cti_support_real_quarterly2025.csv`、`data/source/cti_support_real_quarterly2025.metadata.json`、`data/source/cti_support_real_quarterly2025.official.csv`、`data/source/cti_support_real_quarterly2025.estat.csv`                                                                    |

##### dataIo契約・対応表

`server/lib/dataIo.ts` の `parseCsvFile` と `parseCsvWithHeader` は、ファイル不存在時にそれぞれ空配列を返す。`findHeaderRow` は指定patternに一致する最初の行を返し、不一致は `-1`。path builderはすべて `process.cwd()` 配下の `data/source` を基準にする。CPIは `cpi_data2025_long.csv` / `contribution2025.csv` と2020 fallbackを分離し、CTIは2020 rollback pathと2025 candidate/support pathを分離する。

| 対象シンボル                                                                                                                                                                                                                                          | 現行契約・対応fixture                                                                                                                                      | 対応テスト                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseCsvFile`、`parseCsvWithHeader`、`findHeaderRow`                                                                                                                                                                                                 | Papa Parseの現行オプション、header有無、空入力、ファイル不存在時の空配列、header不一致時の `-1`。                                                          | `tests/data-quality/earning-data-integrity.test.ts`（`parseCsvWithHeader`）、`tests/data-quality/cti-gdp-source-integrity.test.ts`（CSV parse）、`tests/unit/server/lib/data-loader.test.ts`（loader経由の空/CSV入力）。直接関数の全分岐と `findHeaderRow` の専用テストは未確認であり推測しない。 |
| `buildCpiFilePaths`                                                                                                                                                                                                                                   | 2025 main/metadata/contributionと2020 `fallbackMain`/`fallbackContribution`を別pathで返す。基準は `process.cwd()/data/source`。                            | `tests/unit/server/lib/data-loader.test.ts` のファイル選択mock、`tests/data-quality/cpi-data-integrity.test.ts` の `data/source/cpi_data2025_long.csv` と関連artifact。                                                                                                                           |
| `buildCtiFilePaths`、`buildCtiRollback2020FilePaths`                                                                                                                                                                                                  | CTIの2025 candidate、metadata/map/snapshot、annual/quarterly supportと比較artifact、および2020 `main`/supportを別pathで返す。                              | `tests/data-quality/cti-gdp-source-integrity.test.ts`、`tests/data-quality/cti-gdp-source-artifacts.test.ts`、`tests/data-quality/plan21-quarterly-gdp.test.ts`、`tests/utils/cti-2020-rollback-fixture.ts`。                                                                                     |
| `parseContributionWeights`                                                                                                                                                                                                                            | `類・品目` 行と `ウエイト` 行を対応させ、数値weightだけをname→numberへ変換する。                                                                           | `tests/unit/server/lib/data-loader.test.ts`、`tests/data-quality/cpi-data-integrity.test.ts`、`tests/fixtures/csv/contribution.csv`、`data/source/contribution2025.csv` / `contribution.csv`。                                                                                                    |
| `parseIndexSection`                                                                                                                                                                                                                                   | 指定headerから年次indexを抽出し、2004年未満、空値、`-`を除外する。                                                                                         | `server/lib/data-loader/earnings.ts` の5系列呼出しで利用される。直接関数の専用テストと全分岐は未確認であり、未確認部分は補完しない。                                                                                                                                                              |
| 四半期変換・連続性検証（`quarterlyGdpTransform.ts` の `isQuarterlyPeriod`、`hasContinuousQuarterlyPeriods`、`calculateQuarterlyComparisonFactor`、`convertQuarterlyRawRows`、`joinQuarterlyGdpRows`、および `quarterlyAggregation.ts` の互換adapter） | 年境界・Q1〜Q4・連続性・行順・正規化を現行どおり保持する。公開ラベルは `YYYYQn`（例: `2025Q1`）、内部期間キーは `YYYY-Qn`（例: `2025-Q1`）として区別する。 | `tests/data-quality/plan21-quarterly-gdp.test.ts`、`tests/unit/quarterly-gdp-join.test.ts`、`tests/e2e/quarterly-gdp.e2e.spec.ts`。                                                                                                                                                               |

##### 未確認事項と後続実装の境界

- 未確認の挙動は推測で補完しない。確認できたAPI、公開型、戻り値形状、欠損値表現、エラー分類、fallbackだけをリファクタリングの受入基準とする。
- API、公開型、戻り値、エラー分類を変更しない。数値は現行結果と完全一致させ、既存テストが明示する許容誤差（例: GDP比較値の `toBeCloseTo`）以外の誤差を導入しない。
- 実装時のfixtureは上表の実在する `tests/fixtures/` と `data/source/` を使い、比較対象は現行loaderの戻り値、status、CSV SHA/metadata、official/e-Stat snapshot、既存の表示用系列キーとする。テスト実行は `package.json` の実在scriptを確認したうえで、対象unit/data-qualityはVitest、対象E2Eは既存fixture経由のPlaywrightでOrchestratorが実施する。
- Phase 0 のサブタスク 0-2ではテスト追加・fixture追加を行わない。直接関数の未確認分や不足する異常系の証跡は、Phase 0 のサブタスク 0-3以降の候補として残す。
- `openspec/specs/nextjstest/spec.md` は更新しない。今回の変更は計画書への現行契約の記録だけであり、挙動、公開契約、データモデル、データフローを変更していないため、仕様書更新は不要である。
- [x] **0-3（1時間目安）** Phase 0 のサブタスク 0-1で見つかったUI/状態契約の不足ケースだけをテストに追加し、比較対象とテスト実行方法を記録する。時刻・ネットワーク・実データの偶発差を固定し、fixtureは以後の変更単位で再利用できるようにする。
  - 受入条件: 必須契約のすべてに再実行可能な証跡があり、変更前の基準結果を再現できる。未実行項目は代替証跡と残課題を記録する。

#### Phase 0 のサブタスク 0-3 実装記録（追加テストと未実施項目）

追加したテストは、現行コードがすでに規定している状態契約に限定した。

- `tests/unit/useUrlState.test.ts`
  - `from` / `to` / `hidden` / `adv` の複合URLを復元する契約を固定。`hidden` の空要素除去も既存実装どおり確認する。
  - URLパラメータ省略時の `defaultStart` / `defaultEnd` / `[]` / `false` を固定。
- `tests/unit/useCpiChartData.test.ts`
  - `hiddenQuarters` の初期値が空配列であること、同一四半期のtoggleが追加・解除になること、異なる四半期の挿入順を固定。

テストはfixtureとmock入力だけを使用し、ネットワーク、現在時刻、実データには依存しない。実装担当時点ではテスト実行・lint・type-checkは未実行だったが、監査ゲートでOrchestratorが実行済みである。

#### Phase 0 のサブタスク 0-3 監査ゲート実行記録

以下は実装担当の記録後にOrchestratorが実行した結果である。

- `pnpm test -- tests/unit/useUrlState.test.ts tests/unit/useCpiChartData.test.ts`: 引数はVitestの個別指定ではなく全体実行として解釈され、Vitest全体で41 test files / 352 tests passed（12.71s）。
- `pnpm type-check`: 成功。
- `pnpm build`: 成功。Next.js 16.3.1 webpack、静的7ページ生成、API routesのbuild完了。
- `pnpm lint`: 成功。0 errors / 5 warnings。warningの内訳は `lint-staged.config.js` の匿名default export、`server/lib/data-loader/earnings.ts` の未使用 `_` 3件、`src/app/components/CpiChart.tsx` の未使用 `_maxCpiDate` 1件。
- tracked差分に対する `git diff --check`: 成功。
- 未追跡ファイルを含む空白検査はOrchestratorが実行済み。対象は `shared_plan/30-refactoring-foundation-plan.md`、`src/app/components/cpiChartConfig.ts`、`tests/unit/useCpiChartData.test.ts` の3ファイルで、各ファイルに対する `git diff --no-index --check /dev/null <file>` はstdout/stderrともに空、終了コードは1だった。終了コード1は `/dev/null` との差分が存在することによるものであり、空白エラーを示さない。

実装事実として、URL queryを読み込み、`history.replaceState`でURLへ同期していることを確認した。一方、以下は現行コードから契約を断定できないため、実装・テストしていない。

- `popstate` によるURL状態の再同期。
- URLとlocalStorageの競合時の優先順位、およびlocalStorageからのadvanced復元。
- SSR / `window` 不在時の各副作用の実行時契約。
- `hidden` URL変更後のCpiChart内部state再同期。
- 新しいfail-closed挙動や未確認のloader異常系。

### Phase 1 — `CpiChart` の責務分割（1〜2時間/件を目安）

対象: `src/app/components/CpiChart.tsx`、`src/app/components/CpiChart.module.css`、必要に応じて `src/app/components/`、`src/hooks/`、`src/lib/`。

境界: Phase 1では計算式・純粋関数の仕様変更や環境非依存モジュールへの本移設を行わず、既存関数を呼び出す整理に限定する。計算ロジックのdomain/mathへの移設はPhase 3で同値移設として行う。

- [x] **1-1（1.5時間）** `CpiChart.tsx` 内の静的設定（チャート定義、ラベル、セクション定義、描画順）を型付き設定モジュールへ段階移動する。
  - 受入条件: `CpiChart`が設定を組み立てて渡すcomposition rootとなり、7チャートの順序・id・表示ラベル・propsが不変。
  - テスト観点: セクション数、id、描画順、各チャートの必須データがPhase 0 fixtureと一致する。

#### Phase 1 のサブタスク 1-1 実装記録

- 変更ファイル: `src/app/components/cpiChartConfig.ts` を新規作成し、7セクションの `id`・`label`・順序を `CpiChartSection` 型付き配列として定義。`src/app/components/CpiChart.tsx` はこの配列をimportし、`sections`の `useMemo` を削除した。
- 維持した契約: 既存のセクション配列を完全に同じ値・順序で保持し、初期active section、`SectionTabs` props、DOM/スクロール監視が同一配列を参照する構成を維持した。`chartConstants.ts` のexport、派生計算、7チャートのprops、dynamic import、LazyMount、CagrPanel、DataTablesSection、URL/localStorage、計算式は変更していない。`use client` と `page.tsx` のServer Component／serializable props境界も変更していない。
- 公開契約不変の根拠: UIの外部挙動、表示順・ラベル・DOM id、公開データモデル、API、データフロー、Server/Client境界は維持した。一方、型付き設定モジュールへの抽出でComponent Tree等の内部構成が変わったため、`openspec/specs/nextjstest/spec.md` のArchitectureと回帰要件を同期した。
- 実装担当は実装中にテスト、lint、type-check、buildを実行していない。実装後、Orchestratorが監査ゲートとして実行済みで、Vitest 41 files / 352 tests passed、type-check成功、build成功、lint 0 errors / 5 warningsを確認した。

#### Phase 1 のサブタスク 1-1 監査ゲート実行記録

- Vitest: 41 test files / 352 tests passed。
- `pnpm type-check`: 成功。
- `pnpm build`: 成功。
- `pnpm lint`: 成功。0 errors / 5 warnings。

- [x] **1-2（1.5時間目安）** 既存の表示期間フィルタ、系列選択、四半期表示、CAGR入力の呼び出し箇所を局所的に整理する。新しいdomain/mathへの本移設や計算式の変更はPhase 3で行う。
  - 受入条件: 既存関数の入力・出力・欠損表現を保ち、移設のための同じ抽出を繰り返さない。

#### Phase 1 のサブタスク 1-2 実装記録

- 変更ファイル: `src/hooks/useCpiChartDisplayData.ts`、`src/hooks/useCagrState.ts` を新規作成し、`src/app/components/CpiChart.tsx` から表示用派生データとCAGR state/計算呼び出しを局所化した。計画書を更新した。
- 維持した契約: CPI/給与adapter、年範囲filter、四半期除外、`mergeChartData` の入力・出力・順序・欠損表現、CAGRの入力state・結果/error state・reset条件、NaN fallback、同一年拒否、既存エラー文、既存の `calculateCategorySum` / `calculateCAGRValue` 呼び出しを維持した。nominal/realの系列ペア、advanced filtering、URL key `from/to/hidden/adv`、storage key `newGraphShowAdvanced`/`theme`、保存タイミング、7セクション、チャート、テーブル、tooltip、legendの構成は変更していない。
- Phase 3へ残した範囲: 純粋関数のdomain/math移設、server/mathのimport境界是正、`clientCalculations.ts` / `chartUtils.ts` の関数移設・再実装、既存テスト対象関数の削除・再実装は行っていない。
- 公開契約不変の根拠: 公開型・API・データモデル・表示契約・Server/Client境界は維持した。一方、表示用派生データとCAGR stateをhookへ抽出した構成変更を、`openspec/specs/nextjstest/spec.md` のArchitecture、Data Flow、Client Modulesおよび回帰要件へ同期した。
- 実装担当は実装中にテスト実装・テスト実行・lint・type-check・buildを実行していない。実装後、Orchestratorが監査ゲートとして実行済みで、Vitest 41 files / 352 tests passed、type-check成功、build成功、lint 0 errors / 5 warningsを確認した。
- [x] **1-3（1.5時間目安）** `useUrlState`とlocalStorage復元/保存の副作用を機械的に境界化し、CpiChartから切り離す。優先順位・key・保存タイミングはPhase 0の契約表に従う。
  - 受入条件: 現行で確認済みの初期URL、storage、保存の挙動を維持する。`popstate`、SSR時のwindow不在、未確認の優先順位は決め打ちせず、対象テストで確認できた範囲だけを記録する。

#### Phase 1 のサブタスク 1-3 実装記録

- 変更ファイル: `src/lib/urlState.ts` を新規作成し、既存queryを保持しながら `from` / `to` / `hidden` / `adv` を更新する副作用のないquery変換関数を抽出した。`src/hooks/useUrlState.ts` は同関数の結果を従来どおり `window.history.replaceState` へ渡す。`src/hooks/useAdvancedPreference.ts` を新規作成し、`CpiChart.tsx` の `newGraphShowAdvanced` 保存effectだけを移した。
- 維持した契約: URL keyは `from` / `to` / `hidden` / `adv`、storage keyは `newGraphShowAdvanced` / `theme` のまま。default時のkey削除、既存query保持、hiddenの空要素除去、保存値 `1` / `0`、初期stateをURLの `adv` が所有すること、try/catch、旧effectと同じ `startYear` / `endYear` / `stackedHiddenKeys` / `showAdvanced` の依存による保存タイミング、保存effect後にURL同期effectが実行される順序を維持した。`useChartTheme`、`ThemeToggle`、`layout.tsx` は変更していない。
- 未導入: `popstate` listener、URL/localStorage競合の新しい優先順位、壊れた値への新規fallback、SSR仕様の変更は導入していない。`window` はmodule scopeで参照せず、browser APIはeffectまたは更新callback内だけで参照する。
- 公開契約不変の根拠: 公開状態契約、データモデル、API、データフロー、SSR仕様は維持した。一方、URL query変換とadvanced保存effectを別モジュールへ抽出した構成変更を、`openspec/specs/nextjstest/spec.md` のArchitecture、State Managementおよび回帰要件へ同期した。
- 実装担当は実装中にテスト実行、lint、type-check、buildを実行していない。実装後、Orchestratorが監査ゲートとして実行済みで、Vitest 41 files / 352 tests passed、type-check成功、build成功、lint 0 errors / 5 warningsを確認した。

- [x] **1-4（1.5時間目安）** `CpiChart`からセクションナビゲーションのstateとブラウザ副作用を`useSectionNavigation`へ移し、hookの戻り値をSectionTabs、tooltip、セクション描画へ配線する。
  - 受入条件: 7セクションのid・label・順序、active判定、smooth scroll、LazyMount fallback、rAF追跡、programmatic scroll抑制、timer/listener/rAF cleanupを維持する。SectionTabsの横スクロール契約は変更しない。

#### Phase 1 のサブタスク 1-4 実装記録

- 変更ファイル: `src/hooks/useSectionNavigation.ts`を新規作成し、`src/app/components/CpiChart.tsx`からactiveId、scroll/scrollend listener、tab選択時のsmooth scroll、`data-lazy-section` fallback、安定フレーム追跡、programmatic scroll抑制、timer/listener/rAF cleanupを移した。CpiChartはhookの`activeId`、`handleSelectSection`、`isProgrammaticScroll`をSectionTabsと`useChartTooltipController`へ渡す構成にした。計画書も更新した。
- 維持した契約: `CPI_CHART_SECTIONS`の7件・id・label・順序、`scrollY + innerHeight * 0.4`、`offsetTop`/`offsetHeight`の範囲判定、先頭/末尾の扱い、smooth scroll、LazyMount未マウント時のfallback、安定30フレーム・最大180フレームのrAF追跡、scrollend/150ms timerによる抑制解除、連続クリック時の挙動、mobile幅、期間変更時のBottomSheet、tooltip抑制接続を変更していない。from/to/hidden/adv、localStorage、popstate、CAGR、表示データ、チャートprops、計算式、`SectionTabs.tsx`は変更していない。
- cleanup: hookのunmount cleanupでprogrammatic scroll timerを解除し、登録済みrAFを`cancelAnimationFrame`で解除する。browser APIはmodule scopeで参照せず、effectまたはcallback内でのみ参照する。
- Phase 1-4関連E2E実行記録: `pnpm test:e2e -- tests/e2e/section-tabs-scroll.e2e.spec.ts tests/e2e/range-change.e2e.spec.ts tests/e2e/accessibility.e2e.spec.ts` をPlaywright configの全projectと関連依存を含めて実行し、Running 128 tests、112 passed、16 skipped、失敗0だった。対象projectはchromium、chromium-dark、mobile-pixel、webkit-tabs-regression。sandbox内のwebServer起動はEPERMだったため、sandbox外で実行した。
- 当時の実装記録時点では、Phase 1-6以降、Phase 2、Phase 3本体、後続のPhase 4〜6は未着手のまま維持していた。
- Phase 1-4実装後、Phase 1-1〜1-4の構成変更を`openspec/specs/nextjstest/spec.md`へ同期済みである。同期対象はArchitecture（Component Tree、Data Flow、Client Modules、State Managementを含む）およびTest Requirementsである。公開挙動、公開データモデル、APIは不変であり、既存の未確認事項は維持する。

#### Phase 1-1〜1-3 仕様書同期記録

- `openspec/specs/nextjstest/spec.md` を、Architecture（Component Tree、Data Flow、Client Modules、State Managementを含む）およびTest Requirementsへ同期した。CpiChartがcomposition rootであること、型付き7セクション定義と同一配列の受け渡し、7つの追加モジュール（`src/app/components/cpiChartConfig.ts`：チャートセクション設定、`src/hooks/useCpiChartDisplayData.ts`：表示用派生データ、`src/hooks/useCagrState.ts`：CAGR stateと計算呼び出し、`src/lib/urlState.ts`：URL query変換、`src/hooks/useAdvancedPreference.ts`：advanced設定の保存effect、`src/hooks/useSectionNavigation.ts`：セクションナビゲーション、`src/app/components/CpiChartSections.tsx`：7チャートのセクション描画）の責務、既存の`src/app/components/CpiChart.tsx`（設定・表示用派生データ・CAGR state・advanced保存effectを組み立てるcomposition rootとして責務変更）および`src/hooks/useUrlState.ts`（URL query変換モジュールを利用する責務変更）、URL・storage・SSR境界、およびPhase 1回帰要件を追記した。
- 当時の実装記録時点では、Phase 1-6以降、Phase 2、Phase 3本体は未着手のまま維持していた。実装担当は実装中にテスト実装・テスト実行・lint・type-check・buildを実行していない。
- Phase 1-4単独の変更ファイル: `src/hooks/useSectionNavigation.ts`、`src/app/components/CpiChart.tsx`、`shared_plan/30-refactoring-foundation-plan.md`、`openspec/specs/nextjstest/spec.md`。
- Phase 1全体の累積変更ファイル: `src/app/components/cpiChartConfig.ts`、`src/app/components/CpiChart.tsx`、`src/hooks/useCpiChartDisplayData.ts`、`src/hooks/useCagrState.ts`、`src/hooks/useAdvancedPreference.ts`、`src/lib/urlState.ts`、`src/hooks/useUrlState.ts`、`src/hooks/useSectionNavigation.ts`、`tests/unit/useCpiChartData.test.ts`、`tests/unit/useUrlState.test.ts`、`shared_plan/30-refactoring-foundation-plan.md`、`openspec/specs/nextjstest/spec.md`。
- 公開UI挙動、公開データモデル、loader/APIレスポンス、API routes、URL形式、storage key、Server/Client境界を変更していないことを、Purpose / Non-Goalsおよび同期した受入要件の根拠として明記した。新設hook内部型も公開データモデルには含めていない。
- 当時の実装記録時点では、Phase 1-6以降、Phase 2、Phase 3本体は未着手のまま維持していた。実装担当は実装中にテスト実装・テスト実行・lint・type-check・buildを実行していないが、実装後、Orchestratorが監査ゲートとして実行済みで、Vitest 41 files / 352 tests passed、type-check成功、build成功、lint 0 errors / 5 warningsを確認した。
- Phase 1-4の構成同期記録: `useSectionNavigation.ts`を含む構成変更を、`openspec/specs/nextjstest/spec.md`のArchitecture（Component Tree、Data Flow、Client Modules、State Managementを含む）およびTest Requirementsへ同期した。既存の公開UI、データモデル、API、URL/storage、`SectionTabs`横scroll契約は変更していない。既存の未確認`popstate`・競合優先順位と同期履歴は保持した。
- [x] **1-5（2時間）** 描画/セクション定義を小さなセクション部品またはrendererへ分割し、`CpiChart`をcomposition rootとして整理する。

#### Phase 1-5 実装記録（codemap・仕様同期）

- 変更ファイル: ルートおよび `src/`、`src/app/`、`server/`、`server/lib/`、`src/hooks/` のcodemapを現行の主要境界・データフローへ同期した。あわせて本計画書と `openspec/specs/nextjstest/spec.md` のArchitecture（Component Tree、Data Flow、Client Modules、State Management）およびTest Requirementsを同期した。
- state ownership: URL keysは `from`/`to`/`hidden`/`adv` で、URL queryを初期値および同期先として扱う。storage keysは `newGraphShowAdvanced`/`theme`。advancedは保存のみで初期復元せず、themeはtheme storageと `data-theme` DOM属性を用いる。matchMedia/useSyncExternalStoreのSSR snapshot、四半期/CAGR/section stateのReact所有も記録した。URLとlocalStorageの優先順位や`popstate`契約は未検証として断定しない。
- 公開契約不変の根拠: `page.tsx`（Server Component）→ `server/lib/view-models/` → `CpiChart`（Client）→既存adapter/表示用hook→charts/tablesの経路、7チャート、公開props/API/データモデルをcodemap/specに明記した。API routeはe-Stat境界として記載し、古いserver/lib/dataLoader.ts/API route/Client fetch中心の説明を更新した。
- 追加していないもの: popstate、新しいURL/localStorage競合優先順位、storageからURLへの自動書き戻し、不正値の新規厳格化。当時の実装記録時点では、Phase 2/3本体、Phase 1-6以降、後続Phaseは未着手のまま維持していた。
- Phase 1-1〜1-5では、`CpiChartSections.tsx`へ7セクションの描画を抽出し、`CpiChart.tsx`をcomposition rootとして設定・hook・状態・描画部品を組み立てる構成へ整理した。`cpiChartConfig.ts`、`useCpiChartDisplayData`、`useCagrState`、`useUrlState`/`urlState`、`useAdvancedPreference`、`useSectionNavigation`へ既存の設定・hook・URL/localStorage副作用を責務ごとに分割し、Phase 1の不足ケース用テストも追加した。specとcodemapを実装へ同期し、Phase 1の監査ゲートでテスト、lint、type-check、buildの結果も確認済みである。
  - 受入条件: 7チャート、CAGR、テーブル、tooltip、legendの挙動とDOM上のアクセシビリティ契約が維持される。
  - テスト観点: Phase 0の表示比較、関連E2E、`role="img"`、details表、遅延マウント。

#### Phase 1-6（fixture比較ゲート）監査記録

- [x] fixture比較ゲート: 19 tests passed。監査合格。
- Phase 1-6完了記録は維持する。Phase 2-1〜2-5の完了記録も維持する。Phase 3-1は追加共有型境界を含め実装・検証・最終静的監査完了として記録する。

### 更新履歴

- 2026-09-14: Phase 2-1の検証完了を反映。source解決分離、CPI変換維持、公開経路テスト、全Vitest 43 files / 380 tests、対象47 tests、typecheck成功、lint 0 errors / 5 warningsを実績として記録し、次の未着手地点をPhase 2-2とした。
- 2026-09-14: Phase 2-2の実装・監査完了を反映。`cpiValidation.ts`（CSV parse/header/content validation）、`cpiLoader.ts`（純粋変換）、`cpiSource.ts`（source解決）へ責務を分離し、`cpi.ts` adapterを維持した。対象62 tests / 全395 tests、typecheck成功、lint 0 errors / 5 warnings、静的監査合格を記録し、次の未着手地点をPhase 2-3とした。
- 2026-09-14: Phase 2-3の実装・監査完了を反映。CTI validation、GDP年次validation、GDP四半期validationを分離し、CTIの公式snapshot確認と2020 rollback、GDPのraw/比較分離、年次・四半期の独立確認および`ready`条件、四半期のfail-closed契約を検証した。関連60 tests / 全403 tests、typecheck成功、lint 0 errors / 5 warnings、最終静的監査合格を記録し、次の未着手地点をPhase 2-4（四半期変換・連続性検証）とした。
- 2026-09-14: Phase 2-5の実装・検証・最終静的監査完了を反映。`server/lib/dataLoader.ts`を唯一の公開facadeとして整理し、`server/lib/data-loader/cpi.ts`を内部adapterとして維持した。`src/app/page.tsx`と`server/lib/view-models/quarterlyProjection.ts`のimportをfacade経由へ統一し、既存の公開signature、return、error、SSR境界を不変とした。facade契約テストを追加し、関連75 tests passed、全体432 tests passed、type-check成功、lint 0 errors / 5 warningsを記録した。`src/app/api/estat/*`は経路外で非変更であることを静的確認し、API route経由のJSONテストは実施していない。Phase 3-1の完了記録は後続エントリで確定した。後続の「現行Phase 3-2は実装済み・検証待ち（未完了）」という記載は、Phase 3-2実装前の履歴であり、現行Phase 3-2の完了判定は後続記録で確定した。
- 2026-09-14: Phase 3-1の実装・検証・最終静的監査完了を反映。`src/lib/math/supportSeries.ts`（shared pure domain）、`server/lib/math/supportSeries.ts`（既存server import向けvoid互換legacy adapter/re-export）、`src/types/chart.ts`の共有`QuarterlyRow`、`src/lib/quarterlyPublicProjection.ts`のclient-safe経路、`gdpSupport.ts`と`clientCalculations.ts`のshared pure直接利用を同期した。shared pure `scaleSupportSeries`は入力行を非破壊に扱い、欠損/NaN/±Infinity/対象外を有限0へ捏造せず保持する一方、serverのvoid `applySupportSeriesScaling`とclient compatibility adapterは旧公開挙動の0埋め/value||0を保持する。年次normalizerはpositive finite single value以外をfail-closedとする。focused 60 tests passed、全体50 files / 458 tests passed、type-check成功、lint 0 errors / 5 warnings、最終静的監査合格を記録した。次の未着手地点をPhase 3-2とした部分、および現行Phase 3-2を実装済み・検証待ち（未完了）とした記載は、いずれもPhase 3-2実装前の履歴であり、現行Phase 3-2の完了判定は後続記録で確定した。

### Phase 2 — CPI loaderの内部分割（1〜2時間/件を目安）

対象: `server/lib/data-loader/cpi.ts`、必要に応じて `server/lib/data-loader/` の新規内部モジュール、`tests/server/`、`tests/data-quality/`。

境界: Phase 2はサーバー内の責務分割と既存公開APIの維持に限定する。client/serverで共有するモジュールへの移行・共有化はPhase 3で行う。

- [x] **2-1（1.5時間目安）** 入力ファイル選択とパス/metadata解決を内部モジュールへ分離する。
  - 受入条件: 2025候補を優先し、検証不通過時は2020候補へfallbackし、全候補不正時は分類済みstatusでfail-closedとなるsource解決契約を維持する。ファイル不在時の公開loader契約も維持する。
  - テスト観点: 各候補の存在/不在、metadata不整合、空パス、fallback境界。

#### Phase 2-1 実装・検証記録（完了）

- `server/lib/data-loader/cpiSource.ts` を追加し、CPI source解決の責務を集約した。候補path生成、2025 metadataの検証、index/contributionのpair validation、2025優先・2020 fallback、全候補不正時のfail-closedと分類済みstatus返却を同モジュールが所有する。
- `server/lib/data-loader/cpi.ts` は `selectCpiPair()` を利用するadapterとして接続し、CPIの変換（固定ウェイト、欠損値、派生系列、期間フィルタ）は維持した。公開経路は既存の `server/lib/dataLoader.ts` → `loadCpiData()` → `loadCpiDataInternal()` を維持した。
- `tests/unit/server/lib/cpiSource.test.ts` および `tests/unit/server/lib/data-fixture-comparison.test.ts` に、内部source境界と公開 `loadCpiData()` / `getCpiDataStatus()` 契約を確認するテストを追加した。候補順、metadata不整合、fallback、全候補不正時のfail-closed、公開データ/statusを対象とする。
- 公開経路テストを追加し、全Vitest 43 files / 380 tests、Phase 2-1対象47 testsが成功した。`pnpm type-check` は成功、`pnpm lint` は0 errors / 5 warningsで成功した。以上をもってPhase 2-1の検証を完了した。Phase 2-2も実装・監査完了し、次の未着手地点はPhase 2-3とする。
- [x] **2-2（2時間）** CPIロード・検証を分離する（実装・監査完了）。
  - 受入条件: WHEN CPIの候補pairをロードするとき、THEN `cpiSource.ts`が候補path、metadata解決/検証、pair選択を担い、`cpiValidation.ts`がCPI CSV/contribution parseとheader/content validationを担い、`cpiLoader.ts`が2004年以降filter、weight分母、欠損伝播、派生系列、不要系列除去を担い、`cpi.ts`が公開status/load adapterとCTI/GDP/quarterlyを維持する。AND CPIペア選択、2025系列マッピング、固定ウェイト、欠損値の扱い、公開CPI戻り値が不変。
  - テスト観点: 正常CSV、列欠損、異常値、ペア不一致、固定ウェイト計算のfixture比較。

#### Phase 2-2 実装・監査記録（完了）

- `cpiValidation.ts` にCPI index/contribution CSVのparse、header validation、content validationを分離した。
- `cpiLoader.ts` にCPIの純粋変換とrow mappingを分離し、`cpiSource.ts` にsource解決を分離した。`cpi.ts` は公開status/load adapterとして維持した。
- 対象62 tests / 全395 testsが成功し、typecheck成功、lint 0 errors / 5 warnings、静的監査合格を確認した。
- WHEN/THENで定義したCPIペア選択、2025系列マッピング、固定ウェイト、欠損値の扱い、公開CPI戻り値の要件は維持した。codemapの責務記述は既に同期済みのため変更していない。
- [x] **2-3（2時間）** CTI/GDPロード・検証を分離する（実装・監査完了）。
  - 受入条件: CTI名目/実質、GDP raw/比較、projection、既存の検証エラーと戻り値を維持する。
  - テスト観点: 系列欠損、異なるfrequency、2025正規化、公式/支援データの選択、異常系fixture。

#### Phase 2-3 実装・監査記録（完了）

- CTI validation、GDP年次validation、GDP四半期validationを責務分離し、CTI名目/実質、GDP raw/比較、projection、既存の検証エラーと公開戻り値を維持した。
- CTIは公式map/snapshotの独立確認が`ready`となった場合だけ2025候補を採用し、不成立時は完全な2020 rollbackへ切り替えることを検証した。GDP年次・四半期はそれぞれ独立に検証し、各price conceptのraw/比較値を分離した。四半期は独立確認が`ready`でない場合に比較値をfail-closedとし、年次GDPへfallbackしない契約を確認した。
- 関連60 tests / 全403 testsが成功し、typecheck成功、lint 0 errors / 5 warnings、最終静的監査合格を確認した。
- WHEN/THENで定義したCTI validation、GDP年次/四半期validation、独立確認`ready`条件、CTI 2020 rollback、GDP fail-closedおよび公開projectionの要件は維持した。
- [x] **2-4（1.5時間）** 四半期変換・連続性検証を分離する（実装・監査完了）。
  - 受入条件: `quarterlyGdpTransform.ts` の `isQuarterlyPeriod`、`hasContinuousQuarterlyPeriods`、`calculateQuarterlyComparisonFactor`、`convertQuarterlyRawRows`、`joinQuarterlyGdpRows` と、`quarterlyAggregation.ts` の互換adapterを受入対象として記録する。公開ラベル `YYYYQn`（例: `2025Q1`）と内部期間キー `YYYY-Qn`（例: `2025-Q1`）を区別し、期間ラベル、順序、行数、正規化を不変とする。
  - テスト観点: Q1〜Q4、年境界、重複/欠落四半期、snapshot比較、非連続入力。

#### Phase 2-4 実装・監査記録（完了）

- `quarterlyGdpTransform.ts`をpure moduleとして整理し、`quarterlyAggregation.ts`は`mergeQuarterlyGdpRows`互換adapterとして維持した。`gdpSupport` artifact検証/接続、exact `YYYY-Qn` join、nominal/real期間集合一致、invalid artifact fail-closed、unready raw rows保持/comparison非生成、metadata-only predicateを仕様・実装と同期した。
- 関連37 tests / 全416 testsが成功し、type-check成功、lint 0 errors / 5 warnings、最終静的監査合格・検証済みを確認した。
- 仕様書のData Sources / Data Flow / Component Tree / Requirementsを実装へ同期した。Phase 2-5およびPhase 3-1の完了記録へ接続した。
- [x] **2-5（1時間）** 既存公開エントリポイントを薄いadapterとして整理し、外部API/戻り値契約を確認する（実装・検証・最終静的監査完了）。
  - 受入条件: `loadCpiDataInternal`、`loadCtiDataInternal` 等の既存呼び出し元に変更不要、型チェックでserver/client境界が崩れない。
  - 受入条件補足: API route経由のJSON確認はfacade整理の経路外であるため受入対象に含めない。`src/app/api/estat/*` のAPI routeは非変更であることを静的確認する。
  - テスト観点: `src/app/page.tsx` からのSSRロード、facade契約、ロード失敗時の画面。API routeのJSONテストは実施済みとは記録しない。

#### Phase 2-5 実装・検証・最終静的監査記録（完了）

- `server/lib/dataLoader.ts`を既存公開load/status関数の唯一の公開facadeとし、実装を`server/lib/data-loader/*`へ委譲した。`server/lib/data-loader/cpi.ts`は内部adapterとしてCPI/CTI/GDP/quarterlyのloader経路を接続する。
- `src/app/page.tsx`と`server/lib/view-models/quarterlyProjection.ts`のloader importを`server/lib/dataLoader.ts`へ統一した。`page.tsx`のSSRロード、quarterly projectionの接続、ロード失敗時の挙動を既存契約の範囲で維持した。`src/app/api/estat/*` のAPI routeはfacade整理の経路外であり、非変更であることを静的確認した。API route経由のJSONテストは実施していない。
- 既存の公開signature、return shape、error behavior、Server/Client（SSR）境界は変更していない。内部loaderは公開entry pointとして再exportせず、facadeの内側に限定した。
- `tests/unit/server/lib/dataLoader-facade.test.ts`でfacadeの公開契約と内部adapter接続を確認した。関連75 tests passed。全体432 tests passed、type-check成功、lint 0 errors / 5 warnings、最終静的監査合格を確認した。
- Phase 3-1（`supportSeries.ts`から環境非依存の正規化・スケール計算を抽出）は追加共有型移設を含め実装・検証・最終静的監査完了である。次の未着手地点をPhase 3-2とした記録、および現行Phase 3-2を実装済み・検証待ち（未完了）とした記載は、Phase 3-2実装前の履歴であり、現行Phase 3-2の完了判定は後続記録で確定した。

### Phase 3 — 環境非依存domain/mathへの移設（1〜2時間/件を目安）

対象: `server/lib/math/supportSeries.ts`、`src/lib/clientCalculations.ts`、`src/lib/chartUtils.ts`、既存の `src/lib/math/`、必要な型ファイル、`tests/unit/`。

- [x] **3-1（1時間目安）** `supportSeries.ts`から環境非依存の正規化・スケール計算を抽出し、論理層であるdomain/mathの公開関数と型を定義する（実装・検証・最終静的監査完了）。移設先は既存 `src/lib/math/` とし、新規ルート階層は作成していない。
  - 受入条件: shared pure `scaleSupportSeries`は入力行を非破壊に扱い、欠損/NaN/±Infinity/対象外を有限0へ捏造せず保持する。serverのvoid `applySupportSeriesScaling`とclient compatibility adapterは旧公開挙動の0埋め/value||0を保持し、年次normalizerはpositive finite single value以外をfail-closedとする。server loaderはdomain/mathを利用し、共有純粋関数は環境非依存型だけを参照する。
  - テスト観点: 2020/2025基準、空配列、有限/非有限値、既存fixtureとの完全な数値比較。

#### Phase 3-1 実装・検証・最終静的監査記録（完了）

- `src/lib/math/supportSeries.ts`をserver/client共通のpure moduleとし、`calculateGdp2025NormalizationFactor`、`scaleSupportSeries`、`SupportSeriesRow`を移設した。shared pure `scaleSupportSeries`は入力行を非破壊に扱い、欠損/NaN/±Infinity/対象外を有限0へ捏造せず保持する。年次normalizerはpositive finite single value以外をfail-closedとする。`server/lib/math/supportSeries.ts`は既存のvoid戻り値互換legacy adapterとして公開呼出しを保ち、domain関数へ委譲する。
- `src/types/chart.ts`へ共有`QuarterlyRow`を移設し、`src/lib/quarterlyPublicProjection.ts`からserver依存を除去してclient-safeな共有型経路にした。`server/lib/view-models/quarterlyAggregation.ts`は既存APIの互換adapterを維持し、共有`QuarterlyRow`をre-exportする。
- `server/lib/data-loader/gdpSupport.ts`と`src/lib/clientCalculations.ts`は`src/lib/math/supportSeries.ts`のshared pure moduleを直接利用し、`server/lib/view-models/quarterlyAggregation.ts`等の既存server側呼出しは`server/lib/math/supportSeries.ts`のvoid互換adapter経由とする。clientからserver配下への依存を残さない。
- 2020/2025基準、正規化・スケールの数式、丸め、公開projection/JSON形状、SSR境界は不変とした。shared pure `scaleSupportSeries`は欠損/NaN/±Infinity/対象外を有限0へ変換せず入力行も変更しない。serverのvoid `applySupportSeriesScaling`とclient compatibility adapterは旧公開挙動の0埋め/value||0を保持し、年次normalizerはpositive finite single value以外をfail-closedとする。focused 60 tests passed、全体50 files / 458 tests passed、type-check成功、lint 0 errors / 5 warnings、最終静的監査合格を確認した。Phase 3-2を次の未着手地点とした部分は実装前の履歴であり、現行Phase 3-2の完了判定は後続記録で確定した。
- [x] **3-2（2時間目安、完了：実装・監査・検証済み）** `clientCalculations.ts` のカテゴリ合計、CAGR、表示用派生計算をdomain/mathへ移し、client側adapterを薄くした。server側の`quarterlyAggregation`等は既存互換実装を維持し、shared mathへの移行は本フェーズの完了条件に含めない。
  - 受入条件: clientから `@server/lib/math/supportSeries` のimportがなく、ブラウザで解決できないserver依存もないことを監査済み。`pnpm type-check`、`pnpm lint`（0 errors / 5 existing warnings）、`pnpm test`（全体50 files / 458 tests passed）、`pnpm build`、`pnpm test:build-parity`（1 file / 3 tests passed、build完了後の再実行）、`git diff --check` が成功した。禁止依存検索は実コード該当なし（`supportSeries.ts`のコメント1件のみ）。
  - テスト観点: 月次/四半期、系列非表示、負値/0、CAGRエラー、既存計算テストを検証済み。
- [x] **3-3（1.5時間目安、完了：実装・監査・検証済み）** domain/mathの単体テスト、明示的な戻り値型、server/client共有モジュール境界テスト、依存方向チェックを追加した。`tests/unit/math/clientCalculations.test.ts`、`tests/unit/math/dependency-boundary.test.ts`を追加し、直接2 files / 9 tests passed、全体52 files / 467 tests passed、type-check成功、lint 0 errors / 5 existing warnings、production build成功、build parity 1 file / 3 tests passedを確認した。cwd非依存の依存境界監査を実施し、`ClientCalculationResult`を明示した。
  - 受入条件: domain/mathがNext.js、React、Node専用API、`window`/storageを参照せず、clientからserver配下importがなく、server側呼出元を含めて型検査とproduction buildを通過する。
  - テスト観点: 同じ入力の決定性、serverとclient双方からのimport、型付き戻り値。

### Phase 4 — 実証済みチャート共通化（1〜2時間/件を目安）

#### Phase 4-4 — 公開チャートデータ契約とCSV parity

- `ChartDataContract` を7チャートへ配置し、実際にチャートへ渡す正規化データの系列キー、期間、値、null/欠損を安定DOM (`data-testid="chart-data-contract"`, `data-series`, `data-points`, `data-period`, `data-series-key`, `data-value`, `data-value-type`) で公開する。Recharts内部SVG path/class/座標は意味契約にしない。
- 名目・実質の四半期チャート、contract DOM、表、CSVは、選択された全期間の同一行集合を使う。表・CSVを最新12四半期へ切り詰めず、チャートへ渡す全期間の正規化表示データと一致させる。
- `buildCsv` はRFC4180のCRLFを全record終端（最終recordを含む）とし、既存のカンマ・quote・CR/LF escapeを維持する。`tests/fixtures/chart-parity-independent.json` はhidden、adv、nominal/real、GDP境界、欠損、CSV特殊文字の独立根拠を固定する。
- unitはserializer、integrationは独立fixtureと実コンポーネント境界、E2Eはproduction data/sourceと安定selectorによる7対象のchart-data/table/CSV全行全列parity、hidden/adv/nominal-real/GDP境界を分担する。実装後のlint/type-check/unit/integration/E2EはOrchestratorが実行し、未実行の実績は完了と記録しない。

対象: `src/app/components/charts/`、`src/app/components/CustomTooltip.tsx`、legend関連部品、`src/lib/chartConstants.ts`、`src/lib/chartUtils.ts`、関連テスト。

- [x] **4-1（1.5時間、完了：実装・監査・検証済み）** 複数チャートで一致する軸設定・tick生成を共通部品へ移行し、固有軸は各チャートに残した。`EarningsBreakdownChart` と `StackedAreaChart` を `TimeSeriesXAxis` へ移行し、`SpendingBarChart` は四半期棒固有の契約を持つため対象外・未変更とした。既存のtick、Y軸、tooltip、legend、`data-testid`、系列描画を維持した。
  - 検証結果: unit 13 files / 132 tests passed、`pnpm type-check` 成功、`pnpm lint` 0 errors / 5 existing warnings、production build 成功。関連E2EはPlaywright設定上128 tests実行・112 passed / 16 skipped / 0 failed（320/375/390/430/768pxを含む）。`git diff --check` 成功。
- [x] **4-2（1.5時間、完了：実装・監査・検証済み）** tooltip/legendの共通契約を比較し、一致するprops・dismiss・表示順のみ共通化した。desktop/mobile tooltip、stack total/hidden、legendの`aria-pressed`/keyboard、mobile `details`/chevron、44px min-style契約を維持した。`SpendingBarChart`の四半期固有軸は対象外とした。
  - 受入条件: touch tooltip、fine pointer hover、外側タップ、scroll dismiss、legend折りたたみの既存契約が維持される。
  - テスト観点: pointer種別、再タップ、別チャート切替、空payload、モバイル/デスクトップ。
  - 検証結果: 横断契約テスト `tests/components/chart-tooltip-legend-contract.test.tsx` 1 file / 6 tests、既存関連を含む全体53 files / 473 tests passed、`pnpm type-check` 成功、`pnpm lint` 0 errors / 5 existing warnings、Phase 4-1後の関連E2E 128 tests = 112 passed / 16 skipped / 0 failed、production build成功、`git diff --check`成功。
- [x] **4-3（1.5時間目安、完了：実装・監査・検証済み）** 2箇所以上で共有される系列メタデータを型付きregistryへ集約した。`SeriesMetadata`、`EARNINGS_SERIES_REGISTRY`、`COMPARISON_SERIES_REGISTRY` を追加し、Earnings chart/table と NewGraph/比較table が同じregistryを直接共有する構成とした。legacy alias（`EARNINGS_TABLE_CONFIGS` / `LINE_CONFIGS`）はregistryと同一配列を参照する。既存key・label・color・order・advanced・`strokeDasharray` を維持し、GDP raw/comparison系列および`SpendingBarChart`固有系列は対象外のままとした。
  - 受入条件: registryが固有の順序・公開可否を無理に統一せず、主要系列、advanced系列、名目/実質ペア、非公開GDP系列の契約を壊さない。
  - 検証結果: registry test 1 file / 5 tests passed、全体54 files / 478 tests passed、`pnpm type-check` 成功、`pnpm lint` 0 errors / 5 existing warnings、production build 成功、build parity 1 file / 3 tests passed、`git diff --check` 成功。Phase 4-4の実装・監査・検証完了を後続記録で確定した。Phase 4-5以降は未着手。旧来の未着手表現は実装前の履歴である。
- [x] **4-4（1時間、完了：実装・監査・検証済み）** 公開チャートデータ契約とCSV parityを固定し、共通化による差分をfixture比較する。契約が一致しない抽象化は戻すかチャート固有実装へ戻す。
  - 受入条件: 7つのchart/table/CSV対象が同一の正規化表示データを使い、`ChartDataContract` がチャートへ実際に渡す系列キー・期間・値・null/欠損を `data-testid="chart-data-contract"`、`data-series`、`data-points`、子要素の `data-period`、`data-series-key`、`data-value`、`data-value-type` で安定して公開する。Recharts内部SVGのpath/class/geometry/座標は非契約とし、SVGは非空描画と系列可視性のスモーク確認に限る。
  - 受入条件: CSVはRFC4180に従い、最終recordを含む全recordをCRLFで終端し、カンマ・quote・CR/LFのescapeとquoteのround-tripを維持する。独立した手書きfixture `tests/fixtures/chart-parity-independent.json` を実コンポーネント境界で使い、app定数やDOMから期待値を生成しない。
  - テスト責務: unitはCSV serializer edge cases、integrationは独立fixtureによる実コンポーネント境界のmapping、Playwrightはproduction data/sourceと安定selectorで7対象のchart/table/CSVを全行・全列比較し、`hidden`、`adv=1`、nominal/real、GDP境界 `2017年10-12月` / `2018年1-3月` を含める。
  - 境界契約: validated GDP比較値が利用可能な場合、advanced extensionはGDP比較値を優先して`minkanMap`へ渡し、月次展開後に12か月移動平均を計算する。raw正規化品質fixture `tests/fixtures/minkan-extension-anchors.json` は103.44系の証跡に限定し、production-pathのadvanced期待値は独立した凍結入力 `tests/fixtures/chart-parity-advanced.json` から86.44系として算出する。
  - WHEN/THEN: advanced E2Eが実行される WHEN、GDP比較入力から算出した2018年1月・2025年12月の期待値を検証する THEN。nominal/realの区別はヘッダー文字列ではなく、親section、公開`ChartDataContract` key、表の公開ラベル`民間最終消費`で検証する。
  - 検証結果: `pnpm test` 55 files / 486 tests passed、対象Chromium E2E 5/5 passed、`pnpm test:build-parity` 3/3 passed、`pnpm type-check` passed、`pnpm lint` 0 errors / 5 warnings、`pnpm build` passed、`git diff --check` passed。Phase 4-4は実装・監査・検証完了とし、Phase 5-1〜5-2も完了とする。

### Phase 5 — 状態所有者・codemap整理（1〜2時間/件を目安）

対象: `src/hooks/useUrlState.ts`、`src/app/components/CpiChart.tsx`または分割後の状態hook、`src/codemap.md`、関連する `codemap.md`、`tests/unit/useUrlState.test.ts`、関連E2E。

- [x] **5-1（1.5時間目安）** Phase 0の契約表に基づき、期間・系列など各状態の所有者と同期方向を明示する。
  - 受入条件: 現行確認済みの優先順位と既存URL形式・クエリキーを維持し、未確認のURL優先ルールを追加しない。
  - テスト観点: 直リンク、戻る/進む、URL欠損、無効値、既存URLとの互換を `tests/unit/useUrlState.test.ts` に追加した。対象テスト10件を実行して全件成功し、全テスト489件も成功した。`popstate`、URL欠損、無効値については追加挙動を導入せず、追加した契約テストで確認済みである。`pnpm type-check` 成功、`pnpm lint` 成功（警告5件）。
  - 実装記録: `useUrlState`（URL snapshot/read + `replaceState`）、CpiChart（期間・advanced・積み上げ`stackedHiddenKeys`のlive React state）、`useAdvancedPreference`（React state → `newGraphShowAdvanced` 保存）、`useSectionNavigation`（React-only section/scroll state）の所有境界をコードコメント、codemap、OpenSpecへ同期した。通常凡例`hiddenKeys`、移動平均凡例`maHiddenKeys`、nominal/real stateはReact所有である。`popstate`、storage初期復元、URL/storage優先順位、厳格な不正値処理は追加しない方針を維持した。今回、URL欠損時のdefault、`parseInt`由来の非数値・部分数値・範囲外値、既存クエリ保持と`replaceState`、`popstate`後に初回snapshotを再同期しない契約をunit testへ追加した。対象テスト10件・全テスト489件、`pnpm type-check` 成功、`pnpm lint` 成功（警告5件）を確認済み。`popstate`、URL欠損、無効値については追加挙動を導入せず、追加した契約テストで確認済みである。
- [x] **5-2（1.5時間目安、完了：実装・監査・検証済み）** Phase 0で確定したlocalStorageのkey、優先順位、復元対象、保存タイミングに沿って、theme/advanced等の復元、保存、壊れた値への対応を整理する。
  - 受入条件: Phase 0で確認したstorage契約と、URL等の他状態との関係を維持する。未確認の「個人設定のみ」「共有URLを変更しない」といった新ルールを追加しない。
  - テスト観点: SSR、storage unavailable、旧値、URLとstorageの競合、リロード。
  - 文書同期記録（完了・テスト実行済み）: 指定テストから確認できる事実だけを整理した。advancedはURL `adv=1`相当のReact入力を既存localStorage値`0`で上書きせず、URLも書き換えない。`newGraphShowAdvanced`は初期復元せず、unmount/remount（リロード相当）でも復元しない。`showAdvanced`/`startYear`/`endYear`/hidden-key依存の変更で`1`/`0`を保存し、`setItem`例外を無視する。themeは`theme`へ`light`/`dark`を保存し、systemで削除し、`data-theme`を更新する。`setItem`/`removeItem`だけを切替時の`try/catch`で保護し、write failureでもDOM属性とReact表示状態の更新を継続する。未定義のlegacy値は型アサーション後の現行のundefined表示となり、厳格な旧値fallbackは追加・確認していない。storage read例外は初期評価からthrowし、layout inline scriptのpaint前適用とtheme用URL不使用は実装から確認した。これらはadvanced固有のテスト事実であり一般的なURL/storage優先順位は追加していない。対象2 files / 17 tests passed、全体57 files / 506 tests passed、`pnpm type-check` 成功、`pnpm lint` 成功（警告5件）を確認済み。実ブラウザのリロードと`popstate`は未確認のまま残す。
- [x] **5-3（1.5時間目安、完了：文書同期・境界監査済み）** 各変更単位で該当codemapを実装と同期し、Phase 5で `src/codemap.md`、`src/app/codemap.md`、`server/lib/codemap.md` 等の最終整合を確認した。
  - 受入条件: 実在する実装と各codemapの説明が一致し、実在しない状態管理やloader経路の説明を追加しない。ファイル分割でもcomponent tree、data flow、architectureが変わる場合はAGENTSの運用に従いspecも同期する。
  - テスト観点: `rg`による記述と実ファイルの照合、client→server importの不存在確認。
  - 完了記録: API routeは`src/app/api/estat/{stats-list,meta,data}/route.ts`の独立境界であり、各routeは`queryFromRequest`→`server/lib/estat`のtyped operation→`errorResponse`を通る。共通処理は既存の`src/app/api/estat/_shared.ts`と`server/lib/estat.ts`の`fetchEStat`で充足し、`getStatsData`だけがVALUE配列正規化という固有差分を持つため、新規route runner/adapter/API共通関数は抽出しない。dashboard loader facade/SSR/cache/data modelとe-Stat API proxyは分離され、src→server不正importはない。削減量・戻り値影響は0。既存テスト506件、type-check、lintを根拠とし、route JSON専用テストは未実施である。`rg`照合と境界監査を完了した。architecture/data flowは不変のためOpenSpecは更新していない。

### Phase 6 — API共通化の再評価（任意、1〜2時間/件を目安）

対象候補: `src/app/api/`、`server/lib/data-loader/`、既存のAPI route共通処理、関連テスト。

- [x] **6-1（1時間）** Phase 1〜5後にAPI routeとloaderの重複を再調査し、共通化候補・効果・互換性リスクを記録する。
  - 受入条件: 抽出しない判断を含め、変更対象、削減量、戻り値影響、テスト根拠が文書化される。再評価を省略してもPhase 0〜5の基盤整備完了を妨げない。
  - テスト観点: routeごとの入力検証、status、エラーJSON、cache/revalidation、loader呼び出し。
- [ ] **6-2（2時間目安）** 十分な根拠がある場合のみ、1つの小さな共通関数またはadapterを抽出する。根拠が不足する場合はコードを変更せず再評価結果だけを計画/レビュー記録へ残す。
  - 受入条件: APIレスポンス、status、エラー、認証/環境境界、キャッシュ挙動が不変で、不要な汎用フレームワークを導入しない。
  - テスト観点: API integration、production build、既存routeの代表リクエストと異常系。

#### Phase 6 任意再評価記録（6-1完了、6-2未実施）

Phase 1〜5後の任意再評価対象は、e-Statの3 routes（`stats-list`、`meta`、`data`）、`src/app/api/estat/_shared.ts`、`server/lib/estat.ts` の `fetchEStat`、dashboardの `server/lib/dataLoader.ts` facade、およびclient/server math境界とした。既存共通処理は `queryFromRequest`、`errorResponse`、`fetchEStat` で充足している。候補はroute runner/adapterだったが、route固有のinput/status/error/response差分、`getStatsData` のVALUE正規化、SSR/cache/data-model境界があるため、追加抽出の削減見込みは0、戻り値/status/error/cache影響も0と判断し、抽出を見送った。

根拠は既存506 tests、`type-check`、`lint`（警告5）であり、route JSON専用integrationテストは未実施である。`rg`による照合を完了し、src→server不正importなしも確認済みである。OpenSpec/codemapと矛盾する実装事実は追加していない。

6-2は「追加抽出の根拠なし・任意のため実施しない」とし、コード、テスト、テスト実行はいずれも変更・実施しない。この判断はPhase 5完了を損なわず、Phase 0〜5の基盤整備完了を維持する。

## OpenSpec Requirements（Gherkin形式）

### R30: 挙動同値の段階的リファクタリング

#### Scenario R30a: 初期表示と7チャート

- **WHEN** 利用者が既定URLを開く
- **THEN** CPI/CTI/GDPのデータ状態、7チャート、CAGR導線、テーブル、セクション順が現行と同じ意味で表示される

#### Scenario R30b: 状態契約に基づく復元

- **WHEN** 期間または共有対象の系列を含む既存形式のURLを開く
- **THEN** Phase 0で確認した状態ごとの優先順位、key、default、復元タイミング、`popstate` 対応に従って同じ状態を復元する。URL優先などの未確認の新ルールを追加しない

#### Scenario R30c: 状態契約に基づくstorage復元

- **WHEN** URLに共有状態がなく、互換性のあるlocalStorage設定が存在する
- **THEN** Phase 0で確定したkey、優先順位、復元対象、保存タイミングに従って状態を復元し、URL形式とAPIレスポンスを変更しない

#### Scenario R30d: 正常データの変換

- **WHEN** CPI/CTI/GDPの正常fixtureをロードする
- **THEN** 公開エントリポイントの戻り値、系列キー、期間ラベル、数値、欠損表現がリファクタリング前後で一致する

#### Scenario R30e: 異常データの現行契約

- **WHEN** 入力ファイルが欠損、破損、非連続、metadata不整合、または値が不正である
- **THEN** 現行確認済みの検証エラー、fallback、空データ、または公開エラー契約を維持する。新たなfail-closed方針はこのリファクタリングで導入しない

#### Scenario R30f: 純粋計算の環境独立性

- **WHEN** domain/mathの計算関数をserverまたはclientから同じ入力で呼び出す
- **THEN** 同じ決定的な結果を返し、server専用モジュールやブラウザ専用APIへの依存を要求しない

#### Scenario R30g: チャート共通化

- **WHEN** 共通化対象チャートを操作する
- **THEN** 軸、tooltip、legend、series変換、表示順、touch/hover/dismissの既存契約を保ち、固有仕様は失われない

#### Scenario R30h: 変更単位のレビューとロールバック

- **WHEN** 検証済みの前段を前提に、直近の変更単位を適用またはロールバックする
- **THEN** 差分と関連テストをレビューでき、状態key/schemaを変更せず、後続依存がある場合は逆順rollbackまたは修正PRで戻せる。全Phaseを単独適用してビルド可能とは要求しない

## 全体検証ゲート

各変更単位の受入条件を満たしたうえで、差分と対象テストを実行・記録する。Phase完了時は影響範囲のlint/type-check、節目・最終ではproduction build/full test/関連E2Eを実行する。既存warningや環境上実行不能な項目は、原因と代替証跡を記録し、未実行のまま完了扱いにしない。テスト実装はfixer、検証実行はOrchestratorが担当する。

- [x] 挙動同値: `pnpm test` は41 test files / 352 tests passed、`pnpm build` は成功。Playwright E2Eは128件（112 passed / 16 skipped / 0 failed）で、section tabs、`LazyMount`、range変更とURL反映、375px/390px/768px幅を含む既存表示・操作契約を確認済み。
- [x] URL/storage互換: Playwright E2E 128件（112 passed / 16 skipped / 0 failed）でrange/URL反映を含む既存URL契約を確認し、unit/componentを含む全体テストとbuildも成功。`from` / `to` / `hidden` / `adv`、`newGraphShowAdvanced` / `theme`、SSR初期化、既存の保存タイミングを維持している。`popstate` listenerの新設など未確認の新規契約は導入していない。
- [x] データfixture比較（Phase 1-6）: 19 tests passed。CPI/CTI/GDP正常系および異常系、四半期連続性、現行確認済みのfallback/error契約を比較し、監査合格した。
- [x] `pnpm lint`（成功、0 errors / 5 warnings。warningはPhase 0 のサブタスク 0-3監査ゲート実行記録に内訳を記録）。
- [x] `pnpm type-check`（成功）。
- [x] `pnpm test`（全体実行、41 test files / 352 tests passed、12.71s。指定引数がVitestの全体実行として解釈された）。
- [x] integration/production parity（`pnpm build` による `next start` 向けproduction buildを実施済み。production parityの検証ゲート完了）。
- [x] `pnpm build`（成功。Next.js 16.3.1 webpack、静的7ページ生成、API routesのbuild完了）。
- [x] 関連E2E（`pnpm test:e2e -- tests/e2e/section-tabs-scroll.e2e.spec.ts tests/e2e/range-change.e2e.spec.ts tests/e2e/accessibility.e2e.spec.ts`。Playwright configの全project/関連依存を含めRunning 128 tests、112 passed、16 skipped、失敗0。chromium、chromium-dark、mobile-pixel、webkit-tabs-regression。sandbox内のwebServer起動はEPERMのためsandbox外で実行）。
- [x] 375px/390px/768px相当で自動確認済み（Playwright E2E 128件: 112 passed / 16 skipped / 0 failed。LazyMount、section tabs、tooltip等を含む）。ピクセル完全一致ではなく、情報欠落、重なり、操作不能、水平overflowを確認した。
- production parityおよび375px/390px/768px確認を含む既存の検証済みゲートは完了している。データfixture比較もPhase 1-6として19 tests passedで監査合格したため、Phase 0〜1-6およびfixture比較ゲートは完了している。Phase 2-1〜2-5も実装・検証・最終静的監査完了であり、Phase 2-5は関連75 tests passed、全体432 tests passed、type-check成功、lint 0 errors / 5 warningsを記録している。`src/app/api/estat/*`はfacade整理の経路外で、非変更であることを静的確認済みであり、API route経由のJSONテストは実施していない。Phase 3-1はfocused 60 tests passed、全体50 files / 458 tests passed、type-check成功、lint 0 errors / 5 warnings、最終静的監査合格を記録する。Phase 3-2はtype-check、lint（0 errors / 5 warnings）、pnpm test（50 files / 458 tests）、build、build-parity（1 file / 3 tests）、diff-check、依存静的監査を確認済みであり、実装・監査・検証完了として扱う。Phase 2-4の監査実績は関連37 tests / 全416 tests、typecheck成功、lint 0 errors / 5 warnings、最終静的監査合格である。
- [x] tracked差分に対する `git diff --check`（成功）。未追跡ファイルを含む空白検査はOrchestratorが実行済みで、対象は `shared_plan/30-refactoring-foundation-plan.md`、`src/app/components/cpiChartConfig.ts`、`tests/unit/useCpiChartData.test.ts` の3ファイル。各ファイルへの `git diff --no-index --check /dev/null <file>` はstdout/stderrともに空、終了コード1（`/dev/null`との差分によるもので、空白エラーではない）だった。`tests/unit/useUrlState.test.ts` はtracked変更のため未追跡検査対象外。差分レビューおよびcoverage/spec-refsは既存運用に従う。

## リスク / ロールバック

| リスク                      | 予防・検知                               | ロールバック方針                                                                                     |
| --------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 表示順・系列キーの欠落      | Phase 0 fixture、registry/DOM比較        | 直前Phaseの構成定義またはregistry adapterへ戻す                                                      |
| URLとstorageの復元競合      | 既存key/URLの組合せテスト、SSRテスト     | 旧hookを境界adapterとして再接続し、keyを維持する                                                     |
| loaderのfallback/異常系差分 | CSV/metadata異常fixture、公開戻り値比較  | loaderの公開adapterを残し、分割内部だけを戻す                                                        |
| clientからserver依存が残る  | import検索、type-check、production build | domain関数をclient側adapterから再公開し、依存を段階修正する                                          |
| 共通化が固有仕様を吸収する  | チャート別E2E、touch/hover比較           | 共通部品を使用側から外し、元の固有実装へ戻す                                                         |
| Phase間の変更が混ざる       | 変更単位のコミット、差分レビュー         | 直近の変更単位を戻し、後続依存があれば逆順rollbackまたは修正PRとする。他エージェントの変更は保持する |
| build/E2E環境制約           | 実行ログと代替fixtureを記録              | テストを弱体化せず、環境復旧後に再検証する                                                           |

## 仕様書同期

R30はこの計画内の仮IDであり、実装時に既存の要件IDを確認して採番する。

今回の計画作成では `openspec/specs/nextjstest/spec.md` を変更しない。実装時は各Phaseの変更と同時に、同仕様書の以下を実装へ同期する。

判断基準: 外部挙動が不変でも、コンポーネントの追加/削除、構成、依存方向、データフローが変わる場合は、`openspec/specs/nextjstest/spec.md` を同じ変更単位で更新する。説明対象に変更がない場合のみ、更新を省略する理由を記録する。

- **Purpose**: 構成分割後も経済指標ダッシュボードの目的と挙動同値の境界を維持する。
- **Data Model / Data Sources**: データ型・APIレスポンス・loaderの公開契約に変更がないことを明記する。内部型追加時は公開モデルとの境界を追記する。
- **Requirements**: 既存R1〜R20等の該当シナリオに加え、必要なら本計画のR30相当をWHEN/THENで追記する。特にURL同期、legend永続化、データ変換、異常系、tooltip、セクションナビゲーションを実装と一致させる。
- **Architecture / Component Tree**: `CpiChart`をcomposition rootとする構成、分割後のchart/section/state部品、domain/math、loader内部モジュール、依存方向を同期する。
- **Data Flow / State Management**: Phase 0で確定した状態ごとのURL/localStorageの所有者、優先順位、復元・保存・`popstate` の同期方向を図/文章で同期する。確認前にURL優先を新ルールとして記載しない。
- **Non-Goals**: 下記の非ゴールを仕様書のNon-Goals相当へ反映し、リファクタリングで仕様拡張を行わないことを明記する。
- **Test Requirements**: fixture、特性テスト、unit/component、integration、production build、E2E/smokeの対象と実行記録を同期する。

## 非ゴール（Non-goals）

- UI刷新、配色やレイアウトの再設計、ピクセル完全一致の達成。
- URL、localStorage key、APIレスポンス、公開エントリポイントの意図しない変更。
- あらゆるデータ形式を扱う汎用ローダーフレームワークの新設。
- 7チャートを単一チャートや単一巨大rendererへ統合すること。
- リファクタリングと同時に計算式・統計的定義・丸め規則を改善すること。
- plugin、DIコンテナ、repository層などの過剰設計を導入すること。
- API共通化を事前に決め打ちすること。Phase 6で重複と根拠を再評価し、必要な場合だけ小さく抽出する。
- 新しいビジネス要件、データソース、画面、チャート、エクスポート形式を追加すること。

## 着手順の判断

Phase 0のfixture・特性テストが基準結果として安定するまで、構造変更を開始しない。以降はPhase 1→2→3を必須基盤として進め、Phase 4は同一契約を2箇所以上で確認できる場合だけ実施し、Phase 5で最終整合を取る。Phase 6は任意の再評価とする。各変更単位の検証ゲートとレビューを通過した変更だけを次へ渡し、挙動差分が出た場合は直近の安定状態へ戻すか修正PRを作る。
