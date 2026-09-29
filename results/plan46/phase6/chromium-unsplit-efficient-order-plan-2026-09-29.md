# Chromium順序最適化計画

## 現状

実行中のrunnerはChromium全22ファイルを集約した単一configで、`fileParallelism: false`、`maxWorkers: 1`。`all` はこのconfigを一度実行した後にWebKitを実行する。Chromium A/B分割は外部実験のみで、Chromium＋WebKitの所要時間は分割時494.677秒、Chromium単独実行時413.093秒。分割実験ではChromiumのassertion失敗が6件あった。

比較可能な成功計測は、2026-09-28の[`chromium.log`](../phase5/chromium-webkit-parallel-run-2026-09-28/chromium.log)にある同じ22ファイルの1回分のみ。以下は各ファイルのassertion実行時間の合計順であり、config/setup時間を含まない。後続の変更前の履歴サンプルなので、安定した性能順位を保証しない。

## 変更案

active aggregate sequencerのファイル順だけを、短い実測時間から長い順に並べる。Chromiumは単一プロセス・単一workerのままにし、WebKitの実行順も維持する。

1. `next-route-poc`
2. `batch5-standard`
3. `phase6-b09`
4. `phase6-b01`
5. `phase6-b07`
6. `batch5-lazy`
7. `phase6-b12`
8. `phase6-b08`
9. `phase6-b13`
10. `phase6-b02`
11. `phase6-b10`
12. `phase6-b14`
13. `batch4-a`
14. `phase6-b11`
15. `phase6-b05`
16. `phase6-b04`
17. `phase6-b06`
18. `batch4-b`
19. `phase6-b03`
20. `batch3-b`
21. `batch3-a`
22. `batch1`

この順序は直列・1 worker実行で、短時間でファイル単位の結果を得られるようにし、平均的なファイル結果待ち時間を小さくするヒューリスティックである。並列化せず、キャッシュや状態効果もない場合、全ファイルの完了時間の合計は順序だけでは短縮しない。

## 受け入れ条件

- active aggregate sequencerの22ファイルが上記順で各1回ずつ構成される。
- Chromiumの単一config、単一プロセス、`fileParallelism: false`、`maxWorkers: 1`を維持する。
- WebKitを含む他configの順序と、テスト内容・設定を変更しない。
- 既存の作業ツリー差分やindex状態を保つ。

## 検証

変更後にrunnerのconfig listingまたは同等の軽量な構成確認で、順序・重複なし・22件を確認する。順序のみの変更では全ブラウザsuiteを必須にしない。必要な場合に限り通常の総合実行で動作と新しい所要時間を確認する。比較時は各ファイルの結果到達時刻と全体時間を分けて記録し、単一の古い計測から得た順位が現在も妥当かを確認する。
