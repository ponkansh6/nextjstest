# コード改善案（具体）

## 1) chartLogic.computeChartData

問題点:

- normalizedNominalData.find / filteredNominalData.find をループ内で複数回呼んでおり O(n^2) の挙動
- props オブジェクトをそのまま useMemo 依存にしているため再計算が多発する可能性

提案:

- 年月 -> データ の Map を作成して O(1) 参照にする
- filteredNominalData は配列/Map を分けて用途に応じて使う（補完配列と索引用 Map を両方保持）
- 関数を小さく分割し、ユニットテストを追加

例:

```ts
const nominalMap = new Map(normalizedNominalData.map((d) => [d.年月, d]));
// 四半期集計では months.forEach(m => { const row = nominalMap.get(monthStr); ... })
```

## 2) chartUtils.mergeChartData

問題点:

- 正規表現を複数回利用している（パースを一箇所にまとめる）
- CPIのみの年月を切り捨てるロジックが明示されておらず、期待値の差が出る可能性

提案:

- parseYearMonth ヘルパーを作り、比較とソートに再利用
- マージポリシーを README に明文化（CPIのみを含めるか否か）

## 3) useCpiChartData

問題点:

- useMemo の依存配列に `props` オブジェクトを入れている（参照が変わりやすい）

提案:

- 依存配列を個別フィールドに展開する（例: nominalData, startYear, endYear, nominalKeys.join(','), ...）
- またはフックの呼び出し側で props を useMemo して安定化する

## 4) cpiData.ts の分割

提案:

- data-loader (fs, Papa) を scripts/ または server/lib/dataLoader.ts に移動
- 純粋な計算ロジック（移動平均、指標算出）は src/lib/processing.ts の純関数として残す

---

各提案ごとに小さいサンプル PR を作成できます。どれから着手しますか？
