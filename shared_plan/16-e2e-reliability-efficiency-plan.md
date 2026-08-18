# E2E テストの信頼性・効率改善プラン

## 目的

E2E 実行時に発生する **サーバーの起動失敗・重複起動** を構造的に潰し、
あわせて実行時間と重複実行の無駄を削る。

本プランの調査はすべて**実機で再現・計測**した結果に基づく（推測ではない）。

---

## 現状の構成（計測済み）

| 項目                     | 値                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| 設定                     | `playwright.config.ts`（`webServer.command: "pnpm start"` / `url: http://localhost:3000`） |
| `reuseExistingServer`    | **`false` 固定**（古い next-server 残存による事故を受けての設定・コメントに経緯あり）      |
| `webServer.timeout`      | 180 秒                                                                                     |
| ワーカー数               | 3（4 コア環境）                                                                            |
| プロジェクト             | `chromium` / `chromium-dark` / `mobile-pixel` / `webkit-tabs-regression`                   |
| テスト総数               | **118 件（12 ファイル）**。うち実行 96 件 / **skip 22 件**                                 |
| プロジェクト別           | chromium **80** / mobile-pixel 19 / chromium-dark 10 / webkit-tabs-regression 9            |
| 実測: サーバー起動時間   | **0.92 秒**（`pnpm start` → `/` が 200 を返すまで）                                        |
| 実測: E2E 全体の所要時間 | 約 **1.5 分**                                                                              |
| reporter                 | `"html"` のみ                                                                              |
| pre-push                 | `test:all` と `build` を並列 → その後 `test:e2e`（`.husky/pre-push:49-95`）                |

**サーバー起動そのものは 1 秒未満で速い。** つまり「起動が遅い」問題ではなく、
**起動できない／二重に起動してしまう**という状態管理の問題である。

---

## 再現した失敗モード

### A. ポート占有による起動失敗（★再現済み）

`:3000` に何かが LISTEN している状態で `playwright test` を実行すると、
`reuseExistingServer: false` のため Playwright は**即座に失敗**する。

実際に `:3000` をダミーサーバーで塞いで実行した結果:

```
Error: http://localhost:3000 is already used, make sure that nothing is running
on the port/url or set reuseExistingServer:true in config.webServer.
```

**このエラーは「誰が占有しているか」も「どう解消するか」も教えてくれない。**
ユーザーが `pnpm dev`（Next.js の開発サーバーも既定で :3000）を起動したままだと、
E2E は必ずこれで落ちる。**これが「起動失敗」の正体。**

### B. `next-server` 孫プロセスのリーク（★実証済み）

`pnpm start` は `next-server` を**子プロセスとして起動する**。
親（`pnpm start`）だけを kill しても子は生き残り、ポートを掴んだままになる。

検証スクリプトの出力:

```
server ready: 0.92 s
LEAK: kill $! の後も :3000 が LISTEN 中
  残存 PID=953104 cmd=next-server (v1...
```

Playwright は**正常終了時**にはプロセスグループごと停止するため問題ない
（実際、通常の全件実行後は :3000 が解放されていることを確認済み）。
問題は **Ctrl-C / タイムアウト / クラッシュなど異常終了したとき**で、
`next-server` が残り → 次回の実行が A で落ちる、という連鎖になる。
**これが「重複起動」の正体。**

### C. `.next` の陳腐化（本セッションで 2 回踏んだ）

`pnpm test:e2e` は `.next` を**再ビルドしない**。`webServer.command` は `pnpm start` だけである。
`src/` を変更してから `pnpm test:e2e` を実行すると、**古いバンドルを黙って検証する**。

実害の記録: `shared_plan/13` の L-2 では、CSS 修正を 3 通り試して
「すべて症状が変わらない」という調査結果になったが、原因は修正が効いていないのではなく
**古い `.next` を検証し続けていた**ことだった。`.husky/pre-push:33-38` にも
同じ趣旨の警告コメントが既に書かれている（＝過去にも踏んでいる）。

### D. `pkill -f next-server` が実行中のシェル自身を殺す（★実証済み）

後始末に `pkill -f next-server` を使うと、**パターンが自分自身のコマンドラインにマッチ**して
呼び出し元のシェルごと落ちる（実測で exit code 144）。
クリーンアップ手順を用意するなら、この落とし穴を避ける必要がある。

---

## 効率面の計測

### E-1. 特化プロジェクトのテストが `chromium` と二重実行されている

`chromium` プロジェクトには `testMatch` が無く、**12 ファイルすべてを実行する**。
一方で `mobile-pixel` / `chromium-dark` / `webkit-tabs-regression` は
特定ファイルを再度実行するため、**同じファイルが 2 プロジェクトで走る**。

| ファイル                          | 実行されるプロジェクト            | 重複の実態                                                                                                                 |
| --------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `mobile-ux.e2e.spec.ts`           | chromium + mobile-pixel           | **ほぼ完全な重複。** 本文中で `setViewportSize` を 8 箇所自前指定しており、Desktop Chrome で走らせても検証内容が変わらない |
| `accessibility.e2e.spec.ts`       | chromium + chromium-dark          | 「フォーカス管理」3 件はテーマ非依存で**重複**。ダークが要るのは `T-A11Y-1`（コントラスト）1 件のみ                        |
| `tooltip-dismiss.e2e.spec.ts`     | chromium + mobile-pixel           | **重複ではない。** `test.skip(project.name !== ...)` で各プロジェクトが担当分だけ実行する設計（`:16` / `:266`）            |
| `section-tabs-scroll.e2e.spec.ts` | chromium + webkit-tabs-regression | WebKit 固有バグの回帰検知が目的。chromium 側も残す価値はあるが要判断                                                       |

> 設定ファイルのコメントは「testMatch で絞って重複を排除した」と説明しているが、
> **`chromium` 側を絞っていないため重複は解消しきれていない。**

### E-2. `skip` 22 件がブラウザ起動コストだけ払っている

`accessibility.e2e.spec.ts` は 3 つの `describe.skip`（ダークモード / キーボード操作 /
アニメーション）を抱えており、`chromium-dark` の 10 件中 6 件が skip。
`test.skip()` はテスト開始後に判定されるため、**コンテキスト生成のコストは発生する**。

### E-3. `networkidle` と固定 sleep

| 項目                              | 件数        | 影響                                                              |
| --------------------------------- | ----------- | ----------------------------------------------------------------- |
| `waitForLoadState("networkidle")` | **48 箇所** | 1 回あたり最低 500ms（無通信 500ms の待機が定義）。合計 24 秒以上 |
| `waitForTimeout(...)`             | **15 箇所** | 合計 **6,900 ms** の固定 sleep                                    |

ワーカー 3 並列なので壁時計への影響は概ね 1/3 だが、**合わせて 10 秒前後**（全体 90 秒の約 1 割）。
`networkidle` は Playwright 公式ドキュメントでも非推奨とされている待機方法である。

### E-4. reporter が `"html"` のみで、失敗内容が端末に出ない

`reporter: "html"` 単独のため、失敗しても端末には要約しか出ず、
**毎回 `--reporter=list` を手で付け直す必要がある**（本セッションでも繰り返し発生した）。
また html reporter は既定で `open: 'on-failure'` であり、
非対話環境ではレポートサーバー起動が余計な待ちを生む可能性がある。

---

## 改善プラン

### P1【最優先】E2E 専用ポートへ分離する

**`:3000` を使うのをやめ、E2E は `:3100` を使う。**

```ts
// playwright.config.ts
const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

use: { baseURL: BASE_URL, /* … */ },
webServer: {
  command: `pnpm start --port ${E2E_PORT}`,
  url: BASE_URL,
  reuseExistingServer: false,
  timeout: 60 * 1000,
},
```

**効果**:

- `pnpm dev`（:3000）と**恒久的に衝突しなくなる** → 失敗モード A の主因が消える。
- `:3100` に居るプロセスは**定義上 E2E の残骸しかありえない**ため、
  P2 の自動クリーンアップを**安全に**実行できる（ユーザーの dev サーバーを誤って殺さない）。

> `localhost` ではなく `127.0.0.1` を推奨。環境によって `localhost` が IPv6(`::1`) に
> 解決され、IPv4 で LISTEN しているサーバーに繋がらない事故を避けられる。

### P2【最優先】`globalSetup` でポートの事前確認と自動クリーンアップ

`tests/e2e/global-setup.ts` を新設し、`playwright.config.ts` に `globalSetup` として登録する。

処理内容:

1. `E2E_PORT` が LISTEN していなければ何もしない（正常系のコストはほぼ 0）。
2. LISTEN していれば、そのプロセスの PID とコマンド名を取得する。
3. **`next-server` / `next start` 由来なら残骸と判断して `SIGTERM` → 待機 → `SIGKILL`**。
4. それ以外のプロセスなら**自動で殺さず**、以下のような実行可能なメッセージで落とす。

```
E2E ポート 3100 が別プロセスに使われています。
  PID  : 12345
  CMD  : /usr/bin/some-other-app
解消するには次を実行してください:
  kill 12345
（E2E のポートは E2E_PORT 環境変数で変更できます）
```

**Playwright 標準のエラーとの差**: 「誰が占有しているか」「どう直すか」が出る。
失敗モード A・B の両方がここで吸収される。

> **実装上の注意（失敗モード D）**: 後始末に `pkill -f next-server` を使ってはならない。
> パターンが**自分自身のコマンドラインにマッチして呼び出し元シェルごと落ちる**（実測で exit 144）。
> ポート → PID の解決には `lsof -ti:3100` もしくは Node の `net` でのプローブを使い、
> **PID を特定して kill する**こと。

### P3【高】`.next` 陳腐化ガード（失敗モード C）

同じ `globalSetup` 内で、`.next/BUILD_ID` の mtime と
`src/` `server/` `public/` および `next.config.*` / `package.json` の最新 mtime を比較する。
**ソースの方が新しければ即座に失敗**させる。

```
.next のビルドがソースより古いです（最終ビルド: 10:24:11 / 最新の変更: src/app/components/CpiChart.module.css 10:31:02）。
古いバンドルを検証してしまうため中断しました。次を実行してください:
  pnpm build && pnpm test:e2e
```

- 正常時のコストは数十回の `stat` のみで無視できる。
- `pnpm build` を `test:e2e` に常時組み込む案もあるが、pre-push は既に build を
  並列実行しており（`.husky/pre-push:52-57`）**二重ビルドになるため採らない**。
  「ガードして落とす」方が速くて確実。

### P4【高】reporter を `list` + `html(open:never)` に

```ts
reporter: [["list"], ["html", { open: "never" }]],
```

- 失敗の詳細が**端末にそのまま出る**ようになり、`--reporter=list` の付け直しが不要になる。
- 非対話環境でレポートサーバーが立ち上がる余地を消す。

### P5【中】`chromium` から重複ファイルを除外する（E-1）

`chromium` プロジェクトに `testIgnore` を追加し、他プロジェクトが担当するファイルのうち
**内容が重複しているもの**だけを外す。

```ts
{
  name: "chromium",
  // mobile-ux は本文で setViewportSize を自前指定しており、
  // Desktop Chrome で走らせても mobile-pixel と検証内容が変わらないため除外する。
  testIgnore: /mobile-ux\.e2e\.spec\.ts/,
  use: { ...devices["Desktop Chrome"] },
},
```

**除外してよいもの / いけないもの**:

- ✅ `mobile-ux.e2e.spec.ts` — 重複。除外する（**約 9 件削減**）
- ❌ `tooltip-dismiss.e2e.spec.ts` — `test.skip` で担当分けされており、**除外すると desktop hover 検証が消える**
- ❌ `section-tabs-scroll.e2e.spec.ts` — WebKit 固有の回帰検知が目的だが、chromium 側の基本動作確認も価値がある

あわせて `chromium-dark` はテーマ依存のテストだけに絞る。
タイトルにタグを付けて `grep` で選ぶのが最も壊れにくい。

```ts
{
  name: "chromium-dark",
  testMatch: /accessibility\.e2e\.spec\.ts/,
  grep: /@dark/,          // タイトルに @dark を含むテストだけ
  use: { ...devices["Desktop Chrome"], colorScheme: "dark" },
},
```

→ `T-A11Y-1` のタイトルに `@dark` を付ける。フォーカス管理 3 件の重複が消える（**約 3 件削減**）。

### P6【中】クリーンアップ用スクリプトの追加

```json
"test:e2e:clean": "node scripts/kill-e2e-port.mjs",
"test:e2e:fresh": "pnpm build && pnpm test:e2e"
```

- `test:e2e:clean` — `E2E_PORT` の残骸を安全に落とす（P2 と同じ実装を共有する）。
- `test:e2e:fresh` — ビルドから通しで実行したいときの明示的な入口。
  **P3 のガードに引っかかったときの案内文でこのコマンドを提示する。**

### P7【低】`networkidle` と固定 sleep の削減（E-3）

**一括置換は危険なので段階的に行う。** このリポジトリのページは `LazyMount` で
チャートを遅延マウントするため、単純に `networkidle` を消すと不安定化する。

段階:

1. まず `page.goto("/")` 直後の `waitForLoadState("networkidle")` のうち、
   **直後に `expect(...).toBeVisible()` が続くもの**を削る（web assertion が待つので不要）。
2. `waitForTimeout` は、意味のある待機条件（`toHaveAttribute` / `toHaveCount` など）に置換する。
3. 1 ファイルずつ変更し、**同一ファイルを 5 回連続で実行して安定を確認**してから次へ進む。

> 見込み削減は壁時計で 10 秒前後（全体の約 1 割）。**P1〜P4 を終えてから着手する。**
> 信頼性の改善が先で、この項目は最後でよい。

---

## 検証方法（この仕組み自体をどうテストするか）

E2E の足回りを変えるため、**足回り自体の回帰テスト**を用意する。

### 新規 `tests/unit/e2e-harness.test.ts`（vitest）

| ID  | 内容                                                                                        |
| --- | ------------------------------------------------------------------------------------------- |
| H1  | `playwright.config.ts` の `baseURL` と `webServer.url` が**同じポート**を指している         |
| H2  | `webServer.command` に `--port` が含まれ、その値が `baseURL` のポートと一致する             |
| H3  | reporter に `list` が含まれる（失敗が端末に出ることの保証）                                 |
| H4  | 陳腐化ガードのロジック（mtime 比較関数）を切り出して単体テスト: 古い/新しい/欠損の 3 ケース |

> H1・H2 は「ポートを変えたのに片方だけ直して壊す」という典型的な事故を防ぐ。

### 手動での再現確認（実装後に必ず実施）

1. **失敗モード A**: `:3100` を別プロセスで塞いで `pnpm test:e2e` → **PID 付きの案内が出て落ちる**
2. **失敗モード B**: E2E 実行中に Ctrl-C → `pnpm test:e2e` を再実行 → **残骸が自動掃除されて成功する**
3. **失敗モード C**: `src/` の CSS を 1 行変えて `pnpm build` せずに `pnpm test:e2e`
   → **陳腐化ガードで落ち、`pnpm build && pnpm test:e2e` の案内が出る**
4. `pnpm dev`（:3000）を起動したまま `pnpm test:e2e` → **衝突せずに成功する**（P1 の主目的）

### 効果測定

変更前後で以下を記録し、プラン文書に追記する。

- `pnpm test:e2e` の壁時計時間（3 回の中央値）
- 実行テスト件数・skip 件数
- プロジェクト別の件数

### 検証ゲート

`pnpm type-check` → `pnpm lint`（**警告 5 件から増えないこと**）→ `pnpm test`
→ `pnpm build` → `pnpm test:e2e`

---

## リスクと留意点

| リスク                                                     | 対応                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ポート変更の反映漏れ**                                   | `baseURL` / `webServer.url` / `webServer.command` の 3 箇所が連動する。H1・H2 の単体テストで固定する。 **確認済み**: `grep -rn "localhost:3000" tests/` のヒットは `real-consumption.e2e.spec.ts:16` のコメント 1 件のみで、テスト本文は `page.goto("/")` のみ（絶対 URL のベタ書きなし） |
| **`globalSetup` が誤ってユーザーのプロセスを殺す**         | 専用ポート（P1）と組み合わせるのが前提。かつ**コマンド名が `next` 系のときだけ自動 kill**し、それ以外は殺さず案内して落とす                                                                                                                                                               |
| **`pkill -f` の自己マッチ**（失敗モード D・実測済み）      | クリーンアップは**必ず PID 指定**で行う。`pkill -f next-server` は使わない                                                                                                                                                                                                                |
| **陳腐化ガードの誤検知**                                   | `.next` は `pnpm build` 後に mtime が更新される。`tests/` の変更は対象に含めない（再ビルド不要のため）。誤検知時の逃げ道として `E2E_SKIP_STALE_CHECK=1` を用意する                                                                                                                        |
| **`chromium` から `mobile-ux` を外すと検知力が落ちないか** | `mobile-ux` は本文で `setViewportSize(375, 667)` を 8 箇所指定しており、実行環境の既定ビューポートに依存しない。**除外前に mobile-pixel 単独で全件 pass することを確認する**                                                                                                              |
| **`grep: /@dark/` がタグ付け漏れで空振りする**             | Playwright は該当 0 件でも失敗しない。**タグ付け後に `--project=chromium-dark --list` で 1 件以上あることを確認する**                                                                                                                                                                     |
| **`networkidle` 削減による flaky 化**                      | P7 は最後に単独で実施。1 ファイルずつ、5 回連続実行で安定を確認してから進める。少しでも不安定なら戻す                                                                                                                                                                                     |
| **`webServer.timeout` を 180→60 秒に短縮する影響**         | 実測の起動時間は 0.92 秒で 60 倍以上の余裕がある。ただし**低速環境やコールドキャッシュでの初回**を考慮し、まずは 90 秒程度に留める案も可                                                                                                                                                  |

---

## 未確定事項（実装前に判断が必要）

1. **E2E 専用ポートの番号** — 本プランは `3100` を採用。`pnpm dev` の 3000 と、
   Playwright html reporter の既定 9323 を避けられればよい。
2. **`globalSetup` での自動 kill をどこまで許すか** — 本プランは
   「専用ポート かつ `next` 系プロセスなら自動 kill、それ以外は案内して失敗」を推奨。
   一切自動 kill せず常に案内だけにする、より保守的な選択肢もある。
3. **`section-tabs-scroll.e2e.spec.ts` を chromium から外すか** — 本プランは**外さない**。
   WebKit 側は smooth scroll 競合の回帰検知が目的で、chromium 側の基本動作確認とは
   目的が異なるため。ただし 9 件の削減余地ではある。
4. **P7（`networkidle` 削減）を本プランに含めるか** — 信頼性（P1〜P4）とは
   性質が異なる作業なので、**別プランに切り出す**方が進めやすい可能性がある。
