# nextjstest/scripts/

## Responsibility

データ変換、loaderの実データ確認、回帰/性能計測、配色検証、E2E補助を行う開発者向けCLI群。アプリ実行時の依存ではなく、主に`data/source`または標準出力へ結果を出す。

## Design

変換系は`convert_*.ts`（給与・労働・CPI）と`build_*_executable.sh`、一括実行は`run_all_conversions.sh`。確認系は`checkLogic.ts`、`inspectData.ts`、`verify_2025_01.ts`、`verify_keys.ts`、`dump200412.ts`、`traceSmoothing.ts`、`debugHiddenKeys.ts`、`measure-import.ts`。比較/計測は`compare.ts`、`measure_logic_tests.sh`、`measure_logic_tests_fast.sh`、`measure_test_times.sh`、`lighthouse-mobile.js`、配色は`validate-palette.mjs`/`validate-palette-cli.mjs`、E2Eポート整理は`kill-e2e-port.mjs`が担う。`python_backup/`は旧変換・比較・検証スクリプトを保存する領域である。

## Flow

XLS/CSV（`public/economics_source`、`data/source`、引数指定ファイル）→変換/loader検証→CSV、ログ、比較レポート、標準出力。`update_earnings_from_estat.ts`は引数または`/tmp/estat-earnings-index.utf8.csv`を読み、給与CSVとmetadataを更新し、`extract_salary_method_b.ts`はXLSから給与method B CSV/metadataを生成する。

## Integration

変換・確認スクリプトは`server/lib/dataLoader`や`src/lib/clientCalculations`を呼び、生成物はserver loaderの入力となる。`validate-palette`はCSS/定数ではなく渡された配色を検証し、`lighthouse-mobile`は指定URLの監査結果をファイルへ出す。Phase 1のUI/state分割はスクリプトの入出力契約を変更しない。
