# Vitest Browser Mode への E2E 移管計画

## 目的

現在 Playwright が担う E2E をケース単位で棚卸しし、Playwright ベースの実ブラウザを使う Vitest Browser Mode に段階的に移す。DOM 状態、操作後の UI、コンポーネントのブラウザ描画など、Next.js の実ページ起動を必要としないシナリオを対象にする。実ページ起動、Next.js Flight / hydration / route 統合、実ダウンロード、実 viewport / layout / 座標 hit-testing、および WebKit 固有動作など、Browser Mode のテストハーネスでは十分に保証できないシナリオは Playwright に残す。

目標は、現行の**active E2E 論理シナリオ全体の過半数**を Browser Mode へ移すこと。実ページ起動・実ブラウザ統合など移管対象外のケースも分母に含める。Phase 0 でこの目標の実現可能性を判定し、過半数を移せる証拠がなければ分母を狭めたり品質境界を弱めたりせず、目標との不一致と必要な判断を可視化する。既存の Playwright アサーションを Vitest に複製して完了扱いにせず、各契約に単一の主担当テストを割り当て、残す Playwright ケースは明示的な統合・実環境 smoke に縮める。

## 既知の記録と計画42からの引き継ぎ

- 計画42の**歴史的ベースライン**は、Playwright 21 spec、604 assertion callsites、122 pass / 19 skip、Playwright 実行約3分42秒（同記録の正式 baseline は 222.48 秒）である。当時の測定値であり、現在の件数・構成を表さない。
- 計画42は全21 specを対象にした assertion callsite ledger と case responsibility matrix を整備し、AST監査で 604 callsites / unresolved 0 を記録した。case matrix の現行行番号は baseline revision 基準であり、本計画の Phase 0 で現行 source に再照合する。
- 計画42で完了した個別移行・重複整理（例: CSV parser edge cases、月境界 tick 契約、plan24 / plan27 / real-consumption fixture 契約、tooltip / aria 状態の一部）は再移行しない。これらは Vitest 側で既に担う責務として記録し、Playwright に残る統合責務だけを候補にする。
- 計画42の Phase 1 / Phase 2 に未完了項目がある。未完了を一括して本計画の Browser Mode 対象と見なさず、Phase 0 で「純粋 unit」「happy-dom component」「Browser Mode component」「Playwright integration」のいずれが契約に適するか再判定する。quarterly GDP のように既存 unit coverage があり、E2E が実 route / download を検証するものは重複テストを増やさず Playwright に残す。
- 参照: [計画42](42-happy-dom-e2e-migration-plan.md)、[assertion callsite ledger](42-assertion-callsite-ledger.md)、[case responsibility matrix](42-assertion-case-responsibility-matrix.md)。

## 移行境界

| 契約                                                                        | 原則担当                     | 判断基準                                                                                                                                                                                                  |
| --------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 計算・変換・データ境界                                                      | 既存または新規の Vitest unit | DOM やブラウザ機能を使わず検証できる。Browser Mode に移すために unit を browser 化しない。                                                                                                                |
| 実ブラウザでのコンポーネント DOM、操作、focus / keyboard event の限定的検証 | Vitest Browser Mode          | Vite のテストページ上でコンポーネントを mount すれば十分で、Next の実 route や server payload は契約でない。Browser Mode の viewport 指定だけで完結するシンプルな visual / style check は個別に評価する。 |
| 実ページ・server/client 境界・実出力                                        | Playwright                   | `next build` / `next start` の実アプリ、Flight payload、hydration、URL / query から画面までの連携、production download / CSV parity が合否条件。                                                          |
| 実配置・幾何・座標・複数ブラウザ                                            | Playwright                   | 実 viewport 内の containment / overflow、scroll-to-view の実配置、SVG / chart geometry、pointer / touch の座標 hit-testing、WebKit 固有挙動が合否条件。                                                   |

Browser Mode のコンポーネント mount は実ブラウザ上の Vite テストページであり、Next.js の production ページを起動した E2E ではない。実ブラウザという共通点だけで Next route 統合を移したことにしない。チャートケースでも、制御 fixture による DOM / 操作契約は候補になり得るが、実 Recharts plot の hit-testing / geometry / route wiring は Playwright の責務とする。

## 進捗率の定義

Phase 0 では、現行 baseline revision の全 Playwright spec と project 設定を対象に、**論理シナリオ**を全数棚卸しする。論理シナリオは、ソース上の test declaration を1件とし、loop / parameterized test が異なる入力値に対して別々の失敗契約を持つ場合は入力ごとに分ける。Chromium / mobile-pixel など project で同じ宣言が重複実行される場合は、同じ契約なら1論理シナリオにまとめ、異なる viewport / color scheme / engine 条件が契約なら別シナリオとして記録する。helper assertion 自体は独立したシナリオにせず、呼出元ケースに割り当てる。

- **分母 A**: baseline Playwright suite の全 active 論理シナリオ数。Browser Mode 適格 / 不適格の両方を含める。現行構成で実行されない skip scenario は A から除外するが、状態・理由を inventory に残して別報告する。project 間で同一契約を重複実行する数え方は全 suite で一貫させる。
- **適格数 E**: A のうち、Phase 0 reviewer が Browser Mode の忠実な代替で検証できると承認したシナリオ数。Next / production 統合を要さず Browser Mode mount で契約を保てるケースを含める。実ページ、Flight / hydration、download、layout / geometry / hit-testing 等を要する不適格ケースは理由を記録し、A から除外しない。
- **分子 M**: E のうち、Playwright の主担当 assertions を削除または責務縮小し、Browser Mode の対応 assertion と独立 reviewer の確認が完了したシナリオ数。比較期間中の二重実行、仮移植、または同一契約を両ランナーが主張するケースは M に含めない。
- **目標**: `M / A > 0.50`。Phase 0 で E / A を算出して実現可能性を検証する。`E / A <= 0.50`、または適格ケースをすべて移しても実質的な過半数に届かない場合、分母を E に置き換えず、対象範囲と要求の不一致を未解決判断として記録する。境界を弱めたり必須 Playwright 保持を削ったりして達成しない。A / E / M と scenario ID 一覧を毎batch記録する。604 assertion callsites や実行 test count を割合の分母に流用しない。
- **保持 inventory**: 不適格な browser-only シナリオと Playwright project-file pairs / 実行 test 数も別に報告する。移管率だけでは browser 保証の維持を判定しない。

## 作業フェーズ

### Phase 0 — 現状 baseline とシナリオ分類

- [x] 現行 revision で `vitest.config.ts`、`playwright.config.ts`、`package.json`、全 Playwright spec、skip / project / loop 条件を確認する。計画42の表と現在の source の差分を記録する。
- [x] baseline の対象 revision を commit SHA で固定し、clean worktree（または未追跡・変更ファイル一覧を保存した同一 checkout）で実行する。Node / pnpm / lockfile、OS / runner、Playwright と browser revision、関連 env / CLI flags、実行コマンド、選択 config / projects、timeout / retry 条件を記録する。production build が必要なら build に使った同一 SHA と build 成否を記録し、build / install は suite 計時から分離する。Playwright 全 suite を通常の `pnpm run test:e2e` で一度実行し、exit code、pass / fail / skip、listed test、project-file pairs、raw output、計時境界と実行時間を保存する。古い値を現行 baseline として転記しない。
- [x] matrix を現行 source に更新し、全 scenario に stable ID、declaration / helper source、入力条件、project / viewport / skip 条件、検出する failure boundary、既存 unit / happy-dom coverage、責任先、移管可否と理由を付ける。
- [x] Browser Mode 移管可能性を case 単位で reviewer が確認し A / E と `E / A` を確定する。曖昧な skip は A と分けて別一覧に残す。実ページ、Flight / hydration、download、viewport / geometry / hit-testing、WebKit 等の必須保持群を明示して実現可能性を評価する。
- [x] 実現可能性ゲートを記録する。`E / A <= 0.50` なら固定した定義の下で `M / A > 0.50` は不可能と判定する。`E / A > 0.50` でも全適格ケースの移管完了見込みを根拠付きで見積もり、過半数達成を保証しない。件数照合、適格性根拠、または保持 inventory の証拠が不足する場合は判定を「未確定」とし、不足証拠・取得担当・次の判定条件を記録する。いずれも分母を狭めず、要求との不一致または未確定として扱い、境界の変更が必要なら移行作業の承認済み前提として扱わない。
- [x] plan42 完了項目と未完了項目を matrix の責任欄から参照し、既存 Vitest 契約と Playwright の重複を洗い出す。
- [x] **受け入れ条件:** 全 spec / project / skip / loop の scenario が説明可能な状態で列挙され、件数照合差分が0。A / E が再計算可能で、各ケースに Browser Mode / Playwright / unit 等の単一主担当が決まっている。baseline の revision・依存・実行条件・計時境界・raw output が再現可能な粒度で保存される。曖昧な skip は実行対象数と分けて報告し、mismatch / unresolved のケースは移行禁止。`M / A > 0.50` の実現可能性判定（または不足証拠を含む未確定判定）と browser-only 群の保持を文書化する。

#### 2026-09-25 実行記録（当時の Phase 0 未完了状態・履歴）

- **基準 revision / checkout:** `6296bac317f5f2899aec8df34c5d1bbb6b37dc24`。実行前の既存状態は ` D results/plan42/current-worktree-status-20260925.txt` と未追跡の Plan45 文書。後者は本記録の対象であり、Plan42 の削除状態は変更していない。
- **環境:** Node `24.19.0`、pnpm `11.9.0`、Ubuntu `26.04.1` x86_64、kernel `7.0.0-34-generic`。lockfile SHA-256 `e10ab5f3ec885be4d31cf777f24d7b1038dbd77b4ad32597ce9afcb8941738e9`。Playwright `1.62.1`、browser revisions: Chromium `1234`、headless_shell `1234`、WebKit `2336`。
- **設定:** Playwright projects は chromium / chromium-dark / mobile-pixel / webkit-tabs-regression の順に `85 / 2 / 43 / 9` listed executions。workers `3`、CI retries `2`（非CI `0`）、test timeout `60s`、webServer timeout `90s`。`reuseExistingServer: false`。
- **Discovery-only:** `pnpm exec playwright test --list` は exit `0`。21 specs、139 project executions（chromium 85、chromium-dark 2、mobile-pixel 43、WebKit 9）を列挙した。これは test discovery であり、pass / fail / skip の baseline 結果ではない。raw output: [fresh Playwright list](../results/plan45/phase0/fresh-playwright-list-20260925.txt)（SHA-256 `60594fd13fdbc10b6e8029de53b099827cc3ffad987e0c8b213b6b58c9906b06`）。
- **spec 別 discovery 件数:** accessibility `13` (chromium 11, chromium-dark 2); advanced-series `2`; cagr-sheet `9`; chart-table-csv-parity `3`; consumption-boundary `2`; consumption-mobile-acceptance `6`; consumption-mobile-readability `9`; cpi-chart-categories `3`; earnings-tooltip-total `2`; legend-color-sync `3`; mobile-ux `13`; monthly-boundary-axis `2`; plan24-rendering `2`; plan27-private-consumption `2`; quarterly-gdp `1`; range-change `11`; real-consumption `7`; section-tabs-scroll `18` (chromium 9, WebKit 9); spending-filter `2`; tooltip-dismiss `26` (chromium 13, mobile-pixel 13); tooltip-stack-total `3`。これは project ごとの列挙数で、論理 scenario 数ではない。
- **Canonical baseline の先行失敗（履歴）:** 最初の `pnpm run test:e2e` は exit `1`、2.60 秒で suite/test 実行前に停止した。`127.0.0.1:3100` が使用中で起動元/PID を特定できず、`reuseExistingServer: false` のため別プロセスを停止しなかった。raw output: [canonical baseline attempt](../results/plan45/phase0/test-e2e-baseline-20260925.log)。この失敗は後続の同一 canonical command 成功で解消され、baseline 未取得という当時の結論は superseded。
- **不完全な先行試行:** `pnpm test:e2e -- --list` は CLI 引数が意図した形で渡らず、一時的に E2E を約30秒起動した後に停止された。完了した baseline ではなく、永続 raw log もないため件数・結果には算入しない。
- **シナリオ分類の暫定値（superseded）:** 初回レビュー時点では `A=112 provisional (33+79)`、`E=1 known`、`4 unresolved`、`M=0` と記録した。後続の project / loop reconciliation と case-by-case eligibility review により置き換えられた。旧数値は確定値として使わない。
- **当時の未完了 / blockers（superseded）:** 初回記録には baseline 再取得、skip・project・loop 照合などを blocker とした。以下の完了記録にある再実行と inventory で解決済み。Plan42 の `139 listed / 120 pass / 19 skipped` は歴史的値であり、本計画の baseline 根拠にはしない。
- **次の再開条件（superseded）:** port 3100 が空いた実行枠で canonical command を再実行する、という当時の条件は後続 baseline 成功で満たされた。後続の最終ゲート判断は以下を参照。
- **JEV v3 plan review:** response validation `valid=true`; confidence `0.32`, passProbability `0.41`; distribution `valid_as_defined 0.41 / missing_prerequisites_info 0.35 / incomplete_implementation_info 0.20 / other 0.03 / implementation_issue 0.01 / indeterminate 0 / requirements_mismatch 0 / scope_violation 0`. Diagnosis `complete` (status `complete`), finding details none returned; `followUpRecommended=false`, clarificationなし。これは計画記録のみのレビューであり、未取得の E2E baseline を補完・代替しない。artifact: [request](../results/plan45/phase0/jev-initial-request.json), [result](../results/plan45/phase0/jev-initial-result.json)。
- **JEV v3 revalidation / one automatic clarification:** 初回応答 validation `valid=true`、選択 `missing_prerequisites_info`、confidence `0.45`、passProbability `0.21`; distribution `missing_prerequisites_info 0.53 / implementation_issue 0.04 / incomplete_implementation_info 0.18 / other 0.02 / requirements_mismatch 0.01 / valid_as_defined 0.21 / indeterminate 0.01 / scope_violation 0`。case-specific reason なし、affected / evidence / proposedFix / neededEvidence はすべて null、`diagnosisStatus=incomplete`、`followUpRecommended=true`。許可された自動更問は `collect_evidence_without_changes`（confidence `1`, probability `1`）を選択したが、finding、affected、evidence または neededEvidence、nextAction または proposedFix、remainingUncertainty が欠落。更問 response schema validation は valid だが `resolution=unresolved`、`diagnosisStatus=incomplete`、`unresolvedReasons` はこれらの欠落を列挙し、`effectiveVerdict` は正確に `requires_revalidation`。これは1回限りの更問であり、連鎖せず、合格とは扱わない。artifact: [request](../results/plan45/phase0/jev-revalidation-request.json), [result](../results/plan45/phase0/jev-revalidation-result.json)。
- **2026-09-25 read-only census reconciliation（当時の暫定結論、superseded）:** 保存済み `--list` は139 project rows / 21 specs。固定 accessibility skip 6、tooltip project-guard skip 13、assertion のない mobile-ux `#211` を除いた119は project dedupe / runtime skip 前の上限であり、正確な logical A と feasibility は当時未確定とした。後続の scenario inventory で A を確定し、下記の baseline と gate decision で置き換えた。元の raw listing と SHA-256 は上記 Discovery-only を参照。
- **JEV v3 census review:** response validation `valid=true`; choice `valid_as_defined`, confidence `0.66`, passProbability `0.70`; distribution `valid_as_defined 0.70 / missing_prerequisites_info 0.27 / other 0.01 / indeterminate 0.01 / incomplete_implementation_info 0.01 / requirements_mismatch 0 / implementation_issue 0 / scope_violation 0`. Reason `null`; diagnosis `complete`; automatic clarificationなし (`followUpRecommended=false`)。JEV の plan-validity 判定は合格だが、対象 feasibility gate は A と fresh baseline が未解決のため引き続き `undetermined`。このレビューは Phase 0 を完了扱いにせず、Phase 1 も開始扱いにしない。artifact: [request](../results/plan45/phase0/jev-census-review-request.json), [result](../results/plan45/phase0/jev-census-review-result.json)。

#### Phase 0 完了記録・最終 feasibility gate（2026-09-25）

- **Canonical same-SHA build + baseline:** source commit `876880158d5a942926c192395edee7d9856a7e71` で `pnpm run build` (exit `0`; emitted `next build --webpack`) を完了後、同じ source revision で `pnpm run test:e2e` (exit `0`) を実行した。`.next/BUILD_ID` は [`production-build-id-20260925.txt`](../results/plan45/phase0/production-build-id-20260925.txt) に記録された `i19UhhqsK4IGeNgenzwbj`、BUILD_ID file SHA-256 は `f5b1541467aa7f095d04737001bf0749831753ef0b59d568cacdd780d12839ab`。Build elapsed `28.35s`; E2E は139 listed project execution rows、120 passed、19 skipped、0 failed、Playwright reported `3.6m`、outer elapsed `219.85s`。Build/E2E は別々に計時し、workers `3`。証跡: [production build evidence](../results/plan45/phase0/production-build-evidence-20260925.md)、[build raw log](../results/plan45/phase0/production-build-same-sha-20260925.log) (SHA-256 `d50b4b83627e02dad844caec2727c36c5705b78d5c1fe97282666d394272e892`)、[build elapsed file](../results/plan45/phase0/production-build-same-sha-20260925.time.txt) (SHA-256 `101d3d3e4081222e6a8f18a64e1ced5fa3cb6d7526ee7950d28e79b649c97840`)、[E2E raw log](../results/plan45/phase0/test-e2e-same-sha-20260925.log) (SHA-256 `9b00520561a0b543c669dd66600256167d4f529e598acae2a680a13c67be9533`)、[E2E elapsed file](../results/plan45/phase0/test-e2e-same-sha-20260925.time.txt) (SHA-256 `5dbe138a90f1ab9680b600fcf21b3b13d8baac73e1cfe1ba94778af23d4620d9`)。
- **Previous successful run superseded:** the earlier `pnpm run test:e2e` result (`218.70s`, 120 passed / 19 skipped / 0 failed) remains archived at [prior raw log](../results/plan45/phase0/test-e2e-baseline-complete-20260925.log), SHA-256 `8d0e1208976a25d50c6cdc3237e74c3075c188878a236bd8684423f2eb770493`, but its same-SHA production build provenance was not established. It is historical evidence, not the canonical reproducible baseline. The initial port-3100 failure remains documented above.
- **Environment / checkout:** Node `24.19.0`, pnpm `11.9.0`, Ubuntu `26.04.1` x86_64, kernel `7.0.0-34-generic`, lockfile SHA-256 `e10ab5f3ec885be4d31cf777f24d7b1038dbd77b4ad32597ce9afcb8941738e9`, Playwright `1.62.1`, browser revisions Chromium `1234`, headless_shell `1234`, WebKit `2336`; projects chromium / chromium-dark / mobile-pixel / webkit-tabs-regression; workers `3`, CI retries `2` / non-CI retries `0`, test timeout `60s`, webServer timeout `90s`, `reuseExistingServer: false`. Build log identifies `.env.local`; values are intentionally not reproduced, and runner identity / other environment variables are unknown. The pre-existing Plan42 deletion `D results/plan42/current-worktree-status-20260925.txt` remained untouched; Plan45 document-only changes did not alter application inputs.
- **Skip / project / loop reconciliation:** 19 skips は accessibility の固定 skip 6件と tooltip-dismiss の guarded duplicate project copies 13件で全件照合された。range-change の5 runtime guards はすべて baseline で通過。active identical-contract project duplicates は0。chart-table-csv-parity の1 execution row にある5個の異なる contract inputs は5 logical scenarios として数える。`mobile-ux#211` は substantive assertion がないため A から除外。
- **Stable-ID inventory / Plan42 crosswalk / census:** [scenario inventory (A=123)](../results/plan45/phase0/scenario-inventory.md#active-logical-scenario-rows-a123)、[fresh Playwright listing](../results/plan45/phase0/fresh-playwright-list-20260925.txt)、[Plan42 per-row crosswalk and delta notes](../results/plan45/phase0/scenario-inventory.md#crosswalk-notes-and-sources)、[per-spec project execution census](../results/plan45/phase0/scenario-inventory.md#per-spec-project-execution-census)、[exclusion reconciliation](../results/plan45/phase0/scenario-inventory.md#excluded--not-counted-in-a) が全 active contracts、Plan42 callsite IDs / delta、loop/project reconciliation と除外を記録する。Batch A 33、Batch B 90、合計 `A=123`。inventory は Plan42 Phase 1/2 が全体として未完了のままであることを明記しており、Plan45 の Phase 0 完了は Plan42 全体の完了を意味しない。
- **先行 internal eligibility assessment (historical, superseded for the separate API audit):** inventory reviewer の評価は `E=1 confirmed yes, 5 unresolved, 117 no`、`Emax=6`、`M=0`、`Emax/A=6/123≈4.9%` と記録した。この評価・理由は上書きせず履歴として保持する。以下の direct SystemOne row-level API audit は別の情報源・判定結果として記録し、後続の feasibility readout に使う。
- **Independent direct SystemOne row-level eligibility audit (2026-09-25):** 公式 API schema に従い、各 stable ID ごとに現在の source assertion と条件の証拠を提示して選択判定を依頼した。prior eligibility labels / rationales は request input に含めていない。監査側の独立検証では123 unique IDsすべてがちょうど1回回答され、missing / duplicate / unexpected / invalid IDs は各0、6 corrected batch responses は HTTP 200。初期の schema-invalid HTTP 422 batch requests/responses は別途保持し、集計から除外した。Top choice は `eligible=27, not_eligible=96, unresolved=0`、すなわち `27/123=21.95%`。厳密な目標 `M/A > 0.50` には62件必要なため、この分類での上限も gate 未満である。現時点の実移管数は `M=0`。
- **Probability diagnostic (not a confirmed case count):** choice probability mass の expected counts は `eligible=33.52 (27.25%), not_eligible=81.31, unresolved=8.16` (丸め後合計 `122.99`)、平均 confidence `0.6468`、最低 `0.14`。この分布は不確実性を示す診断値であり、top-choice の row count や確定 eligibility 数の代用にはしない。選択応答には保証された自由記述の rationale がないため、row-level classes は SystemOne の選択として扱い、説明文による証明とは扱わない。
- **Audit artifacts / schema:** [derived row-level audit report](../results/plan45/phase0/jev-api-eligibility-audit-derived.md) (SHA-256 `4feff3816e720f858aa2b6d53ce9cb07fd042143bac1bf469058cfae5787910c`); [batch manifest](../results/plan45/phase0/jev-api-eligibility-audit-sha256.txt) (SHA-256 `49100c6326f042320b587b65aed01239a921ba9b1a5bc68b338682b9d3c1b75f`). Official references: [SystemOne API documentation](https://docs.typesafe.ai/api) and [OpenAPI schema](https://api.typesafe.ai/openapi.json). Initial schema-validation failures were HTTP 422 and produced no classifications; only corrected HTTP 200 choices contribute to the result.
- **Current feasibility gate / Phase 0 status:** the direct API audit gives `Emax/A=27/123=21.95%`, still below 50%; at least62 cases would be required for `M/A>0.50`. Therefore Phase 0 is complete with a **stop under the current boundary**, and Phase 1 remains not started. This is a feasibility result for the fixed scope, not a claim about all possible scopes. No unresolved historical assessment is silently recast as eligible, and no scope or quality boundary is changed.
- **Phase 0 completion:** six Phase 0 checklist items and acceptance criteria are complete based on the same-SHA build/E2E records, source-level inventory, Plan42 crosswalk, project census, direct API audit and the gate calculation above. Plan42 Phase 1/2 global incompletion remains separate; Plan45 Phase 0 completion does not change Plan42 status.
- **JEV close review — oversized request attempts:** the oversized [`jev-phase0-close-request.json`](../results/plan45/phase0/jev-phase0-close-request.json) received HTTP 400 `max_tokens_exceeded` twice. No valid result, clarification, or verdict was produced from those attempts; they are transport failures, not review decisions.
- **JEV close review — compact regular initial v3:** after compacting the review context, response validation passed and the initial verdict was `valid_as_defined`, confidence `0.91`, passProbability `0.93`; distribution: `valid_as_defined 0.93 / implementation_issue 0.05 / requirements_mismatch 0.01 / missing_prerequisites_info 0.01 / incomplete_implementation_info 0 / scope_violation 0 / other 0 / indeterminate 0`. No clarification was recommended or run. Artifacts: [request](../results/plan45/phase0/jev-phase0-compact-request.json) (SHA-256 `3b80f929c230b3fc7d0f7f752f2a556a35701aba975727d26643bdf792fa3df6`), [result](../results/plan45/phase0/jev-phase0-compact-result.json) (SHA-256 `b1c40b868a89170e4a41af733e2ee4b77c614b91caed980cda256bf83a43f0f8`). This plan-validity review is separate from the row-level eligibility audit below; its accompanying `4.9%` note records the then-current internal assessment, superseded for eligibility counts by the direct audit. The stop decision remains the same. Earlier JEV artifacts and their historical findings remain preserved.

### Phase 1 — Browser Mode 設定 spike

- [ ] 既定の Vitest happy-dom / unit 実行を維持しつつ、Browser Mode を独立 config または明示的 Vitest project として分離する案を spike する。既存 `vitest.config.ts` は現在 happy-dom を既定とし `tests/e2e/**` を除外しているため、既存の `pnpm test` が意図せずブラウザを起動しないことを確認する。
- [ ] Browser Mode 実行には公式手順に従い `@vitest/browser-playwright` を設定し、browser provider、`enabled: true`、明示的な browser instance、headless / CI 起動を構成する。Playwright 本体は既存依存だが Browser Mode provider は現行 `package.json` にないため、依存・lockfile変更は spike 成功後の実装提案に含める。
- [ ] 1つの実候補 client component を Vite の Browser Mode page に mount する spike を行い、依存 import graph、必要 prop / provider、操作と観測する契約、fixture が production route から失う保証を記録する。合成 fixture だけでなく、移行候補から実 component を選び、既存 component / happy-dom test と異なる実ブラウザ上の追加保証を示す。
- [ ] 選んだ component の Next 固有 import を境界ごとに列挙する（例: `next/navigation`、`next/image`、server-only module、server component、route handler）。直接利用できる / adapter または明示 mock が必要 / Browser Mode 対象外、のいずれかを根拠付きで分類する。Next server-only module、server component、route handler を Vite のテストページから直接 import する構成にしない。mock / adapter で Next 統合契約を検証したことにしない。
- [ ] 1つの候補 fixture で Chromium 起動、render、入力操作、失敗診断、並列実行を試し、cold startup / warm run の時間を記録する。失敗時の trace / screenshot 等の有用性も確認する。
- **受け入れ条件:** unit / happy-dom 実行との選別が衝突せず、CI で安定してブラウザが起動し、実候補 component の import 境界・操作・診断を再現できる。mock によって消える保証と残る保証が明示され、spike で見つかった制約と所要時間を本計画の実装判断記録へ追記する。

### Phase 2 — test harness / CI 基盤

- [ ] React コンポーネントの共通 render / cleanup / fixture helper を用意し、各シナリオが独立に mount して後片付けする。Recharts mock 使用時は保証が props / DOM に限定されることを test 名と台帳に明示する。
- [ ] Browser Mode テストでは `userEvent`、`page` / locator、`expect.element(...)` を `vitest/browser` から使う方針と async assertion 規約を整備する。既存 `@testing-library/user-event` の simulator をそのまま持ち込まず、locator / `userEvent` が対象 provider 上で実際に動くことを spike で確かめる。
- [ ] setup、browser install/cache、headless launch、worker数・file parallelism、timeout、artifact、retry と CI job を整える。最初は並列度を保守的に設定し、測定後に変更する。
- [ ] テスト間隔離は**テストファイル単位**であり、Playwright Test のように各 test ごとに新しい page/context が作られる前提を置かない。各 test は reset / rerender / cleanup を明示し、cookie / localStorage / mock state を共有しない。
- [ ] Browser Mode は native ESM を使うため、import namespace に直接 `vi.spyOn` を適用できない。必要時は対応可能な `vi.mock(..., { spy: true })`、依存注入、公開関数などを使う。blocking `alert` / `confirm` / `print` はネイティブに待ち受けられないため、契約に必要な場合は Playwright 側に残すか API を明示 mock する。
- **受け入れ条件:** CI 上で unit + happy-dom と Browser Mode を明示的に選択して実行できる。テストファイル間の環境 / 状態漏れがなく、起動費用を含む時間を測れる。

### Phase 3 — 小さな移管 batch

- [ ] Phase 0 で承認された Browser Mode 候補のうち、制御しやすい aria / 表示 / 操作後 DOM ケースから1〜3 scenario の batch を選ぶ。Plan42 の未完了候補（例えば advanced series、range controls、CAGR sheet、filter / tooltip 状態）のみから選び、既に責務が unit / component test にあるケースは重複させない。
- [ ] scenario ごとに移行前 assertion ID → 新 test assertion → 残す Playwright assertion の対応を記録する。Browser Mode 側の代替が green になるまで既存 E2E assertion を消さず、その後に重複範囲だけ削る。
- [ ] 実データ・実 component prop のどちらが必要か明記する。Browser Mode の render test が既存 happy-dom test と同じ契約を単に反復するなら移行しない。
- **受け入れ条件:** batch 内全 assertion に一対一の責任先があり、A / E / M の更新後も Playwright の必須 browser-only 保証が残る。独立 review と focused verification が終わるまで次 batch を開始しない。

### Phase 4 — 段階 batch 拡大

- [ ] Batch 1 の安定性・実行時間・重複差分を review 後、残る適格 scenario を契約グループごとに小分けして移す。ARIA / state、component rendering、controlled interaction のような境界を混ぜない。
- [ ] batch ごとに同一シナリオIDの Playwright caseを移す。spec ファイル全体を一括で Browser Mode に置き換えず、mixed spec は移した責務の分だけ縮める。
- [ ] Batch ごとに対応 ledger / matrix、Vitest Browser assertion、Playwright の維持理由を更新する。ユニットテストに存在する契約を Browser Mode で再度検証する場合、Browser Mode が加える実ブラウザ固有の追加保証を特定できなければ重複として候補から外す。
- **受け入れ条件:** 各 batch 後に `M / A` が再計算でき、移管済み主担当重複が0、browser-only 保証の欠落0。最終的に `M / A > 0.50` を満たす。不達見込みなら根拠と要求との不一致を記録し、必須 Playwright ケースを無理に移さない。

### Phase 5 — 並行比較、cutover と Playwright 残置 inventory

- [ ] cutover 前の比較期間は両ランナーで移管ケースを一時的に実行し、scenario ID 単位で結果を照合する。二重実行は比較期間のみ許可し、結果一致・skip条件・テストデータ境界が確認された時点で Browser Mode を主担当、Playwright を縮小 smoke または完全除去に切り替える。
- [ ] Playwright 残置リストを全件記録する。少なくとも実ページ起動、Next Flight / hydration / URL route integration、実 download / production CSV parity、viewport / layout / SVG geometry / coordinate hit-testing、scroll / touch、WebKit 固有 regression、実 browser CSS / computed-style 契約を該当ケース付きで説明する。
- [ ] Browser Mode と Playwright の併存中も、同一契約を両方で永続的に繰り返さない。片方の smoke を残す場合は確認する統合境界を明確にし、Browser Mode との assertion 重複と区別する。
- [ ] Playwright assertion / case を削除できるのは、scenario ID と assertion ID の対応、代替テストの green 結果、同一 failure boundary を検証する証拠、既存 unit / component coverage との重複確認、および独立 reviewer の承認を記録した場合に限る。縮小するケースでは削除 assertion と残す integration assertion を対応づけ、代替で証明できない保証を Playwright に残す。移管不能理由の解消だけを理由に case を削除せず、残置 inventory の統合境界が別テストでカバーされる証拠を示す。
- **受け入れ条件:** 切替後の主担当は1契約につき1つ。全ての残置 Playwright ケースに現行 inventory と retention reason がある。全移管シナリオで skip / project 実行範囲を照合する。

### Phase 6 — CI/runtime / flake metrics と運用受入

- [ ] Browser Mode の cold startup、warm startup、test body、total runtime を分け、suite / worker 数と併せて同条件の複数 CI run で記録する。Playwright suite の旧約3分42秒は歴史値としてのみ示し、実行条件・suite 構成が異なる単発値同士から性能改善の因果を主張しない。
- [ ] retry 回数、初回失敗・retry pass、最終失敗、起動失敗、timeout、skip、flaky rate を Browser Mode / Playwright 別に記録する。retry 成功を安定成功として数えず、原因を修正または残置理由として分類する。
- [ ] CI 上の全品質ゲートと対象inventory、baseline / candidate revision、Node / pnpm / browser provider version、install / build 境界、時間計測境界を保存する。
- **受け入れ条件:** `M / A > 0.50`、移行 contract の assertion coverage が complete、必須 Playwright inventory が実行される。Browser Mode の startup / runtime / flake の比較可能な記録があり、許容値を外れる失敗が未解決でない。所要時間の削減値は必須条件にせず、品質・安定性・運用コストを併記する。境界上達成できない場合は根拠と要求との不一致を最終記録に残す。

## テクニカルキーポイント

以下は実装・受入時に確認するチェックリストであり、spike 前に成立済みと見なさない。未対応項目は blocker / workaround / 対象外を記録し、保証境界が変わる場合は対象 scenario の適格性を再判定する。

- [ ] **設定分離:** Browser Mode 専用 config または明示 Vitest project を用意し、通常の unit / happy-dom config と test include / exclude、setup、CLI command を分離する。通常の `pnpm test` がブラウザを起動しないこと、既存 happy-dom suite の選択が変わらないことを確認する。
- [ ] **provider と version compatibility:** `@vitest/browser-playwright`、Vitest、Vite、React plugin、Playwright、Node の実際のバージョンを lockfile 上で記録し、公式の互換性・設定に照合する。provider を明示し、browser `enabled` / `instances`、headless 起動、Playwright browser binary の install revision を固定する。provider install と browser binary install / cache restore を区別し、CI とローカルで同一 revision が使われることを確認する。
- [ ] **実 component / Next 境界:** 合成 fixture ではなく移行候補の client component を mount し、import graph と Next 固有 API の扱いを記録する。adapter / mock を使う場合は偽装する範囲と失われる Next 統合保証を列記する。server component、server-only import、route handler、Flight / hydration は production Next 経路を必要とするため Browser Mode 合格の根拠にしない。
- [ ] **page / context 隔離と cleanup:** provider の実際の file 単位 page / context と test case 間共有条件を spike で確認する。各 test で mount / unmount と DOM cleanup を行い、cookie、localStorage、timer、event listener、mock state、module state、portal、network stub の reset 所有者を決める。順序依存・並列依存を検出し、テスト後も次 test の初期状態が一定であることを確認する。
- [ ] **操作 / async:** `vitest/browser` の `page` / locator、Browser Mode `userEvent`、`expect.element` を実 provider 上で確認する。外部 simulator との混在可否、async assertion / wait の timeout、失敗時 locator 診断を定める。
- [ ] **native ESM mock 制約:** ブラウザの native ESM namespace に対する通常の `vi.spyOn` 可否を前提にしない。`vi.mock(..., { spy: true })`、依存注入、境界 adapter のどれを使うかを対象 module 単位で確認する。mock が実契約を置き換えないことも記録する。
- [ ] **dialogs:** alert / confirm / prompt / print 等の blocking dialog が必要なケースを棚卸しする。Browser Mode の mock 動作で実ブラウザ dialog を検証したと扱わず、Playwright に残すか、アプリ側の明示的な注入境界を検証するかをケースごとに決める。
- [ ] **CI / artifact:** provider と browser binary の install/cache、headless launch、OS依存、worker / file parallelism、timeout / retry を明示する。失敗時に test output、trace または screenshot、browser console / page error、revision・version・実行条件が保存されるかを spike し、artifact retention と upload 条件を定義する。retry pass は初回 flake として残す。
- [ ] **計測と対象境界:** cold / warm startup、test body、suite 合計を同じ revision / runner / suite で測る。Browser Mode の viewport / screenshot は Vite test page 上の観測に限定し、production Next route の layout、download、WebKit、座標 hit-testing の保証として数えない。

Browser Mode は happy-dom / jsdom よりブラウザの DOM・CSS・event behavior に近い保証を提供する一方、standalone E2E runner の置換ではない。provider と browser 起動の初期化費用は、ファイル粒度と並列度を決める前に測る。Playwright provider は file ごとに page / context を使うため、test case ごとの隔離を前提にせず harness で cleanup する。

公式一次資料:

- [Vitest Browser Mode guide](https://vitest.dev/guide/browser/)
- [Why Browser Mode (利点と初期化コスト)](https://vitest.dev/guide/browser/why)
- [Configuring Playwright provider (provider、file 単位 page/context)](https://vitest.dev/config/browser/playwright)

## リスクと対策

| リスク                                                                     | 対策                                                                                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser Mode の page/context を Playwright Test の test 単位隔離と誤解する | file 内 state bleed を許容せず、明示 cleanup と test-order independence を検証する。                                                        |
| Browser Mode の実ブラウザを Next.js production E2E と混同する              | 全 scenario に統合境界を記録し、Flight / hydration / route / download は Playwright を残す。                                                |
| native ESM spy / blocking dialog の制約で既存テストを書き換えられない      | 対応可能な spy / DI / mock をspikeし、native dialog自体の保証はPlaywrightに保つ。                                                           |
| Browser startup が多く、E2Eより遅くなる・不安定になる                      | cold / warm 起動、file 数、worker、retry / flake を測る。細分化しすぎず、CI上で費用対効果を見てbatchを継続する。                            |
| Browser Mode に移した後も同一契約を2箇所で保守する                         | assertion ledger の移行先・残置先を reviewer が照合し、主担当の重複を0にしてから cutover する。                                             |
| Playwright を減らした結果、実ページ上の不具合を見逃す                      | retention inventory、実 route smoke、全行 CSV parity、実 viewport / geometry / download、WebKit regression の現行範囲を受入ゲートに含める。 |
| baseline / candidate の実行件数・環境が異なり時間比較が誤解を招く          | 現行 baseline を再測定し、同じ suite / 条件 / timer boundary で記録。時間は参考値、scenario coverage と flake が別ゲート。                  |

## 依存関係

1. 計画42の ledger / matrix と現行の Vitest / Playwright 設定を Phase 0 の入力にする。
2. Phase 0 の完全な scenario inventory と reviewer 判定が揃うまで候補 assertion を削除しない。
3. Phase 1 spike の provider / browser startup / component mount の成功後に、Browser Mode provider 依存と設定を追加する。
4. Phase 2 harness / CI が使える状態になってから小規模移行を行う。
5. Batch review と比較結果を経て cutover し、最終 runtime / flake 受入を行う。

## 初回 JEV plan_validity レビュー

- 実施方法: `skills/jev-review/SKILL.md` の v3 single-distribution 初回レビュー手順。レビュー本文には計画と必要な根拠だけを含め、認証情報は含めない。
- 初回結果: API transport success、応答検証 valid。JEV は `indeterminate`（不合格）、confidence 0.84、`valid_as_defined` passProbability 0.02。確率分布は `valid_as_defined` 0.02 / `requirements_mismatch` 0 / `missing_prerequisites_info` 0.05 / `incomplete_implementation_info` 0.07 / `implementation_issue` 0 / `scope_violation` 0 / `other` 0 / `indeterminate` 0.86。
- 初回診断: 不完全。case-specific finding / affected location / evidence / needed evidence は応答に含まれず、特定の計画欠陥は示されなかった。
- 自動更問: 実施済み（新規 v3 の初回有効な非合格に対する1回限り）。選択は `collect_evidence_without_changes`、confidence 1.0。応答検証は valid だが finding、affected location、observed evidence または exact neededEvidence、concrete nextAction / proposedFix、remainingUncertainty の全項目を欠くため `resolution: unresolved` / `diagnosisStatus: incomplete`。effective verdict は `requires_revalidation`。更問は連鎖させない。
- 修正点: 要件に対する case-specific finding と根拠が提示されなかったため、JEV 判定を受けて計画本文を変更していない。過半数の分母を全 active scenario とする親依頼の明確化はレビュー依頼作成前に反映済み。
- 未確定点: JEV はこの計画を合格と判定しておらず、必要な追加証拠も特定していない。追加証拠を得るか計画の次の実質修正を行った後に通常の初回 JEV 判定を再実行する必要がある。この未解決状態を承認として扱わない。
- 記録 artifact: `/tmp/plan45-jevr-request.json`、`/tmp/plan45-jevr-result.json`。レビューの raw response には認証情報を含めていない。

## polish 後 JEV plan_validity レビュー

- 実施方法: polish 後の計画に対する v3 single-distribution の初回 `plan_validity` レビュー。API transport は成功し、応答検証も valid。
- 結果: `valid_as_defined`、confidence 0.97、passProbability 0.98。確率分布は `valid_as_defined` 0.98 / `incomplete_implementation_info` 0.01 / `indeterminate` 0.01 / `requirements_mismatch` 0 / `missing_prerequisites_info` 0 / `implementation_issue` 0 / `scope_violation` 0 / `other` 0。
- 自動更問: 初回判定が有効な合格のため実施なし。
- 解釈: このレビューは計画文面に対する補助的な妥当性評価であり、実装の検証やテスト、型チェック、lint などの品質ゲートを代替しない。先行する初回レビューと未解決の記録は変更せず保持する。
- 記録 artifact: `/tmp/plan45-polish-jev-request.json`、`/tmp/plan45-polish-jev-result.json`。
