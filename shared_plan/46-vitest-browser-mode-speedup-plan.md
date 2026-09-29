# Vitest Browser Mode 高速化計画

作成日: 2026-09-28  
状態: 計画

## 目的

現在のVitest Browser Mode集約実行の所要時間を、テスト契約・browser coverage・安定性を保ちながら短縮する。原因を推測で決めず、同条件の基準値と計測区間を先に確立し、時間上位のspecから一度に一要因ずつ改善する。

対象コマンドは `pnpm run test:browser:next-route-poc:built`。build時間はsuite計時と分ける。full-run構成はChromium aggregateとWebKitの2 configを維持した状態を初期対象とし、config数や並行度を変える実験は、個別test内の改善と分けて扱う。

## 既知の証拠と限界

### 確認済みの観測

- 2026-09-28の最終full runは2 full-run config（Chromium 1、WebKit 1）で完走し、138 passed / 5 skipped / 0 failed、runner elapsed約518秒だった。根拠は `results/plan45/phase6/phase6-browser-mode-minimal-launch-final-2026-09-28.log`。
- 別の `--profile-json` full runも同じ2-config構成で終了コード0、runner wall time約506秒だった。JSONのtest duration合計はChromium 369,033.4ms、WebKit 103,594ms。これはconfig実行時間やrunner wall timeとは計測境界が異なり、加算してwall timeの内訳とはみなさない。
- そのJSON内で時間の長いspecはChromiumの `batch2-production-route` 71.60秒（Chromium test durationの19.40%）、`batch1` 51.57秒（13.98%）、`batch3-a` 44.79秒（12.14%）、`batch3-b` 43.45秒（11.77%）、`batch4-b` 28.10秒（7.61%）。WebKitでは `batch5` 36.016秒（WebKit test durationの34.77%）が最長。
- 個別test上位には、route readiness（navigation、H1、network-idle）、`__MOUNT_ALL__`、serialなvisibility/bounding-box/evaluate確認、tab操作後のsection/viewport待ち、再loadと明示waitがある。これらはソース上で通過する操作の観測であり、各操作の時間計測ではない。
- 過去の2-config試行や3-config fallbackには未完走の履歴がある。後続の最終2-config runは成功しているが、過去の中断・失敗を成功結果と混同しない。中断後のunknown listenerはPID/process identityが確認されず、停止済みともrunner由来とも断定しない。

### 未確定事項

- 1回のprofileでは通常時の中央値、ばらつき、日内変動が分からない。
- JSON test durationだけではrunner/Vitest child、Next.js server readiness、browser executable lifecycle、commandごとのBrowserContext/page生成・close、未分類時間を分解できない。
- 上記の待ち操作がspec時間のどの程度を占めるか、同一操作を短縮しても契約を損なわないかは未計測。

よって現時点で確認済みなのは「長いspecの順位」であり、wait種別を確定ボトルネックとすることや、並列度・timeout・isolationを変更することではない。

## 実施フェーズ

### Phase 0 — 再現可能な基準線と計測境界

1. 対象revision、Node/pnpm、lockfile、OS/runner、build成果物のrevision、実行コマンドと引数、config順、browser設定、環境負荷・省電力状態を記録する。install/buildは計時から分離する。
2. 変更のない2-config full runを、同じbuild成果物と条件で計3回行う。各回のrunner wall time、config elapsed、Vitest summary、pass/fail/skip、profile JSONを保存し、中央値・最小/最大・rangeを出す。既存の約518秒完走runと約506秒profile runは歴史的referenceとして載せ、条件・profile有無が一致する基準線の反復統計に混ぜない。
3. 利用可能な既存runnerログとVitest出力で境界を対応づける。runner/config開始終了・exit code、server起動/readiness/teardown、Vitest reported setup/import/transform/tests、browser lifecycle、test durationを個別欄に置き、計測できない区間は「未分類」とする。
4. 必要ならmeasurement-onlyの計時ログを一時的に追加する。runnerの逐次順、browser lifecycle、test動作、cleanup、終了コード伝播を変えず、production-route command invocationごとのBrowserContext/page create/closeはbrowser executable lifecycleと別計上する。test file数でcontext/page数を代用しない。エラー時もcleanupと計時を残し、外部wall timeと照合する。計測コードは結果を保存後に通常経路から除去または隔離する。

**Phase 0完了条件:** 3回のrunが同じtest/skip件数で完走し、条件とraw artifactsが保存される。計時境界ごとに実測値か未計測の明示があり、異なる境界の数値を足し合わせて全体時間を説明していない。

### Phase 1 — 上位候補の絞り込み

1. JSON profileからbrowser/configごとのspecおよびtest名の順位表を作る。各行にduration、browser内比率、成功状態、出典runを記載する。
2. 現行sourceとstageログで、上位testの操作列を対応づける。まずChromium `batch2-production-route` とWebKit `batch5`、次にChromium `batch1`、`batch3-a`、`batch3-b`、`batch4-b`を調査対象にする。これは計測優先順位であり、個別待ちの原因認定ではない。
3. 追加プロファイルでは候補testを必要最小限でfocused実行し、最低3回の中央値とばらつきを取得する。同じconfigの共有browser/server/cache条件と違う場合はその差を記録し、focused実行時間をfull-run順位の代わりにしない。
4. traceは順位だけでは待ち原因を区別できない候補に限る。navigation/server response、selector retry/actionability、明示wait/network-idle、描画/layout、Vitest preparation、browser lifecycle、context/page lifecycleのどれに帰属するか記録する。traceによる計測摂動も記す。

**優先度判定:** 集約wall timeの20%以上を占める区間、または上位3区間でtest durationの50%以上を占める区間を優先調査する。ただし単独では原因確定とせず、同条件反復で再現し、待ち区間または実行境界に計時根拠が結び付くことを求める。揺れの範囲内、もしくは区間に帰属できない場合は未確定のままにする。

### Phase 2 — 仮説を一つずつ試す

1. Phase 1の証拠から、影響範囲を最小にした仮説を一件選び、変更前に対象契約、予測される計測差、維持するisolation・browser coverageを記録する。
2. 一実験につき変更変数を一つに限定する。例えば同一テスト内の重複した待ち条件、固定sleep、serialな読み取りのどれかを個別に評価する。複数specの一括編集、waitの包括的削除、viewport・timeout・retry・worker並列度・config grouping変更を同じ実験に混ぜない。
3. 対象testをfocused実行して機能契約を確認し、続けて同一条件のfull 2-config suiteを走らせる。性能比較は同じ計時境界・同じprofile有無の基準線と比較し、最低3回の中央値とrangeを使う。
4. traceで調べた場合は、traceなしのrunを最終性能比較に用いる。trace有無のrunを混ぜない。
5. 効果が計測揺れを超えない、ばらつきが増える、または契約・安定性が悪化する場合は仮説を棄却して変更を戻し、結果を記録する。成功時も次の変更前に新しい3-run基準線を作る。

#### 並行度・config変更を扱う場合

これは上記のテスト内実験と独立した候補として後段で評価する。現在は2-config full run完走が確認されている一方、過去に別構成の中断・失敗がある。config数、browser launch数、並行度、順序またはresource contentionのどれか一つだけを変え、focused gateの後にfull suiteを反復する。実際のprocess数・launch数はログまたはprocess evidenceで確認し、config数から推定しない。再現性ある完走と総合的な性能改善の両方が得られなければ採用しない。

### Phase 3 — 確認と成果物

採用候補ごとにfocused契約確認後、型チェック、lint、runner/hook関連既存チェックおよびfull 2-config Browser Mode suiteを実行する。full suiteは138 passed / 5 skipped / 0 failedとの一致を確認し、意図したtest inventory差があれば理由を明記する。baselineと変更後を同条件・同計時境界で最低3回比較し、中央値、range、browser別内訳、改善率を示す。suite時間が下がっても個別testの安定性やskip/failureが悪化していれば受け入れない。

## 受け入れ条件

- 再現条件、3回以上のraw run、pass/fail/skip件数、中央値とrangeが保存されている。
- Vitest test duration、config/runner wall time、server/browser/context-page lifecycleの計時境界が分離され、未計測値は未計測として残っている。
- 最適化対象は反復測定で上位に再現し、変更対象の待ち・処理に証拠が結びついている。
- 一度に変えた要因が一つで、変更前後に同一の機能契約とfull-suite結果を確認している。
- 性能改善がrun-to-run variabilityを超えて再現する。比較条件または中央値改善が不明瞭なら採用判定を保留する。
- Browser Mode/Chromium/WebKitの対象契約、isolation、viewport、timeout、skip意図を維持し、test inventoryの予期しない変化がない。
- 検証ゲートが通過し、最終的な計画・変更内容・計測根拠・制約を `shared_plan` と仕様書更新の要否に反映する。

## 退避・ロールバック条件

- focused testまたはfull suiteでfailure、hang、summary欠落、件数差、isolation/viewport上の契約差が生じたら、その変更を戻す。
- 終了コード0でも138/5/0から差がある場合は、意図と根拠が明確になるまで採用しない。
- 反復で改善が計測揺れ以下、または別区間への時間移動で全体改善が再現しない場合は変更を戻す。
- runner/server/browser cleanupや終了コード伝播の異常を見つけた場合、性能値を無効として扱い、先にrunner挙動を復旧する。
- 中断時にprocess identityの分からないlistenerを終了済み・再利用済みと記録しない。新runは通常のport allocationを使い、既知のプロセス所有者が確認できないものを本計画でkillしない。

## 記録する成果物

- 実行条件、revision、環境、build識別子、run開始/終了とexit codeをまとめたbenchmark manifest。
- 各回のraw runner log、Vitest JSON profile、必要な場合だけtraceとtrace取得条件。
- browser/config/spec/test順位表と、計時境界（runner/config/server/browser/context-page/test/未分類）別の集計表。
- 実験台帳: 仮説、根拠、変更した一要因、対象契約、focused/full結果、3回以上の中央値・range、採用/棄却理由、rollback commit/diff参照。
- 結果が確定したらこの計画を更新し、正式なbaseline、未解決の測定項目、採用した改善、残るリスクを記録する。

## 参照

- ボトルネック調査結果: `results/plan45/phase6/phase6-browser-mode-bottleneck-investigation-plan-2026-09-28.md`
- 最終2-config run log: `results/plan45/phase6/phase6-browser-mode-minimal-launch-final-2026-09-28.log`
- runner: `scripts/run-next-route-poc.mjs`
- test集約定義: `package.json` (`test:browser:next-route-poc:built`)
- Browser Mode configs: `vitest.browser.aggregate-chromium.config.ts`, `vitest.browser.webkit.config.ts`
- production-route context/page境界: `tests/browser-mode/next-route-poc.command.ts`（他commandも計測前に監査する）

## JEV plan review

初回v3 `plan_validity` 判定は `valid_as_defined`（confidence 0.98、pass probability 0.99）。修正要求はなかった。request: `results/plan45/phase6/jev-vitest-browser-speedup-plan-2026-09-28-request.json`、result: `results/plan45/phase6/jev-vitest-browser-speedup-plan-2026-09-28-result.json`。

この判定は計画の妥当性を対象とし、未解決の性能測定項目は残る。同条件の反復run、lifecycle別の実測、spec内の待ち時間のtrace帰属は未取得であり、計画の各フェーズで証拠を収集する。
