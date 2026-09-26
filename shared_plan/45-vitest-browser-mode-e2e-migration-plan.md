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

- [ ] Batch 2 以降は、Phase 0 で承認された残る Browser Mode 候補から1〜3 scenario の batch を選ぶ。既に責務が unit / component test にある契約は重複させず、各 batch の前に対象範囲と残す Playwright 保証を明記する。
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
