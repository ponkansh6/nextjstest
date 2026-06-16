#!/bin/bash

# 全テストファイルを取得
test_files=$(find tests -name "*.test.ts*")

echo "Running tests and measuring time..."
echo "File,Duration(ms)" > test_times.csv

for f in $test_files; do
  # 実行時間を取得 (vitestは標準出力に時間を出すため、そこから抽出)
  # 実行に時間がかかる可能性があるため、個別に計測
  # 失敗しても計測を続ける
  duration=$(npx vitest run "$f" --reporter=verbose 2>&1 | grep "Duration" | awk '{print $2}' | sed 's/ms//')
  
  if [ -z "$duration" ]; then
    duration=0
  fi
  
  echo "$f,$duration" >> test_times.csv
  echo "Measured $f: ${duration}ms"
done

# 時間順にソートして表示
sort -t, -k2 -n test_times.csv
