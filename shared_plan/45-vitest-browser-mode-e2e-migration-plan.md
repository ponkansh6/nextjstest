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
- **先行 internal eligibility assessment (historical):** inventory reviewer の評価は `E=1 confirmed yes, 5 unresolved, 117 no`、`Emax=6`、`M=0`、`Emax/A=6/123≈4.9%` と記録した。この評価・理由は上書きせず、初期の内部判定履歴として保持する。
- **First direct SystemOne row audit (historical stage 1):** 公式 API schema に従い、123 stable IDs を一件ずつ判定した結果は top-choice `eligible=27, not_eligible=96, unresolved=0` (`27/123=21.95%`) だった。prior eligibility labels / rationales は入力に含めなかった。初期 schema-invalid HTTP 422 batches は別記録・集計対象外。後続の全件再評価により、この件数は履歴として保持し、現在の readout には使わない。
- **Historical stage-1 probability diagnostic (not a confirmed case count; superseded for the current decision by the full-scope reassessment):** choice probability mass の expected counts は `eligible=33.52 (27.25%), not_eligible=81.31, unresolved=8.16` (丸め後合計 `122.99`)、平均 confidence `0.6468`、最低 `0.14`。この分布は不確実性を示す診断値であり、top-choice の row count や確定 eligibility 数の代用にはしない。選択応答には保証された自由記述の rationale がないため、row-level classes は SystemOne の選択として扱い、説明文による証明とは扱わない。
- **Reason follow-up audit of the 96 prior `not_eligible` rows (2026-09-25):** 対象は初回 direct API audit で top-choice `not_eligible` だった96 stable IDsのみ。事前定義した理由カテゴリを使い、各行の実際の source assertion / condition evidence を入力したが、prior reason labels は送っていない。8 batch responses はすべて HTTP 200。independent validation は96 requested / 96 distinct answered、gap / duplicate / unexpected / invalid choice は0。manifest の17 entriesはすべて hash 検証に通過した。SystemOne categorical selections は `real_layout_geometry_or_coordinate_hit_test=63`、`nextjs_or_production_integration=7`、`engine_specific_behavior=1`、`actually_eligible=25`。その他すべての理由選択は0。API response に保証された free-text rationale はないため、これらは監査側の分類選択であり説明的な証明とは扱わない。`actually_eligible` の25件を再分類すると、初回 eligible 27件をそのまま維持する**条件付き**合計は `eligible=52, not_eligible=71, unresolved=0`、`52/123=42.28%`。初回 eligible 27件は理由 follow-up では再監査されていない。したがってこの結合値も厳密な62件必要数を下回り、Phase 1 は未開始のままとする。証跡: [derived reason audit](../results/plan45/phase0/jev-api-noteligible-reason-derived.md) (SHA-256 `7013c09d5fcbfd1bbc4fed2c377455b1a438605193d3d6f85150f89b9e8213bb`)、[reason-audit manifest](../results/plan45/phase0/jev-api-noteligible-reason-sha256.txt) (SHA-256 `bae9c3f0de919d6e73d317cad71e03e06adfd4e20aee2621d15633f6b3db2d94`)。
- **Full-scope direct TypeSafe API reassessment (current Phase 0 result; 2026-09-26):** This was a direct TypeSafe API assessment; no JEV review skill was used. It supplied all 123 source assertion / condition contracts and used the official SystemOne choice schema. Earlier classifications were included only as explicitly non-ground-truth hypotheses, not as authority; the audit re-evaluated every stable ID. Independent validation confirms 123/123 unique keyed answers, 0 missing / duplicate / unexpected / invalid IDs, all 12 batches HTTP 200, and all 25 manifest entries match. MAP choices are `eligible=90, not_eligible=33, unresolved=0`; category counts are eligible component/DOM `30`, viewport/layout/scroll `46`, pointer/chart `7`, engine provider `7`, and ineligible Next/production integration `21`, top-level/full app shell `1`, unit-only/no-browser contract `0`, other provider gap `11`. These are categorical selections, not explanatory proof: the choice API guarantees no free-text rationale.
- **Official Browser Mode evidence considered in the full-scope audit:** Vitest `4.1.11` has no Browser Mode package/provider configured in this repository today, while `vitest.config.ts` uses happy-dom; the audit treated this as setup absence, not a provider capability gap. Official Browser Mode / Playwright provider evidence supports browser globals in a Vite iframe, configurable viewport, Chromium/Firefox/WebKit providers, locator cursor-position click, wheel deltas, bounding boxes/coordinate click, and provider/custom touch configuration. The iframe does not supply the Next production app or route, so Next build/start, Flight/hydration, URL-route wiring, production downloads/CSV parity, and the full top-level app shell remain outside the faithful boundary. See the official [Vitest Browser Mode guide](https://vitest.dev/guide/browser/) and [Playwright provider configuration](https://vitest.dev/config/browser/playwright).
- **Full-scope gate / next step:** MAP eligible count is `E=90` (`Emax=90/123=73.17%`), exceeding the strict gate threshold of at least `62/123` needed for a potential `M/A > 0.50`; at that historical checkpoint, reviewed migrated count was `M=0`. The separate rounded probability mass is eligible `74.28/123=60.39%`, not eligible `44.37`, unresolved `4.25`, summing to `122.90` due to row-level rounding; mean confidence is `0.523`. This probability mass is diagnostic and does not replace MAP classification. At the Phase 0 gate, this result **authorized proceeding to the Phase 1 Browser Mode setup spike**. Phase 1 was not started at that historical checkpoint: this audit does not implement the spike, establish a completed migration, or authorize jumping ahead to migration batches. The earlier conditional `52/71/0` estimate and other eligibility stages remain explicitly historical.
- **Post-Batch 1 current migration accounting (2026-09-26):** `A=123`, `E=90`, `M=1`; MAP classes are `eligible=90`, `not_eligible=33`, `unresolved=0`. P42-021 completed the Browser Mode transfer after focused/full gates and independent review. P42-018 remains Playwright. See the Phase 3 Batch 1 record below.
- **Full-scope audit artifacts:** [derived reassessment report](../results/plan45/phase0/jev-api-full-browser-mode-reassessment-derived.md) (SHA-256 `b2f3c718001a5b27798eaf1b6d433c4af9c9bea1acf05940ebdcb84cd722e0f0`) and [12-batch request/response manifest](../results/plan45/phase0/jev-api-full-browser-mode-reassessment-sha256.txt) (SHA-256 `96ddc50a9af522dca874dce86448ddc430cc8f31a36166cf742355141b05141a`). The manifest covers the 12 request/response pairs and all 25 listed artifact entries.
- **Audit artifacts / schema:** [derived row-level audit report](../results/plan45/phase0/jev-api-eligibility-audit-derived.md) (SHA-256 `4feff3816e720f858aa2b6d53ce9cb07fd042143bac1bf469058cfae5787910c`); [batch manifest](../results/plan45/phase0/jev-api-eligibility-audit-sha256.txt) (SHA-256 `49100c6326f042320b587b65aed01239a921ba9b1a5bc68b338682b9d3c1b75f`). Official references: [SystemOne API documentation](https://docs.typesafe.ai/api) and [OpenAPI schema](https://api.typesafe.ai/openapi.json). Initial schema-validation failures were HTTP 422 and produced no classifications; only corrected HTTP 200 choices contribute to the result.
- **Earlier feasibility readouts (historical):** the 27/96/0 full-inventory pass and the conditional `52/71/0` readout from auditing only the prior 96 not-eligible rows are preserved above as historical stages. The latter conditionally carried forward the 27 prior eligible rows, which were not audited in that reason pass. Both are superseded as current counts by the following full-scope reassessment.
- **Phase 0 completion:** six Phase 0 checklist items and acceptance criteria are complete based on the same-SHA build/E2E records, source-level inventory, Plan42 crosswalk, project census, full-scope direct API reassessment and the gate calculation above. Plan42 Phase 1/2 global incompletion remains separate; Plan45 Phase 0 completion does not change Plan42 status. The Phase 0 numeric gate authorized the Phase 1 setup spike, which is now implemented and verified locally; the fixture-hook smoke verification and external-push limitation are recorded below.
- **JEV close review — oversized request attempts:** the oversized [`jev-phase0-close-request.json`](../results/plan45/phase0/jev-phase0-close-request.json) received HTTP 400 `max_tokens_exceeded` twice. No valid result, clarification, or verdict was produced from those attempts; they are transport failures, not review decisions.
- **JEV close review — compact regular initial v3:** after compacting the review context, response validation passed and the initial verdict was `valid_as_defined`, confidence `0.91`, passProbability `0.93`; distribution: `valid_as_defined 0.93 / implementation_issue 0.05 / requirements_mismatch 0.01 / missing_prerequisites_info 0.01 / incomplete_implementation_info 0 / scope_violation 0 / other 0 / indeterminate 0`. No clarification was recommended or run. Artifacts: [request](../results/plan45/phase0/jev-phase0-compact-request.json) (SHA-256 `3b80f929c230b3fc7d0f7f752f2a556a35701aba975727d26643bdf792fa3df6`), [result](../results/plan45/phase0/jev-phase0-compact-result.json) (SHA-256 `b1c40b868a89170e4a41af733e2ee4b77c614b91caed980cda256bf83a43f0f8`). This plan-validity review is separate from the row-level eligibility audit below; its accompanying `4.9%` note records the then-current internal assessment, superseded for eligibility counts by the direct audit. The current gate is reported in the full-scope reassessment above. Earlier JEV artifacts and their historical findings remain preserved.

### Phase 1 — Browser Mode 設定 spike

- [x] 既定の Vitest happy-dom / unit 実行を維持しつつ、Browser Mode を独立 config として分離した。`tests/browser-mode/**` を既定configから除外し、既定の `pnpm test` がBrowser Modeを起動しないことを84 files / 772 passed / 4 skippedで確認した。
- [x] `@vitest/browser-playwright@4.1.11`、Playwright provider、`enabled: true`、明示Chromium、headless、2-worker設定を追加し、ローカルheadless Chromiumで実行した。Browser Modeは通常のpre-push changed/full profilesおよび`test:full`から選択される。GitHub Actions workflowの変更は不要。
- [x] 実候補 `ThemeToggle` をVite Browser Mode pageにmountし、import境界、必要prop/provider、クリック操作、localStorage / DOM / aria/icon状態、computed CSS / bounding boxを記録・確認した。既存happy-dom契約と異なる追加保証・production route側で失う保証を下記ログに記録した。
- [x] 選定componentのNext固有境界を確認した。`ThemeToggle`自身に`next/*`、server-only、route handler、Server Component importはなく、adapter/mockは不要。Vite mountがNext統合を検証しない境界を下記に記録した。
- [x] 2つの独立specを`fileParallelism: true` / `maxWorkers: 2`で実行し、Chromium起動、render、実click / persistence、failure artifact出力、ファイル並列を確認した。cold/warm時間を記録した。診断screenshotは表示markerを含むことを確認した。Trace Viewerでの詳細な診断価値、CI artifact保持は未確認。
- **受け入れ:** happy-domからの選別、headless Chromium、component import境界・操作、2-worker実行、cold/warm時間、artifact生成、pre-push changed/full profileからの選択は確認済み。sandbox制約下の明示的なlocal browser pathを使った`CI=1 pnpm test:browser`は2/2 pass。fixture hook smokeも実行済みだが、実際のexternal git pushは行っていない。Trace Viewerでの診断価値は未確認事項として残す。mockによって消える保証・残る保証と制約は下記記録に明示した。

#### Phase 1 実装判断記録 — 2026-09-26（完了、local verification）

- **状態:** Browser Mode設定とThemeToggle smoke testを実装し、final treeでローカル検証済み。2つのbrowser spec / 2 testsがpassし、既定 `pnpm test` は84 files / 772 passed / 4 skipped。`pnpm lint`、`pnpm type-check`、`git diff --check`もpassした。`CI=1 pnpm test:browser`も2/2 passした（sandbox内の明示的local browser pathを指定）。拡張fixture coverageを含む`pnpm run test:hook-smoke`もpassした（詳細はfixture verification項目）。これは実際のexternal git pushを行った記録ではない。Phase 1は完了。GitHub Actions workflow変更は不要である。Phase 2 / migration batchは別の計画段階として扱う。
- **実行経路:** 既定 `pnpm test` は従来の `vitest.config.ts`（happy-dom）を引き続き使い、`tests/browser-mode/**`は除外する。独立した `pnpm test:browser` が `vitest.browser.config.ts` のみを起動し、`tests/browser-mode/**/*.browser.test.tsx` のみを収集する。Browser Modeは `@vitest/browser-playwright@4.1.11`、Playwright provider、明示Chromium、headless、1280×800 viewportを使う。`fileParallelism: true` / `maxWorkers: 2`で、interactionとCSS/renderの2 specを別worker/pageへ分けて実行する。失敗screenshotと失敗時trace（DOM snapshots / screenshotsを含む）を設定する。Browser downloadは自動ではなく、local browser setup時に一度`pnpm exec playwright install chromium`を実行する。LinuxではPlaywright OS dependenciesのinstallも必要になる場合がある。
- **pre-push / `test:full` selection:** Browser Modeは通常のpre-push changed/full profilesと`test:full`に組み込み済み。`test:full`とfull pre-pushでは`test:all`の後に`test:browser`を1回実行する。changed profileでは、有効かつ空でない関連selectionの後に`test:browser`を実行する。empty / invalid / indeterminate selectionはfull fallbackとなり、`test:browser`をちょうど1回実行する。docs/assets-only変更は関連Vitest selection、`test:all`、`test:browser`をskipする一方、既存の`build`と`test:e2e:clean` / `test:e2e` gatesは該当条件に応じて実行する。通常の`pnpm test`はhappy-domのまま。Browser downloadは自動ではなく、local browser setup時に一度`pnpm exec playwright install chromium`を実行する。LinuxではPlaywright OS dependenciesのinstallも必要になる場合がある。GitHub Actions workflow変更は行わず、また要求しない。
- **fixture-hook smoke verification:** `pnpm run test:hook-smoke` passed. Coverage includes initial/normal paths, docs+asset-only skip, multi-ref selection, deletion handling, failure atomicity, full profile, Browser Mode failure in both full and changed profiles, and full fallback gates. Full and changed Browser Mode failures reject the fixture push, preserve temporary bare remote refs, and prevent later gates from running. Empty, invalid, and indeterminate related selections fall back to full and invoke `test:browser` exactly once. Docs+SVG-only fixture pushes skip the related Vitest selection, `test:all`, and `test:browser`; the existing `build` and `test:e2e:clean` / `test:e2e` gates still run as applicable. These are temporary-fixture simulations of the actual hook, not an external push; no actual external `git push` was performed.
- **Final direct TypeSafe JEV checkpoint (JEV 1.13.0):** Following the expanded hook-smoke coverage fixes, the direct API checkpoint returned `valid_as_defined` (confidence `0.89`, selected-choice probability `0.92`). The finding was `no_material_issue` (`0.96` / `0.97`); evidence assessment `evidence_supports_acceptance` (`0.90` / `0.91`); next action `accept_phase1_and_continue` (`0.98` / `0.99`); remaining uncertainty `none_for_defined_local_gate` (`0.77` / `0.81`). Response validation passed. No clarification was sent because the initial verdict was valid. This accepts the defined local Phase 1 gate based on the recorded fixture simulations; an actual external push remains unverified. The earlier pre-final valid response is preserved as historical and superseded because it preceded the expanded smoke-coverage fixes. The Phase 5 investigation of all 33 stable IDs remains a future requirement. Artifacts: [derived checkpoint report](../results/plan45/phase1/jev-api-phase1-final-checkpoint-derived.md) (SHA-256 `20b5e4466a64c7909fe401b76b891146e93369d2b2b22b1a140bff526bd572b9`), [request](../results/plan45/phase1/jev-api-phase1-final-checkpoint-request.json) (SHA-256 `8c5a6b0783b9c53848b767c946c02eea63b5385b59270d9ca579918a9c0a44a6`), [response](../results/plan45/phase1/jev-api-phase1-final-checkpoint-response.json) (SHA-256 `c735daa206dc95d62e9d8bf77c9f731b1e509f3c3265b7aeca597c50118b3e17`), [artifact manifest](../results/plan45/phase1/jev-api-phase1-final-checkpoint-sha256.txt) (SHA-256 `960e740fe5f75640bdea5d27b93e9f2ef21d485f7e409f1f820906d56c4ace63`).
- **候補:** `src/app/components/ThemeToggle.tsx`。`"use client"` entry で React `useState`、`./CpiChart.module.css`、browser `localStorage` / `document.documentElement` のみを直接参照する。`next/*` import、server-only module、route handler、Server Component、provider prop はない。Browser test は実コンポーネントを Testing Library `render` で mount し、Browser Mode の Playwright locator `page.getByRole(...).click()` で system → light → dark のクリック、`localStorage` / `data-theme` / icon 更新を観測する。別テストで CSS Module の computed `min-height` / `min-width` と実 `getBoundingClientRect()` が44px以上か確認する。
- **既存契約との差分:** `tests/components/ThemeToggle.test.tsx` の happy-dom suite は保存済み値の初期表示、light/dark/system循環、SSR相当評価、無効 legacy 値、storage read/write/remove 例外を既に確認し、CSS Module はmockしている。新しい Browser Mode smoke は既存ケースの移管・削除ではなく、Chromium の native click / Web Storage / 実CSSレイアウトが Vite page 上で動くかを調べる spike。測定できればBrowser Modeが追加する保証は実ブラウザDOM・event・computed CSSであり、Next production統合ではない。
- **境界・失われる保証:** Vite test iframe と独立に mount するため、`SectionTabs` / outer app shell、Next route、初回サーバーHTML、Flight payload、hydration、layout側の inline theme bootstrap と `ThemeToggle` の協調、production CSS pipeline、route遷移や production asset 配信を検証しない。これらを実際に確認する Playwright assertions の根拠にはしない。候補の直接 import graph に Next固有境界はないため adapter / mock は使わず、Next統合保証を偽装するmockもない。
- **診断・分離:** Browser configはlocator action timeout 5秒、失敗screenshot、失敗時traceを指定。最初の操作テストは`TypeError: button.getAttribute is not a function`でclick前に失敗した。Vitest 4.1.11 `expect.element(locator).toHaveAttribute()` / `toHaveTextContent()`へ修正後、実click、localStorage/data-theme/icon/aria-labelの切替とCSS computed size / bounding boxがpassした。最初の失敗screenshotは全面白だった。一時diagnostic probeでは表示marker付き158×99 screenshotを生成し、trace ZIPには`trace.trace` / network / html / jsonl / sourceと18 JPEG framesが含まれたため、screenshot・trace artifactが内容付きで生成されることを確認した。Trace Viewerでの診断価値とCI retentionは未確認。一時probeと専用artifactは確認後削除し、ThemeToggle失敗時のartifactは保持した。2 specは各自`localStorage` / `data-theme`を初期化しmount/unmount cleanupを行った。`fileParallelism: true` / `maxWorkers: 2`の実行で別ファイル並列を確認した。console / page errorの追加診断粒度は未評価。
- **所要時間・最終tree検証:** lockfile反映後のBrowser Mode cold first runは4.17s（Vite re-optimizationを含む）、immediate warm rerunは3.78s。いずれも2 files / 2 testsのローカルsmoke suiteであり、E2E suiteとの速度比較やCI性能を示さない。既定`pnpm test`は84 files / 772 passed / 4 skipped、28.55s。`pnpm lint`、`pnpm type-check`、`git diff --check`もpassした（pnpm dlxのcache path制限を避けるためXDG_CACHE_HOMEを/tmp配下に指定）。`CI=1 pnpm test:browser`は2/2 pass。`pnpm run test:hook-smoke`もpassし、expanded fixture coverageは上記に記録した。実際のexternal pushではない。Trace Viewerの診断価値とartifact retentionは未確認だが、GitHub Actions workflowの変更・統合は本計画の要件ではない。

### Phase 2 — Browser Mode harness / runtime operations

**Status (2026-09-26): Phase 1 and Phase 2 are complete. Phase 2
implementation, verification, and the final implementation JEV checkpoint
passed; Phase 3 is ready. This phase does not include GitHub Actions or other
CI workflow changes.**

**Existing execution paths to preserve:** `pnpm test` remains the default
happy-dom suite and excludes Browser Mode specs. `pnpm test:browser` selects
`vitest.browser.config.ts` and only `tests/browser-mode/**/*.browser.test.tsx`.
`test:full` and full pre-push run `test:all` followed by `test:browser`; changed
pre-push runs Browser Mode after a valid, non-empty related selection, uses one
full fallback for empty/invalid/indeterminate selection, and skips related
tests plus Browser Mode for docs/assets-only changes. The hook does not install
browsers automatically. These paths were added and verified during Phase 1 and
were preserved through Phase 2.

- [x] Add `tests/browser-mode/setup.ts` for shared per-test React cleanup and
      reset of DOM/theme attributes, `localStorage`, JavaScript-visible cookies,
      mock call history, and spies. Teardown restores spies before browser-state
      resets; clearing call history does not reset mock implementations. Cookie
      cleanup is limited to JavaScript-visible cookies. Add a focused Browser Mode
      harness spec proving that two successive tests in the same file do not
      retain these states.
- [x] Add a small shared React render/fixture helper limited to capabilities
      used by current Browser Mode specs. Defer a provider-wrapper abstraction
      until multiple providers actually need it.
- [x] Demonstrate the supported `userEvent` API from `vitest/browser` in one
      test while retaining locator interaction coverage. Use `expect.element(...)`
      for async locator assertions. There is currently no Recharts mock; if a
      future mock is needed, state that it checks props/DOM only, not actual chart
      layout or rendering. Avoid `vi.spyOn` on native ESM namespace exports; use
      dependency injection or `vi.mock(..., { spy: true })`. Keep blocking
      `alert` / `confirm` / `print` behavior in Playwright E2E or explicitly mock
      the relevant API.
- [x] Treat isolation as per test file: tests in one file share the Browser
      Mode page/context, so every test must explicitly reset state rather than
      assume a new page/context per test.
- [x] Record the runtime contract: Chromium is installed manually once with
      `pnpm exec playwright install chromium`; Linux may also require Playwright OS
      dependencies. Preserve `fileParallelism: true`, 2 workers, a 5-second
      action timeout, and the default no-retry behavior. Record/retain
      `trace.mode=retain-on-failure`, trace screenshots and DOM snapshots, and
      `screenshotFailures=true`. Successful `pnpm test:browser` elapsed samples
      were 5.58s and 6.82s; `test:full`'s embedded Browser Mode step took 4.63s.
      These samples vary and do not establish that a warm run is faster. Timings
      include command startup. The Phase 1 reference is 4.17 seconds cold
      (including Vite re-optimization) and 3.78 seconds warm for the two-spec local
      smoke suite; it is not a Phase 2 harness result or a CI performance claim.
- [x] Update the OpenSpec WHEN/THEN scenarios alongside implementation so they
      describe the actual setup, isolation, supported interactions, and
      operational boundaries.

**Phase 2 acceptance (complete):** the shared helper exists; a sequential same-file
isolation spec proves DOM/theme, storage, cookie, and mock reset; one test
demonstrates Browser Mode `userEvent` alongside locator coverage and async
`expect.element` assertions; runtime settings, failure artifacts, and
startup-inclusive cold/warm timing are recorded. The existing happy-dom,
`test:full`, and pre-push selection paths remain intact, with OpenSpec updated
to match. The Phase 5 investigation of the 33 MAP-ineligible stable IDs is
deferred to Phase 5 and does not expand Phase 2 scope.

**Phase 2 verification record (2026-09-26):** Browser runs used Vitest 4.1.11
and `PLAYWRIGHT_BROWSERS_PATH=/home/shunki/.cache/ms-playwright`; without this
override, the temporary `XDG_CACHE_HOME` selected a separate Playwright browser
cache. `pnpm test:browser` passed 3 files / 4 tests, exercising the supported
`vitest/browser` `userEvent` API and sequential cleanup/isolation within one
test file. `pnpm test` passed 84 files (772 passed, 4 skipped). The full
`pnpm test:full` command completed successfully, including `lint:fast`,
type-check, unit tests, Browser Mode, webpack build, build-parity (3 tests),
pnpm audit, secretlint, and E2E (120 passed, 19 skipped); elapsed time was
4m58.99s. `pnpm run test:hook-smoke`, `pnpm lint`, and `git diff --check` also
passed. No GitHub Actions workflow changes were made. The final JEV
implementation checkpoint is recorded below. Examination of all 33
MAP-ineligible IDs remains deferred to Phase 5. Diagnostic artifacts remain
outside the committed changes.

**Final implementation JEV checkpoint (2026-09-26):** the validated initial
verdict was `valid_as_defined` (confidence `0.81`, selected-choice probability
`0.83`); no follow-up was sent because the initial verdict passed. The
checkpoint accepts Phase 2 and recommends continuing to Phase 3. It resolves
the tested setup/cleanup, `vitest/browser` `userEvent`, async
`expect.element`, and Vitest 4.1.11 exercised-behavior uncertainty based on the
final runtime evidence. It does not claim a blanket guarantee for every
statement on rolling documentation pages.

The initial **plan-only** JEV result remains preserved as historical: its raw
verdict was `valid_as_defined`, but the structured `setup_cleanup_contract`
finding conflicted with `affected_requirement=none`, lacked case-specific
evidence, and selected `vitest_411_compatibility` without a specific
uncertainty. Its overall resolution remains `unresolved` with
`diagnosisStatus=incomplete`; the later implementation checkpoint resolves
only the behavior exercised by the implementation tests and does not rewrite
that earlier response. The earlier contradictory diagnostics remain in the
original artifacts: [plan-only request](../results/plan45/phase2/jev-api-phase2-plan-checkpoint-request.json)
(SHA-256 `bd76ddd2cc55bdf3d657a545cf9d468d522314648acabfe31f81f940664559b9`),
[response](../results/plan45/phase2/jev-api-phase2-plan-checkpoint-response.json)
(`2acdfbfa863c72f4dc842f73e0ee500f1586abdef06316c9517afaed3bf6a827`),
[derived report](../results/plan45/phase2/jev-api-phase2-plan-checkpoint-derived.md)
(`36503c1a9cbf775993ad86f0e2c61cb8d4ce99fe5ca3b8ee420d082671d5496e`), and
[manifest](../results/plan45/phase2/jev-api-phase2-plan-checkpoint-sha256.txt)
(`27bc2c92e3e910b2cc5f97499dae61ccdce72360b1e815db3a9fbcecb59fea7d`).

Implementation checkpoint artifacts and exact SHA-256 values:

- Request: [`jev-api-phase2-implementation-checkpoint-request.json`](../results/plan45/phase2/jev-api-phase2-implementation-checkpoint-request.json),
  `f9ba040fd34d38bd53f9181ae931ff9850cee0987c250077ae37cf3c3d2995a8`.
- Response: [`jev-api-phase2-implementation-checkpoint-response.json`](../results/plan45/phase2/jev-api-phase2-implementation-checkpoint-response.json),
  `812e3f258b7b70680d8dc649d55b21b87bee5cb4ac0bb6f525e1c4d1c515e603`.
- Derived report: [`jev-api-phase2-implementation-checkpoint-derived.md`](../results/plan45/phase2/jev-api-phase2-implementation-checkpoint-derived.md),
  `174a65edca9da10dfb55e5edd9f02e4ccb56484af2a3960b4e68ed951e263eb9`.
- Manifest file: [`jev-api-phase2-implementation-checkpoint-sha256.txt`](../results/plan45/phase2/jev-api-phase2-implementation-checkpoint-sha256.txt),
  file SHA-256 `9c19c4829a92a29498e915e5d6bf3bde5363dd046884c172d20c375ab5de2a36`.
  The manifest covers the four unchanged plan-checkpoint artifacts and the
  three implementation-checkpoint artifacts listed above; all seven entries
  were independently verified.

The final checkpoint marks Phase 3 ready. No GitHub Actions workflow changes
were made, and all 33 MAP-ineligible IDs remain deferred for individual
investigation in Phase 5.

### Phase 3 — 小さな移管 batch

#### Batch 1 transfer record — `p45-a-a11y-info-escape`

**Status (2026-09-26): complete.** The pre-implementation JEV plan checkpoint
passed (`valid_as_defined`, confidence `0.93`, selected probability `0.95`),
and focused/full validation plus independent review are complete. P42-021 is
counted in M. JEV's implementation checkpoint primary verdict was
`valid_as_defined` (confidence `0.87`, selected probability `0.88`) and
recommends accepting Batch 1 and continuing; no follow-up was sent. Its
separate unresolved/incomplete diagnostic about pre-push output provenance is
preserved below and does not change the primary verdict. See [Batch 1 plan
checkpoint report](../results/plan45/phase3/jev-api-phase3-batch1-plan-checkpoint-derived.md)
and [implementation checkpoint report](../results/plan45/phase3/jev-api-phase3-batch1-implementation-checkpoint-derived.md).

- **Scope and baseline:** stable ID `p45-a-a11y-info-escape` maps to immutable
  baseline assertion `P42-021`, with Phase 0 MAP eligibility
  `eligible_component_or_dom_interaction`. The original first `/データソース/`
  button was confirmed as the CPI-major `ChartInfoButton`. Current accounting is
  `A=123`, `E=90`, `M=1` after focused/full gates and independent review.
  Full MAP classes are `eligible=90`,
  `not_eligible=33`, `unresolved=0`. Browser Mode passed 1/1, after which only the P42-021 E2E
  case was removed. Source audit confirms its sole assertion was Escape
  dismissal; no page-error / no-error assertion is claimed.
- **Migrated Browser Mode behavior:** the real `ChartInfoButton` is mounted with
  static children using `renderBrowserComponent`; use the rendered trigger to
  open the popup, confirm the dialog is visible, send real Chromium Escape via
  `await userEvent.keyboard('{Escape}')`, and assert the dialog is hidden. The
  source currently exposes `aria-expanded={open}` on the trigger and renders
  the popup with `role="dialog"`; the passing test asserts expanded true after
  open and false after Escape. Retain `expect.element(...)` for retrying
  asynchronous locator assertions.
- **Boundaries and separate cases:** this component mount does not verify the
  production route's Escape or focus integration; after P42-021's removal,
  that particular route-level Escape path is no longer covered. Preserve
  P42-018's outside-click / scroll Playwright case unchanged. P42-020 has
  already been removed and must not be reintroduced. Do not add a pageerror
  assertion or claim that one exists.
- **Downstream record:** the Phase 0 scenario inventory, Plan42 responsibility
  matrix, Plan42 assertion ledger, and OpenSpec WHEN/THEN scenario now map this
  one assertion to Browser Mode. Immutable Plan42 baseline IDs, expression,
  source lines, and 604-callsite count remain unchanged; current ownership and
  the remaining route-level limitation are recorded separately. P42-018's
  outside-click / scroll Playwright coverage is unchanged; P42-020 was already
  removed and is not reintroduced. No GitHub Actions change is planned.
- **Completed verification (2026-09-26):** focused Browser Mode 1/1; all
  Browser Mode 4 files / 5 tests; `ChartInfoButton` unit 20/20; preserved
  P42-018 outside-click/scroll E2E 1/1; `pnpm run test:hook-smoke` passed all
  listed branches (initial, normal, docs-only skip, multi-ref, deletion,
  failure atomicity, full profile, Browser Mode failure/fallback).
  `pnpm test:full` exited 0: lint:fast, type-check, Vitest 84 files / 772
  passed / 4 skipped, Browser Mode 5 passed, Next webpack build succeeded,
  build parity 3 passed, security check passed, and E2E 119 passed / 19
  skipped. Full `pnpm lint` and `git diff --check` exited 0. Independent review
  passed. The implementation report is [here](../results/plan45/phase3/jev-api-phase3-batch1-implementation-checkpoint-derived.md)
  (manifest SHA-256 `e0596b98ce66ed10504871a5a59dedbbab2b0c59fe4b6c1495430284a2b2b7fc`).
- **JEV diagnostic uncertainty:** during `pnpm test:full`, malformed-JSON and
  exit-23-looking pre-push lines appeared. The command returned 0 and a later
  actual Next production build succeeded; JEV explicitly did not identify a
  real build failure. The missing evidence is captured stdout/stderr mapping
  those lines to a fixture versus the actual hook process. Keep this as an
  unresolved/incomplete diagnostic, not a blocker to this component transfer.
- **Deferred work:** keep the Phase 5 individual investigation of all 33
  MAP-ineligible IDs deferred; this batch does not resolve or recategorize
  them. No GitHub Actions workflow changes are included or requested.

- [x] Batch 1 completed after focused/full gates and independent review; update
      A / E / M to `123 / 90 / 1` and preserve the outstanding diagnostic separately.

#### Batch 2 proposed plan — `p45-b-consumption-mobile-acceptance-139-mobile-pixel-acceptance-plan25-openspec-1`

**Status (2026-09-26): complete.** The pre-correction
checkpoint's primary verdict was `valid_as_defined` (confidence `0.95`, pass
probability `0.96`), with separate `support_series_fixture` uncertainty
(confidence `0.66`, probability `0.71`). Preserve it as historical: its
diagnostic was unresolved/incomplete, so it did not satisfy the plan gate. The
corrected fresh initial reassessment returned primary `valid_as_defined`
(confidence `0.97`, pass probability `0.97`), case finding
`no_case_specific_finding` (confidence `0.84`, probability `0.87`), and
remaining uncertainty `none_for_plan_checkpoint` (confidence `0.86`,
probability `0.88`). The JEV plan gate is satisfied; no follow-up was sent.
Its weak `affected_requirement` localization to `inventory_row94` (confidence
`0.34`, probability `0.40`) does not alter the pass, and the required inventory
mapping correction remains. The plan approval covered only the written bounded
proposal; implementation completion is recorded below. This is an
assertion-level partial transfer of exactly `P42-181`, not a transfer of the mixed Playwright
scenario or the stable scenario as a whole. Keep `A=123`, `E=90`, and `M=1`; M
counts fully migrated stable scenarios, so this partial transfer does not
increment it. The 33 Phase 0 MAP-ineligible IDs remain deferred to Phase 5. No
GitHub Actions changes are in scope.

Fresh reassessment artifacts: [request](../results/plan45/phase3/jev-api-phase3-batch2-plan-reassessment-request.json),
[response](../results/plan45/phase3/jev-api-phase3-batch2-plan-reassessment-response.json),
[derived report](../results/plan45/phase3/jev-api-phase3-batch2-plan-reassessment-derived.md)
(SHA-256 `f85d81e0c6f694f5e404f8c555f1ff9460f97a6a3efc9b40ec34bc7a93413109`),
and [manifest](../results/plan45/phase3/jev-api-phase3-batch2-plan-reassessment-sha256.txt)
(SHA-256 `3f08f0348c6e2c364356c957964b7ef0d24782a5c109fc95d5c65b9933f5b632`).

**Batch 2 implementation result (complete):** The first focused Browser Mode
run encountered an invalid hook call in `ResponsiveContainer` after Vite
late-discovered and optimized Recharts, then reloaded the test. The harness now
pre-optimizes Recharts through `optimizeDeps.include: ["recharts"]`; the focused
replacement passed 1/1 and all Browser Mode tests passed 5 files / 6 tests.
The retained mobile Playwright case passed 1/1. Only the P42-181
empty-state-text assertion was removed after the replacement passed.

The first `pnpm test:full` run had one unrelated failure at
`tests/e2e/tooltip-dismiss.e2e.spec.ts:207` (118 passed / 1 failed / 19 skipped);
the exact isolated rerun passed 1/1. A second `pnpm test:full` passed, including
lint:fast, type-check, unit tests (84 files / 772 passed / 4 skipped), Browser
Mode (5 files / 6 passed), Next webpack build, build parity (3 passed), security
checks, and E2E (119 passed / 19 skipped). `pnpm lint`,
`pnpm run test:hook-smoke`, and `git diff --check` also passed. Independent scope
audit found no mismatch.

The implementation JEV checkpoint passed `valid_as_defined` (confidence `0.91`,
pass probability `0.93`), with diagnosis complete and no follow-up. See [request](../results/plan45/phase3/jev-api-phase3-batch2-implementation-checkpoint-request.json)
(SHA-256 `66ff264d7b28e59c43a037f210e18e25900df7e0e57b7da53b2f57fe468029a2`),
[response](../results/plan45/phase3/jev-api-phase3-batch2-implementation-checkpoint-response.json)
(`2686a9199c0f19985fddff70d03e2fa46f5f0722fb43fadd9d0f9750db967922`),
[derived JSON](../results/plan45/phase3/jev-api-phase3-batch2-implementation-checkpoint-derived.json)
(`af4502aec79e8c0a2cac6a726474fe923015f747656ea5ffc2ef69170d831f28`), and
[manifest](../results/plan45/phase3/jev-api-phase3-batch2-implementation-checkpoint-sha256.txt)
(`55440cabeb73b579dcc56db63db0dc57e2420ae501204d871df5ac20b8d20ced`).

Recharts emitted unsuppressed React unknown-prop `console.error` warnings in
development render; they were audited to the chart subtree, separate from the
asserted status node. No zero-console-error claim is made. The existing
production E2E console/pageerror check passed for its route test only and does
not cover the empty-state interaction. Both full runs also displayed malformed
Vitest JSON / exit-23-looking pre-push diagnostics. Their provenance remains
unresolved and non-blocking: the second full command returned 0 and the actual
production build succeeded. `A=123`, `E=90`, `M=1`; this partial mixed-scenario
transfer does not increment M. The 33 Phase 5 individual MAP-ineligible
investigations remain deferred. No GitHub Actions/workflow changes are in scope.

- **Baseline mapping correction (applied):** Phase 0 scenario-inventory line 94
  omitted `P42-181` from its Plan42 assertion-ID list. Plan42 ledger row 191 and
  `tests/e2e/consumption-mobile-acceptance.e2e.spec.ts:153-155` identify the
  assertion, and no other inventory row owns it. The existing row's ID mapping
  is corrected; baseline and scenario row counts are unchanged, with no 124th
  scenario created. The latest raw MAP request places
  the text assertion in this stable row and selected
  `eligible_component_or_dom_interaction` at confidence `0.17` / probability
  `0.25`. This remains a candidate signal only, not blanket approval of the mixed
  E2E case; JEV approved only the bounded P42-181 assertion transfer.
- **Exact transferred contract and fixture boundary:** mount the actual
  `SpendingBarChart` in Browser Mode with deterministic static data and props.
  Supply expense keys only (for example, `食料` and `住居`); exclude every
  special nominal/real support key and every support-series row. Set
  `hiddenKeys` to every supplied expense key, making both
  `hasVisibleExpenseSeries` and `hasVisibleSupportSeries` false. Assert only the
  rendered `role="status"` empty-state message. This checks the component's
  rendered empty-state message/status contract. It does not test the hide-all
  action, actual Recharts bars/SVG behavior, or the mobile production route.
  Existing component unit tests do not cover this empty status assertion;
  `P42-517` owns the category aria toggle and is not an overlapping status
  contract.
- **Mixed E2E remainder:** the source case at lines 139-159 also covers the
  production/mobile route, actual accordion and hide-all interaction, absent
  real Recharts bars (`P42-180`), aria state (`P42-182`), and bar restoration
  (`P42-183`). Retain the Playwright case and those assertions, together with
  the production/mobile behavior (`P42-179`); do not claim the entire case or
  stable scenario is migrated. After the focused Browser Mode test passed,
  only `P42-181` was removed from Playwright and assigned to Browser Mode. The
  route, viewport, accordion/action, SVG/chart, aria-state, and recovery
  coverage remains in Playwright; the retained mobile case passed 1/1.
- **Required record updates (applied):** the existing Phase 0 inventory row
  mapping is corrected without altering A/E/M or row count; one current-owner
  delta for `P42-181` is appended to the Plan42 responsibility matrix and
  assertion ledger while immutable baseline fields remain intact; and existing
  OpenSpec requirement R20d now states the empty-state message and
  `role="status"` semantics while preserving recovery/no-bars and the remaining
  viewport/accessibility coverage. No separate scenario was added.
- **Acceptance gates (complete):** the corrected bounded proposal passed its
  fresh initial JEV plan reassessment. The focused Browser Mode replacement
  passed before only the matching Playwright assertion was removed; the full
  Browser Mode suite, retained Playwright case, independent scope audit, full
  validation gates, and JEV implementation checkpoint all passed. Assertion
  ownership is reconciled with no duplicate primary owner. Keep `A/E/M=123/90/1`
  because this is a partial transfer, and preserve the remaining mixed-case
  guarantees explicitly.

#### Batch 3 proposed plan — ten partial assertion transfers

**Status: staged plan JEV-approved; Batch3a implementation may start.**
The prior initial checkpoints returned `valid_as_defined` (confidence `0.86`,
pass probability `0.88`), diagnosis complete, no follow-up; preserve them as
historical reviews of the earlier execution wording. This fresh initial review
covers the staged sub-batches below and returned `valid_as_defined` (confidence
`0.75`, pass probability `0.79`), diagnosis complete, no follow-up. No separate
finding or unresolved diagnostic was returned. Prioritize Browser Mode implementation
speed and defer consolidated retained-E2E verification until all ten new named
Browser Mode cases pass. Run the cases in three sub-batches that each cover no
more than three stable rows: Batch3a has 3 rows / 5 named cases; Batch3b has 3
rows / 3 cases; Batch3c has 2 rows / 2 cases. With two named tests already
migrated in Batches 1 and 2, there will be 12 cumulative named Browser Mode
tests at the E2E gate. Across unique source Playwright declaration/assertion groups, that gate touches
nine groups total: one from Batch 1, one from Batch 2, and seven from Batch 3.
The two monthly-axis chart cases share one Playwright callsite/assertion group,
executed once for each chart case; count it once as a source group and retain it
until both Browser Mode axis tests pass. Do not run any E2E command before the ten new cases pass, including
targeted Playwright tests or `pnpm test:full`. Within each sub-batch, run focused
Browser Mode verification, independent review, and its implementation JEV
checkpoint before starting the next. After Batch3c passes, run the full Browser
Mode suite and one consolidated retained-E2E regression. Each named test
replaces its mapped assertion group only after that test passes; groups and
adjacent E2E responsibilities are enumerated below. These are assertion-slice
transfers: they do not complete their mixed stable scenarios or increment M.
Preserve `A=123`, `E=90`, `M=1` pending exact assertion reconciliation. Phase
5's 33 individual MAP-ineligible investigations remain deferred; no GitHub
Actions changes are included.

Staged-plan JEV artifacts: [request](../results/plan45/phase3/jev-api-phase3-batch3-staged-plan-checkpoint-request.json)
(SHA-256 `9eb1ae91a521c4ab0f464ada7a15716d803bd68db0d664761a59289c0c3c569a`),
[response](../results/plan45/phase3/jev-api-phase3-batch3-staged-plan-checkpoint-response.json)
(`257e296adacef1a88d896d57291a2ca6d7e827ad9c6932fe9d44e519eef9fc3f`),
[derived JSON](../results/plan45/phase3/jev-api-phase3-batch3-staged-plan-checkpoint-derived.json)
(`0b3b53da31129bc6d8f81e1d8a51e00a49b3cba226e6d8b754b7f62301cb5b17`), and
[manifest](../results/plan45/phase3/jev-api-phase3-batch3-staged-plan-checkpoint-sha256.txt)
(`776c67cd3fefd28143231b84150b38307bbc900518767d18ec5aa87a01e549cb`). All
three manifest entries were verified; earlier plan-review artifacts remain
preserved separately.

Corrected plan reassessment artifacts: [request](../results/plan45/phase3/jev-api-phase3-batch3-plan-reassessment-request.json)
(SHA-256 `b54274d561a48c79cdd4562e2a3863a13e26454f99271151995f5d7902abed7b`),
[response](../results/plan45/phase3/jev-api-phase3-batch3-plan-reassessment-response.json)
(`eefecd442d95a6934d88369f64b41b9320773ebe95e2858940027fd6ce4d2a0e`),
[derived JSON](../results/plan45/phase3/jev-api-phase3-batch3-plan-reassessment-derived.json)
(`41d3d6d8ea548566d7a1a8cec3f2b37b0d1df5bf6dc1dc9f00ab12f63fc4127b`), and
[manifest](../results/plan45/phase3/jev-api-phase3-batch3-plan-reassessment-sha256.txt)
(`cdf3e5e90ae70eeab69347b4f9a940ee0d9e4ca9cb35707869dc56d17d6a0f25`). The
manifest covers both the preserved historical initial request/response and the
corrected initial reassessment artifacts.

| Sub-batch / new named Browser Mode case                                                           | Stable row / baseline assertions                                                                                                                                                                                                                                                                                                                                                         | Bounded Browser Mode contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Playwright guarantees to retain                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Batch3c — `CagrPanel keeps the result dialog open and renders a deterministic CAGR result`        | `p45-a-cagr-sheet-02`; candidate file `tests/browser-mode/CagrPanel.browser.test.tsx`; cover P42-046–049: dialog initially visible, remains visible after start-year change, calculated result visible, and rendered percent matches the signed optional-minus / exactly-two-decimal contract.                                                                                           | Mount actual `CagrPanel` with actual `useCagrState` and deterministic chart data; change start year and calculate; assert dialog persistence and rendered calculated result, not hook math alone.                                                                                                                                                                                                                                                                                                                                                                                                        | Keep production section/route trigger P42-040/-041, loaded production data, route wiring, and integration in E2E. This covers only component-local dialog/result behavior.                                                                                                                                                                                                                 |
| Batch3b — `StackedAreaChart omits both CPI boundary months from its rendered SVG axis`            | `p45-b-monthly-boundary-axis-21-cpi-2017-12-2018-1-svg`; cover the CPI loop execution of the shared P42-353–355 source group: first-axis-tick readiness and both boundary labels absent. Also assert at least one final SVG axis tick is present as the Browser Mode readiness equivalent. P42-356 has no independent current source assertion and is not claimed as migrated behavior.  | Mount the actual CPI `StackedAreaChart` with deterministic synthetic monthly labels; assert at least one final SVG axis tick is present and both `2017年12月` and `2018年1月` are absent.                                                                                                                                                                                                                                                                                                                                                                                                                | Retain independent production route/data/render E2E coverage. Keep the shared axis loop/assertions until both CPI and earnings Browser Mode axis tests pass, then remove that shared loop/assertion group once; remove its readiness helper only if no other caller uses it. Preserve other independent E2E coverage. Existing pure tick-algorithm unit tests remain the arithmetic owner. |
| Batch3b — `EarningsBreakdownChart omits both earnings boundary months from its rendered SVG axis` | `p45-b-monthly-boundary-axis-21-2017-12-2018-1-svg`; cover the earnings loop execution of the shared P42-353–355 source group: first-axis-tick readiness and both boundary labels absent. Also assert at least one final SVG axis tick is present as the Browser Mode readiness equivalent. P42-356 has no independent current source assertion and is not claimed as migrated behavior. | Mount the actual `EarningsBreakdownChart` with deterministic synthetic monthly labels; assert at least one final SVG axis tick is present and both `2017年12月` and `2018年1月` are absent.                                                                                                                                                                                                                                                                                                                                                                                                              | Retain independent production route/data/render E2E coverage. Remove the shared axis loop/assertion group only after both axis Browser Mode tests pass; remove its readiness helper only if it has no other caller. Preserve other independent E2E coverage. Existing pure tick-algorithm unit tests remain the arithmetic owner.                                                          |
| Batch3a — `Nominal SpendingBarChart shows legend controls with 32px touch targets at 412x915`     | `p45-b-consumption-mobile-acceptance-37-mobile-pixel-acceptance-plan25-openspec-dom-32px`; replace the nominal loop iteration of P42-166–168: first control visible, at least one legend control exists, and every measured control meets 32×32.                                                                                                                                         | Mount the actual nominal chart in a 412×915 Browser Mode viewport; open its legend and assert visible legend controls/content and actual button bounding boxes are at least 32×32.                                                                                                                                                                                                                                                                                                                                                                                                                       | Keep P42-165 production chart visibility in E2E. The component test does not prove the production route or mobile chart wiring.                                                                                                                                                                                                                                                            |
| Batch3a — `Real SpendingBarChart shows legend controls with 32px touch targets at 412x915`        | Same stable row; replace the real loop iteration of P42-166–168 with the same three mapped assertions for the real series.                                                                                                                                                                                                                                                               | Independent real-chart fixture and named test for the real series, with the same local legend visibility/content and ≥32×32 button bounds.                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Keep P42-165 production chart visibility in E2E.                                                                                                                                                                                                                                                                                                                                           |
| Batch3a — `Nominal SpendingBarChart shows its Recharts tooltip after chart hover`                 | `p45-b-consumption-mobile-acceptance-63-mobile-pixel-acceptance-plan25-openspec-tooltip-14px-16`; replace the nominal loop iteration of P42-170 only.                                                                                                                                                                                                                                    | Mount actual nominal `SpendingBarChart`/Recharts with deterministic data, hover an actual rendered bar, and assert tooltip visibility.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Keep P42-169 production visibility and P42-171–174 typography/alignment presentation checks in E2E. Do not duplicate direct `CustomTooltip` inline-style unit assertions.                                                                                                                                                                                                                  |
| Batch3a — `Real SpendingBarChart shows its Recharts tooltip after chart hover`                    | Same stable row; replace the real loop iteration of P42-170 only.                                                                                                                                                                                                                                                                                                                        | Independent real-series fixture and named test for actual Recharts hover-to-tooltip visibility.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Keep P42-169 and P42-171–174 in E2E; no direct tooltip typography duplication.                                                                                                                                                                                                                                                                                                             |
| Batch3a — `SpendingBarChart legend summary keeps its rendered text on one line`                   | `p45-b-consumption-mobile-acceptance-122-mobile-pixel-acceptance-plan25-openspec-summary-1`; replace P42-177 only for nominal and real loop iterations.                                                                                                                                                                                                                                  | Use one named Browser Mode test with nominal and real render fixtures, both mounted through the same actual `SpendingBarChart` summary/CSS path; assert computed `white-space: nowrap` on each summary. Before implementation, confirm the distinct fixture outputs from the actual props: with all visible expense keys and four visible quarters, two nominal keys render `費目・四半期を変更（費目 2/2・四半期 4/4）・全選択`, while three real keys render `費目・四半期を変更（費目 3/3・四半期 4/4）・全選択`. Do not assert or transfer summary copy.                                             | Keep P42-175 production visibility. Leave P42-176 closed-details and P42-178 summary-copy assertion ownership unchanged; do not duplicate existing unit/E2E coverage.                                                                                                                                                                                                                      |
| Batch3b — `EarningsBreakdownChart displays its tooltip after plot hover`                          | `p45-a-earnings-hover`; replace P42-290 only.                                                                                                                                                                                                                                                                                                                                            | Mount actual `EarningsBreakdownChart`, hover its real rendered plot, and assert the tooltip becomes visible; this covers the earnings plot path, not hook/helper behavior alone.                                                                                                                                                                                                                                                                                                                                                                                                                         | Keep the production route, viewport plot geometry (P42-287–289), and computed separator CSS in E2E.                                                                                                                                                                                                                                                                                        |
| Batch3c — `SpendingBarChart tooltip closes on Escape after controller-driven chart hover`         | `p45-b-tooltip-dismiss-578-chromium-escape-dismiss`; candidate file `tests/browser-mode/SpendingBarChart-tooltip-dismiss.browser.test.tsx`; candidate assertion P42-577 only.                                                                                                                                                                                                            | Mount nominal `SpendingBarChart` with actual `useChartTooltipController({ suppressed: false, isTouch: false })`; wire its `tooltipProps` and `onPointerDown`, `onPointerMove`, `onMouseMove`, `onPointerLeave`, and `onMouseLeave` through the chart event props. Real Browser Mode pointer hover over a rendered bar must activate the controller and show the tooltip; use the established `userEvent.keyboard("{Escape}")` to send Escape and assert it becomes hidden. Never set `activeChartId`, tooltip active state, or tooltip content directly. This checks component/controller behavior only. | Retain P42-575/-576 and P42-578–583, including re-hover, mouseleave, heading/bounds, outside-click, plus route and coordinate assertions (and any other row assertions) in Playwright. This does not claim production integration or coordinate geometry.                                                                                                                                  |

Batch3a comprises 3 stable rows / 5 named tests; Batch3b comprises 3 rows / 3
tests; Batch3c comprises 2 rows / 2 tests. For each sub-batch, first run its
focused Browser Mode verification, complete independent review, and obtain its
implementation JEV checkpoint before starting the next sub-batch. Do not run
E2E during these sub-batches. After Batch3c passes, run the full Browser Mode
suite; only after all ten new named cases pass, remove exactly the mapped
assertion groups and run one consolidated retained-E2E regression. At that gate, ten named Batch3 Browser Mode cases replace mapped assertion groups.
The cumulative unique Playwright source declaration/assertion-group count touched
is nine (Batch1 one, Batch2 one, Batch3 seven); the shared monthly-axis group
represents two chart loop cases but one source group. Verify all retained
route/mobile/geometry, production styling, and action guarantees, with no
duplicate primary owner. Keep `M=1`
because each transfer is partial at the stable-row level. Obtain independent
scope review and an implementation JEV checkpoint at each sub-batch boundary
before proceeding.

#### Batch3b corrected plan reassessment — JEV approved

The initial JEV plan reassessment returned `valid_as_defined` (confidence 0.90; pass probability 0.92), diagnosis complete, no follow-up. The full distribution is `valid_as_defined=0.92`, `requirements_mismatch=0.06`, `scope_violation=0.01`, `implementation_issue=0.01`; all other criteria are 0. The corrected B3b plan is approved for implementation. Earlier review artifacts remain preserved as historical checkpoints.

The accepted mapping treats extant P42-353/-354/-355 as one shared source group executed for both monthly-chart loop cases. P42-356 maps to test-end line 29 in the ledger, but there is no `labels.length` expect in the source; it is a ledger/source mismatch, not a current E2E assertion or transferred behavior. Each Browser Mode axis case checks both boundary labels are absent and at least one rendered tick exists as a readiness equivalent. After both tests pass, remove the shared loop/assertions once; remove the readiness helper only if unused, and preserve independent E2E coverage. Keep route/data integration, P42-287–289 geometry, P42-297 separator styling, and P42-290 earnings hover in Playwright. Stable rows remain partial; `A=123`, `E=90`, `M=1` is unchanged. No E2E before all ten named Batch3 Browser Mode cases pass.

Oracle's independent review found no blocker. It retained the implementation risks around deterministic boundary fixtures, rendered width/font/`ResponsiveContainer` behavior, possible route-fed-data divergence, and P42-353's readiness role. These remain implementation verification concerns, not open plan-review findings.

Corrected review artifacts: [request](../results/plan45/phase3/jev-api-phase3-batch3b-plan-reassessment-corrected-request.json) (SHA-256 `82bef7e3b09cdcf19b38af6f3b8f9b0003cd6ef52bf3a98869d7ba9b5b8ce98c`), [response](../results/plan45/phase3/jev-api-phase3-batch3b-plan-reassessment-corrected-response.json) (`4ca76f6150bc7c7fbdd310dbd3199907a6c043047d342bc6f4b775c67b7c663e`), [derived record](../results/plan45/phase3/jev-api-phase3-batch3b-plan-reassessment-corrected-derived.md) (`cc8add041d972e1096ccaffa88a849e0a7e3b1c87a2210e7c7ff03d87a8869d7`), and [SHA-256 manifest](../results/plan45/phase3/jev-api-phase3-batch3b-plan-reassessment-corrected-sha256.txt) (`fe6b0da70008daa6338f1905c90c98cdb524bc06d4e8a61b452f208b456b126e`). The manifest covers request, response, and derived record; entries were verified.

#### Batch3c corrected plan reassessment — JEV approved; implementation may start

The fresh initial JEV plan reassessment returned `valid_as_defined` (confidence 0.92; pass probability 0.93), diagnosis complete, no follow-up. Its full distribution is `valid_as_defined=0.93`, `requirements_mismatch=0.03`, `implementation_issue=0.01`, `scope_violation=0.01`, `other=0.01`; all other criteria are 0. The corrected plan authorizes implementation of the two B3c candidate cases. Earlier approved plan reviews are preserved as historical checkpoints.

CAGR candidate `tests/browser-mode/CagrPanel.browser.test.tsx` mounts actual `CagrPanel` and actual `useCagrState` with deterministic data; it verifies initial dialog visibility, persistence after changing start year, and a visible calculated result matching `^-?\d+\.\d{2}%$` for P42-046–049. Keep production route/section trigger P42-040/-041 and production data/route integration in E2E.

The desktop Escape candidate `tests/browser-mode/SpendingBarChart-tooltip-dismiss.browser.test.tsx` mounts actual nominal `SpendingBarChart` with actual `useChartTooltipController({ suppressed: false, isTouch: false })`, wired through `tooltipProps` and actual `onPointerDown`, `onPointerMove`, `onMouseMove`, `onPointerLeave`, and `onMouseLeave` chart event props. A real pointer hover over a rendered bar must activate the controller and show the tooltip; send Escape through `userEvent.keyboard("{Escape}")` and assert dismissal. Never assign `activeChartId`, tooltip active state, or content directly. This covers component/controller behavior only; P42-577 is the only proposed transfer. Retain P42-575/-576 and P42-578–583, including re-hover, mouseleave, heading/bounds, outside-click, plus P42-603/-604 and remaining route/coordinate assertions in E2E.

Keep both cases partial, preserve `A=123`, `E=90`, `M=1`, and run no E2E before all ten new named Batch3 Browser Mode cases pass. Oracle's blocking plan gap—the missing real desktop tooltip controller/handler path—is addressed; the retained E2E boundaries remain explicit.

Fresh B3c review artifacts: [request](../results/plan45/phase3/jev-api-phase3-batch3c-plan-reassessment-request.json) (SHA-256 `0e4e5d79db5cab968cee89b8b9a925cd8832ecf71ff6768218bcb6bfdfb60e08`), [response](../results/plan45/phase3/jev-api-phase3-batch3c-plan-reassessment-response.json) (`0fdb1af8873c22cdd98178946c88a2f24609ed20d2d6e65ee5d33bf0c366e809`), [derived record](../results/plan45/phase3/jev-api-phase3-batch3c-plan-reassessment-derived.md) (`f4f58e64f023863a9cda108b01fb674e1f193dd2d623180c1d4c419b9d0619b9`), and [SHA-256 manifest](../results/plan45/phase3/jev-api-phase3-batch3c-plan-reassessment-sha256.txt) (`e26f34e54256335b3c8491f690ee97ffbc13fadb0d5baffab5462c35b883065e`). The manifest covers request, response, and derived record; all entries were verified.

#### Batch3c implementation checkpoint — green candidates; E2E retained

Final focused Browser Mode verification passed 2 files / 2 tests in 5.03
seconds. The initial attempt measured a 0×0 responsive chart container, used
`not.toBeVisible` for a tooltip removed from the DOM, and hit `ENAMETOOLONG`
copying trace artifacts due to long test titles. The corrected run asserted a
1280×800 viewport, shortened titles, and used the established
`not.toBeInTheDocument` matcher; both tests passed.

The CAGR candidate uses actual `CagrPanel` / `useCagrState`, changes the start
year, calculates, and confirms the dialog remains visible with result `-12.94%`.
The Escape candidate uses actual nominal `SpendingBarChart` wired to actual
`useChartTooltipController({ suppressed: false, isTouch: false })` and all five
chart event props. It confirms a visible bar and the actual tooltip with
`食料（名目）` / `123.00` before sending `userEvent.keyboard("{Escape}")`, then
confirms removal from the DOM. It never sets controller state or tooltip
content directly. Oracle review is closed; it confirmed the controller/event
path and visible pre-Escape assertions address P42-577.

The implementation JEV checkpoint returned `valid_as_defined` (confidence
0.98; pass probability 0.99; probabilities: valid 0.99, implementation issue
0.01, all other criteria 0). Diagnosis is complete and no follow-up was
recommended. Both results are green candidates only; every original Playwright
assertion remains until all ten new named Batch3 Browser Mode cases pass and
the one-time source crosswalk/cleanup occurs. Keep P42-040/-041, P42-575/-576,
P42-578–583, P42-603/-604, route/coordinate assertions and the remaining
production E2E guarantees. Keep `A=123`, `E=90`, `M=1`; neither row is counted
as migrated. No E2E was run.

Implementation artifacts: [request](../results/plan45/phase3/jev-api-phase3-batch3c-implementation-checkpoint-request.json)
(SHA-256 `7e02569cda70565653feac75d63202e251f6f8d1315e71bab237b55b1528cbc0`),
[response](../results/plan45/phase3/jev-api-phase3-batch3c-implementation-checkpoint-response.json)
(`dacd1eec2e01d8116d21cdaa761fe2c57dc1f805ca26fb5686edf644740e6e8d`),
[derived record](../results/plan45/phase3/jev-api-phase3-batch3c-implementation-checkpoint-derived.md)
(`863494d0d7e5d98a4de50244a2780f294231e7b85fb97e754beb5b3b80a994f8`), and
[SHA-256 manifest](../results/plan45/phase3/jev-api-phase3-batch3c-implementation-checkpoint-sha256.txt)
(`8e096960e722c7609c5bf570d5f7606d35e7a5533be35457702ae62dd4dc0925`). The
manifest covers request, response, and derived record; all entries were
verified.

#### Batch3a implementation checkpoint — complete

Batch3a focused Browser Mode verification passed for
`tests/browser-mode/SpendingBarChart-mobile.browser.test.tsx` (1 file / 5
tests, exit 0). The mobile viewport was set and checked at 412×915; the exact
legend target selector was `button[aria-pressed]`. Independent Oracle review
closed with no mismatch. The first two focused attempts failed only from API
misuse (`page.setViewportSize`, then Playwright-only `evaluateAll` and
`toHaveCSS`); the corrected `page.viewport`, `locator.elements`, and
`window.getComputedStyle` run passed 5/5.

The implementation JEV checkpoint returned `valid_as_defined` (confidence
0.97; pass probability 0.98; probabilities: valid 0.98, incomplete
implementation information 0.02, all other criteria 0). Diagnosis is complete
and no follow-up was recommended. B3a transfers only P42-166/-167/-168 for
nominal and real variants in row37, P42-170 for nominal and real tooltip
visibility in row63, and P42-177 for nominal and real computed nowrap in
row122. P42-165 remains E2E; P42-169 and P42-171–174 remain E2E; P42-175
remains E2E and P42-176/-178 ownership is unchanged. These three stable rows
remain partial, so `A=123`, `E=90`, `M=1` and eligibility counts are unchanged.
No E2E was run; defer consolidated E2E until all ten new named Batch3 Browser
Mode cases pass.

Checkpoint artifacts: [request](../results/plan45/phase3/jev-api-phase3-batch3a-implementation-checkpoint-request.json)
(SHA-256 `c6a92b108cb3bf908103547dbf8d7c0df4baad5d11bea84ebea5d765f5b6bbce`),
[response](../results/plan45/phase3/jev-api-phase3-batch3a-implementation-checkpoint-response.json)
(`d9dccb027a34013726fad0bb34a11550321c2b0b84abc235944a6b4143ab32ff`),
[derived record](../results/plan45/phase3/jev-api-phase3-batch3a-implementation-checkpoint-derived.md)
(`98d93ef24cb5b265787daa8dbce87c641ee835d2a72bf853c07f6eb438fd6edd`), and
[SHA-256 manifest](../results/plan45/phase3/jev-api-phase3-batch3a-implementation-checkpoint-sha256.txt)
(`102ea763b5a47cb0fe4876cc1e689f23c405ee5c94deba4210dfe8b38d742492`). All
request, response, and derived-record entries in the manifest were verified.

#### Batch3b implementation checkpoint — green candidates; E2E retained

Focused Browser Mode verification passed 2 files / 3 tests in 5.32 seconds.
The first attempt passed both axis cases but failed earnings hover because its
horizontal line path had a zero-height bounding box; switching to the actual
visible nonzero-area Recharts area path fixed the hover case. The corrected
focused run passed all three tests. Unsuppressed React/Recharts development
warnings for forwarded chart props and a false active attribute remain visible;
there is no zero-console-error claim.

Independent Oracle review found no blocker. The two axis tests are green
component-level candidates for P42-353/-354/-355 across both chart iterations.
P42-356 maps to test-end line 29 but has no `labels.length` expect; it is not
covered or moved. The earnings hover case covers P42-290 only. Keep P42-287–289
viewport/plot assertions, P42-297 separator styling, route/data integration,
and the shared Playwright axis group intact until all ten new Batch3 named
Browser Mode cases pass and the final source crosswalk is reviewed. Remove the
shared axis group once only after both axis tests pass; remove its readiness
helper only if unused. These green candidates do not complete any stable row or
increment `M`; preserve `A=123`, `E=90`, `M=1`. No E2E was run and no Playwright
source edit was made.

The implementation checkpoint returned `valid_as_defined` (confidence 0.96;
pass probability 0.97; probabilities: valid 0.97, implementation issue 0.02,
requirements mismatch 0.01, all other criteria 0). Diagnosis is complete and
no follow-up was recommended. Artifacts: [request](../results/plan45/phase3/jev-api-phase3-batch3b-implementation-checkpoint-request.json)
(SHA-256 `77c75857c7f9a3bae236a327f8c135790e4842553c5c4ad25a8e64a7b90e3ef1`),
[response](../results/plan45/phase3/jev-api-phase3-batch3b-implementation-checkpoint-response.json)
(`02537c710baa39f65dd40e4a802725a42390a83ac7384f789c9c95b446f5f914`),
[derived record](../results/plan45/phase3/jev-api-phase3-batch3b-implementation-checkpoint-derived.md)
(`a2a9b5b0af83fe49c274eaba421df0d20690cbffa0744731f3aab9a50e582149`), and
[SHA-256 manifest](../results/plan45/phase3/jev-api-phase3-batch3b-implementation-checkpoint-sha256.txt)
(`e47f927f7e27d75b11a0e7bb4853e7f1bb8af8bf8e34bfc90639bdb9ad89b823`). All
request, response, and derived-record entries were verified.

- [ ] Batch 2 以降は、Phase 0 で承認された残る Browser Mode 候補から1〜3 scenario の batch を選ぶ。既に責務が unit / component test にある契約は重複させず、各 batch の前に対象範囲と残す Playwright 保証を明記する。
- [ ] scenario ごとに移行前 assertion ID → 新 test assertion → 残す Playwright assertion の対応を記録する。Browser Mode 側の代替が green になるまで既存 E2E assertion を消さず、その後に重複範囲だけ削る。
- [ ] 実データ・実 component prop のどちらが必要か明記する。Browser Mode の render test が既存 happy-dom test と同じ契約を単に反復するなら移行しない。
- **受け入れ条件:** batch 内全 assertion に一対一の責任先があり、A / E / M の更新後も Playwright の必須 browser-only 保証が残る。独立 review と focused verification が終わるまで次 batch を開始しない。

#### Batch3 final source cleanup and consolidated verification — JEV checkpoint pending

The ten new Batch3 named Browser Mode tests passed before cleanup. The full
Browser Mode suite passed 10 files / 16 tests. `pnpm run test:e2e:clean` found
no process was found using E2E port 3100; the consolidated `pnpm run test:e2e` run passed 116 of
135 tests, skipped 19, failed 0, and completed in 3.6 minutes. Browser Mode
reported unsuppressed Recharts unknown-prop and `false active` warnings; the
E2E `NO_COLOR` / `FORCE_COLOR` messages were nonblocking. These warnings are
recorded without a clean-console claim.

The final source map is assertion-level and conservative. The CAGR P42-046–049
component contract was removed from the Playwright test after the actual
`CagrPanel` / `useCagrState` candidate passed; P42-040/-041 production trigger,
route/data integration, and other sheet cases remain. Mobile row 37 removed
P42-166–168 while retaining P42-165 production chart visibility; row 63
removed P42-170 while retaining P42-169 and P42-171–174; row 122 removed
P42-177 while retaining P42-175/-176/-178. The earnings hover helper's
P42-290 visibility assertion was removed and explicit visibility assertions
remain at the hidden-series initial and fresh-hover callsites; P42-287–289
plot geometry and P42-297 separator styling remain. Tooltip-dismiss removed
only P42-577 Escape dismissal, retaining P42-575/-576, P42-578–583, and route /
coordinate assertions.

The monthly-boundary Playwright file was its sole test and was deleted after
both synthetic Browser Mode chart cases passed. P42-353/-354/-355 were one
shared source assertion group across CPI and earnings loop executions; P42-356
was a ledger/source mismatch at the test-end line, with no `labels.length`
expect. The synthetic Browser Mode cases now assert the exact December 2017
and January 2018 axis-label omissions. Broader retained route E2E covers
integration but does **not** assert those exact boundary omissions; this is a
known coverage-boundary change, not unchanged route coverage.

All affected stable rows remain partial because route/data integration or
other assertions remain in Playwright. Accordingly `A=123`, `E=90`, `M=1` is
unchanged; none of these assertion slices is counted as another fully migrated
stable scenario. The ten-case gate and consolidated E2E run are complete, but
the overall Phase3 migration and all 33 Phase5 investigations remain in
progress/deferred. Independent Explorer source mapping and Oracle scope review
found no blocker and confirmed the partial-row accounting and exact-axis
limitation.

A fresh v3 JEV `implementation_checkpoint_validity` request is prepared for
this final cleanup and evidence set; its initial checkpoint is pending. The
request asks whether the cleanup and verification are valid as defined, with
eight mutually exclusive criteria and one choice. It requires JEV to assess
the partial-versus-complete distinction, exact source map, the synthetic-only
axis boundary evidence, and the bounded warnings above. No response or verdict
is claimed here. [Request](../results/plan45/phase3/jev-api-phase3-final-migration-implementation-checkpoint-request.json),
[derived context](../results/plan45/phase3/jev-api-phase3-final-migration-implementation-checkpoint-derived.md),
and [SHA-256 manifest](../results/plan45/phase3/jev-api-phase3-final-migration-implementation-checkpoint-sha256.txt)
are recorded separately.

#### Batch3d proposed plan — CAGR sheet viewport pair

**Status: JEV plan-approved; implementation may start after prior batch gates.** Batch3d contains exactly two
named Browser Mode cases, one each for `p45-a-cagr-sheet-08` and
`p45-a-cagr-sheet-09`. These add 2 toward the next 20 further Browser Mode
migrations before the next consolidated E2E run. The counter from the last
consolidated E2E is now 2/20. Do not run E2E before all 20 further named cases
pass. Each stable row remains partial, and `M` does not
increase.

The existing Browser Mode fixture in
`tests/browser-mode/CagrPanel.browser.test.tsx` mounts the actual `CagrPanel`
and `useCagrState` with deterministic two-row CPI data. It currently relies on
the default 1280×800 viewport and does not load `globals.css`. Each new test
must set and verify its exact Browser Mode viewport. Because production global
CSS is absent from this fixture, include an explicit fixture style baseline for
the relevant document defaults (16px root size, border-box sizing, zero body
margin/padding, and documented system-font fallback); bound the geometry claim
to that fixture baseline. Do not claim production page-shell placement from
these component tests.

| Stable row / candidate Browser Mode test                                                                                                    | Exact source mapping to replace after green                                                                                                                                                                                                   | Bounded Browser Mode contract                                                                                                                                                                                                                                                                                                   | E2E ownership to retain                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `p45-a-cagr-sheet-08` — `CagrPanel keeps portrait result detail and note inside 375x667` in `tests/browser-mode/CagrPanel.browser.test.tsx` | Original T-E2E-8 (`tests/e2e/cagr-sheet.e2e.spec.ts:175`): P42-060 dialog visible is retained as route integration; transfer P42-061 result value visible, P42-062 `.cagrResultDetail` bottom ≤667, and P42-063 `.cagrSheetNote` bottom ≤667. | Render actual `CagrPanel` / `useCagrState` with the existing deterministic data; use a verified 375×667 viewport; open the sheet and calculate; assert component-local dialog/result visibility and the two element bottom bounds against 667. This proves local component layout under the declared fixture CSS baseline only. | Keep production `page.goto`, live `#section-stacked` intersection/scroll, actual route trigger and click, page-shell placement, and P42-060 trigger-to-dialog visible check as E2E integration ownership. |
| `p45-a-cagr-sheet-09` — `CagrPanel keeps landscape result detail inside 667x375` in `tests/browser-mode/CagrPanel.browser.test.tsx`         | Original T-E2E-9 (`tests/e2e/cagr-sheet.e2e.spec.ts:205`): P42-064 dialog visible is retained as route integration; transfer P42-065 result value visible and P42-066 `.cagrResultDetail` bottom ≤ `window.innerHeight + 1` (376px).          | Render the same actual component/hook fixture; use and verify 667×375; open the sheet and calculate; assert component-local dialog/result visibility and detail bottom ≤376. Scope is the sheet-local result and its fixture viewport bound, not route/page-shell geometry.                                                     | Keep production `page.goto`, live `#section-stacked` intersection/scroll, actual route trigger and click, page-shell placement, and P42-064 trigger-to-dialog visible check as E2E integration ownership. |

Source context: `BottomSheet` is inline and fixed, with a 60dvh maximum; the
compact variant is 45dvh and landscape at heights ≤500px raises it to 70dvh.
The Browser Mode assertions cover only dialog/result visibility and the mapped
sheet-local bottom bounds. They do not cover the production chart's live
intersection, route-fed data, trigger location, or page-shell placement.
**Implementation status (2026-09-26):** Both named Browser Mode cases are
implemented in `tests/browser-mode/CagrPanel.browser.test.tsx`, using explicit
375×667 and 667×375 viewport assertions and the declared fixture CSS baseline.
Focused verification passed 3/3 tests in that file, including the two new
viewport cases and the existing dialog/result case. An initial focused attempt
used unsupported `page.locator`; it was corrected to supported Browser Mode
viewport/locator APIs before the passing run. Playwright removed only P42-061–063
portrait result/geometry and P42-065/-066 landscape result/geometry assertions.
P42-060/-064 dialog-visible checks remain after the production trigger as route
integration evidence; the production trigger, live `#section-stacked`
intersection/scroll, and page-shell placement remain E2E-owned. No E2E ran because
the next consolidated gate is 20 cases; B3d contributes 2/20. `A=123`, `E=90`,
`M=1` remains unchanged and both rows are partial.

The implementation JEV checkpoint returned `valid_as_defined` (confidence
0.92, passProbability 0.93; distribution: valid 0.93, indeterminate 0.02,
missing_prerequisites_info 0.02, incomplete_implementation_info 0.01,
requirements_mismatch 0.01, implementation_issue 0.01, scope_violation 0,
other 0). Diagnosis is complete; no follow-up was recommended. The result
validates these bounded implementation slices but does not waive independent
review before treating them as fully reconciled, does not change stable-row
partial status, and does not allow E2E before the 20-case gate.

Artifacts: [request](../results/plan45/phase3/jev-api-phase3-batch3d-implementation-checkpoint-request.json)
(SHA-256 `e538df1df0b7fa70bc4d55bb9c30b0c531c4bb1b96639b0923eb22949fb0c8ba`),
[response](../results/plan45/phase3/jev-api-phase3-batch3d-implementation-checkpoint-response.json)
(`7d09cbb37f44c5f324b6192ba6922b292d62e985007202f6d55cba727e58ad7e`),
[derived record](../results/plan45/phase3/jev-api-phase3-batch3d-implementation-checkpoint-derived.md)
(`8c651bc320037d94f911a2e136befb280c3a2c5f58f00eaf0dc1b706798da041`), and
[manifest](../results/plan45/phase3/jev-api-phase3-batch3d-implementation-checkpoint-sha256.txt)
(`0dfd3785d48ff711344829925bff3c84f98bd1134106b642b741d8a0a32ed3dd`). All
request/response/derived manifest entries verify.

The fresh v3 plan checkpoint returned `valid_as_defined` (confidence 0.88,
passProbability 0.90; distribution: valid 0.90, implementation_issue 0.03,
requirements_mismatch 0.02, incomplete_implementation_info 0.02,
missing_prerequisites_info 0.01, scope_violation 0.01, other 0.01,
indeterminate 0). Diagnosis is complete; no follow-up was recommended. The
[request](../results/plan45/phase3/jev-api-phase3-batch3d-plan-checkpoint-request.json)
(SHA-256 `e00bad9c986dc529b8d227c2ad10ae9ea65e4e0b54bf03d3dac3bb9dd3af643f`),
[response](../results/plan45/phase3/jev-api-phase3-batch3d-plan-checkpoint-response.json)
(`4957519620f38cdafad7fc54c3da8d395d6b0c06058a22874523d0996ef1f152`), [derived context](../results/plan45/phase3/jev-api-phase3-batch3d-plan-checkpoint-derived.md)
(`35746b1798b9a2cec31c5fc8741ba327dd12ffd33e78924115c528a6f8ffddc9`), and [manifest](../results/plan45/phase3/jev-api-phase3-batch3d-plan-checkpoint-sha256.txt)
(`986b528124191ad5672e876138cf306ca3758d8b124cfc4e6fb77a092f602fac`) preserve the fresh plan review.

#### Batch3e implementation correction — 14 mapped cases; P42-262 candidate withdrawn

**Status: B3e-a/b/c implementation checkpoints passed; roadmap corrected after source audit.** The original B3e plan proposed 17 cases across 10 rows. Actual implementation is 14 mapped assertion-slice cases across seven rows: B3e-a six, B3e-b two, and B3e-c six. The two earnings viewport cases were deferred; the proposed P42-262 area-path transfer is withdrawn because immutable Plan42 maps P42-262 to the 12-item legend-label loop, already component-unit-owned. The current live `#section-stacked`/area-path route smoke has no corresponding P42 ID and remains in Playwright. Any isolated area-path smoke is unmapped supplementary coverage and does not count toward migration cadence. B3d contributed 2; B3e's actual cases bring the counter to 16/20. Keep `A=123`, `E=90`, `M=1`; these are partial assertion-slice transfers, not fully migrated stable rows. No E2E runs until a further valid case reaches 20/20. Do not include the 768/769 page-shell-dependent cases.

The current Browser Mode fixtures are narrower than these candidates: the
SpendingBarChart fixture uses a 412×915 viewport and only two nominal / three
real categories; the EarningsBreakdownChart fixture uses a simplified tooltip
at 1280×800; MonthlyBoundaryAxis already mounts the actual StackedAreaChart
with deterministic synthetic monthly data. The new cases must use actual
components, deterministic data sized for each measured contract, explicit
viewport setup, and the relevant production component CSS. Do not substitute
the simplified earnings tooltip fixture for `CustomTooltip` in the bounds
cases.

| Execution sub-batch / stable row                                                         | Named Browser Mode cases and mapped source assertion slice                                                                                                                                                                                                                                                                                                                      | Keep in E2E / unit ownership                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B3e-a** — `p45-b-consumption-mobile-readability-52-320px-y-x`                          | Two independent actual `SpendingBarChart` fixtures: nominal and real at 320×667. Each replaces its width-loop iteration's P42-203–207, P42-209–213, P42-215–217 geometry assertions. Exclude P42-208 nonnegative data-domain values and P42-214 quarter-label format.                                                                                                           | Keep P42-202 production section visibility and P42-218 document scroll-width assertion in E2E. Keep P42-208/-214 as data/value-format assertions in E2E. Route, production page shell, and section integration stay Playwright-owned.                                                                         |
| **B3e-a** — `p45-b-consumption-mobile-readability-52-375px-y-x`                          | Two named actual chart cases, nominal and real at 375×667; same geometry assertion bundle P42-203–207, -209–213, -215–217 only.                                                                                                                                                                                                                                                 | Keep P42-202/-208/-214/-218 and route/page-shell ownership in E2E.                                                                                                                                                                                                                                            |
| **B3e-a** — `p45-b-consumption-mobile-readability-52-390px-y-x`                          | Two named actual chart cases, nominal and real at 390×667; same geometry assertion bundle only.                                                                                                                                                                                                                                                                                 | Keep P42-202/-208/-214/-218 and route/page-shell ownership in E2E.                                                                                                                                                                                                                                            |
| **B3e-b** — `p45-b-consumption-mobile-readability-52-430px-y-x`                          | Two named actual chart cases, nominal and real at 430×667; same geometry assertion bundle only.                                                                                                                                                                                                                                                                                 | Keep P42-202/-208/-214/-218 and route/page-shell ownership in E2E.                                                                                                                                                                                                                                            |
| **B3e-b deferred** — `p45-b-consumption-mobile-readability-191-375px-tooltip-6-viewport` | Originally proposed actual chart/`CustomTooltip` bounds case at 375×667 for P42-230 and P42-232–240. Deferred after feasibility review: production mobile controller uses click activation and fixed wrapper placement, while the candidate relied on hover and overridden placement; stable Geist font assets are generated under `.next` and are not a checked-in test asset. | Keep P42-219–240 in E2E, including content/activation and all tooltip viewport bounds. Do not count this case.                                                                                                                                                                                                |
| **B3e-b deferred** — `p45-b-consumption-mobile-readability-191-430px-tooltip-6-viewport` | Originally proposed actual chart/`CustomTooltip` bounds case at 430×667 for P42-230 and P42-232–240. Deferred for the same controller-placement and stable-font parity reasons.                                                                                                                                                                                                 | Keep P42-219–240 in E2E, including content/activation and all tooltip viewport bounds. Do not count this case.                                                                                                                                                                                                |
| **B3e-c** — `p45-b-consumption-mobile-readability-297-375x667-tooltip`                   | Two actual `SpendingBarChart` / controller-driven `CustomTooltip` cases, nominal and real at 375×667, with the full production key sets. Transfer only P42-246/-247/-248 computed overflowY, max-height, and paddingBottom; P42-250 scrollHeight>clientHeight; P42-255 scroll-to-end within 1px; and P42-256 close visible after scroll.                                        | Retain P42-241/-242 route visibility and real touch/controller activation, P42-243/-244 content/key mapping, P42-251–254 absolute tooltip viewport bounds, P42-257–260 close-button viewport bounds, and P42-261 after-close hidden behavior. P42-245 remains unit-owned; P42-249 remains removed/unit-owned. |
| **B3e-c** — `p45-b-consumption-mobile-readability-297-320x480-tooltip`                   | Two actual nominal/real controller-driven chart-tooltip cases at 320×480; same exact P42-246/-247/-248, -250, -255, and -256 CSS/scroll slice only.                                                                                                                                                                                                                             | Retain P42-241–244, P42-251–254, P42-257–261; keep P42-245/-249 with their current unit/no-E2E ownership.                                                                                                                                                                                                     |
| **B3e-c** — `p45-b-consumption-mobile-readability-297-landscape-tooltip`                 | Two actual nominal/real controller-driven chart-tooltip cases at 667×375 landscape; same exact P42-246/-247/-248, -250, -255, and -256 slice only.                                                                                                                                                                                                                              | Retain P42-241–244, P42-251–254, P42-257–261; keep P42-245/-249 with their current unit/no-E2E ownership.                                                                                                                                                                                                     |

The width-pair fixtures must assert only component geometry: safe-area-aware
section bottom spacing, chart wrapper/SVG bounds, numeric tick presence,
positive bounded bars and non-overlapping centers, tick counts, and measurable
unclipped centered X-axis text. P42-208's tick-value domain and P42-214's
quarter-label format are outside this Browser Mode slice. For earnings tooltip
bounds, P42-231 is explicitly retained because its current expect mixes row
value presence with label measurement; only separately mapped outer/total/row
rectangle bounds transfer. For the internal-scroll cases, build actual
nominal/real payloads with the full production key sets and enough rows to
overflow the rendered `CustomTooltip`; use the real touch controller and its
normal wrapper placement. Transfer only computed overflow/max-height/padding,
scroll overflow, reaching the scroll end, and close visibility after scroll.
Keep touch activation, route data, exact payload keys, absolute tooltip and
close-button viewport bounds, and post-close behavior in E2E. P42-245 remains existing unit-owned “no other N”
behavior, and P42-249 is absent from E2E and directly covered by a unit style
assertion. Correction: P42-262 is the 12-item legend-label loop at immutable
baseline line 35 and is already covered by `tests/components/all.test.tsx`; it
does not identify the current `#section-stacked`/area-path route smoke. That
smoke remains wholly in Playwright and has no P42 mapping to transfer.

Execution sequence: B3e-a (3 rows / 6 cases), B3e-b (1 row / 2 cases; two
earnings viewport candidates deferred), and B3e-c (3 rows / 6 cases). B3e-d /
P42-262 is dropped as an invalid mapping.
After each sub-batch, run
its focused Browser Mode checks and independent diff review, then obtain a
fresh implementation JEV checkpoint before starting the next sub-batch. Use
one initial plan JEV review for this staged roadmap, not a repeated plan call
per sub-batch. No E2E, targeted Playwright, or full E2E command runs during
B3e. The actual 14 mapped cases have passed focused verification and their
implementation JEV checkpoints; cumulative count is 16/20. B3e does not reach
the next E2E gate. The proposed B3f Cagr pair below would advance to 18/20,
still below the gate; wait for another valid plan-reviewed case before any
consolidated E2E regression. No claim of `M` increase is permitted.

Fresh plan-review artifacts: [request](../results/plan45/phase3/jev-api-phase3-batch3e-plan-checkpoint-request.json),
[derived context](../results/plan45/phase3/jev-api-phase3-batch3e-plan-checkpoint-derived.md),
and [manifest](../results/plan45/phase3/jev-api-phase3-batch3e-plan-checkpoint-sha256.txt).

The fresh v3 plan checkpoint returned `valid_as_defined` (confidence 0.78,
passProbability 0.81; distribution: valid 0.81, requirements_mismatch 0.06,
scope_violation 0.06, implementation_issue 0.06,
incomplete_implementation_info 0.01, remaining criteria 0). Diagnosis is
complete; no follow-up was recommended. This approves the staged roadmap only;
implementation, focused checks, independent subbatch reviews, and per-subbatch
implementation JEV gates remain required before assertion cleanup. Artifacts:

#### B3e-a implementation status — focused verification and JEV checkpoint complete

The six named cases are implemented in `tests/browser-mode/SpendingBarChart-readability.browser.test.tsx`: nominal and real fixtures at 320×667, 375×667, and 390×667. Focused Browser Mode verification passed 6/6. Each sets and asserts the Browser Mode viewport and measures the actual component's section spacing, wrapper/SVG bounds, Y-axis ticks, rendered bars and separation, and X-axis tick text geometry. Independent review confirmed the production 21 nominal / 11 real keys, 84-quarter series, and `.container`-equivalent 1rem horizontal padding with `box-sizing: border-box` in the fixture. No route/data/page-shell behavior is claimed from these component fixtures.

At the B3e-a checkpoint, the Playwright width-loop source removed only P42-203–207, -209–213, and -215–217 for 320/375/390px. It retained P42-202 route/section visibility, P42-208 nonnegative Y values, P42-214 quarter-label formatting, and P42-218 document scroll-width; the 430px geometry groups and two earnings tooltip viewport assertions remained in E2E. Earlier focused attempts failed on a CSS Module selector, incomplete series data, and parent width; each was corrected before the 6/6 result. These are partial stable-row transfers, so `A=123`, `E=90`, `M=1` remains unchanged. B3d contributed 2 cases; B3e-a added 6, bringing that checkpoint counter to 8/20 since the last consolidated E2E. Independent review is closed. JEV implementation checkpoint passed `valid_as_defined` (confidence .98, pass probability .99; distribution: valid .99, scope violation .01, all other criteria 0); diagnosis complete, no follow-up. No E2E was run.

#### B3e-b implementation status — focused verification and JEV checkpoint complete; earnings cases deferred

Two named Browser Mode cases now add nominal and real `SpendingBarChart` chart-local geometry at 430×667. The 430px E2E iteration removes only P42-203–207, -209–213, and -215–217, retaining P42-202/-208/-214/-218. The two planned EarningsBreakdownChart/CustomTooltip viewport cases were removed after the feasibility review: production mobile controller behavior uses click activation and a fixed tooltip wrapper, but the candidate used hover and custom placement; the app's Geist font is generated by `next/font/google` into `.next` and is not available as a stable checked-in fixture asset. P42-219–240 therefore remain in E2E, including P42-230 and -232–240 bounds. B3e-b adds 2 cases to B3d+B3e-a, bringing the counter to 10/20. Focused Browser Mode verification passed 8/8, including the two new 430px cases; independent review is closed. JEV implementation checkpoint passed `valid_as_defined` (confidence .97, pass probability .98; distribution: valid .98, requirements mismatch .02, all other criteria 0); diagnosis complete, no follow-up. `A=123`, `E=90`, `M=1` remains unchanged. No E2E was run.

#### B3e-c implementation status — focused verification and JEV checkpoint complete

The six named cases are in `tests/browser-mode/SpendingBarChart-tooltip-scroll.browser.test.tsx`: nominal and real `SpendingBarChart` fixtures at 375×667, 320×480, and 667×375. They use the complete production 21/11 series keys, 84 deterministic quarters, production-equivalent outer container and chart-container widths, actual `useChartTooltipController({ suppressed: false, isTouch: true })`, its real chart handlers, and production `CustomTooltip` placement. The exact source audit narrowed the Browser Mode slice to P42-246/-247/-248 computed overflow/max-height/paddingBottom, -250 `scrollHeight > clientHeight`, -255 scroll-to-end within 1px, and -256 close visibility after scroll. E2E removes only those six expectation groups for both chart variants across all three viewports; it retains P42-241/-242 route visibility and touch/controller activation, -243/-244 content/key mapping, -251–254 absolute tooltip bounds, -257–260 close-button bounds, and -261 after-close hidden behavior. P42-245 remains unit-owned; -249 remains removed/unit-owned. Focused Browser Mode verification passed 6/6, independent review is closed, and implementation JEV passed `valid_as_defined` (confidence .95, pass probability .97; distribution: valid .97, incomplete info .01, indeterminate .01, missing prerequisites .01, all others 0); diagnosis complete, no follow-up. B3e-c adds 6 cases to the prior 10/20 counter, reaching 16/20; `A=123`, `E=90`, `M=1` remains unchanged, and stable rows remain partial. No E2E was run.

Implementation checkpoint artifacts: [request](../results/plan45/phase3/jev-api-phase3-batch3e-c-implementation-checkpoint-request.json) (SHA-256 `087552d69f31e4b512134d2df7d20fa47c2e2e65acad91e1090eef9b64d91563`), [response](../results/plan45/phase3/jev-api-phase3-batch3e-c-implementation-checkpoint-response.json) (`848861df2c157161b4e924aee3435e09e68c007562799edccd9658ed8a6804fc`), [derived record](../results/plan45/phase3/jev-api-phase3-batch3e-c-implementation-checkpoint-derived.md) (`9771fa105bdbafa13bd5160012107e484d1135fa3e4533c4253209fbec0e619b`), and [manifest](../results/plan45/phase3/jev-api-phase3-batch3e-c-implementation-checkpoint-sha256.txt).

Implementation checkpoint artifacts: [request](../results/plan45/phase3/jev-api-phase3-batch3e-b-implementation-checkpoint-request.json) (SHA-256 `6da480325026700a8493c18991fa0573b56dfd68338ff8abaaae7a0ce462acb5`), [response](../results/plan45/phase3/jev-api-phase3-batch3e-b-implementation-checkpoint-response.json) (`3b3f27017ca8faa96cad8d3418cef0f7d24d679eb61a100ce8580402b216de2b`), [derived record](../results/plan45/phase3/jev-api-phase3-batch3e-b-implementation-checkpoint-derived.md) (`dbc3daa44a159d403bcb0816f9423e67ce302a54fc93a6efdd4299f8ca0ebe91`), and [manifest](../results/plan45/phase3/jev-api-phase3-batch3e-b-implementation-checkpoint-sha256.txt).

Implementation checkpoint artifacts: [request](../results/plan45/phase3/jev-api-phase3-batch3e-a-implementation-checkpoint-request.json) (SHA-256 `d0667a9b75164923d56db1a0622401b3ed6e3f301a795aca9a097a976374cd48`), [response](../results/plan45/phase3/jev-api-phase3-batch3e-a-implementation-checkpoint-response.json) (`814f53b2c35be71bc06665be442728931b839843d92620a547370e7d8745cc2d`), [derived record](../results/plan45/phase3/jev-api-phase3-batch3e-a-implementation-checkpoint-derived.md) (`b779cb1c4d068bdfa967ce77bde734a079bb6a0a2fa06628ac3a5464d7f284d9`), and [manifest](../results/plan45/phase3/jev-api-phase3-batch3e-a-implementation-checkpoint-sha256.txt).

[request](../results/plan45/phase3/jev-api-phase3-batch3e-plan-checkpoint-request.json)
(SHA-256 `4493bcedb466b027eb2e2fa2c71f00093c3eb5b50d1d263219f88641ae7a479b`),
[response](../results/plan45/phase3/jev-api-phase3-batch3e-plan-checkpoint-response.json)
(`276cfcdb36f1d54b51e2ad07770e53c790d94c5735c3c1b783a216c7c5c57e12`),
[derived record](../results/plan45/phase3/jev-api-phase3-batch3e-plan-checkpoint-derived.md)
(`7e28d55b5b1202d8c19ab58973b38fa4849b620c8c24e5e25e23200b9283ae36`), and
[manifest](../results/plan45/phase3/jev-api-phase3-batch3e-plan-checkpoint-sha256.txt)
(`317d02c8426eb3088f124a99760f01aad77eb9958e2be252f576eaeab85340a9`).

#### B3f approved plan — two partial Cagr component slices

B3f proposes exactly two named Browser Mode cases in the existing
`tests/browser-mode/CagrPanel.browser.test.tsx` fixture, which mounts actual
`CagrPanel`, `useCagrState`, and `BottomSheet` component behavior with
deterministic chart data. The fixture approach has prior B3d evidence: the
focused CagrPanel Browser Mode file passed 3/3 and its implementation checkpoint
was JEV-approved (`valid_as_defined`, confidence .92 / pass probability .93).
Phase0 marked the full stable rows ineligible because their complete contracts
include live route setup, production trigger/overlay placement, viewport/page
integration, or real coordinate hit-testing. B3f isolates only component-local
contracts and retains production-route integration in Playwright.

| Stable row / named Browser Mode case                              | Proposed component assertion slice                                                                                                                                                                                                     | Retained Playwright contract                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `p45-a-cagr-sheet-03` — `cagrBackdropDismissesActualSheet`        | Mount actual `CagrPanel`/`useCagrState`/`BottomSheet`; open the component sheet, click the rendered backdrop through Browser Mode input, and assert the dialog is removed. This takes only P42-051's local close-on-backdrop contract. | Keep P42-050 production route trigger-to-dialog opening. Add an E2E assertion that `document.elementFromPoint(10,10)` resolves to the live backdrop before clicking `(10,10)`; do not claim the isolated fixture establishes production overlay placement or hit-testing. |
| `p45-a-cagr-sheet-07` — `cagrResultFitsWithoutInnerScroll375x667` | At 375×667, mount actual CagrPanel, calculate the result using the real hook, and assert rendered sheet `scrollHeight - clientHeight <= 0` (P42-059).                                                                                  | Keep the live route, `#section-stacked` trigger/open, and result-calculation flow in Playwright, including dialog/result assertions and all other production checks. Remove only the duplicated no-inner-scroll metric after focused Browser Mode passes.                 |

These are partial row slices: route setup, real page integration, and the
`(10,10)` production overlay target stay in E2E. B3f must verify the actual
component's rendered backdrop interaction and the exact 375×667 no-scroll
metric. The isolated B3d fixture uses a system-font fallback rather than the
production Geist font; keep geometry claims limited to the sheet-local scroll
metric and preserve production overlay/route checks. `A=123`, `E=90`, `M=1`
remains unchanged.

B3e contributes 14 actual mapped cases to B3d's 2, so the current cadence is
16/20. B3f adds two, reaching 18/20; no E2E is permitted until further
plan-reviewed and independently verified cases reach 20/20. Each B3f case
requires focused Browser Mode verification, independent diff review, and a
fresh implementation JEV checkpoint before a later batch starts. This is a
plan checkpoint only; no implementation or test execution is included. The fresh corrected B3e/B3f plan review passed `valid_as_defined` (confidence .98, pass probability .99; distribution: valid .99, incomplete implementation info .01, all other criteria 0); diagnosis complete, no follow-up. The earlier B3e 17-case review is preserved as historical and does not satisfy this corrected mapping checkpoint.

Plan-review artifacts: [request](../results/plan45/phase3/jev-api-phase3-batch3f-plan-checkpoint-request.json) (SHA-256 `4a928c3b10709b32a6f312fbe49ad3a7c218893c4591f46b1e53710e2ae27123`), [response](../results/plan45/phase3/jev-api-phase3-batch3f-plan-checkpoint-response.json) (`a980a54b539efce9c4e8f9b127027c0aab875065b249e8fe6dc8376f601f6db2`), [derived record](../results/plan45/phase3/jev-api-phase3-batch3f-plan-checkpoint-derived.md) (`df69fb4dd2fcf0ba63467e1b2ec928c4eeea4f8b1e534e16684d71b68a1cfe53`), and [manifest](../results/plan45/phase3/jev-api-phase3-batch3f-plan-checkpoint-sha256.txt).

**B3f source implementation status:** `tests/browser-mode/CagrPanel.browser.test.tsx` now contains the two planned cases: actual component backdrop dismissal (P42-051) and 375×667 calculated-sheet no-inner-scroll (P42-059). `tests/e2e/cagr-sheet.e2e.spec.ts` retains the route trigger, actual `(10,10)` click, and now asserts that `elementFromPoint(10,10)` hits the production backdrop; T-E2E-7 retains route calculation and removes only the no-scroll metric. The rows remain partial and `A=123/E=90/M=1` is unchanged; cadence is 18/20. Focused Browser Mode verification passed 5/5, independent review is closed, and implementation JEV passed `valid_as_defined` (confidence .98, pass probability 1.00; distribution: valid 1.00, all others 0); diagnosis complete, no follow-up. No E2E was run for B3f.

Implementation checkpoint artifacts: [request](../results/plan45/phase3/jev-api-phase3-batch3f-implementation-checkpoint-request.json) (SHA-256 `71cdba6ae5650dddacb9e8028a6dacc4ca9a14d767847e86cc60f84581b196da`), [response](../results/plan45/phase3/jev-api-phase3-batch3f-implementation-checkpoint-response.json) (`f3391ba05a76b55af30784b0f1e5523398855689be615115f18f7755c1d542d0`), [derived record](../results/plan45/phase3/jev-api-phase3-batch3f-implementation-checkpoint-derived.md) (`898070a5c213c19d93f6450d18382c0dd226e7934d06ec1087f190ef1ac7e014`), and [manifest](../results/plan45/phase3/jev-api-phase3-batch3f-implementation-checkpoint-sha256.txt).

#### B3g approved plan — two CpiChart range-select dismiss cases

B3g proposes exactly two assertion-level Browser Mode cases for `p45-b-range-change-215-e2e` and P42-471/-473. Both cases must mount the real `CpiChart`, `ChartFilters`, and `BottomSheet`, use deterministic representative CpiChart props/data, open the real range sheet, change a valid select value, and verify that the actual sheet closes. One case changes `#startYear` (P42-471); the other reopens the sheet and changes `#endYear` (P42-473). Each case must begin from isolated, fresh `window.history` state so URL writes from a preceding render cannot affect its initial query state.

The standalone fixture's only known Next-specific dependency is `useSearchParams` via `useUrlState`. A narrow explicit adapter for that hook may be used if standalone Browser Mode requires it, but adapter selection is not decided at planning time. Do not mock `CpiChart`, `ChartFilters`, `BottomSheet`, the year-change handlers, or sheet state. Keep URL writes and live route/data/chart integration outside the isolated fixture claim. Reset history/query state before each independent case and verify it cannot inherit another case's `replaceState` mutation.

| Stable row / cases                                                                                       | Browser Mode slice proposed                                                                                                                                                                                                                                           | Retained Playwright contract                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `p45-b-range-change-215-e2e` — `startYearChangeClosesActualRangeSheet`, `endYearChangeClosesActualRange` | Actual `CpiChart` and its real `ChartFilters` and `BottomSheet`; changing the start year and end year independently closes the rendered sheet. Transfer only P42-471 (start select becomes hidden after change) and P42-473 (end select becomes hidden after change). | Retain P42-470/-472 visibility before each change in the real route test. Keep the real route/setup, select operations, URL serialization, data filtering and rendered-chart integration asserted across the `range-change` E2E suite. Playwright remains the authority for route and URL/data/chart wiring. |

Phase0 marked the complete stable row ineligible because its contract runs
through the production route, URL state, filtered data and rendered charts.
This proposal transfers only the sheet-close reaction to a user select
interaction, while retaining pre-change visibility and route/URL/data/chart
coverage in Playwright. The Browser Mode fixture must not claim those live
integration guarantees. If the narrow `useSearchParams` adapter is needed,
document its exact behavior before implementation; keep it limited to providing
initial query state and do not adapt the production state handlers. Each case
must start with fresh history state because `useUrlState` updates the URL.

B3f leaves the cadence at 18/20. B3g adds two cases; after focused Browser Mode
verification, independent review, and implementation JEV pass, the cadence
reaches exactly 20/20 and permits one consolidated retained-E2E regression.
Do not run E2E before both new cases pass their gates. `A=123`, `E=90`,
`M=1` remains unchanged, and the stable row remains partial. This is a plan
checkpoint only; no source edits or test runs are included. JEV initial plan review selected `valid_as_defined` (confidence .60, pass probability .66; distribution: valid .66, incomplete implementation info .20, missing prerequisites .10, indeterminate .03, scope violation .01, all other criteria 0); diagnosis complete, no follow-up. The plan gate passes, while the adapter choice remains conditional and unresolved by design.

Plan-review artifacts: [request](../results/plan45/phase3/jev-api-phase3-batch3g-plan-checkpoint-request.json) (SHA-256 `8e468390c61994ade642b2cafb9acdf98ec4e210111f76cf576762738e65cc17`), [response](../results/plan45/phase3/jev-api-phase3-batch3g-plan-checkpoint-response.json) (`ab66aeed463d907362820cbfbcdff8d93f10206d18dc9a1104316ca1452953b1`), [derived record](../results/plan45/phase3/jev-api-phase3-batch3g-plan-checkpoint-derived.md) (`583d470dbf37cd54ecf9983520e217620c0dff065d4a9ce99f36e7b3890afbee`), and [manifest](../results/plan45/phase3/jev-api-phase3-batch3g-plan-checkpoint-sha256.txt).

B3g implementation checkpoint: focused `CpiChart-range-close.browser.test.tsx` passed 2/2. After reaching 20/20, the consolidated `pnpm run test:e2e` passed 116 tests, skipped 19, 135 total, with zero failures; range-change P42-470/-472 and production route/URL assertions passed. Playwright assertions remain preserved, so P42-471/-473 are still partial component slices and the stable row is not counted as fully migrated. `A=123`, `E=90`, `M=1` is unchanged. The fresh implementation JEV checkpoint passed `valid_as_defined` (confidence .99, pass probability 1.00; distribution valid 1.00, all other criteria 0); diagnosis complete, no follow-up. See [request](../results/plan45/phase3/jev-api-phase3-batch3g-implementation-checkpoint-request.json) (SHA-256 `39de29b9a659d1880759fc2a2302d6e5a85efefb3b76d09034a3725b550c8a7f`), [response](../results/plan45/phase3/jev-api-phase3-batch3g-implementation-checkpoint-response.json) (`38f19ce90981fa7fc7cc7a85e82db2986a4299d9ebec70f162b8fb01c45f0436`), [derived record](../results/plan45/phase3/jev-api-phase3-batch3g-implementation-checkpoint-derived.md) (`9f3014868d97c529ee33bb22346e6f77c5362af3759959459dfa7477da494e11`), and [manifest](../results/plan45/phase3/jev-api-phase3-batch3g-implementation-checkpoint-sha256.txt).

### Phase 4 — 段階 batch 拡大

#### B3i proposed plan — ten MAP-eligible partial assertion slices

Following the user's revised migration policy, this batch uses the E=90 MAP-eligible stable-row set, accepts rough but deterministic component fixtures for the mapped local contract, and runs one consolidated retained-E2E regression after every ten newly migrated eligible stable rows. B3g completed the prior 20/20 named-test gate and its consolidated E2E; this policy starts a separate `0/10` eligible-row cadence. A row counts toward the new cadence only after its mapped Browser Mode assertion passes. Partial assertion progress is tracked separately from `M`, which continues to count only fully migrated stable scenarios. Keep `A=123`, `E=90`, `M=1` until a complete stable row meets the existing migration definition.

The B3h screen found no safe next candidate under its then-current strict component-equivalence bar. This B3i proposal applies the subsequently revised user policy: rough component fixtures are accepted for narrow assertion slices, while route/dataflow, URL, production-layout, download, and WebKit evidence remain with Playwright. Route dependence alone does not make a MAP-eligible row ineligible: transfer any local/component contract that can be reproduced faithfully, and retain only the distinct route integration boundary. The ten rows below were independently checked against MAP eligibility and immutable P42 callsites. This proposal does not claim that any row is fully migrated.

| Stable row                                                    | Proposed Browser Mode assertion slice                                                                                                                                                                                                     | Explicitly retained in Playwright                                                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `p45-a-cagr-sheet-04` — P42-052                               | In `CagrPanel.browser.test.tsx`, mount the actual sheet at 375×667 and assert its content has no horizontal overflow.                                                                                                                     | Production route/sheet integration and real page layout.                                                                                |
| `p45-a-cagr-sheet-05` — P42-053/-054                          | At 375×667 with the actual sheet open, assert the graph drawing area's visible height is at least 120px.                                                                                                                                  | Production route, page-shell placement, and route-fed chart integration.                                                                |
| `p45-b-mobile-ux-19-ux` — P42-323/-324                        | Mount the actual rendered mobile action controls at the audited mobile viewport and assert each mapped target meets the source tap-target dimensions.                                                                                     | Full production page geometry, scrolling, and engine-specific checks.                                                                   |
| `p45-a-a11y-sheet-tab-trap` — P42-022                         | Mount the actual `BottomSheet`, open it, send Tab through its focusable controls, and assert active focus remains inside the sheet.                                                                                                       | Production route focus context and any browser/assistive-technology boundary beyond the component focus contract.                       |
| `p45-b-tooltip-stack-total-65-e2e-t7-2022` — P42-586 only     | Mount the actual nominal `SpendingBarChart` with deterministic 2022+ data, hover a rendered bar, and assert the actual tooltip becomes visible. The fixture also has additive total-content checks; do not map or count those as P42-587. | P42-585 production `>5`-bars condition and route-fed data/chart integration; P42-587 remains in preexisting unit coverage.              |
| `p45-a-cpi-legend-scroll` — P42-263/-264                      | Mount the actual `CpiChart`, record fixture scroll position, click the visible `住居` legend control, and assert it toggles while fixture scroll position is preserved.                                                                   | Production route, page scroll/layout integration, and route-fed data.                                                                   |
| `p45-b-section-tabs-scroll-47-case01-chromium` — P42-501/-502 | For Chromium case01 only, mount actual `SectionTabs` with deterministic section targets and assert clicking the nominal-consumption tab invokes its scroll behavior and makes the matching fixture section visible.                       | Chromium case02/03, all WebKit projects, lazy-mount behavior, and production route/page geometry.                                       |
| `p45-b-range-change-187-e2e-1` — P42-463–466                  | Mount actual `CpiChart` with one selected year and assert the local single-year period/bar result.                                                                                                                                        | Production route and URL serialization, data loading/filtering, and route-fed SVG integration.                                          |
| `p45-b-range-change-200-e2e-2` — P42-469 only                 | Mount actual CpiChart range controls with deterministic 2017/2018 fixture data; assert the local chart-data contract grows from four rows (2017) to eight (2017–2018), satisfying P42-469's proportionality assertion.                    | P42-467/-468 production range selection, URL serialization for both ranges, and production chart-data integration remain in Playwright. |
| `p45-b-spending-filter-35-e2e-q1` — P42-511 (partial)         | Mount the actual nominal Q1 control and assert only its `aria-pressed` state after click (P42-511).                                                                                                                                       | P42-512/-514 route SVG assertions remain E2E; P42-513 remains unit-owned. Keep route/data/chart integration.                            |

The weak `p45-a-cagr-sheet-06` P42-055/-056 candidate is excluded. If one of the ten planned rows proves non-actionable against its actual mapped assertion during implementation, stop that row and use `p45-b-spending-filter-64-e2e` P42-515–518 only after documenting the evidence and obtaining a scoped plan reassessment; do not silently substitute it. For every row, remove only assertions that the corresponding Browser Mode test actually passes, preserve all unmapped route/data/URL/WebKit checks in Playwright, and keep row status partial. The existing P42 mapping is fixed; no assertion outside the listed IDs may be claimed as transferred.

**Acceptance gates:** implementation is staged in reviewable slices; each selected row requires its mapped Browser Mode assertion to pass and an independent review before adding one to the `0/10` cadence. Preserve a row-by-row ledger of migrated assertion IDs and retained E2E IDs. Run the consolidated retained E2E suite only after ten newly migrated eligible stable rows have passed their mapped Browser Mode assertions. Do not use test-case count as a substitute for eligible stable-row count. `A=123`, `E=90`, `M=1` and the Phase5 investigation obligations remain unchanged until their independent definitions are satisfied. This is plan scope only; no implementation or test result is claimed.

JEV v3 plan checkpoint passed `valid_as_defined` (confidence .89, pass probability .90; distribution: valid .90, scope violation .03, requirements mismatch .02, missing prerequisites .02, indeterminate .01, other .01, incomplete implementation info .01, implementation issue 0); diagnosis complete, no follow-up. Implementation may proceed under the acceptance gates above. See [request](../results/plan45/phase3/jev-api-phase3-batch3i-plan-checkpoint-request.json) (SHA-256 `e4260ca80c12edfc3e3c35dadaf2d35899bdab86451c86569573eb680d25b89f`), [response](../results/plan45/phase3/jev-api-phase3-batch3i-plan-checkpoint-response.json) (`ab3ea7e69e2ca6a695e64e6d9fb69221b9563d1e524b0d623b7ab9da574a5801`), [derived record](../results/plan45/phase3/jev-api-phase3-batch3i-plan-checkpoint-derived.md) (`64bef80f0c3679324bf60f13636d51bd726fc38940421f2678b0d347c7a75557`), and [manifest](../results/plan45/phase3/jev-api-phase3-batch3i-plan-checkpoint-sha256.txt).

**B3i batch 1 implementation checkpoint:** focused Browser Mode passed 2 files / 8 tests, and independent review confirmed the three partial assertion transfers. P42-052 is the closed CagrPanel sheet check at 375×667; its specific T-E2E-4 assertion was removed while broader live-route overflow remains. Only P42-054 transfers from the second CAGR row; P42-053 dialog visibility remains in E2E. Only P42-324 SectionTabs target dimensions transfer from mobile UX; P42-323 global target guard and all other buttons remain in E2E. The three rows are partial and count 3/10 toward the new cadence; no E2E was run. `A=123`, `E=90`, `M=1` remains unchanged. Implementation JEV passed `valid_as_defined` (confidence .98, pass probability .99; distribution valid .99, incomplete info .01, all other criteria 0); diagnosis complete, no follow-up. See [request](../results/plan45/phase3/jev-api-phase3-batch3i-batch1-implementation-checkpoint-request.json) (SHA-256 `0aba53f706ece22cb7f5a18872b4ff3424df774d3c55baf877896b073c463843`), [response](../results/plan45/phase3/jev-api-phase3-batch3i-batch1-implementation-checkpoint-response.json) (`71abf1630d18bf7e6a94eed9eb905d58cdf1efa27135b9c8ee8ef3d048e176ad`), [derived record](../results/plan45/phase3/jev-api-phase3-batch3i-batch1-implementation-checkpoint-derived.md) (`3e73ab08bbfb00923da51ce9a78fffac93d8632175141e8d8c154491709bf679`), and [manifest](../results/plan45/phase3/jev-api-phase3-batch3i-batch1-implementation-checkpoint-sha256.txt).

**B3i batch 2 implementation checkpoint:** focused Browser Mode passed 3 files / 7 tests; independent review passed. P42-263/-264 now cover the actual visible `住居` CpiChart legend toggle and fixture scroll preservation. P42-501/-502 cover Chromium SectionTabs case01 only; retain Chromium case02/03, WebKit, and lazy-mount/route checks. P42-511 alone covers the actual Q1 control's `aria-pressed` state after click; P42-512/-514 route SVG assertions remain E2E and P42-513 is unit-owned. With batch 1, cadence is 6/10; all six rows remain partial and no E2E was run. `A=123`, `E=90`, `M=1` remains unchanged. Implementation JEV passed `valid_as_defined` (confidence .90, pass probability .92; distribution valid .92, incomplete info .04, indeterminate .02, missing prerequisites .02, others 0); diagnosis complete, no follow-up. See [request](../results/plan45/phase3/jev-api-phase3-batch3i-batch2-implementation-checkpoint-request.json) (SHA-256 `b7cd9adfe94c28d3bd6ca3278058031461d417efb7d193cfa96fee793216d510`), [response](../results/plan45/phase3/jev-api-phase3-batch3i-batch2-implementation-checkpoint-response.json) (`95bd206b9db7ada13f996256d81e41ee4db002627e3f67454df66d602d0e72ff`), [derived record](../results/plan45/phase3/jev-api-phase3-batch3i-batch2-implementation-checkpoint-derived.md) (`2f97090ebf0a7e744c259a971ba177aea18b9623d2bdae4853ef71dff682c529`), and [manifest](../results/plan45/phase3/jev-api-phase3-batch3i-batch2-implementation-checkpoint-sha256.txt).

**B3i batch 3 implementation checkpoint:** focused Browser Mode passed 3 files / 3 tests after fixing a supported DOM count matcher issue; independent review passed. P42-022 now covers actual BottomSheet focus containment. P42-586 alone covers actual SpendingBarChart hover tooltip visibility; the Browser fixture's additive total-content assertions are not mapped or counted as P42-587, which remains in preexisting unit coverage. P42-585 production `>5` bars remains E2E. P42-463–466 cover the actual CpiChart single-year period/bar result; production route and URL assertions remain E2E. Cadence is 9/10; all nine rows remain partial and no E2E was run. `A=123`, `E=90`, `M=1` remains unchanged. Implementation JEV passed `valid_as_defined` (confidence .95, pass probability .96; distribution valid .96, incomplete info .02, missing prerequisites .01, indeterminate .01, all other criteria 0); diagnosis complete, no follow-up. See [request](../results/plan45/phase3/jev-api-phase3-batch3i-batch3-implementation-checkpoint-request.json) (SHA-256 `4d17e937675892a61903960492618be139d461308f8d1d71ad94883957ca65fe`), [response](../results/plan45/phase3/jev-api-phase3-batch3i-batch3-implementation-checkpoint-response.json) (`78b5034349881dfb4ed91123c95d0c45a24b439e9cda0c2b699fcc26c4bf2caa`), [derived record](../results/plan45/phase3/jev-api-phase3-batch3i-batch3-implementation-checkpoint-derived.md) (`7a5addd01bcbbf830ff89b1b53874a9dd3c41419886b0b5c689f71bb15291c52`), and [manifest](../results/plan45/phase3/jev-api-phase3-batch3i-batch3-implementation-checkpoint-sha256.txt).

**B3i batch 4 and completed 10-row gate:** focused Browser Mode passed the final P42-469 local proportionality assertion. The actual CpiChart fixture verifies four chart-data rows for 2017 and eight for 2017–2018; only P42-469 transfers. Playwright keeps P42-467/-468, including production range interaction and URL checks for both ranges, plus route-fed data integration. Together, batches 1–4 cover ten distinct MAP-eligible rows with at least one mapped Browser Mode assertion each. The consolidated `pnpm run test:e2e` passed 115 tests, skipped 19 (134 total), with zero failures. The 10/10 cadence gate is complete and the next cadence starts at 0/10. These remain partial assertion-slice transfers, so `A=123`, `E=90`, `M=1` is unchanged. In particular, route dependence did not categorically exclude the range-change row: its local proportionality contract moved while production route and URL contracts remain E2E-owned.

**B3i batch 3 implementation checkpoint:** focused Browser Mode passed 3 files / 3 tests after fixing a supported DOM count matcher issue; independent review passed. P42-022 now covers actual BottomSheet focus containment. P42-586 alone covers actual SpendingBarChart hover tooltip visibility; P42-585 production `>5` bars remains E2E and P42-587 remains in preexisting unit coverage. P42-463–466 cover the actual CpiChart single-year period/bar result; production route and URL assertions remain E2E. Cadence is 9/10; all nine rows remain partial and no E2E was run. `A=123`, `E=90`, `M=1` remains unchanged. Implementation JEV passed `valid_as_defined` (confidence .95, pass probability .96; distribution valid .96, incomplete info .02, missing prerequisites .01, indeterminate .01, all other criteria 0); diagnosis complete, no follow-up. See [request](../results/plan45/phase3/jev-api-phase3-batch3i-batch3-implementation-checkpoint-request.json) (SHA-256 `4d17e937675892a61903960492618be139d461308f8d1d71ad94883957ca65fe`), [response](../results/plan45/phase3/jev-api-phase3-batch3i-batch3-implementation-checkpoint-response.json) (`78b5034349881dfb4ed91123c95d0c45a24b439e9cda0c2b699fcc26c4bf2caa`), [derived record](../results/plan45/phase3/jev-api-phase3-batch3i-batch3-implementation-checkpoint-derived.md) (`7a5addd01bcbbf830ff89b1b53874a9dd3c41419886b0b5c689f71bb15291c52`), and [manifest](../results/plan45/phase3/jev-api-phase3-batch3i-batch3-implementation-checkpoint-sha256.txt).

#### B3j completed plan and execution record — ten MAP-eligible partial assertion slices

B3j began a fresh `0/10` cadence after B3i's completed 10-row E2E gate. The JEV plan checkpoint passed, and the four batches plus consolidated E2E gate are recorded below. Route dependence alone did not exclude an otherwise eligible row: mapped local/component assertions moved where actual component fixtures reproduced them, while distinct production route, build/source freshness, dataflow, URL/navigation, sheet-entry, and other integration assertions stayed in Playwright. Work was split into four batches of 2/2/3/3, with focused Browser Mode verification after each and one consolidated `pnpm run test:e2e` after all ten rows. The next formal checkpoint is JEV implementation review.

| Batch | Stable row and immutable P42 IDs                    | Browser Mode assertion slice and status                                                                                                                                                                                                                                                                                                                                           | Explicitly retained in Playwright                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `p45-a-legend-entertainment-series9` — P42-316/-317 | Mount the actual CPI legend source-token/rendering component; explicitly assert the `--series-9` swatch is visible (P42-316), and also inspect its computed color as an uncounted additive check. Count only P42-316 as transferred. The current Playwright source has no explicit `toBeVisible` call here; its swatch evaluation implicitly requires an element.                 | Keep P42-317 computed swatch RGB versus the `globals.css` source token, production CSS freshness, and route integration in E2E. Do not claim the implicit element lookup as a removed visibility assertion.                                                                                                                                                                                                      |
| 1     | `p45-a-legend-food-nominal` — P42-318/-319          | Mount the actual nominal spending legend; explicitly assert the `--nominal-food` swatch is visible (P42-318), and also inspect its computed color as an uncounted additive check. Count only P42-318 as transferred. The current Playwright source has no explicit `toBeVisible` call here; its swatch evaluation implicitly requires an element.                                 | Keep P42-319 computed swatch RGB versus the `globals.css` source token, production CSS freshness, and route integration in E2E. Do not claim the implicit element lookup as a removed visibility assertion.                                                                                                                                                                                                      |
| 2     | `p45-a-legend-dark-all12` — P42-320/-321/-322       | Focused verification passed. Mount the actual legend on a dark-root component fixture and assert all 12 legend buttons are visible (P42-321). A fixture computed-color check is additive only.                                                                                                                                                                                    | Keep P42-320 real-route `data-theme=dark` bootstrap and P42-322 source-vs-production dark computed-color/build freshness in E2E.                                                                                                                                                                                                                                                                                 |
| 2     | `p45-b-mobile-ux-79-ux-375px-select` — P42-327–333  | Focused verification passed. At 375×667, mount actual `SectionTabs` and `ChartFilters`; transfer only bounding-box/layout checks P42-329–333: both boxes are non-null; `buttonBox.x >= selectBox.x + selectBox.width - 1`; `abs(selectBox.y - buttonBox.y) < min(selectBox.height, buttonBox.height) * 0.5`; and `buttonBox.x + buttonBox.width > selectBox.x + selectBox.width`. | Keep production route/sheet entry and P42-327/-328 end-select/max-button visibility in E2E.                                                                                                                                                                                                                                                                                                                      |
| 3     | `p45-b-mobile-ux-112-ux-375px-select` — P42-334–338 | With the actual `SectionTabs` + `ChartFilters` fixture at 375×667, transfer only P42-336/-337 non-null bounding boxes and P42-338 `abs(startBox.width - endBox.width) <= 4px`. Focused verification passed; row remains partial after the consolidated E2E gate.                                                                                                                  | Keep production `/`, sheet trigger, and P42-334/-335 start/end select visibility in E2E.                                                                                                                                                                                                                                                                                                                         |
| 3     | `p45-b-mobile-ux-140-ux-375px-3` — P42-339–348      | With the actual `SectionTabs` + `ChartFilters` fixture at 375×667, transfer only P42-342–348: three non-null boxes; `abs(startBox.y - endBox.y) < 15`; `abs(endBox.y - buttonBox.y) < 15`; `startBox.x < endBox.x`; and `endBox.x + endBox.width <= buttonBox.x + 10`. Focused verification passed; row remains partial after the consolidated E2E gate.                          | Keep production route/sheet trigger and P42-339–341 start/end/max visibility in E2E.                                                                                                                                                                                                                                                                                                                             |
| 3     | `p45-a-cagr-sheet-06` — P42-055/-056                | In a meaningful actual closed-sheet `CagrPanel`/parent-composition fixture, transfer only the section/tab absence assertions P42-055/-056. Focused verification passed; row remains partial after the consolidated E2E gate.                                                                                                                                                      | Keep production route presence in E2E.                                                                                                                                                                                                                                                                                                                                                                           |
| 4     | `p45-a-cpi-tooltip-rows` — P42-265–286              | Focused verification passed. Mount actual `CpiChart` with deterministic hover data and transfer exactly P42-268/-269/-270/-274/-275: hover makes the tooltip visible, total is visible, exactly 12 rows render, the tooltip root marker exists, and the root contains the total marker. Do not claim P42-277's tautological check as a transferred invariant.                     | Keep P42-271–273 labels/schema and P42-279 plus P42-283–286 hidden-series path in E2E; retain all other production assertions and route/data integration.                                                                                                                                                                                                                                                        |
| 4     | `p45-b-range-change-303-e2e-2005-url` — P42-477–482 | Focused verification passed. Mount actual `ChartFilters` and assert the controlled start/end values become 2005/latest year, transferring only P42-479/-480. The fixture may check max-button visibility as setup/additive coverage, but does not count that as a transferred P42 assertion or claim to exercise sheet closure.                                                   | Keep P42-477 production-route max-button visibility, P42-478 parent sheet-close assertion, and P42-481/-482 URL cleanup in Playwright.                                                                                                                                                                                                                                                                           |
| 4     | `p45-b-spending-filter-64-e2e` — P42-515–518        | Focused verification passed. Mount nominal `SpendingBarChart`, toggle the mapped category, and assert only P42-518's rendered SVG bar count decreases.                                                                                                                                                                                                                            | Keep the production `/` + nominal-first-bar smoke and real category click in Playwright, with a distinct post-click nominal chart-visible integration smoke. This chart-visible result is an integration smoke, not a mapped P42 transfer; do not repeat the moved bar-count contract. P42-515/-516 belong to the separate Q1 row; P42-517 is already unit-owned and absent from this current E2E category case. |

Rows are selected from the existing MAP E=90 inventory and were reassessed as eligible; no B3i P42 transfer overlaps these slices. Keep per-row partial status distinct from `M`, which counts only complete stable-row migrations. All ten focused checks and the consolidated E2E gate passed; preserve every unlisted route/production assertion. The JEV plan checkpoint passed. The separate JEV implementation checkpoint remains the next formal review step.

**B3j batch 1 focused checkpoint:** `tests/browser-mode/legend-color-token.browser.test.tsx` passed 2/2 for `p45-a-legend-entertainment-series9` and `p45-a-legend-food-nominal`. Count P42-316 and P42-318 visibility as transferred; computed-color checks in the component fixtures are additive only. Keep P42-317/-319 production source-token versus built-color freshness and route checks in E2E. No E2E assertions were removed: current source had no explicit visibility assertions, only an element lookup implicit in swatch evaluation. Cadence is 2/10; both rows remain partial, so `A=123`, `E=90`, `M=1` is unchanged. This is a focused Browser Mode checkpoint only; the batch is not gated by consolidated E2E, which is scheduled after ten rows.

**B3j batch 2 focused checkpoint:** `legend-color-token.browser.test.tsx` and `SectionTabsTargets.browser.test.tsx` passed (2 files, 6 tests). For `p45-a-legend-dark-all12`, only P42-321 (all 12 legend buttons visible) transfers; P42-320 dark route bootstrap and P42-322 source-vs-production dark color/build freshness remain in E2E. For `p45-b-mobile-ux-79-ux-375px-select`, only P42-329–333 geometry transfers; P42-327/-328 visibility and production route/sheet entry remain in E2E. Independent diff review confirmed row112/140 geometry is still in E2E and only row79 P42-329–333 geometry was removed. Browser Mode output included non-failing React/Recharts unknown-prop console warnings and a `TimeoutNegativeWarning`. Cadence is 4/10; all four rows remain partial, no consolidated E2E has run, and `A=123`, `E=90`, `M=1` is unchanged.

**B3j batch 3 focused checkpoint:** `SectionTabsTargets.browser.test.tsx` and `CagrPanel.browser.test.tsx` passed (2 files, 13 tests); independent review passed the row112/140 boundaries. The three rows add P42-336–338, P42-342–348, and P42-055/-056 respectively. For CAGR, review confirmed changes to P42-052/-053/-054 and T-E2E-5/-7/-8/-9 were pre-existing B3i changes; batch 3 changed only T-E2E-6, while retaining the live route `#section-stacked` presence and trigger. Cadence is 7/10; all seven rows remain partial, `A=123`, `E=90`, `M=1` is unchanged, and no consolidated E2E has run.

**B3j batch 4 and completed 10-row gate:** focused Browser Mode passed 3 files / 7 tests; the JEV batch4 plan checkpoint passed. Across batches 1–4, all ten selected MAP-eligible rows have a passing focused assertion and the consolidated `pnpm run test:e2e` passed 115 tests, skipped 19 (134 total), with zero failures. Exact partial transfers are: P42-316/-318; P42-321; P42-329–333; P42-336–338; P42-342–348; P42-055/-056; P42-268/-269/-270/-274/-275; P42-479/-480 only; and P42-518 only. For the range row, P42-477 production-route max-button visibility, P42-478 parent sheet close, and P42-481/-482 URL cleanup remain E2E. For CPI tooltip, P42-271–273 labels/schema and P42-279/-283–286 hidden-series path remain E2E. For spending filter, Playwright retains the production `/` + nominal-first-bar smoke, real category click, and distinct post-click nominal chart-visible integration smoke; that visible result is not a mapped transfer. P42-515/-516 remain in the separate Q1 row and P42-517 is unit-owned. Route dependence alone did not exclude any candidate; production integration remains covered. All ten rows remain partial, so the cadence gate resets to 0/10 and `A=123`, `E=90`, `M=1` is unchanged. No tests beyond the stated focused Browser Mode checks and consolidated E2E are recorded.

#### B3k proposed plan — ten MAP-eligible partial assertion slices

B3k started a fresh `0/10` cadence after B3j's completed gate. The candidate screen against the final full MAP reassessment confirmed all ten distinct rows remain in `E=90`; they do not overlap B3i/B3j and exclude unit-owned IDs. Route dependence alone is not an exclusion: transfer a mapped local component assertion when an actual component fixture can reproduce it, and retain distinct production route, data, projection, page-layout, touch/hit-testing, and engine guarantees in Playwright. B3k used batches of 2/2/3/3 with focused Browser Mode after each batch and one consolidated `pnpm run test:e2e` after all ten rows. The two earlier plan JEV reviews apply to prior B4 boundaries and remain historical; the current reconsidered B4 slate passed initial plan revalidation.

**Initial plan JEV checkpoint for the prior boundary revision (historical):** `valid_as_defined`, pass (confidence `0.77`, passProbability `0.80`); distribution: `valid_as_defined 0.80`, `implementation_issue 0.06`, `incomplete_implementation_info 0.05`, `scope_violation 0.04`, `requirements_mismatch 0.03`, `missing_prerequisites_info 0.01`, `other 0.01`, `indeterminate 0`. Diagnosis complete; no follow-up. This result applies to the prior boundary revision and is preserved as historical evidence. Artifact: [initial plan review result](../results/plan45/phase1/jev-b3k-plan-review-result.json).

**Earlier corrected-boundary initial plan JEV revalidation (historical for the current Batch 4 slate):** `valid_as_defined`, pass (confidence `0.38`, passProbability `0.47`); distribution: `valid_as_defined 0.47`, `incomplete_implementation_info 0.43`, `scope_violation 0.07`, `requirements_mismatch 0.01`, `implementation_issue 0.01`, `missing_prerequisites_info 0.01`, `other 0`, `indeterminate 0`. Diagnosis complete; no follow-up. This result remains preserved for its earlier exact assertion-transfer semantics. The current Batch 4 slate is covered by the separate initial plan revalidation recorded below. Artifact: [earlier corrected plan revalidation result](../results/plan45/phase1/jev-b3k-plan-revalidation-result.json).

**Current reconsidered-slate initial plan JEV revalidation:** `valid_as_defined`, pass (confidence `0.91`, passProbability `0.93`); distribution: `valid_as_defined 0.93`, `incomplete_implementation_info 0.04`, `implementation_issue 0.02`, `requirements_mismatch 0.01`, `missing_prerequisites_info 0`, `scope_violation 0`, `other 0`, `indeterminate 0`. Diagnosis complete; no follow-up. This result applies to the current B4 boundaries: P42-187/-190 only, P42-309 only with P42-297 retained, and additive LazyMount component coverage with production P42-349/-350 retained. Artifact: [current plan revalidation result](../results/plan45/phase1/jev-b3k-plan-revalidation-current-result.json).

**B3k batch 1 implementation JEV checkpoint:** `valid_as_defined`, pass (confidence `0.98`, passProbability `0.99`); distribution: `valid_as_defined 0.99`, `incomplete_implementation_info 0.01`, `other 0`, `missing_prerequisites_info 0`, `implementation_issue 0`, `scope_violation 0`, `requirements_mismatch 0`, `indeterminate 0`. Diagnosis complete; no follow-up. Batch 1 is accepted as two partial scenario-row transfers; focused Browser Mode passed 2 files / 2 tests, and independent diff review was clean. Consolidated E2E remains pending until 10/10; the other eight rows remain pending, and `A=123`, `E=90`, `M=1` is unchanged. Artifact: [Batch 1 implementation review result](../results/plan45/phase1/jev-b3k-batch1-implementation-result.json).

**B3k batch 2 implementation JEV checkpoint:** `valid_as_defined`, pass (confidence `0.97`, passProbability `0.99`); distribution: `valid_as_defined 0.99`, `incomplete_implementation_info 0.01`, `other 0`, `missing_prerequisites_info 0`, `implementation_issue 0`, `scope_violation 0`, `requirements_mismatch 0`, `indeterminate 0`. Diagnosis complete; no follow-up. Batch 2 is accepted as two partial scenario-row transfers; focused Browser Mode passed 1 file / 7 tests, and independent diff review was clean. Consolidated E2E remains pending until 10/10; six rows remain pending, and `A=123`, `E=90`, `M=1` is unchanged. Artifact: [Batch 2 implementation review result](../results/plan45/phase1/jev-b3k-batch2-implementation-result.json).

**B3k batch 3 implementation JEV checkpoint:** `valid_as_defined`, pass (confidence `0.96`, passProbability `0.97`); distribution: `valid_as_defined 0.97`, `implementation_issue 0.02`, `incomplete_implementation_info 0.01`, `other 0`, `missing_prerequisites_info 0`, `scope_violation 0`, `requirements_mismatch 0`, `indeterminate 0`. Diagnosis complete; no follow-up. Batch 3 is accepted as three partial scenario-row transfers; focused Browser Mode passed 3 files / 14 tests, and independent diff review was clean. For P42-538/-539, initial tooltip/close/cursor visibility only establishes the open-state precondition before tap + actual window scroll dismissal; P42-536/-537 remain in E2E. Artifact: [Batch 3 implementation review result](../results/plan45/phase1/jev-b3k-batch3-implementation-result.json).

| Batch | Stable row and immutable P42 IDs                                                                                             | Proposed Browser Mode assertion slice                                                                                                                                                                                                                                                                                                                                                                                                       | Explicitly retained in Playwright                                                                                                                                                                                                                            |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `p45-b-range-change-107-e2e` — P42-457/-458                                                                                  | With actual `CpiChart` and deterministic CPI plus nominal/real data, reproduce the local finite chart-data-contract comparison in Browser Mode. This passed in Batch 1; remove exactly the two production Playwright count-vs-contract expects P42-457/-458, now transferred as a partial slice.                                                                                                                                            | Keep production route readiness/hydration and data setup, route-fed chart presence, and first-bar visibility in Playwright as integration coverage; the same projection-count expects are not retained.                                                      |
| 1     | `p45-b-tooltip-stack-total-81-e2e-t8-tooltip` — P42-588/-591 only                                                            | In actual `SpendingBarChart` Browser Mode with `useChartTooltipController`/handlers, cover initial hover and fresh-bar re-hover after hiding 食料. This passed in Batch 1. P42-588/-591 are exactly the two `expect(tooltip).toBeVisible()` calls; remove those exact calls from Playwright and keep P42-588/-591 owned only by Browser Mode as a partial slice.                                                                            | Keep production route setup, real bar hover, 食料 row visible/absent, legend aria transition and click, pointer leave/re-hover integration in E2E. P42-590 production category click/state remains integration; P42-589/-592 are unit-owned/already removed. |
| 2     | `p45-b-section-tabs-scroll-120-case01-chromium` — P42-505                                                                    | Mount actual `SectionTabs`; assert computed `scrollbarWidth` is `none`. Batch 2 focused Browser Mode passed; transfer the Chromium-only P42-505 predicate.                                                                                                                                                                                                                                                                                  | Keep production route/layout and the WebKit engine copy in E2E.                                                                                                                                                                                              |
| 2     | `p45-b-section-tabs-scroll-127-case01-chromium` — P42-506/-507                                                               | Mount actual `SectionTabs`; assert overflow and that `scrollLeft` advances after scrolling. Batch 2 focused Browser Mode passed; transfer only the Chromium P42-506/-507 predicates.                                                                                                                                                                                                                                                        | Keep production section layout/route, route scroll setup/mutation, and WebKit copy in E2E.                                                                                                                                                                   |
| 3     | `p45-b-section-tabs-scroll-142-mask-image-chromium` — P42-508/-509                                                           | Mount actual `SectionTabs`; assert computed `maskImage` and `webkitMaskImage` are not `none`. Batch 3 passed; transfer only Chromium predicates.                                                                                                                                                                                                                                                                                            | Keep production layout/provider and WebKit copy in E2E.                                                                                                                                                                                                      |
| 3     | `p45-b-tooltip-dismiss-231-case01` — P42-538/-539                                                                            | Mount actual chart/controller behavior; after a tap, trigger dismissal with a real scroll and assert the close button is hidden and cursor count is zero. Batch 3 passed. Initial tooltip/close/cursor visibility is only an open-state precondition; it does not transfer P42-536/-537.                                                                                                                                                    | Keep P42-536/-537 initial control/cursor visibility plus production scroll/touch/page wiring in E2E.                                                                                                                                                         |
| 3     | `p45-b-consumption-mobile-acceptance-139-mobile-pixel-acceptance-plan25-openspec-1` — P42-180/-183 only                      | Mount actual `SpendingBarChart`; assert bars disappear and restore after series toggles. Batch 3 passed.                                                                                                                                                                                                                                                                                                                                    | Keep production route, mobile touch, and route-fed SVG integration in E2E. P42-181 is already migrated and P42-182 is unit-owned, so neither is selected.                                                                                                    |
| 4     | `p45-b-consumption-mobile-acceptance-161-mobile-pixel-acceptance-plan25-openspec-dark-mode-tooltip` — P42-187/-190 only      | Mount actual `SpendingBarChart` and use real Browser Mode tap/controller behavior; transfer only tooltip-visible P42-187 and first-category nonempty-text P42-190.                                                                                                                                                                                                                                                                          | Keep P42-188 close-button visibility, P42-189 category visibility, P42-191 numeric content, P42-192 dismissal, viewport/typography, production theme/zoom, route/chart visibility, and actual mobile tap integration.                                        |
| 4     | `p45-a-earnings-hidden-series-hover` — P42-309 only                                                                          | Mount actual `EarningsBreakdownChart`; transfer only P42-309, the computed separator-style assertion after hidden-series re-hover (`tests/e2e/earnings-tooltip-total.e2e.spec.ts:83`).                                                                                                                                                                                                                                                      | Keep P42-297 initial computed separator style in E2E, plus production route/data/plot/hit/payload, legend propagation, and re-hover integration. Tooltip keys/count/math/order remain unit-owned.                                                            |
| 4     | `p45-b-mobile-ux-192-lazymount-p5-1` — actual LazyMount local child transition after browser scroll; P42-349/-350 remain E2E | Mount actual `LazyMount` and verify the child is initially absent and mounts after browser scroll near the viewport. This is partial component-level transfer: the local absent-to-mounted transition has Browser Mode coverage, while production route assertions stay in Playwright. Because both the `IntersectionObserver` callback and scroll listener call `checkReach`, do not attribute mounting specifically to observer callback. | Keep both exact production `/` `#section-new-graph` absence/reveal expectations P42-349/-350 in Playwright; the local fixture does not prove production route reveal.                                                                                        |

#### B3k completed 10-row gate

All ten planned rows were touched across four batches of 2/2/3/3. Batches 1–3 passed focused Browser Mode as recorded above; Batch 4 focused Browser Mode passed 3 files / 9 tests. Batch 4 transferred only P42-187 tooltip visibility and P42-190 first-category nonempty text; P42-309 post-hidden-series-re-hover computed separator style; and LazyMount's actual component-level local absent-to-mounted transition after browser scroll. P42-297 initial computed style remains in Playwright. P42-349/-350 production route absence/reveal remain in Playwright. Browser Mode's LazyMount fixture cannot distinguish IntersectionObserver from the independent scroll listener, so no observer-specific causation is claimed. Production route, chart integration, mobile tap, and initial-style boundaries remain in E2E as specified above.

The consolidated `pnpm run test:e2e` passed 115, skipped 19 (134 total), with zero failures. Implementation JEV passed `valid_as_defined` (confidence `.76`, passProbability `.79`); distribution: `valid_as_defined .79`, `incomplete_implementation_info .14`, `scope_violation .02`, `indeterminate .02`, `implementation_issue .01`, `missing_prerequisites_info .01`, other categories `0`. Diagnosis complete. Artifact: [Batch 4 implementation result](../results/plan45/phase1/jev-b3k-batch4-implementation-result.json). The current-slate plan revalidation was `valid_as_defined` as recorded above.

All ten B3k planned rows have been touched and all four batch gates are complete. Rows remain partial, so `A=123`, `E=90`, `M=1` is unchanged; cadence resets to `0/10`. The consolidated E2E checkpoint is complete. No tests beyond the stated focused Browser Mode checks and consolidated E2E are recorded.

#### B3h candidate screen — no safe next slice identified

After B3g reached the 20/20 cadence and its consolidated E2E gate passed, a fresh inventory-wide audit screened possible next assertion slices. It found no safe candidate at this time. Reviewed categories were production route/dataflow/chart-table/CSV and quarterly production-data contracts; UI actions already owned by unit or Browser Mode tests; production mobile/layout/WebKit/scroll geometry; and unresolved focus/contrast contracts. Existing route/data, download/parity, production geometry, and engine guarantees remain in their current owners; existing component coverage is not duplicated without a distinct failure boundary.

The closest candidates, P42-018/-019, were rejected: P42-018 outside-click duplicates unit coverage and its scroll behavior remains route-level. No migration is selected just to advance the counter. B3g's 20-case gate is recorded as passed; the next cadence starts at 0/20. `A=123`, `E=90`, `M=1` remains unchanged, and the 33 Phase5 investigations remain deferred. This checkpoint is a candidate screen only; it does not authorize implementation or claim new test evidence.

JEV plan checkpoint passed `valid_as_defined` (confidence .97, pass probability .98; distribution: valid .98, incomplete implementation info .01, missing prerequisites info .01, other criteria 0); diagnosis complete, no follow-up. See [request](../results/plan45/phase3/jev-api-phase3-batch3h-candidate-screen-plan-request.json) (SHA-256 `bc1791843d65558f18a1f8946774cb34a4d5dcea4c1608d0755f7439225e7a9d`), [response](../results/plan45/phase3/jev-api-phase3-batch3h-candidate-screen-plan-response.json) (`3ceed1c7c0ec6e1cd0c5e92a08e7c3200f0c137ac818382cbeb7626705565412`), [derived record](../results/plan45/phase3/jev-api-phase3-batch3h-candidate-screen-plan-derived.md) (`ae40bfd45c44451cb56f16eb943167e44564fe465b555f15f0298c561c340455`), and [manifest](../results/plan45/phase3/jev-api-phase3-batch3h-candidate-screen-plan-sha256.txt).

- [ ] Batch 1 の安定性・実行時間・重複差分を review 後、残る適格 scenario を契約グループごとに小分けして移す。ARIA / state、component rendering、controlled interaction のような境界を混ぜない。
- [ ] batch ごとに同一シナリオIDの Playwright caseを移す。spec ファイル全体を一括で Browser Mode に置き換えず、mixed spec は移した責務の分だけ縮める。
- [ ] Batch ごとに対応 ledger / matrix、Vitest Browser assertion、Playwright の維持理由を更新する。ユニットテストに存在する契約を Browser Mode で再度検証する場合、Browser Mode が加える実ブラウザ固有の追加保証を特定できなければ重複として候補から外す。
- **受け入れ条件:** 各 batch 後に `M / A` が再計算でき、移管済み主担当重複が0、browser-only 保証の欠落0。最終的に `M / A > 0.50` を満たす。不達見込みなら根拠と要求との不一致を記録し、必須 Playwright ケースを無理に移さない。

### Phase 5 — 並行比較、cutover と Playwright 残置 inventory

- [ ] cutover 前の比較期間は両ランナーで移管ケースを一時的に実行し、scenario ID 単位で結果を照合する。二重実行は比較期間のみ許可し、結果一致・skip条件・テストデータ境界が確認された時点で Browser Mode を主担当、Playwright を縮小 smoke または完全除去に切り替える。
- [ ] Playwright 残置リストを全件記録する。少なくとも実ページ起動、Next Flight / hydration / URL route integration、実 download / production CSV parity、viewport / layout / SVG geometry / coordinate hit-testing、scroll / touch、WebKit 固有 regression、実 browser CSS / computed-style 契約を該当ケース付きで説明する。
- [ ] Phase 0 の最新 MAP 判定で不適格となった以下の全33 stable IDを、元の Playwright spec・各 assertion・入力条件に戻って個別に詳細調査する。各IDについて実際の失敗境界と具体的証拠を示し、Browser Mode、Playwright残置、unit/component testの代替経路をそれぞれ検討した上で処遇と理由を更新する。単にviewport、layout、geometry、scroll、座標操作、browser engineを使うだけの説明を非対応の証拠にしない。最終的にBrowser Modeで確認できる可能性を先取りして排除せず、実制約を特定できない行、または代替経路の保証が不明な行は未解決として残す。処遇更新の根拠と証拠をscenario inventoryへ反映し、E / 過半数ゲートを再計算する。根拠のないJEV選択肢だけで不適格理由を確定しない。
  - `p45-a-a11y-cagr-trigger-dark`, `p45-a-a11y-cagr-trigger-default`, `p45-a-a11y-real-legend-header-dark`, `p45-a-a11y-real-legend-header-default`, `p45-a-advanced-series-adv-query`, `p45-a-parity-advanced-anchors`, `p45-a-parity-hidden-series`, `p45-a-parity-section-cpi-major`, `p45-a-parity-section-earnings`, `p45-a-parity-section-new-graph`, `p45-a-parity-section-residual`, `p45-a-parity-section-stacked`。
  - `p45-b-plan27-private-consumption-79-plan27-38-cti-nominal-cti-key-is-distinct-from-the-real`, `p45-b-plan27-private-consumption-9-plan27-38-cti-2005q1-2017q4-52-graph-table-csv-cti-regi`, `p45-b-quarterly-gdp-26-plan23-quarterly-public-projection-ready-state-renders-`。
  - `p45-b-real-consumption-128-page-tsx-e2e-real-consumption-chart-with-actual-browser`, `p45-b-real-consumption-156-page-tsx-e2e-real-consumption-chart-with-actual-browser`, `p45-b-real-consumption-174-page-tsx-e2e-real-consumption-chart-with-actual-browser`, `p45-b-real-consumption-21-page-tsx-e2e-real-consumption-chart-with-actual-browser`, `p45-b-real-consumption-60-page-tsx-e2e-real-consumption-chart-with-actual-browser`, `p45-b-real-consumption-82-page-tsx-e2e-real-consumption-chart-with-actual-browser`, `p45-b-real-consumption-99-page-tsx-e2e-real-consumption-chart-with-actual-browser`。
  - `p45-b-tooltip-dismiss-138-case01`, `p45-b-tooltip-dismiss-159-mobile-pixel-tooltip-escape-tooltip`, `p45-b-tooltip-dismiss-188-case01`, `p45-b-tooltip-dismiss-207-1`, `p45-b-tooltip-dismiss-249-case01`, `p45-b-tooltip-dismiss-284-case01`, `p45-b-tooltip-dismiss-307-viewport-chartnote-tooltip-tooltip-chartnote-tooltip`, `p45-b-tooltip-dismiss-430-tooltip-chartnote-tooltip`, `p45-b-tooltip-dismiss-473-case01`, `p45-b-tooltip-dismiss-508-case01`, `p45-b-tooltip-dismiss-535-case01`。
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

## B3m plan — all 38 untouched eligible scenarios before the next consolidated E2E

This plan follows the instruction to implement every untouched eligible scenario before the next consolidated E2E. The final MAP accounting is `A=123`, `E=90`, `M=1`: 51 eligible rows have partial component-level coverage, one row is fully migrated, and 38 eligible rows remain untouched. The 51st partial row is `p45-b-mobile-ux-201-lazymount-p5-1`: existing B3k coverage of actual `LazyMount`'s child absent-to-present transition after native browser scroll is shared local coverage. It does not transfer P42-349/-350 production-route absence/reveal, nor P42-351, which is the distinct `__MOUNT_ALL__` force-mount assertion and is already unit-owned. This correction changes no implementation status and does not claim any new test transfer.

### Untouched eligible roster (38)

- **Controls, series, and render data (7):** `p45-a-a11y-info-outside-click`; `p45-a-advanced-series-normal`; `p45-a-cagr-sheet-01`; `p45-a-cpi-sections`; `p45-b-plan24-rendering-71-plan24-rendering-contract-cti-2005-2017-2018-legacy-gdp`; `p45-b-plan24-rendering-88-plan24-rendering-contract-2025q1-q4-csv-tooltip`; `p45-b-tooltip-stack-total-108-e2e-t9-cpi-section-stacked-tooltip-total`.
- **Responsive and mobile component slices (11):** `p45-b-consumption-boundary-85-768px-desktop-chromium-768px-viewport-overflow`; `p45-b-consumption-boundary-85-768px-desktop-chromium-769px-viewport-overflow`; `p45-b-consumption-mobile-acceptance-187-mobile-pixel-acceptance-plan25-openspec-375x667-tooltip`; `p45-b-consumption-mobile-readability-191-375px-tooltip-6-viewport`; `p45-b-consumption-mobile-readability-191-430px-tooltip-6-viewport`; `p45-b-mobile-ux-243-sectiontabs-sticky-android-chrome`; `p45-b-mobile-ux-47-ux-375px`; `p45-b-mobile-ux-65-ux-320px-overflow`; `p45-b-mobile-ux-65-ux-375px-overflow`; `p45-b-mobile-ux-65-ux-390px-overflow`; `p45-b-mobile-ux-65-ux-430px-overflow`; and `p45-b-mobile-ux-201-lazymount-p5-1` is not untouched and is excluded.
- **Range change (6):** `p45-b-range-change-119-e2e`; `p45-b-range-change-136-e2e`; `p45-b-range-change-153-e2e`; `p45-b-range-change-170-e2e`; `p45-b-range-change-242-e2e`; `p45-b-range-change-273-e2e`.
- **SectionTabs / WebKit (14):** `p45-b-section-tabs-scroll-120-case02-webkit`; `p45-b-section-tabs-scroll-127-case02-webkit`; `p45-b-section-tabs-scroll-142-mask-image-webkit`; `p45-b-section-tabs-scroll-47-3-chromium`; `p45-b-section-tabs-scroll-47-3-webkit`; `p45-b-section-tabs-scroll-47-case02-chromium`; `p45-b-section-tabs-scroll-47-case04-webkit`; `p45-b-section-tabs-scroll-47-case05-webkit`; `p45-b-section-tabs-scroll-82-3-chromium`; `p45-b-section-tabs-scroll-82-3-webkit`; `p45-b-section-tabs-scroll-82-case01-chromium`; `p45-b-section-tabs-scroll-82-case02-chromium`; `p45-b-section-tabs-scroll-82-case04-webkit`; `p45-b-section-tabs-scroll-82-case05-webkit`.

**Roster count:** the four group subtotals are 7 + 11 + 6 + 14 = 38 unique IDs. Cross-check each selected row against the phase0 inventory before implementation. The line-item roster is the source of truth; no eligible row outside this roster may be added without a reviewed plan update.

### Bounded component contracts and retained E2E ownership

1. **Controls / series / render data.** The outside-click component slice is local coverage only; the proposed P42-018 mapping has no corresponding assertion in the current source E2E diff, so no P42-018 transfer is claimed. Preserve route/scroll P42-019. Advanced-series checks the actual production registry rendered by `NewGraph`, while URL/query and route wiring remain E2E (P42-024–032). CAGR sheet 01 covers only component dialog predicates for P42-041; retain production entry integration. CPI sections mounts actual `CpiChart` and asserts visible section labels plus a real Recharts area path. This is additive coverage: its source-callsite crosswalk is unmapped/repair-required; do not invent P42-262 (that ID belongs to the unit-owned legend loop), and retain the full current source E2E. Plan24-71 checks only the line-absent rendering predicate P42-361; Plan24-88 uses its fixture for tooltip predicates P42-383/-384/-385, retaining route/data/CSV integration. T9's Browser Mode fixture checks actual `StackedAreaChart` hover, row count, and visible total as additive component coverage. Retain production P42-597/-598, including P42-598 live total visibility, per the prior P42-599 JEV approval; a component fixture does not prove route/Recharts payload wiring.
2. **Responsive / mobile.** Rows 85 at 768/769 transfer CSS predicates P42-149/-150 in the actual component under each Browser Mode viewport; retain document/page-shell overflow E2E. Row 187 transfers the bounded tooltip visibility slice P42-223..229/-231; production close/touch/viewport measurement integration stays in E2E, including the mixed content-and-measurement predicate P42-231. The 375/430 readability rows transfer the specified component content predicates, while production route data, viewport measurements, separator/borderTop, and geometry remain in E2E. Sticky SectionTabs transfers P42-352 transform/compositing style only; retain Android Chrome production behavior. Mobile UX rows use actual `CpiChart`'s `.chartContainer` width/overflow measured in Browser Mode at 320/375/390/430px; document-root overflow remains E2E. Spending-filter keeps the production bar-count reduction assertion; the P42-511 aria-only slice does not authorize removing it.
3. **Range changes.** Rows 119/136/153/170 have additive component tests for actual chart rendering after selecting start/end values. Keep the route-to-SVG first-bar visibility assertions in E2E because a component fixture does not prove route-fed data wiring. Row 242 uses an actual `CpiChart` range-change component fixture: capture `window` `error` and `unhandledrejection` events during the range interaction and assert neither occurs. This is local component evidence only; retain production Playwright `pageerror` smoke P42-474 for route-level errors. Row 273 transfers only scroll preservation P42-476; retain route integration. Keep P42-479/-480 maximum-range selected-value readbacks in E2E.
4. **SectionTabs / WebKit.** WebKit rows assert the same specified style/scroll predicates in WebKit Browser Mode. Use a dedicated WebKit Browser Mode config/project and targeted include so existing specs are not all run a second time. Keep mounted-nav P42-501 scroll delta local while P42-502 route-in-viewport remains E2E; keep lazy rows' P42-503 initial-absent component precondition local and P42-504 production reveal E2E. Current Browser Mode config is Chromium-only. Installed versions are Vitest and `@vitest/browser-playwright` 4.1.11, Playwright 1.62.1, with WebKit revision 2336 available. Official provider support references: [Browser Mode guide](https://vitest.dev/guide/browser/) and [browser instances configuration](https://vitest.dev/config/browser/instances).

### Execution and review gate

Split implementation into the four groups above and focused batches small enough to review. For each row, record source predicate crosswalk, actual component, transferred local assertion, and retained production assertion. Run the focused Browser Mode target for each implementation batch and obtain independent diff review. Do not remove Playwright assertions until the corresponding focused Browser Mode assertion passes and review confirms the exact overlap. Do not run the consolidated E2E until all 38 roster rows have passing focused Browser Mode coverage and independent diff review; then run exactly one consolidated E2E checkpoint. Keep all new transfers partial unless every contract predicate moves with no retained production integration. Expected accounting before that final gate remains `A=123/E=90/M=1`; after the 38 eligible untouched rows are implemented they may be partial, but M only changes for fully migrated stable scenarios.

### Plan JEV status

Initial v3 `plan_validity` review returned `valid_as_defined` (confidence `.23`, passProbability `.32`; diagnosis complete, no follow-up); see [plan result](../results/plan45/phase1/jev-b3m-untouched38-plan-result.json). That result evaluated the proposed plan, not implementation completion.

### B3m implementation checkpoint — complete

The unchanged 38-ID roster now has component-level Browser Mode coverage. Focused Chromium reported **29 passed, 9 skipped** (the nine WebKit-specific cases), exit 0. Targeted WebKit reported **9 passed, 5 skipped** (the five Chromium-only cases), exit 0. These are focused component checks; the consolidated production E2E was then run after the clean audit and checkpoint as recorded below. The four focused files are `B3m-controls-series-render.browser.test.tsx`, `B3m-responsive-mobile.browser.test.tsx`, `CpiChart-range-change.browser.test.tsx`, and `SectionTabsB3m.browser.test.tsx`; targeted WebKit uses `vitest.browser.webkit.config.ts`.

**Final count:** `A=123/E=90/M=1` is decomposed as **89 partial + 1 full + 0 untouched**. All 38 B3m rows are local component-coverage partials; none is fully migrated. Row201 remains in the prior partial count and outside the 38-row roster.

**Final E2E diff boundary audit:** the independent audit is clean after restorations. Route-to-SVG first-bar expectations for rows 119/136/153/170 remain. Production P42-474 `pageerror` smoke, P42-479/-480 max-range start/end value readbacks, T9 P42-597/-598, P42-231 mixed content and measurement, and production WebKit E2E remain. Document-level overflow remains for mobile UX rows 47/65 at 320/375/390/430px; local coverage is only `CpiChart`'s `.chartContainer`. T9 local assertions are additive and retain the previous P42-599 decision; no P42-598 transfer is claimed.

Other reviewed local boundaries: P42-149/-150 CSS at 768/769; bounded P42-223..229 tooltip close/content slices with P42-231 production mixed content/measurement retained; P42-361 line-absent rendering; P42-383/-384/-385 tooltip payload predicates while route/data/CSV remain; readability local content while production typography/viewport, separator/borderTop and geometry remain; SectionTabs component predicates while route target-in-view/reveal and WebKit route coverage remain. CPI section labels/area-path and P42-018 outside-click component coverage are additive: the former has a repair-required source mapping, and the latter has no matching source E2E assertion in the current diff. Spending-filter retains its production bar-count reduction; no transfer beyond the aria-only P42-511 slice is claimed.

`pnpm run lint:fast` passed. `pnpm run type-check` exits 2. The B3m files have no remaining type errors; failures remain only in existing Browser Mode specs `CpiChart-single-year`, `EarningsBreakdownChart`, `MonthlyBoundaryAxis`, `SpendingBarChart-mobile`, `SpendingBarChart-readability`, `SpendingBarChart-tooltip-dismiss`, `SpendingBarChart-tooltip-rehover`, `SpendingBarChart-tooltip-scroll`, `SpendingBarChart-tooltip-total`, `SpendingBarChart`, and `legend-color-token`. Reported categories include Locator typing, implicit `any`, `strokeOpacity`, `?raw`, and `CpiData` errors. The orchestrator reran type-check after the B3m fixes and confirmed this scope; type-check is not passing.

After the clean diff audit and JEV checkpoint, the single consolidated E2E was run as `E2E_PORT=3101 pnpm run test:e2e`: **117 passed, 19 skipped, 0 failed**. An unidentifiable listener occupied port 3100; it was left untouched and the E2E server used port 3101. JEV returned `valid_as_defined` (confidence `.39`, passProbability `.47`; diagnosis complete, no follow-up); see [implementation checkpoint result](../results/plan45/phase1/jev-b3m-implementation-checkpoint-result.json). The result accepts the checkpoint as defined, while the count remains partial coverage, not 38 full scenario migrations. Final evidence summary: [B3m final checkpoint](../results/plan45/phase1/b3m-final-checkpoint-summary.md).

The [implementation checkpoint context](../results/plan45/phase1/jev-b3m-implementation-checkpoint-derived.md) and [v3 request](../results/plan45/phase1/jev-b3m-implementation-checkpoint-request.json) are the historical inputs to JEV; the [result](../results/plan45/phase1/jev-b3m-implementation-checkpoint-result.json) is `valid_as_defined`. The review preserves additive T9 component coverage and the prior P42-597/-598 production E2E decision, including P42-598 live total visibility. Request/result remain unchanged as a historical snapshot.

## Status addendum — 2026-09-27

The scoped Phase 2 migration is complete: all **89/89 eligible roster scenarios** are `Verified/full` across five batches of 20/20/20/20/9. See the [Phase 2 roster](../results/plan45/phase2/full-migration-roster.md) and [Phase 2 completion record](../results/plan45/phase2/full-migration-plan.md). This scoped result supersedes the historical B3m “89 partial + 1 full” status only for IDs overlapping this Phase 2 roster; the earlier B3m checkpoint above remains a historical record.

Final verification for the targeted production-route repair to rows #17/#18 exited 0: Chromium 80/80 and WebKit 21 passed/5 skipped. `pnpm lint` passed; `pnpm run build` passed, including its embedded TypeScript phase. Standalone `pnpm type-check` exits 2 on existing Browser Mode component typing diagnostics; no errors were reported in the new production-route cases. The last E2E checkpoint was Batch 5 (32 passed/19 skipped); E2E was not rerun for the final #17/#18 route repair. The post-implementation JEV result is [`valid_as_defined`](../results/plan45/phase2/jev-full-migration-post-implementation-checkpoint-result.json), confidence 0.86, passProbability 0.89.

This does not complete overall shared Plan45. Global A/E/M and the M/A threshold were **not recomputed**. Phase 3 checklist reconciliation remains, as do Phase 4–6 gates, including the 33 MAP-ineligible investigations, retained Playwright ownership reconciliation, and CI timing/flake comparison.

## Execution addendum — 2026-09-27 (Phase 3 and Phase 4)

The prior status paragraph above is preserved as the state recorded before this execution. The current reconciliation and checkpoint supersede its statements that global A/E/M and Phase 3–4 status were still open; Phase 5 and Phase 6 remain open.

**Phase 3 ledger reconciliation is complete.** Current counts are `A=123`, `E=90`, `M=84`: one previously completed whole scenario (`p45-a-a11y-info-escape`, P42-021), plus 83 whole-scenario transfers from the 89-row Phase 2 roster. The other six Phase 2 rows (#12, #30, #70–73) remain partial because the separator-style assertion is not asserted by the wrapper, some tooltip-dismiss assertions remain in Playwright, or the range-change destination omits the source first-bar-visible assertion. Thus 83/89 Phase 2 rows are whole-scenario full; the roster's `Verified/full` terminology continues to mean its mapped eligible predicate slice passed, and is not a global whole-scenario status. `M/A=84/123≈68.3%`, exceeding the strict `>50%` gate (minimum M=62). The 33 MAP-ineligible rows remain Phase 5 investigations. See the [Phase 3 reconciliation](../results/plan45/phase3/phase3-ledger-reconciliation-2026-09-27.md).

**Phase 4 B3i accounting and current verification are complete.** All ten B3i assertion slices are crosswalked in the [Phase 4 checkpoint](../results/plan45/phase4/phase4-verification-checkpoint-2026-09-27.md); they overlap Phase 2 roster scenarios and do not add ten scenario counts or increment M. The row187-named component test / P42-469 / row200 route label discrepancy is resolved there. Historical B3i E2E `115 passed / 19 skipped` predates final route repair and is not current verification.

Current verification: `pnpm run test:browser` passed (26 files, 95 passed, 9 skipped); `pnpm run test:browser:next-route-poc` passed its production build and TS phase, Chromium 80/80, WebKit 21 passed/5 skipped; `pnpm run test:e2e` passed (32 passed, 19 skipped, 0 failed); `pnpm run lint:fast` passed. The route command runs production-route assertions through Vitest Browser Mode with the Playwright provider and is distinct from the E2E command. Standalone `pnpm run type-check` **failed** with Browser Mode test diagnostics (Locator `.locator` typing, implicit-any parameters, `strokeOpacity` omissions in `SpendingBarChart.browser.test.tsx`, and raw CSS module / `CpiData` cast issues). This remains a residual and is not reported as passing. React prop warnings during `test:browser` were non-failing.

The initial Phase 3–4 plan review passed JEV `valid_as_defined` (confidence 0.62; passProbability 0.67), but reviewed the execution plan only, not implementation. The first implementation checkpoint passed `valid_as_defined` before a recorded independent review of all ten B3i slices, including P42-469, was available; preserve it as a historical snapshot, not the final review basis. The new [B3i independent read-only review](../results/plan45/phase4/b3i-independent-review-2026-09-27.md) inspected all ten slices without executing tests. It records that P42-501/-502 uses fixture `onSelect` for scrolling with separate production-route handler coverage, and that P42-469's component title says row187 while its plan/production-route mapping is row200. The fresh implementation checkpoint returned JEV `valid_as_defined` (confidence 0.59, passProbability 0.65); see the [review 2 report](../results/plan45/phase3/jev-plan45-phase3-phase4-implementation-checkpoint-review2-derived.md) and its [SHA-256 manifest](../results/plan45/phase3/jev-plan45-phase3-phase4-implementation-checkpoint-review2-sha256.txt). These supersede the earlier implementation review for final acceptance. Phase 5's 33 investigations and Phase 6 runtime/flake comparisons are still outstanding.

## Phase 5 execution checkpoint — 2026-09-27

The dated [Phase 5 execution results](../results/plan45/phase5/phase5-feasibility-execution-results-2026-09-27.md) first recorded the six partial-case cutovers and a preliminary audit of all 33 historical MAP-ineligible stable IDs. This checkpoint is historical; the final feasibility disposition and global counts are superseded by the final status addendum below. The earlier Phase 3/4 paragraph remains preserved as history. The JEV-reviewed [Phase 5 execution plan](../results/plan45/phase5/phase5-feasibility-execution-plan-2026-09-27.md) remains unchanged.

**Six partial rows reached full Browser Mode ownership.** The exact Playwright predicate was crosswalked for #12 (`p45-a-earnings-hover`), #30 (`p45-b-tooltip-dismiss-578-chromium-escape-dismiss`), and #70–73 (four range-change rows). Focused Browser Mode passed 6/6; #12 and #70–73 were dual-run using temporary byte-identical HEAD copies (5/5 combined), and #30 passed 1/1 before its duplicate was removed. All ran against production `/` with actual data at Chromium 1280×720, with no skips; an independent Oracle approved the six full migrations. Post-cutover Playwright passed 31, skipped 18, failed 0. The production-route Browser Mode gate passed Chromium 9 files / 80 tests and WebKit 5 files / 21 passed / 5 skipped. `pnpm run test:e2e` after cutover passed 31, skipped 18, failed 0; `pnpm run lint` passed. Standalone `pnpm run type-check` failed on existing Browser Mode diagnostics (`Locator.locator`, implicit `any`, missing `strokeOpacity`, raw CSS module typing, and the `CpiData` cast). Its CI wiring is present in `test:full`, regular production build, and full-validation paths.

Crosswalk correction for #12: it owns P42-287–290 and the source `expectBrowserSeparatorStyle` computed-DOM border assertion at `tests/e2e/earnings-tooltip-total.e2e.spec.ts:49–55`, called at line 67; that helper assertion was not separately assigned a P42 callsite ID. P42-297 is the separate evidence-row border assertion in hidden-series #13. The production-route Browser Mode batch1 wrapper checks the computed separator border for #12. The historical focused six-case and Playwright dual-run counts above are recorded, but their focused raw transcripts were not preserved; current production-route and consolidated E2E suite results remain evidence.

**Preliminary disposition (superseded by the final status below):** At the first checkpoint, row-specific probes had not yet completed and the 33 rows remained outside E. Do not use this snapshot as the current feasibility or accounting result.

That preliminary ledger was `A=123`, `E=90`, `M=90`; the final E update and dispositions are recorded in the final status addendum below. The six whole-scenario migrations raise M by six. Phase 6 runtime/flake comparisons remain separate. Source deletions for two original specs predated this work. Temporary exact-HEAD copies were removed after dual-run.

## Phase 5 final feasibility status — 2026-09-27

Current implementation checkpoint JEV v2/revalidation returned `valid_as_defined` (confidence `0.84`, passProbability `0.85`), diagnosis complete, and no clarification. It supersedes the earlier lower-confidence checkpoint (`0.38` / `0.46`), preserved as historical. See the [v2 request](../results/plan45/phase5/jev-phase5-feasibility-implementation-checkpoint-revalidation-request.json), [response](../results/plan45/phase5/jev-phase5-feasibility-implementation-checkpoint-revalidation-response.json), [derived report](../results/plan45/phase5/jev-phase5-feasibility-implementation-checkpoint-revalidation-derived.md), and [SHA-256 manifest](../results/plan45/phase5/jev-phase5-feasibility-implementation-checkpoint-revalidation-sha256.txt).

The JEV-reviewed Phase 5 execution plan above remains unchanged. The final bounded Browser Mode source-contract probes observed all 33 historical MAP-ineligible stable IDs: rendering/data 15/15 and interaction 18/18 (`contractMatch=true` for each interaction row). **No Browser Mode impossibility was demonstrated.** The per-ID observation table and caveats are recorded in the [Phase 5 execution result](../results/plan45/phase5/phase5-feasibility-execution-results-2026-09-27.md#final-row-level-audit-of-the-33-historical-map-ineligible-ids), with raw [rendering](../results/plan45/phase5/phase5-rendering-probes-final-2026-09-27.log) and [interaction](../results/plan45/phase5/phase5-interaction-probes-final-2026-09-27.log) logs.

The current ledger is `A=123`, `E=123` (100%), `M=90` (73.17%). The 33 probe passes establish eligibility only; they do not transfer ownership or increment M. The six earlier partial rows (#12, #30, #70–73) are complete whole-scenario migrations and account for M increasing from 84 to 90. #307 passed under an engineered overlap, which says nothing about natural overlap in the unmodified layout. #535 met the source hidden-close assertion while its chart-center touch was offscreen (`y≈−2785`), hit-test null, and no scroll movement was observed; this does not establish on-screen touch behavior, but the row is source-feasible and not unresolved.

The Phase 3 ledger's contemporaneous #12 partial-gap description is superseded by the crosswalk correction above: the separator helper assertion was not P42-297 and is covered by the #12 route wrapper. P42-297 remains assigned to hidden-series #13.

Final diagnostic results: rendering/data suite 15/15 passed; interaction suite 18/18 passed. `pnpm run lint` passed. Standalone `pnpm run type-check` remains blocked by existing unrelated Browser Mode component errors and is not reported as passing. The 33 eligible rows remain under their existing Playwright ownership until individual whole-scenario cutovers. Phase 6 runtime/flake measurement remains separate.

Current validation logs: the built production-route Browser Mode run passed Chromium 9 files / 80 tests and WebKit 5 files / 21 passed / 5 skipped ([raw log](../results/plan45/phase5/phase5-browser-route-validation-current.log)). The fresh-built full `pnpm run test:e2e` rerun passed 31 tests / 18 skipped ([raw log](../results/plan45/phase5/phase5-e2e-validation-current.log)); a separate isolated real-consumption suite passed 7/7 ([raw log](../results/plan45/phase5/phase5-e2e-real-consumption-isolated.log)). The first fresh-built full-suite attempt encountered a transient #14 missing-section timeout and produced no final suite summary, so it is not counted as a pass. The later complete rerun and isolated run passed. This validation record leaves the six partial cutovers at `M=90`; the 33 feasibility-only rows raise E to 123 but do not raise M. The #12/P42 crosswalk correction and #307/#535 caveats above remain in force.

## Phase 6 cutover checkpoint — B01 and B02 accepted

Phase 6 remains in progress. B01 fully migrated exactly `p45-a-a11y-cagr-trigger-default` and `p45-a-a11y-cagr-trigger-dark` after `pnpm run test:browser:phase6-b01:built` passed 2/2 and an independent source-boundary review accepted the source-to-destination mapping. The [saved Browser Mode log](../results/plan45/phase6/phase6-b01-browser-mode-validation-2026-09-27.log) records 1 file / 2 passed; the [saved residual E2E log](../results/plan45/phase6/phase6-b01-residual-e2e-validation-2026-09-27.log) records 29 passed / 18 skipped. B02 fully migrated exactly `p45-a-a11y-real-legend-header-default` and `p45-a-a11y-real-legend-header-dark` after its focused Browser Mode file passed 2/2 and an independent source-boundary review accepted the source-to-destination mapping. The [saved B02 Browser Mode log](../results/plan45/phase6/phase6-b02-browser-mode-validation-2026-09-27.log) records that focused result. After B01 and B02 source removals, `pnpm run test:e2e:fresh` succeeded with 27 passed / 18 skipped; see the [cumulative residual E2E log](../results/plan45/phase6/phase6-b02-residual-e2e-validation-2026-09-27.log). The ledger is now `A=123`, `E=123`, `M=94` (`M/A=76.42%`); exactly 4 of the 33 Phase 6 scenarios are accepted/migrated, and the remaining 29 remain Playwright-owned pending their own batch gates. The two `focus-management` `fixtureTest` deletions in the current worktree diff of `tests/e2e/accessibility.e2e.spec.ts` remain of unknown provenance, are outside B01/B02, and are excluded from M.

## Phase 6 cutover checkpoint — B03 accepted

B03 fully migrated exactly `p45-a-advanced-series-adv-query`, `p45-a-parity-advanced-anchors`, and `p45-a-parity-hidden-series` after the focused Browser Mode run passed 3/3 and an independent source-boundary review accepted the source-to-destination mapping. The [saved B03 Browser Mode log](../results/plan45/phase6/phase6-b03-browser-mode-validation-pass3-2026-09-27.log) records the passing run. After the B01–B03 source changes, `pnpm run test:e2e:fresh` succeeded with 25 passed / 18 skipped; see the [cumulative residual E2E log](../results/plan45/phase6/phase6-b03-residual-e2e-validation-2026-09-27.log). The normal-view advanced-series E2E assertion remains in Playwright alongside the migrated `?adv=1` test. The ledger is `A=123`, `E=123`, `M=97` (`M/A≈78.9%`); exactly 7 of 33 Phase 6 scenarios are accepted/migrated, and 26 remain Playwright-owned. Phase 6 remains in progress.

Source-boundary correction for B03: hidden-series does not assert an `aria-pressed` transition or a change in SVG geometry. Its exact assertions are clicking `住居`, keeping chart keys/rows and table headers/values unchanged, matching the post-click CSV against the source display snapshot, excluding internal series, and keeping the SVG visible. The advanced-anchors source does not call the typed CSV metadata helper, so that helper is not a cutover requirement. The current cutover plan and scenario inventory record these corrected boundaries.

The two `focus-management` `fixtureTest` deletions in the current worktree diff of `tests/e2e/accessibility.e2e.spec.ts` remain of unknown provenance, are outside B01–B03, and are excluded from M.

## Phase 6 cutover checkpoint — B04 accepted

B04 fully migrated exactly `p45-a-parity-section-cpi-major`, `p45-a-parity-section-earnings`, and `p45-a-parity-section-new-graph`. The focused Browser Mode run passed 3/3 and source-boundary review accepted the mapping. The [B04 focused Browser Mode log](../results/plan45/phase6/phase6-b04-browser-mode-validation-pass2-2026-09-27.log) records the pass; the cumulative [residual E2E log](../results/plan45/phase6/phase6-b04-residual-e2e-validation-2026-09-27.log) records 25 passed / 18 skipped. B04 preserves full-period chart/table/CSV parity, headers, row and column counts, typed metadata, empty-cell rules, series order, and internal-series exclusion for each section.

The current ledger is `A=123`, `E=123`, `M=100` (`M/A=81.30%`). Exactly 10 of the 33 Phase 6 scenarios are accepted/migrated; the other 23 remain Playwright-owned pending their own batch gates. Residual and stacked monthly source cases remain in Playwright under B05. Phase 6 remains in progress. The two `focus-management` `fixtureTest` deletions in `tests/e2e/accessibility.e2e.spec.ts` have unknown provenance, are outside B01–B04, and are excluded from M. Prior B01–B03 checkpoints and their JEV artifacts remain recorded above and in the Phase 6 cutover plan.

## Phase 6 cutover checkpoint — B05 accepted

B05 fully migrated exactly `p45-a-parity-section-residual` and `p45-a-parity-section-stacked`. The focused Browser Mode run passed 2/2 and source-boundary review accepted the mapping. See the [B05 focused Browser Mode log](../results/plan45/phase6/phase6-b05-browser-mode-validation-2026-09-27.log). The final [residual E2E log](../results/plan45/phase6/phase6-b05-residual-e2e-validation-pass2-2026-09-27.log) records 24 passed / 18 skipped. The earlier attempt ([log](../results/plan45/phase6/phase6-b05-residual-e2e-validation-2026-09-27.log)) is transient: its fresh build encountered a concurrent B06 syntax error, so it is not the final residual result. B05 preserves full-period residual and stacked-series chart/table/CSV parity, including headers, row/column counts, typed metadata, empty-cell rules, series order, internal-series exclusion, and public rendered geometry.

B05's JEV implementation checkpoint returned `valid_as_defined` (confidence `0.80`, passProbability `0.82`), diagnosis complete, and no clarification. See the [request](../results/plan45/phase6/jev-phase6-b05-implementation-checkpoint-request.json), [result](../results/plan45/phase6/jev-phase6-b05-implementation-checkpoint-result.json), [derived report](../results/plan45/phase6/jev-phase6-b05-implementation-checkpoint-derived.md), and [SHA-256 manifest](../results/plan45/phase6/jev-phase6-b05-implementation-checkpoint-sha256.txt).

The ledger is `A=123`, `E=123`, `M=102` (`M/A=82.93%`): 12 of 33 Phase 6 scenarios are accepted/migrated and 21 remain Playwright-owned. Phase 6 remains in progress. The two `focus-management` `fixtureTest` deletions in `tests/e2e/accessibility.e2e.spec.ts` have unknown provenance, are outside B01–B05, and remain excluded from M.

## Phase 6 cutover checkpoint — B06 accepted

B06 fully migrated exactly `p45-b-plan27-private-consumption-79-plan27-38-cti-nominal-cti-key-is-distinct-from-the-real`, `p45-b-plan27-private-consumption-9-plan27-38-cti-2005q1-2017q4-52-graph-table-csv-cti-regi`, and `p45-b-quarterly-gdp-26-plan23-quarterly-public-projection-ready-state-renders-`. The final focused Browser Mode run passed 3/3; see the [pass5 log](../results/plan45/phase6/phase6-b06-browser-mode-validation-pass5-2026-09-27.log). Earlier focused attempts in the [initial log](../results/plan45/phase6/phase6-b06-browser-mode-validation-2026-09-27.log), [pass2](../results/plan45/phase6/phase6-b06-browser-mode-validation-pass2-2026-09-27.log), [pass3](../results/plan45/phase6/phase6-b06-browser-mode-validation-pass3-2026-09-27.log), and [pass4](../results/plan45/phase6/phase6-b06-browser-mode-validation-pass4-2026-09-27.log) are superseded diagnostics, not final acceptance evidence. The final [residual E2E log](../results/plan45/phase6/phase6-b06-residual-e2e-validation-2026-09-27.log) records 21 passed / 18 skipped.

After independent audit, the two now-empty E2E specs (`tests/e2e/plan27-private-consumption.e2e.spec.ts` and `tests/e2e/quarterly-gdp.e2e.spec.ts`) were deleted; shared fixtures remain. B06's Browser Mode replacement preserves the Plan27 Pixel 7 contexts, nominal/real key boundary, 52-quarter graph/table/CSV, invalid post-boundary metadata, and legacy wage CTI/internal GDP exclusions, plus quarterly GDP ready state, public-series membership, year selection, tables/CSV, quarterly values and metadata, and hover tooltip. The B06 JEV checkpoint returned `valid_as_defined` (confidence `0.73`, passProbability `0.77`), diagnosis complete, and no clarification. See the [request](../results/plan45/phase6/jev-phase6-b06-implementation-checkpoint-request.json), [result](../results/plan45/phase6/jev-phase6-b06-implementation-checkpoint-result.json), [derived report](../results/plan45/phase6/jev-phase6-b06-implementation-checkpoint-derived.md), and [SHA-256 manifest](../results/plan45/phase6/jev-phase6-b06-implementation-checkpoint-sha256.txt).

The ledger is `A=123`, `E=123`, `M=105` (`M/A=85.37%`): 15 of 33 Phase 6 scenarios are accepted/migrated and 18 remain Playwright-owned. Phase 6 remains in progress. The two `focus-management` `fixtureTest` deletions in `tests/e2e/accessibility.e2e.spec.ts` have unknown provenance, are outside B01–B06, and remain excluded from M.

## Phase 6 cutover checkpoint — B07 accepted

B07 fully migrated exactly `p45-b-real-consumption-21-page-tsx-e2e-real-consumption-chart-with-actual-browser`, `p45-b-real-consumption-60-page-tsx-e2e-real-consumption-chart-with-actual-browser`, and `p45-b-real-consumption-82-page-tsx-e2e-real-consumption-chart-with-actual-browser`. The final focused Browser Mode run passed 3/3; see the [pass2 log](../results/plan45/phase6/phase6-b07-browser-mode-validation-pass2-2026-09-27.log). The residual E2E run passed its build/typecheck phase and 18 tests with 18 skipped; see the [residual E2E log](../results/plan45/phase6/phase6-b07-residual-e2e-validation-2026-09-27.log). The initial #82 timeout ([pass1 diagnostic](../results/plan45/phase6/phase6-b07-browser-mode-validation-2026-09-27.log)) is superseded and is not acceptance evidence.

The source audit confirms only these three cases were transferred and now-unused Flight helper imports were removed; shared fixtures and all remaining E2E cases were preserved. #21 asserts 48 quarterly real-consumption Flight rows for 2005–2016 and positive endpoint support values. #60 registers pageerror and console error listeners before navigation and asserts no errors. #82's source fixture injects `__MOUNT_ALL__` before navigation; the Browser Mode test instead uses the normal production route and selects the `消費(実質)` tab, activating actual LazyMount behavior. This exercises the real tab flow, so it is stronger/different than the literal fixture setup; the difference was disclosed and accepted by JEV.

B07's JEV implementation checkpoint returned `valid_as_defined` (confidence `0.92`, passProbability `0.93`), diagnosis complete, and no clarification. See the [request](../results/plan45/phase6/jev-phase6-b07-implementation-checkpoint-request.json), [result](../results/plan45/phase6/jev-phase6-b07-implementation-checkpoint-result.json), [derived report](../results/plan45/phase6/jev-phase6-b07-implementation-checkpoint-derived.md), and [SHA-256 manifest](../results/plan45/phase6/jev-phase6-b07-implementation-checkpoint-sha256.txt).

The ledger is `A=123`, `E=123`, `M=108` (`M/A=87.80%`): 18 of 33 Phase 6 scenarios are accepted/migrated and 15 remain Playwright-owned. Phase 6 remains in progress. The two `focus-management` `fixtureTest` deletions in `tests/e2e/accessibility.e2e.spec.ts` have unknown provenance, are outside B01–B07, and remain excluded from M.

## Phase 6 cutover checkpoint — B08 accepted

B08 fully migrated exactly `p45-b-real-consumption-99-page-tsx-e2e-real-consumption-chart-with-actual-browser`, `p45-b-real-consumption-128-page-tsx-e2e-real-consumption-chart-with-actual-browser`, and `p45-b-real-consumption-156-page-tsx-e2e-real-consumption-chart-with-actual-browser`. The focused Browser Mode run passed 3/3; see the [B08 focused log](../results/plan45/phase6/phase6-b08-browser-mode-validation-2026-09-27.log). The residual E2E run passed its build/typecheck phase and 15 tests with 18 skipped; see the [B08 residual E2E log](../results/plan45/phase6/phase6-b08-residual-e2e-validation-2026-09-27.log).

Source-boundary details: #99 asserts visibility of the first page-global `[aria-pressed]` control, attempts a click with a 5-second timeout while swallowing click failure, then waits 500ms; it makes no chart-change assertion. #128 accepts zero local legend items or a list whose items are all hidden, without asserting `details.open`. #156 checks summary visibility and verifies its click reveals the first section-local legend button. B07 remains accepted. #174 belongs to B09 and remains Playwright-owned.

B08's JEV implementation checkpoint returned `valid_as_defined` (confidence `0.93`, passProbability `0.94`), diagnosis complete, and no clarification. See the [request](../results/plan45/phase6/jev-phase6-b08-implementation-checkpoint-request.json), [result](../results/plan45/phase6/jev-phase6-b08-implementation-checkpoint-result.json), [derived report](../results/plan45/phase6/jev-phase6-b08-implementation-checkpoint-derived.md), and [SHA-256 manifest](../results/plan45/phase6/jev-phase6-b08-implementation-checkpoint-sha256.txt).

The ledger is `A=123`, `E=123`, `M=111` (`M/A=90.24%`): 21 of 33 Phase 6 scenarios are accepted/migrated and 12 remain Playwright-owned. Phase 6 remains in progress. The two `focus-management` `fixtureTest` deletions in `tests/e2e/accessibility.e2e.spec.ts` have unknown provenance, are outside B01–B08, and remain excluded from M.

## Phase 6 cutover checkpoint — B09 accepted

B09 fully migrated `p45-b-real-consumption-174-page-tsx-e2e-real-consumption-chart-with-actual-browser`. The focused Browser Mode run passed 1/1; see the [B09 focused log](../results/plan45/phase6/phase6-b09-browser-mode-validation-2026-09-27.log). The residual E2E run passed its build/typecheck phase and 14 tests with 18 skipped; see the [B09 residual E2E log](../results/plan45/phase6/phase6-b09-residual-e2e-validation-2026-09-27.log).

The source test title refers to styling/SVG, but its body asserts only real-consumption section and summary visibility. Browser Mode uses `__MOUNT_ALL__`, navigates to `/` in Chromium, waits for `networkidle`, scrolls `#section-consumption-real` into view, and asserts those same visibility predicates; no style/SVG coverage is claimed. Independent audit confirmed that the seven cases in `tests/e2e/real-consumption.e2e.spec.ts` are exactly B07 #21/#60/#82, B08 #99/#128/#156, and B09 #174, all accepted by Browser Mode; the E2E spec was deleted. Shared `tests/e2e/fixtures.ts` was untouched.

B09's JEV implementation checkpoint returned `valid_as_defined` (confidence `0.94`, passProbability `0.95`), diagnosis complete, and no clarification. See the [request](../results/plan45/phase6/jev-phase6-b09-implementation-checkpoint-request.json), [result](../results/plan45/phase6/jev-phase6-b09-implementation-checkpoint-result.json), [derived report](../results/plan45/phase6/jev-phase6-b09-implementation-checkpoint-derived.md), and [SHA-256 manifest](../results/plan45/phase6/jev-phase6-b09-implementation-checkpoint-sha256.txt).

The ledger is `A=123`, `E=123`, `M=112` (`M/A=91.06%`): 22 of 33 Phase 6 scenarios are accepted/migrated and 11 remain Playwright-owned. Phase 6 remains in progress. The two `focus-management` `fixtureTest` deletions in `tests/e2e/accessibility.e2e.spec.ts` have unknown provenance, are outside B01–B09, and remain excluded from M.

## Phase 6 cutover checkpoint — B10 accepted

B10 fully migrated exactly `p45-b-tooltip-dismiss-138-case01`, `p45-b-tooltip-dismiss-159-mobile-pixel-tooltip-escape-tooltip`, and `p45-b-tooltip-dismiss-188-case01`. The focused Browser Mode run passed 3/3; see the [B10 focused log](../results/plan45/phase6/phase6-b10-browser-mode-validation-2026-09-27.log). The residual E2E run passed build/typecheck and 11 tests with 15 skipped; see the [B10 residual E2E log](../results/plan45/phase6/phase6-b10-residual-e2e-validation-2026-09-27.log).

These cases preserve Pixel 7 actual touchscreen and source hit-test fidelity: route commands target live nominal bars with positive geometry and verify matching `elementFromPoint` targets. #138 checks close/cursor dismissal, #159 preserves Escape dismissal and immediate same-coordinate retap, and #188 preserves outside-heading dismissal. The independent source audit removed exactly these three cases; #207 and subsequent tooltip cases remain in Playwright, including B11 #249's intact CDP assertions.

The corrected B10 JEV checkpoint returned `valid_as_defined` (confidence `0.92`, passProbability `0.93`). See the corrected [request](../results/plan45/phase6/jev-phase6-b10-implementation-checkpoint-request.json), [result](../results/plan45/phase6/jev-phase6-b10-implementation-checkpoint-result.json), [derived report](../results/plan45/phase6/jev-phase6-b10-implementation-checkpoint-derived.md), and [SHA-256 manifest](../results/plan45/phase6/jev-phase6-b10-implementation-checkpoint-sha256.txt). The initial superseded request/result/derived report remain preserved ([request](../results/plan45/phase6/jev-phase6-b10-implementation-checkpoint-initial-request.json), [result](../results/plan45/phase6/jev-phase6-b10-implementation-checkpoint-initial-result.json), [report](../results/plan45/phase6/jev-phase6-b10-implementation-checkpoint-initial-derived.md)).

An unrelated existing tooltip diff removes two post-scroll assertions from #231 covering P42-536–539 outcome (close control hidden and cursor count zero); the desktop Chromium hover-dismiss test deletion remains unattributed. Neither is B10 or counted in M; do not restore or attribute either change. The ledger is `A=123`, `E=123`, `M=115` (`M/A=93.50%`): 25 of 33 Phase 6 scenarios are accepted/migrated and 8 remain Playwright-owned. Phase 6 remains in progress. The two `focus-management` `fixtureTest` deletions in `tests/e2e/accessibility.e2e.spec.ts` have unknown provenance, are outside B01–B10, and remain excluded from M.

## Phase 6 cutover checkpoint — B11 accepted

B11 fully migrated exactly `p45-b-tooltip-dismiss-207-1`, `p45-b-tooltip-dismiss-249-case01`, and `p45-b-tooltip-dismiss-284-case01`. The focused Browser Mode run passed 3/3; see the [B11 focused log](../results/plan45/phase6/phase6-b11-browser-mode-validation-2026-09-27.log). The residual E2E run passed build/typecheck and 8 tests with 12 skipped; see the [B11 residual E2E log](../results/plan45/phase6/phase6-b11-residual-e2e-validation-2026-09-27.log).

#207 preserves nominal then real Pixel 7 touch checks for cursor count and close visibility. #249 preserves the source CDP gesture: touchStart at the wrapper center when its bounding box exists, exactly five touchMoves with y increasing by 15px each, then touchEnd; only final close-hidden state is asserted, with no intermediate gesture-state assertions. #284 closes, finds a fresh hit-tested nominal-bar point, retaps, and checks close visibility. The independent source audit removed exactly these three cases; #307, #430, and all other non-B11 cases remain E2E-owned.

B11's JEV implementation checkpoint returned `valid_as_defined` (confidence `0.91`, passProbability `0.93`), diagnosis complete, and no clarification. See the [request](../results/plan45/phase6/jev-phase6-b11-implementation-checkpoint-request.json), [result](../results/plan45/phase6/jev-phase6-b11-implementation-checkpoint-result.json), [derived report](../results/plan45/phase6/jev-phase6-b11-implementation-checkpoint-derived.md), and [SHA-256 manifest](../results/plan45/phase6/jev-phase6-b11-implementation-checkpoint-sha256.txt).

Unrelated tooltip worktree changes remain outside B11: two post-wheel assertions were removed from #231, covering P42-536–539's post-scroll outcome (close control hidden and cursor count zero), and the desktop Chromium hover-dismiss case removal remains unattributed. Do not restore or assign either change to B11; neither is counted in M. B11 #249 is the distinct CDP gesture case above. The ledger is `A=123`, `E=123`, `M=118` (`M/A=95.93%`): 28 of 33 Phase 6 scenarios are accepted/migrated and 5 remain Playwright-owned. Phase 6 remains in progress. The two `focus-management` `fixtureTest` deletions in `tests/e2e/accessibility.e2e.spec.ts` have unknown provenance, are outside B01–B11, and remain excluded from M.

## Phase 6 cutover checkpoint — B12 accepted

B12 fully migrated exactly `p45-b-tooltip-dismiss-307-viewport-chartnote-tooltip-tooltip-chartnote-tooltip` and `p45-b-tooltip-dismiss-430-tooltip-chartnote-tooltip`. The final focused Browser Mode run passed 2/2; see the [B12 pass2 log](../results/plan45/phase6/phase6-b12-browser-mode-validation-pass2-2026-09-27.log). The first focused attempt failed with `ReferenceError: movedLinkBox` and is retained as a superseded diagnostic ([initial log](../results/plan45/phase6/phase6-b12-browser-mode-validation-2026-09-27.log)); pass2 is the acceptance evidence. The residual E2E run passed build/typecheck and 6 tests with 10 skipped; see the [B12 residual E2E log](../results/plan45/phase6/phase6-b12-residual-e2e-validation-2026-09-27.log).

#307 deliberately engineers overlap by moving the actual chartNote link inline beneath the live tooltip, confirms topmost hit-test resolves to the tooltip, and touchscreen-taps it; it asserts no nominal hash navigation and that the tooltip stays visible. The exact prior inline link style is restored in `finally`. This does not claim a natural layout collision. #430 finds an actual chartNote link point outside the tooltip, confirms the hit-test, taps via touchscreen, and asserts nominal hash navigation plus tooltip dismissal.

B12's JEV checkpoint returned `valid_as_defined` (confidence `0.93`, passProbability `0.95`), diagnosis complete, and no clarification. See the [request](../results/plan45/phase6/jev-phase6-b12-implementation-checkpoint-request.json), [result](../results/plan45/phase6/jev-phase6-b12-implementation-checkpoint-result.json), [derived report](../results/plan45/phase6/jev-phase6-b12-implementation-checkpoint-derived.md), and [SHA-256 manifest](../results/plan45/phase6/jev-phase6-b12-implementation-checkpoint-sha256.txt). Only the two B12 IDs are accepted in this batch.

The unrelated #231 post-wheel assertion removals (P42-536–539: close hidden and cursor count zero) and the unattributed desktop Chromium hover-dismiss deletion remain outside B12 and are not counted in M; preserve their unknown provenance. The two `focus-management` `fixtureTest` deletions also remain of unknown provenance, are outside B01–B12, and are excluded from M. The ledger is `A=123`, `E=123`, `M=120` (`M/A=97.56%`): 30 of 33 Phase 6 scenarios are accepted/migrated and 3 remain Playwright-owned. Phase 6 remains in progress.

## Phase 6 cutover completion — B01–B13 accepted

B13 fully migrated exactly `p45-b-tooltip-dismiss-473-case01`, `p45-b-tooltip-dismiss-508-case01`, and `p45-b-tooltip-dismiss-535-case01`. The focused Browser Mode run passed 3/3; see the [B13 focused log](../results/plan45/phase6/phase6-b13-browser-mode-validation-2026-09-27.log). The residual E2E run passed build/typecheck and 3 tests with 7 skipped; see the [B13 residual E2E log](../results/plan45/phase6/phase6-b13-residual-e2e-validation-2026-09-27.log).

#473 preserves stacked-chart opening and outside-heading dismissal with close, cursor, and active-dot predicates. #508 preserves open and close-button dismissal with active-dot predicates and no added post-close cursor assertion. #535 follows the source's salary-tab sequence, immediately reads the CPI wrapper box, and conditionally sends CDP touchStart/touchEnd if a box exists. It does not check screen bounds or hit-test the point, so the coordinate may be offscreen. The limited source predicate is close hidden immediately and after scroll settles with at least two stable samples within five seconds; this does not prove suppression for a visible, on-screen, hit-tested chart touch.

B13's JEV implementation checkpoint returned `valid_as_defined` (confidence `0.98`, passProbability `0.99`), diagnosis complete, and no clarification. See the [request](../results/plan45/phase6/jev-phase6-b13-implementation-checkpoint-request.json), [result](../results/plan45/phase6/jev-phase6-b13-implementation-checkpoint-result.json), [derived report](../results/plan45/phase6/jev-phase6-b13-implementation-checkpoint-derived.md), and [SHA-256 manifest](../results/plan45/phase6/jev-phase6-b13-implementation-checkpoint-sha256.txt).

All batches B01–B13 and all 33 eligible scenario IDs are accepted/migrated: `A=123`, `E=123`, `M=123` (`M/A=100%`), with zero remaining in this roster. The `tooltip-dismiss.e2e.spec.ts` file remains because #231 and other E2E cases are still present. The unrelated #231 post-wheel assertion removals (P42-536–539: close hidden and cursor count zero) and the desktop Chromium hover-dismiss deletion remain unknown-provenance changes outside B01–B13; they are not attributed or counted in M. The two `focus-management` `fixtureTest` deletions also remain of unknown provenance and are excluded from M. This closes the 33-scenario Phase 6 cutover roster; it does not close any separate Plan45 CI/runtime measurement gates.

Final aggregate validation: the final built Browser Mode run passed build/typecheck, all B01–B13 cases (33/33), and legacy route suites—Chromium 9 files / 80 passed and WebKit 5 files / 21 passed / 5 skipped (134 passed / 5 skipped across these suites); see the [final full Browser Mode log](../results/plan45/phase6/phase6-final-full-browser-mode-validation-2026-09-27.log). The final residual E2E run passed build/typecheck and 3 passed / 7 skipped ([log](../results/plan45/phase6/phase6-b13-residual-e2e-validation-2026-09-27.log)). `pnpm run lint:fast` exited 0 ([log](../results/plan45/phase6/phase6-final-lint-validation-2026-09-27.log)). The final ledger remains `A=123`, `E=123`, `M=123`, 33/33 migrated, zero remaining. Previously recorded #231 post-wheel assertion removals, unattributed desktop Chromium hover-dismiss deletion, unknown accessibility focus-test deletions, and #307/#535 limitations are unchanged.

## Post-cutover residual E2E audit — 2026-09-27

The [residual E2E audit record](../results/plan45/phase6/residual-e2e-audit-and-migration-plan-2026-09-27.md) closes the remaining meaningful accessibility checks in B14 without changing the original 33-case ledger (`A=123/E=123/M=123`). B14 adds four production-route Browser Mode checks for dark legend contrast/hover reset, keyboard Space activation, keyboard focus-visible styling, and reduced-motion behavior. The six source accessibility cases were unconditional skips with no rationale; the locator-defined range-picker check and merely truthy color-string check were retired rather than counted as coverage.

The active normal advanced-series E2E was removed after exact comparison with the existing batch3-b production-route Browser Mode assertions. The no-assertion mobile LazyMount route smoke was removed; unit and Browser Mode checks continue to cover LazyMount and the test-only mount override. Tooltip #231 remains the sole active E2E behavior because current mobile bar-touch opening is not covered by an equivalent Browser Mode predicate. The E2E run reports its mobile-pixel instance passed and its Chromium project copy skipped. The absent #231 post-wheel assertions, desktop hover-test body, and focus-management bodies retain unknown provenance and were not modified by this audit.

Follow-up validation: B01–B14 passed 37/37, legacy Chromium 9 files / 80 passed, WebKit 5 files / 21 passed / 5 skipped (138 passed / 5 skipped overall); fresh residual E2E passed 1 / skipped 1; production build/TypeScript, `pnpm run lint:fast`, and `git diff --check` passed. Logs: [aggregate Browser Mode](../results/plan45/phase6/phase6-b14-full-browser-mode-validation-pass2-2026-09-27.log), [residual E2E](../results/plan45/phase6/phase6-b14-residual-e2e-validation-2026-09-27.log), [lint](../results/plan45/phase6/phase6-b14-lint-validation-2026-09-27.log). JEV v3 plan and implementation checkpoints both returned `valid_as_defined`; see the request/result links in the [audit record](../results/plan45/phase6/residual-e2e-audit-and-migration-plan-2026-09-27.md).

Final audit addendum: standalone `pnpm run type-check` exits 2 with 71 errors across 23 pre-existing Browser Mode test files; after the B14 local typing correction, no remaining diagnostic points to B14 ([type-check log](../results/plan45/phase6/phase6-b14-type-check-validation-pass2-2026-09-27.log)). The latest JEV implementation checkpoint revalidation returned `valid_as_defined` (confidence `0.95`, pass probability `0.96`, diagnosis complete, no follow-up); see the [request](../results/plan45/phase6/jev-residual-e2e-implementation-checkpoint-revalidation-request.json) and [result](../results/plan45/phase6/jev-residual-e2e-implementation-checkpoint-revalidation-result.json).

### Superseding decision: tooltip #231 E2E retirement — 2026-09-27

The preceding statement that tooltip #231 remains Playwright-owned is superseded. The existing `p45-b-tooltip-dismiss-231-case01` Browser Mode case checks the same production-route hit-tested mobile touch/open behavior and additionally confirms tooltip/cursor dismissal after scrolling. With no recorded Pixel 7-specific requirement, only the runnable mobile #231 case was removed from `tests/e2e/tooltip-dismiss.e2e.spec.ts`; the file remains as a no-runnable-test shell with its empty desktop describe, prior helpers, and comments. No pre-existing deleted test bodies were restored. The `mobile-pixel` matcher was removed. Browser Mode is now the sole owner; its 412×915 mobile-touch profile does not assert Pixel 7 UA or device scale factor. The original Phase 5/6 ledger remains `A=123/E=123/M=123` (33/33), and all E2E counts above remain historical snapshots. `test:e2e` remains available as a standalone script; `test:full` no longer invokes an empty Playwright suite. See the [retirement plan](../results/plan45/phase6/phase6-tooltip-231-e2e-retirement-plan-2026-09-27.md) and [JEV plan review](../results/plan45/phase6/jev-tooltip-231-e2e-retirement-plan-result.json).

Retirement checkpoint validation: production build and build TypeScript passed, as did `pnpm run lint:fast`. Browser Mode aggregate results were B01–B14 37 passed, production-route 80 passed, and WebKit 21 passed / 5 skipped. Focused #231 Browser Mode passed 1 test with 79 name-filter skips ([log](../results/plan45/phase6/phase6-tooltip-231-focused-browser-mode-validation-2026-09-27.log)); see the [aggregate log](../results/plan45/phase6/phase6-tooltip-231-browser-mode-validation-2026-09-27.log). Playwright `--list` returned zero tests and exit 1 because the suite is empty; no empty E2E execution is claimed. `test:full` and standalone `pnpm run type-check` were not run. `git diff --check` passed both before and after this documentation update. JEV plan revalidation and implementation checkpoint both returned `valid_as_defined`; implementation confidence 0.54, pass probability 0.61, diagnosis complete, no follow-up. See the [plan revalidation](../results/plan45/phase6/jev-tooltip-231-e2e-retirement-plan-revalidation-result.json), [implementation request](../results/plan45/phase6/jev-tooltip-231-e2e-retirement-implementation-checkpoint-request.json), and [implementation result](../results/plan45/phase6/jev-tooltip-231-e2e-retirement-implementation-checkpoint-result.json). These results do not rewrite historical suite counts or the original 33/33 ledger.

### Pre-push Browser Mode gate update — 2026-09-28

The pre-push E2E stage is replaced by the built production-route Browser Mode aggregate after the build in both full and changed-file profiles. The standalone `test:e2e` command remains available. Hook-smoke and the focused push-impact unit checks passed (10/10). See the [cutover plan](../results/plan45/phase6/phase6-prepush-browser-mode-cutover-plan-2026-09-28.md), [JEV plan result](../results/plan45/phase6/jev-prepush-browser-mode-cutover-plan-result.json), and [implementation reassessment](../results/plan45/phase6/jev-prepush-browser-mode-cutover-implementation-reassessment-result.json).
