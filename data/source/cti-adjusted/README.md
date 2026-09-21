# Plan39 annual adjusted CTI artifacts

This directory is the versioned artifact boundary for the Plan39 annual
adjusted-connection loader. The loader accepts only saved local artifacts; it
does not download from e-Stat at runtime and it does not aggregate monthly CTI
data as a substitute.

The manifest records statistical code `00200567` and the official sources:

- **B**: table 1-1-1, all households, real index, annual 2005 onward —
  `https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=000040499069`
- **A**: table 2-1-1, distribution-adjusted value, all households, real index,
  annual 2017 onward —
  `https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=000040499087`
- **L**: `lev-jnb.xls`, official annual original index, 1981–2018, two-or-more-person
  households adjusted for household-size and household-head-age distributions.

Every saved B/A/L artifact must carry metadata with the manifest
`schemaVersion` and `revision`, the statistical code, source identity, annual
coverage, and a 64-character SHA-256 reference. The hash is checked against
the exact saved artifact before the input is passed to the calculation core.
The checked-in B/A/L artifacts were retrieved from the URLs above on 2026-09-20.
B and A use the official annual real-index columns; L uses the official annual
sheet directly, so no monthly yearization was performed. Missing or invalid
artifacts fail closed. A source `-` is retained as `null`; no completion or
interpolation is performed. `audit.json` records source and saved-artifact
SHA-256 values and the inspected ranges.

## Rollback snapshot

採用時点のrollback snapshotは
`snapshots/plan39-9b899d39bae3dd832fdc9ac2806a44cd678ea700f09ec5f7f5b58e0ed5c87fa3/`
に固定している。このsnapshot IDは、B/A/L保存JSONのSHA-256を
`B:<hash>`、`A:<hash>`、`L:<hash>`の順に改行連結し、その文字列をSHA-256化した値であり、現在時刻・乱数・mtimeを含まない。

snapshotには実artifact B/A/L、各artifactから抽出したmetadata、採用時manifest、audit、全ファイルのSHA-256を記録した`hashes.json`を保存している。値の推定・補完・再取得は行っていない。

### 復元とloader hash検証

読み取り専用でsnapshot完全性と現行artifactのloader契約を検証する。

```sh
node scripts/plan39/rollback.mjs --verify
```

復元は対象IDと`--force`を明示した場合だけ実行する。スクリプトは復元前にsnapshot内のB/A/L・metadata・manifest・audit・hashesを検証し、復元後にmanifestの各SHA-256とmetadata契約を再検証する。`--force`なしでは何も変更しない。

```sh
node scripts/plan39/rollback.mjs \
  --restore 9b899d39bae3dd832fdc9ac2806a44cd678ea700f09ec5f7f5b58e0ed5c87fa3 \
  --force
```

新しい採用時点を固定する場合は、既存snapshotを変更せずに実行する。同一B/A/L入力なら同一IDになる。

```sh
node scripts/plan39/rollback.mjs --create
```

この成果物は公開系列を切り替えず、既存loader/API/UIにも接続しない。復元後のloader hash検証が失敗した場合は復元結果を公開入力として扱わず停止する。
