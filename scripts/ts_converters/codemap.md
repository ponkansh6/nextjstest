# nextjstest/scripts/ts_converters/

## Responsibility

e-Stat/公的統計のExcel・CSVを、`data/source/`に置く正規化CSVへ変換するTypeScript実装群。ここは開発時の変換・生成境界であり、変換結果がdashboard loaderの追跡済み入力として採用されるかはファイルごとのloader選択と運用に依存する。

## Design

固定変換器はそれぞれ実装内で入力ファイル名と出力ファイル名を固定している。現リポジトリで`data/source/economics_source/`に存在する具体的な入力は`lt01-b10.xlsx`で、`convert_population.ts`がこれを読み`data/source/population_statistics.csv`へ出力する。給与系などの固定変換器は、対応する入力が同ディレクトリに供給された場合に、各自の定数で指定した給与CSVを`data/source/`へ出力する。`data/source/`直下の`hon-mks202512.csv`は`server/lib/dataIo.ts`のdashboard loaderが読む追跡済み入力であり、`hon-mks202606.xls`は別の実在するExcel入力である。これらは`economics_source`配下の入力ではない。`convert_cpi.ts`は`data/source/economics_source/`内の拡張子が`.xls`、`.xlsx`、`.csv`、`.xlsb`のファイルから更新日時順に最大5件を読み、`data/source/cpi_data/`へ`*.converted.csv`を生成する。`template.ts`は変換器の雛形である。

## Flow

入力ファイル → XLSX/Arquero等で表抽出・列/年月変換 → `data/source/`または`data/source/cpi_data/`のCSV。`convert_cpi.ts`は`lib/xlsx-reader`、`sheet-selector`、`table-extractor`、`date-utils`、`csv-writer`を通り、入力を更新日時順に最大5件処理する。生成先の`data/source/cpi_data/`は一時/生成用であり、dashboard loaderが採用する追跡済み入力（例: `data/source/hon-mks202512.csv`）と同一とは限らない。固定変換器は各統計表の列順・header skipを直接適用し、個別の出力CSVへ書く。

## Integration

出力CSVは`server/lib/data-loader`のCPI/CTI/給与/人口入力境界で、生成後はdata-qualityテストとmetadata検証の対象になる。Phase 1はClient側のcomposition/state分割であり、これらの変換入力・出力形式を変更しない。
