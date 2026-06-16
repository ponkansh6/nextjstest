#!/bin/bash
echo "計測を開始します: 軽量ロジックテスト（高速設定）"
start_time=$(date +%s%3N)

# 専用設定ファイルを使用して実行
pnpm vitest run -c vitest.unit.config.ts

end_time=$(date +%s%3N)
duration=$((end_time - start_time))

echo "計測終了"
echo "合計所要時間: $duration ミリ秒"
