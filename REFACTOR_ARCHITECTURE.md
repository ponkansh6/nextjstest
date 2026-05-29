# アーキテクチャ提案（サーバ／クライアント責務）

現状:

- src/lib/cpiData.ts に fs 同期読み込みや path/process.cwd を使うコードが混在している。
- このモジュールがクライアント側に誤ってバンドルされるとブラウザ実行時に失敗するリスクがある。

提案:

1. サーバ専用コードを server/ または scripts/ に移動する（例: server/dataLoader.ts）。
2. クライアントは API（/app/api/... route.ts）から前処理済み JSON を取得して描画する。
3. Next.js の app-router を活用して、サーバコンポーネントとクライアントコンポーネントの境界を明確にする。

メリット:

- バンドルサイズ低下、クライアントでの偶発的な fs import を防止
- データ前処理を CI/バッチで実行し、クライアントは軽量に保てる

実装ステップ:

- step1: cpiData 内の FS 操作を抽出し server/dataLoader.ts に移設
- step2: データ生成 API（または静的 JSON 出力）を実装
- step3: クライアント側は fetch で JSON を取得するように変更

注意:

- 既存の tests がサーバモジュールに依存している場合は、モックまたはユニット化を行う
