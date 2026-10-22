# nextjstest/scripts/ts_converters/lib/

## Responsibility

`convert_cpi.ts` が使用するExcel/CSV読み込み、sheet選択、表抽出、年月正規化、CSV書き出しの補助モジュール群。

## Design

`xlsx-reader.ts`はXLS/XLSX/CSVを読み`Map<string, any[][]>`へ変換し、`sheet-selector.ts`は候補sheetを選ぶ。`table-extractor.ts`は入力表をArquero tableへ変換し、`date-utils.ts`は年月を正規化する。`csv-writer.ts`は既存出力をbackupしてCSVを書き出す。

## Flow

`convert_cpi.ts` → `readWorkbook` → `pickBestSheet` → `extractTable` → 数値列と年月の正規化 → `writeCSVWithBackup` → `data/source/cpi_data/*.converted.csv`。

## Integration

`convert_cpi.ts`がこのlibの現行利用元である。固定列の賃金・人口変換器は各自の変換処理を持ち、このlibを利用しない。生成CSVは変換時の出力であり、dashboard runtimeが直接参照する契約ではない。
