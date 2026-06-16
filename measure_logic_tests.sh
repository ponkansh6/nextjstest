#!/bin/bash
echo "計測を開始します: 軽量ロジックテスト"
start_time=$(date +%s%3N)

# vitestを実行（軽量なテストとしてtests/unit配下を指定）
pnpm run test tests/unit/

end_time=$(date +%s%3N)
duration=$((end_time - start_time))

echo "計測終了"
echo "合計所要時間: $duration ミリ秒"
