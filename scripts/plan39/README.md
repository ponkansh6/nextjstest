# Plan39 実データ監査オーケストレータ

既存の `loadCtiAdjustedInputs` を入力検証ゲートとして通し、保存済みB/A/L artifactだけを使って監査結果を `results/plan39/` に保存します。通常推計のcalibration、backtest trainingはともに2018..2025、targetは2017、holdoutは2017です。感度分析は baseline（2018..2025）と alternative（2018..2024）を同じtarget・holdout・`official_annual` Lルールで比較します。期間、target、holdout、入力coverage、leakageは結果と `auditSummary` に保存されます。

````sh
pnpm plan39:analysis
pnpm plan39:analysis -- --check

Regenerate the manifest-validated provisional 2+ household-share input before
analysis when its source snapshots change:

```sh
node scripts/plan39/build-production-pi2plus.mjs
pnpm plan39:analysis
````

The endpoint-calibrated correction uses the 2025 residual and retrospective
2018–2024 comparison, so its backtest is not independent forecast evidence.

```

`--artifact-root` と `--results-dir` で対象を明示できます。結果JSONのトップレベル `auditSummary` には、verdictのchecks、選択threshold、感度分析のraw/verdict、期間契約、入力・分析fingerprintと実artifact hashを固定schemaで保存します。`--check <保存JSON>` はloader済み入力を使い、auditSummaryとnested sourceのdeep equality、実artifact・manifest・取得auditのSHA-256、期間・Lルール・verdict/check・threshold・感度分析の判定整合性をread-onlyで検証します。V2のOtherジャンプ判定はOther値そのものの前年差ではなく、`Other / 総合 × 100` の隣接年差（percentage points）です。閾値は公式Aの2017–2025年から評価可能な隣接ペア全てで算出した最大シェア差とし、欠損・非正総合・不整合があれば公開ゲートを閉じます。推計系列と2016→2017接続もこの閾値で再評価し、違反ペアと入力値は監査結果に記録します。`scripts/plan39/run-analysis.mjs` の旧 residualBoundary sweep は別のlegacy diagnosticです。`--check` の成功は構造・hash・判定整合性の検証成功を意味し、全体 `verdict.status=pass` を意味しません。失敗やinsufficient-dataもJSON結果として保存され、書き込みはtempからrenameするため途中JSONを残しません。

`calendar_year_average` は使用しません。実artifactのcoverageが明示期間を満たさない場合や、sensitivity／残差境界の値が不足する場合は全体判定をpassにせず、理由付きでfail-closedします。
```
