# nextjstest/scripts/ts_converters/lib/

## Responsibility

Excel/CSV変換器で共通利用する、読み込み・表抽出・header/列/年月正規化・merge・CSV書き出しの小さな境界モジュール群。

## Design

`xlsx-reader.ts`はXLS/XLSX/encodingを読み`Map<string, any[][]>`へ、`sheet-selector.ts`は候補sheetを選ぶ。`header-detector.ts`と`table-extractor.ts`はheader/labelを検出してArquero tableへ変換し、`column-mapper.ts`は列対応を作る。`date-utils.ts`は年月検出/正規化、`nendo-synthesizer.ts`は年度から月を補完、`merger.ts`は年月キーで結合、`csv-writer.ts`はbackup付きCSV出力、`types.ts`は共有結果型を定義する。

## Flow

変換器 → `xlsx-reader` → sheet/header/table抽出 → 列・年月正規化/年度補完 → `mergeByNengetsu` → `writeCSVWithBackup` → `data/source` CSV。Arquero tableと共有型が各段の受け渡しになる。

## Integration

利用元は主に`convert_cpi.ts`と同ディレクトリの変換器で、出力は`server/lib/data-loader`へ渡る。ここは開発時の変換境界であり、Phase 1の表示hook、URL、公開データモデル、APIとは直接接続せず、既存生成CSVの形式を維持する。
