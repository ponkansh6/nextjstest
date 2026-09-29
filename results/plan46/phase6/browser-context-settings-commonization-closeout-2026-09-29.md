# Browser context・画面設定共通化の実施記録

## 実施範囲

更新版の詳細計画に沿って、22個のroute command実装（provider variantを含む25行）を対象にcontext lifecycleとviewport/device設定を共通化した。内訳は初期移行7件、代表移行2件、残る非WebKit 10件、共有commandのWebKit variant 3件（最後に移行）。各commandの実行ごとに独立したcontextを作る契約を維持した。

共通helperはcontext-onlyの`withIsolatedContext(browser, options, callback)`。Browser/provider判定、page生成、route操作、assertion、command固有の入出力はcommand側に残した。context生成失敗時はcloseせず、生成後はcallback/page作成の成否にかかわらずcloseを一度試みる。callback errorはidentityとstackを保って優先し、close errorは補助情報として取得可能にした。callback成功後のclose単独失敗は伝播する。options builderは呼び出しごとにtop-levelと変更対象のnested objectを新しくし、device descriptor全体を適用した後にscenario overrideを重ねる。

## 仕様同期とtraceability

仕様書のData Sources、Data Flow、Component Tree、Requirementsを実装に同期し、Operational validation contractsに次のWHEN/THENシナリオを追加した。

1. callback/page作成またはcontext closeが失敗したとき、contextを適切にcloseし、callback errorのidentity/stackとclose errorの補助情報を保つ。
2. presetを作成するとき、各呼び出しで独立したoptions/nested objectsを返し、device descriptorの後にscenario overrideを適用する。

対応するlifecycle/optionsシナリオは、helper unit testの生成失敗・callback/page失敗・close失敗・参照独立性/cloneテストで確認し、production-route aggregateでroute command側の適用を確認した。Browser Modeの`.tsx` suiteは別の検証面であり、production routeの`.browser.test.ts`を含まない。

`test:all`の初回実行で、既存のphase4 Browser Mode probeが既定configに拾われる構成上の問題が判明した。対象probeの**ファイル単位の明示的exclude**を既定configに加え、専用Browser Mode configに実行責務を集約した。これにより最終の`test:all`は通過した。

## 最終検証

- `pnpm run type-check`: pass
- `pnpm run lint:fast`: pass
- helper unit: 1 file、10 tests passed
- `pnpm run test:all`: 87 files、792 passed、4 skipped
- `pnpm run test:browser`: 22 files、74 passed、6 skipped
- built Chromium aggregate: 22 files、97 passed、329.94 s
- WebKit aggregate: 4 files、14 passed、5 skipped、83.08 s
- focused B10: 3/3 passed、12.97 s
- focused B14: 4/4 passed、12.41 s
- Phase5 interactions: 2/2 passed、9.94 s
- `git diff --check`: clean
- JEV implementation checkpoint: `valid_as_defined`

最初のtype-checkでは、作業ツリーに既にあったuntrackedの`tests/components/CpiChart.test.tsx`にも型エラー（mock return typeと`exact: true` selector overload）が見つかったため、TypeScript整合のみの狭い修正を加えて最終type-checkを通した。この修正は今回のcontext migration acceptance scope外であり、テスト挙動の変更・計測はしていない。

aggregateの所要時間はこの検証時点のサンプルであり、共通化による前後のspeedupを示す比較値ではない。context起動回数も削減していない。

Phase5 interaction実行時はport 3187/3188にlistenerが存在したが、PID/processは確認できなかったため、使用portを3190へ切り替えた。この作業で起動したserverだけを停止した。

## 作業状態

既存のstaged変更を保持した。今回のcloseout記録を含め、新たなstage操作およびcommitは行っていない。
