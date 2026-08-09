# UI/UX 改善プラン（モバイルファースト） — 経済指標ダッシュボード

作成日: 2026-08-09
対象: `src/app/` 配下（`page.tsx` / `CpiChart.tsx` / 各チャートコンポーネント / CSS Modules）
方針: **想定主要デバイスをスマートフォン（375〜430px 幅）とし、そこを起点に設計を組み直す。** 大画面は「拡大版」ではなく「余白を活かす版」として後段に置く。

---

## 0. 現状サマリ

Next.js 16 App Router + Recharts の単一ページダッシュボード。サーバーで CSV を読み込み、クライアントの `CpiChart` が 7 種のグラフ（CPI 主要指数 / 費目別寄与度 / CAGR パネル / 消費支出 名目・実質 / 給与内訳 / 残差 / 移動平均）を縦一列に描画する。

現状の CSS は「モバイルをベース、`min-width: 641px` で一括拡大」という構造になっている。ベース値がモバイル向けである点は正しいが、**モバイル固有の要件（タップターゲット・hover 非依存・ビューポート高・スクロール総量・タッチでのツールチップ）がほぼ未対応**である。以下、モバイル体験への影響度順に整理する。

### モバイルでの基準値（本プランで用いる想定）

| 項目 | 想定 |
|---|---|
| 基準幅 | 375px（iPhone SE/13 mini 相当）／ 390〜430px（主流） |
| 基準高（縦持ち・可視領域） | 約 630〜730px（ブラウザ UI 込みで実質はさらに小さい） |
| 横持ち可視高 | 約 320〜390px |
| 最小タップターゲット | 44×44px（WCAG 2.5.8 AAA / Apple HIG、Android は 48dp） |
| ポインタ | `hover: none` / `pointer: coarse` |

---

## 1. 実施状況（2026-08-10 時点）

> 実装は Phase1〜8 完了。変更は未コミット（作業ツリー上）。各項目は検証（lint / type-check / test / Playwright）を経て完了とする。
>
> **検証結果**: type-check ✅ / lint ✅（残る 5 件は既存の warning）/ vitest 174 件 ✅ /
> Playwright chromium・mobile-pixel 36 件 ✅。mobile-iphone（WebKit）のみ**環境ブロック**
> — ホストに `libevent-2.1-7t64` / `libavif16` / `libmanette-0.2-0` が無く、導入に sudo が必要。

### 実施済み（✅）

| Phase | 項目 | 実装内容 | 状態 |
|---|---|---|---|
| 1 | P0-1 ブレークポイント統一 | `src/lib/breakpoints.ts`（`MOBILE_BREAKPOINT_PX = 768`）導入、CSS 変数と連携 | ✅ |
| 1 | P0-2 / P0-3 CSS 変数 | `--blue-600` 定義、ダークモード `--blue-50/500/600` 上書き（`globals.css`） | ✅ |
| 1 | P0-4 `100dvh` 置換 | `page.module.css` / `ChartInfoButton.module.css` | ✅ |
| 1 | P0-5 codemap 訂正 | `codemap.md` を実装に一致 | ✅ |
| 2 | P1-1 タップターゲット | `.trigger`/`.closeButton`/`.actionButton`/`.legendItem` に 44px 確保 | ✅ |
| 2 | P1-2 hover ガード | `@media (hover: hover)` 化、`:active` へ移行 | ✅ |
| 2 | P3-3 文言統一 | 「Calculate」→「計算する」等日本語化 | ✅ |
| 3 | P2-1 案1 ヘッダー圧縮 | モバイル padding / `.title` clamp 化 | ✅ |
| 3 | P2-3 チャート高さ | `min(500px, 60svh)` 等ビューポート連動 | ✅ |
| 3 | P5-2 スケルトン一致 | `.chartSkeleton` 寸法を実チャートに一致 | ✅ |
| 4 | P1-3 凡例折りたたみ | 12 系列凡例の折りたたみ＋要約表示 | ✅ |
| 4 | P1-5 期間プリセット | `.presetChip`（過去10年 / 過去20年 / 2020年〜 / 全期間） | ✅ |
| 4 | P3-2 CAGR stale 防止 | 入力変化時の結果リセット | ✅ |
| 4 | P1-4 ツールチップ最適化 | `CustomTooltip.tsx` モバイル対応 | ✅ |
| 4 | P3-4 solo ボタン | `StackedAreaChart` に「この費目だけ」ボタン（`.soloButton`） | ✅ |
| 5 | P2-1 案2 セクションタブ | `SectionTabs.tsx` スティッキータブバー（`aria-current` 連動） | ✅ |
| 5 | P2-2 範囲表示 | タブバー内に範囲ラベル＋ピッカー起動 | ✅ |
| 5 | P3-1 URL 同期 | `useUrlState.ts`（`?from&to&hidden`、`router.replace`） | ✅ |
| 6 | P5-1 遅延マウント | `LazyMount.tsx`（IntersectionObserver / rootMargin 200px、`__MOUNT_ALL__` フック付き） | ✅ |
| 6 | P4-1 フォーカスリング | `:focus-visible` を全ボタン/セレクトに追加 | ✅ |
| 6 | P4-2 reduced-motion | `@media (prefers-reduced-motion: reduce)` | ✅ |
| 6 | P4-4 テーマトグル | `ThemeToggle.tsx` + `layout.tsx` `themeColor` | ✅ |
| 6 | Playwright プロジェクト | chromium / mobile-iphone（iPhone 13）/ mobile-pixel（Pixel 7） | ✅ |
| 6 | E2E テスト | `range-change.e2e.spec.ts` / `real-consumption.e2e.spec.ts` | ✅ 追加済み |

### 追加で実施済み（2026-08-10）

| Phase | 項目 | 実装内容 | 状態 |
|---|---|---|---|
| 7 | P4-3 グラフ SR 対応 | 全 6 チャートに `role="img"` + `aria-label`、`<details>` データテーブル | ✅ |
| 7 | P4-5 パレット境界線 | `StackedAreaChart` の各 `Area` に `stroke`（gridStroke / opacity 0.4） | ✅ |
| 8 | P6-1 流体タイポグラフィ | `min-width: 769px` の段階指定を全廃し `clamp()` へ。同ブロックは `.chartWrapper` のレイアウト切替のみ残置。`.popup` の `width: 1280px` → `min(1280px, calc(100vw - 4rem))` | ✅ |
| 8 | P6-2 コンテナ幅統一 | `.container` の段階的 max-width を廃止、`.pageWrapper` の 80rem に一本化 | ✅ |
| 8 | P6-3 エラー文言 | エンドユーザー向け文言 + `NODE_ENV === "development"` 時のみ開発者向け詳細 | ✅ |
| 8 | P6-5 OGP・metadataBase | `openGraph` / `twitter` / `metadataBase` / `viewport.themeColor` | ✅ |
| 8 | P6-6 エクスポート | `src/lib/csvExport.ts`（純関数）+ `ChartExportButton.tsx`。各グラフの `<details>` 内に CSV ボタン | ✅ |
| 8 | P5-3 横溢れ | `overflow-x: hidden` を撤廃し、375px で溢れないことを E2E でアサート | ✅ |

**この回で見つけて直した実バグ**:

| 箇所 | 内容 |
|---|---|
| `.soloButton` | 42×27px でタップターゲット違反（P3-4 で追加した「単独」ボタン）→ `min-width/min-height: 44px` |
| `.calculateButton` | モバイルで 40px 高（padding だけでは 44px に届かない）→ `min-height: 44px` |
| `playwright.config.ts` | `webServer` に `url` が無く起動完了を待てず、`ERR_CONNECTION_REFUSED` で不安定 → `url` 追加 |
| `real-consumption.e2e.spec.ts` | `LazyMount` 配下のセクションは SSR HTML に無いため、`goto` 直後の同期チェックが常に失敗 → `#section-consumption-real` を `expect().toBeVisible()` で待機 |
| `LazyMount.tsx` | effect 内 setState（lint エラー / カスケードレンダリング）→ `useSyncExternalStore` で SSR 安全に判定 |

### 実施予定（⏳）

| 項目 | 内容 | 備考 |
|---|---|---|
| WebKit 実行環境 | mobile-iphone プロジェクトはホストのシステムライブラリ不足で起動不可。`sudo apt-get install libevent-2.1-7t64 libavif16 libmanette-0.2-0`（`lxqt-sudo` 経由）が必要 | **要ユーザー判断**（sudo） |
| Lighthouse モバイル計測 | 改善前後の Performance / Accessibility をモバイルプリセットで比較 | 未着手 |
| ダークモード E2E | `colorScheme: "dark"` プロジェクトで凡例タップ後の残留 hover とコントラストを検証（P0-3 / P1-2 の回帰防止） | 未着手 |
| キーボードのみ通し操作 | P4-1 の通し検証 | 未着手 |

### 非採用（維持）

- Recharts 移行・PWA 化・パレット全面差し替え・状態管理ライブラリ導入・モバイル専用ページ分割（末尾「補足」と同一判断）

---

## P0 — モバイルで実害のあるバグ（即修正）

### P0-1. `isMobile` の判定境界と CSS ブレークポイントが食い違う（モバイル最大の欠陥）

- **箇所**: `src/hooks/useChartTheme.ts:11,16` は `max-width: 768px`。CSS 側は `max-width: 640px` / `min-width: 641px`（`CpiChart.module.css` / `page.module.css:` 末尾ブロック / `globals.css:140`）。
- **モバイルでの影響**: **641px〜768px の帯**（タブレット縦持ち、および大型スマホの横持ち — iPhone 14 Pro Max 横は 932×430 だが、Android 大型端末や分割ビューでこの帯に容易に入る）で、JS は「モバイル」としてツールチップを 12px で描く一方、CSS は「PC」として軸ラベル 24px・`chartTitle` 3.375rem・`select` 2rem を適用する。ツールチップだけが極小、周囲は巨大という完全にちぐはぐな画面になる。
- **修正**: ブレークポイントを単一の定数に集約（`src/lib/breakpoints.ts` + CSS カスタムプロパティ、もしくは CSS 側の値を JS から参照）。**モバイル境界は 768px に統一**（タブレット縦持ちまでを「タッチ主体」として扱うため）。

### P0-2. `--blue-600` が未定義でホバー/押下フィードバックが効かない

- **箇所**: `src/app/components/CpiChart.module.css:288`
- **内容**: `.calculateButton:hover:not(:disabled) { background-color: var(--blue-600); }` だが `--blue-600` は `globals.css` に定義がない（使用 1 件・定義 0 件）。
- **モバイルでの影響**: タッチ端末では hover が「タップ後に貼り付く」形で発火するため、押した瞬間のフィードバックがこの宣言に依存している。無効化されているため、**タップしても色が変わらない＝押せたのか分からない**。
- **修正**: `globals.css` の `:root` に `--blue-600: #2563eb;`、ダークモードにも対応値を追加。あわせて `:active` に明示的な押下色を与える（タッチではこちらが本命）。

### P0-3. ダークモードで `--blue-50` / `--blue-500` が上書きされていない

- **箇所**: `src/app/globals.css:16-17`（`:root` のみ。`@media (prefers-color-scheme: dark)` ブロックに上書きなし）
- **モバイルでの影響**: スマホはダークモード利用率が高い。ダーク時 `.legendItem:hover` / `.actionButton:hover` が `background-color: var(--blue-50)`（`#eff6ff` ＝ ほぼ白）になり、その上に `color: var(--card-text)`（`#e5e5e5`）が乗る。**コントラスト比 約 1.1:1 で文字が消える。** しかもタッチでは hover が貼り付くため、**凡例をタップするたびに白い矩形が残り続ける**（P1-2 と複合して最悪の見え方になる）。
- **修正**: ダークモードブロックに `--blue-50: rgba(59,130,246,0.15);` `--blue-500: #60a5fa;` `--blue-600: #3b82f6;` を追加。ホバー/アクティブ時の前景色も明示する。

### P0-4. `min-height: 100vh` が iOS Safari でビューポートを超える

- **箇所**: `src/app/page.module.css:7`、および `ChartInfoButton.module.css:204` の `max-height: calc(100vh - 4rem)`
- **モバイルでの影響**: iOS Safari / Android Chrome の `100vh` はアドレスバー非表示時の高さを指すため、実表示領域より 60〜120px 大きい。結果、常に不要な縦スクロールが発生し、情報ポップアップは下端が画面外に出て閉じるボタンに届かないことがある。
- **修正**: `100dvh`（動的ビューポート）に置換。`ChartInfoButton` のポップアップは `max-height: calc(100dvh - 4rem)` かつ `overflow-y: auto` を維持。

### P0-5. `codemap.md` の記述と実装の不一致

- **内容**: `codemap.md` は「LocalStorage for chart preferences and user settings」「Redux Toolkit」と記載しているが、`src/` に `localStorage` の使用は 0 件、Redux も未導入。
- **修正**: 実装に合わせて訂正（P3-1 の永続化を実装するならその時点で記述を有効化）。

---

## P1 — タッチ操作性（モバイル最優先）

### P1-1. タップターゲットが軒並み 44px 未満

現状の実測値（モバイル ≤640px 時）:

| 要素 | 箇所 | 実効サイズ | 44px 比 |
|---|---|---|---|
| 情報ボタン `.trigger` | `ChartInfoButton.module.css:14` | **20×20px** | 45% |
| ポップアップ閉じるボタン `.closeButton` | `ChartInfoButton.module.css:83` | **22×22px** | 50% |
| 全表示/全非表示 `.actionButton` | `CpiChart.module.css:83,88` | 約 **24px 高**（モバイル上書きなし） | 55% |
| 凡例チップ `.legendItem` | `CpiChart.module.css:178` | **36px 高**（`min-height: 2.25rem`） | 82% |

- **問題**: 情報ボタン 20px はスマホでは「押せない」に等しく、隣接する `chartTitle` テキストと重なって誤タップも起きる。`.actionButton` に至ってはモバイル用の上書きが一切なく、PC のベース値がそのまま出ている。
- **修正**:
  - `.trigger` / `.closeButton` に `min-width: 44px; min-height: 44px;` を与える。アイコン自体は 20px のまま、透明な余白（`padding` もしくは疑似要素による当たり判定拡張）で 44px を確保し、見た目を変えずに押しやすくする。
  - `.actionButton` にモバイル用ブロックを追加（`min-height: 44px; padding: 0.625rem 1rem; font-size: 0.875rem;`）。
  - `.legendItem` の `min-height` を `2.75rem`(44px) に引き上げ。12 個並ぶため、下の P1-3 と同時に検討する。
  - チップ間 `gap` を 0.75rem 以上に保ち、隣接誤タップを防ぐ。

### P1-2. `:hover` がタッチ端末で「貼り付く」

- **箇所**: `CpiChart.module.css:92`（`.actionButton:hover`）、`:123`（`.legendItem:hover`）、`:287`（`.calculateButton:hover`）、`ChartInfoButton.module.css` の `.trigger:hover` / `.closeButton:hover`
- **問題**: いずれも `@media (hover: hover)` でガードされていない。タッチ端末では要素をタップすると hover 状態が残り、別の場所をタップするまで解除されない。`.legendItem:hover` は `transform: translateY(-1px)` も持つため、**タップした凡例だけが浮いたまま固定される**。P0-3 と重なるとダークモードで白い矩形が残る。
- **修正**: hover 系のスタイルを全て `@media (hover: hover) and (pointer: fine) { ... }` で囲む。タッチ端末向けのフィードバックは `:active` に移す（背景色の一瞬の変化など、transform は使わない）。

### P1-3. 12 個の凡例チップが画面の大半を占める

- **箇所**: `StackedAreaChart` の凡例（`stackedKeys` 12 系列）、`CpiChart.module.css:170-183` のモバイルブロック
- **問題**: 375px 幅でチップ（1 個あたり約 120〜160px 幅 × 44px 高 + gap）を 12 個並べると **5〜6 行 = 約 280px**。グラフ本体（500px）の半分以上のスペースを凡例が食い、**スクロールしないとグラフと凡例を同時に見られない**。凡例を操作しながら結果を確認する、という基本操作が成立していない。
- **改善案（推奨順）**:
  1. **折りたたみ＋要約表示**: デフォルトは「表示中: 12/12 費目」の 1 行サマリ＋「費目を選ぶ」ボタン。タップでボトムシート（またはインライン展開）に全 12 項目をリスト表示。グラフの上を凡例が占有しなくなる。
  2. **横スクロールの 1 行チップ**: `flex-wrap: nowrap; overflow-x: auto; scroll-snap-type: x proximity;` で 1 行に収める。実装は軽いが、隠れた項目に気づきにくい欠点がある。
  3. **凡例をグラフ直下に移動**: グラフを先に見せ、操作は下に置く。スクロール量は変わらないが「まずグラフ」の原則は守れる。
- **注**: `MajorIndicesChart`（`targetKeys`、少数系列）は現状のまま折り返しで問題ない。**12 系列の積み上げグラフだけを特別扱いする**のが費用対効果が高い。

### P1-4. ツールチップがタッチで使いものにならない

- **箇所**: `CustomTooltip.tsx`、各チャートの `<Tooltip>`
- **問題**:
  - Recharts のツールチップは「指を置いている位置」に追従するため、**指自身がツールチップを隠す**。
  - 12 系列表示時、行が 12 + ラベル 1 = 13 行。`fontSize: 12px` でも高さ約 220px、幅は系列名（「家具・家事用品」等）＋数値で 200px 超。375px 幅の画面では**チャート領域をほぼ全面的に覆う**。
  - 指を離すと消えるため、値を読み取ってメモする時間がない。
  - 系列名に**色ドットがなく**、全行が同じ `tooltipText` 色。どの行がグラフのどの帯かを目で対応づけられない。
- **改善案**:
  - **タッチ時は固定位置に出す**: `isMobile` の場合、ツールチップをカーソル追従ではなくチャート上端（または下端）の固定バーとして描画する（Recharts の `position` プロパティ、もしくは `<Tooltip>` を使わず自前の read-out バーを置く）。指に隠れず、値も読み続けられる。
  - **表示系列を絞る**: 値の降順ソート＋上位 5 件＋「他 N 件」。全件は展開で。
  - `entry.color` を使った色チップを各行の先頭に追加（PC でも有効）。
  - 単位表記（2020年=100 の指数）を追加。`toFixed(2)` 固定を見直す。

### P1-5. `select` 2 つでの年範囲指定はタッチでコストが高い

- **箇所**: `ChartFilters.tsx`、`CagrPanel.tsx`
- **問題**: 年の選択肢は 30 件超。モバイルではネイティブピッカーがモーダルで開き、目的の年までホイールを回す操作が必要。しかも「開始年」「終了年」で 2 回。さらに CAGR パネルにも同じ操作が 3 つある（開始年・終了年・評価月）。**画面上で最も頻度の高い操作が、最も重い操作になっている。**
- **改善案**:
  - **プリセットボタンを主役に**: 「過去10年」「過去20年」「2020年〜」「全期間」を横スクロールのチップ列で常時表示。日常操作の 8 割はこれで完結する。`select` は「詳細指定」として折りたたむ。
  - プリセットチップは 44px 高・`scroll-snap` 付きの横 1 行に収める（縦スペースを消費しない）。
  - 現状の `disabled` による start > end の防止（`ChartFilters.tsx:28,43`）は妥当。プリセット追加後も維持する。

---

## P2 — モバイルの情報設計

### P2-1. 7 グラフ縦一列 ＝ モバイルでは 5,000px 超のスクロール

- **現状**: `CpiChart.tsx` が 7 セクション（＋CAGR パネル）を無条件に縦積み。1 セクションあたり 凡例 約 100〜280px ＋ グラフ 500px ＋ タイトル/注記/情報欄 約 120px ＝ **700〜900px**。7 本で **概算 5,000〜6,000px**。375×667 の画面では **8〜9 画面分**を、目次も現在位置表示もなしに縦スクロールし続けることになる。
- **さらにファーストビューの浪費**: `page.module.css:2` `padding-top: 4rem`(64px) ＋ `:14` `margin-bottom: 4rem`(64px) ＋ `.title` 3rem(48px、日本語タイトルは 375px 幅で 2 行 ≒ 105px) ＋ バッジ ＋ 説明文。**ヘッダーだけで約 300px、667px 画面の 45%** を消費し、最初のグラフは 1 画面目にほぼ映らない。
- **改善案（モバイル優先順）**:
  1. **ヘッダーの圧縮（即効・低コスト）**: モバイルでは `padding-top: 1.5rem`、`header { margin-bottom: 1.5rem }`、`.title` を `clamp(1.5rem, 6vw, 4.5rem)`、`.description` はモバイルで非表示または 2 行クランプ。これだけでファーストビューにグラフが入る。
  2. **スティッキーなセクションタブ（推奨）**: 画面上端に横スクロール型のタブバー（「CPI」「費目別」「CAGR」「消費(名目)」「消費(実質)」「給与」「残差」「移動平均」）を固定。各 `chartSection` に `id` と `scroll-margin-top` を付与。`IntersectionObserver` で現在表示中のセクションをタブでハイライトし、現在位置を常に示す。**モバイルではこれが「あると良い」ではなく「ないと迷子になる」レベル。**
     - ⚠️ **実装前の確認事項**: `globals.css:71` の `html, body { overflow-x: hidden }` は、`position: sticky` を持つ子孫のクリッピング/固定不具合の原因になり得る（ブラウザ実装依存）。sticky 化の前にこの宣言を外し、横溢れの真因（多くはグラフの `margin` かチップ列）を個別に対処する。
  3. **セクションのアコーディオン化**: 初期状態では各グラフを閉じ、タイトル一覧だけを見せる。タップで開く。スクロール総量が劇的に減り、次項の遅延マウントとも噛み合う。ただし「一覧して比較する」という本来の価値を損なうため、タブバー（案 2）で足りるなら不要。
  4. **遅延マウント**: `SpendingBarChart` 等は `dynamic()` 済みだが即マウントされる。`IntersectionObserver` でビューポート接近時に初めてマウントする。モバイル端末では 7 つの Recharts SVG の同時初期化が体感を大きく損なうため、効果が PC より大きい（P5-1 参照）。

### P2-2. 年範囲フィルタが最上部にしかない

- **箇所**: `ChartFilters` は `CpiChart.tsx` 冒頭で 1 回だけ描画。
- **モバイルでの影響**: 6 番目のグラフ（≒ 4,000px 地点）を見ているときに範囲を変えたくなったら、**8 画面分スクロールバックして操作し、また 8 画面分戻る**。実質的に「見ながら範囲を変える」ができない。
- **改善案**: P2-1 案 2 のスティッキータブバーに**現在の範囲（例: 2000–2026）を表示し、タップでボトムシート型の範囲ピッカー（プリセット＋詳細）を開く**。フィルタ行そのものを sticky にすると縦領域を常時消費するため、モバイルでは「表示は 1 行・操作はシート」が最適。

### P2-3. チャート高さがビューポートに追従しない

- **箇所**: `CpiChart.module.css:189` — モバイル `height: 500px` 固定 / `≥641px` は `aspect-ratio: 4/3, max-height: 650px`
- **問題**:
  - **横持ち**: 可視高が 320〜390px しかないところに 500px 固定。1 本のグラフすら画面に収まらず、スクロールしながらでないと全体形状が掴めない。グラフを大きく見たくて横にしたのに逆効果になっている。
  - **縦持ち**: 500px はビューポート高の約 75%。凡例（P1-3）と合わせると必ずはみ出す。
- **修正**: `height: min(500px, 60svh)` 程度でビューポート連動にする（`svh` を使うとアドレスバーの出入りでレイアウトが揺れない）。横持ち時は `@media (orientation: landscape) and (max-height: 500px)` で `height: 85svh` 相当に切り替え、画面を使い切る。

### P2-4. 消費支出（実質）グラフに凡例がない

- **箇所**: `CpiChart.tsx` の 2 つ目の `SpendingBarChart` で `hideLegend`。名目側の凡例（`handleLegendToggle`）が名目・実質を**同時に**制御する設計。
- **モバイルでの影響**: PC なら「上のグラフの凡例」が視界の端に残るが、**モバイルでは名目グラフと実質グラフが 1 画面以上離れている**ため、実質グラフを見ているユーザーには系列を切り替える手段が存在しないように見える。連動の事実も画面上のどこにも書かれていない。
- **改善案**: 実質グラフ側に読み取り専用の凡例（クリック不可・状態表示のみ）を表示し、「凡例は『消費支出（名目）』と連動」の注記と、名目グラフへのアンカーリンクを添える。

---

## P3 — インタラクションの質

### P3-1. 状態が永続化・共有されない（モバイルでは影響が大きい）

- **現状**: 年範囲・凡例の表示/非表示はすべて `useState`。リロードで消え、URL にも入らない。
- **モバイルでの影響**: モバイルブラウザはバックグラウンドでタブを破棄しやすい。**他アプリに切り替えて戻っただけで、苦労して設定した範囲と系列選択が全て失われる**（PC より遥かに起きやすい）。加えて、モバイルでの共有手段はほぼ URL 共有なので、状態が URL に入らないことは共有機能の不在に等しい。
- **改善案**:
  - **URL クエリ同期（推奨）**: `?from=2000&to=2025&hidden=...` を `useSearchParams` + `router.replace` で同期。復帰時の状態保持・リンク共有・E2E テストの安定化がまとめて解決する。
  - 補助として `sessionStorage`/`localStorage` に最終状態を保存。

### P3-2. CAGR の結果が stale になる

- **箇所**: `CpiChart.tsx` の `calculateCAGR` / `CagrPanel.tsx` の結果カード
- **問題**: 計算後に開始年・終了年・評価月・凡例選択を変えても `cagrResult` は前回の値を表示し続ける。**表示中の条件と表示中の数値が食い違う。**
- **モバイルでの影響**: `select` を変更するとネイティブピッカーがモーダルで開閉するため画面が切り替わり、**「条件を変えた」という記憶が結果カードの数値と結びつきにくい**。誤読のリスクが PC より高い。
- **改善案（いずれか）**:
  - 入力が変化したら `cagrResult` を `null` にリセット（最小修正）。
  - 結果カードの「算出条件」表示（`CagrPanel.tsx` の `.cagrResultDetail`）が**現在の state を参照している**ため stale 検知に使えない。算出時にスナップショットした値を表示するよう変更する。
  - デバウンス付きの自動再計算にしてボタンを廃止（タップ数が減るのでモバイルでは特に有効）。

### P3-3. 「Calculate」だけ英語

- **箇所**: `CagrPanel.tsx` のボタン。UI 全体が日本語なのにここだけ英語。同様に `chartSkeleton` の `Chart loading...`（`CpiChart.tsx` の 4 箇所の `dynamic()` の `loading`）も英語。
- **修正**: 「計算する」「グラフを読み込み中…」に統一。

### P3-4. 凡例操作に solo（この系列だけ表示）がない

- **現状**: `onReset` は「全表示 ⇄ 全非表示」のトグルのみ。12 系列ある費目別寄与度で「1 系列だけ見たい」場合、**11 回タップ**が必要。
- **モバイルでの影響**: 44px のチップを 11 回、しかも複数行にまたがって正確にタップする — 現実的な操作ではない。
- **改善案**: P1-3 の折りたたみ UI に「この費目だけ」ボタンを各項目に付ける（Shift+クリックのようなモディファイア操作はモバイルに存在しないため、**明示的なボタンにする**）。PC 側では Shift+クリックも併せて提供する。

### P3-5. 非表示状態の表現が色と不透明度のみ

- **箇所**: `CpiChart.module.css` の `.legendItem.hidden`（`opacity: 0.5` ＋ 背景色変更）
- **問題**: 色覚多様性・屋外の直射日光下（モバイル特有の低コントラスト環境）で状態が判別しづらい。`aria-pressed` は正しく付いている（`ChartLegend.tsx` / `MajorIndicesChart.tsx`）ので支援技術には伝わるが、視覚表現が弱い。
- **改善案**: ラベルへの取り消し線、色チップの塗り→輪郭のみへの変化、チェックマークアイコンのいずれかを追加（色以外の手がかりを 1 つ以上）。

---

## P4 — アクセシビリティ

### P4-1. フォーカスリングが大半のインタラクティブ要素にない

- **現状**: `:focus-visible` の定義は `ChartInfoButton.module.css` の 2 箇所のみ。`CpiChart.module.css` には 0 件。
- **影響対象**: `.legendItem`、`.actionButton`、`.calculateButton`。`.select` は `:focus` があるが `:focus-visible` ではない。
- **モバイル文脈**: Bluetooth キーボード接続時やスイッチコントロール利用時に必要。`:focus-visible` を使えばタッチ操作時にはリングが出ないため、通常のモバイル体験を損なわない。
- **修正**: 共通の `:focus-visible { outline: 2px solid var(--blue-500); outline-offset: 2px; }` を全ボタン/セレクトに適用。

### P4-2. `prefers-reduced-motion` 未対応

- **現状**: プロジェクト全体で 0 件。以下が常に走る。
  - `page.module.css:19` `fadeIn`（ヘッダー、translateY 付き）
  - `CpiChart.module.css:498` 付近 `shimmer`（スケルトン、無限ループ）
  - `.legendItem:hover` / `.calculateButton:hover` の `translateY`
- **モバイル文脈**: スクロールしながら動くアニメーションは前庭障害への負荷が大きく、片手保持の小画面ではより顕著。WCAG 2.3.3 相当。
- **修正**: `@media (prefers-reduced-motion: reduce)` で `animation: none` / `transition: none` / `transform: none` を一括適用。

### P4-3. グラフ本体がスクリーンリーダーに不可視

- **現状**: Recharts の SVG に `role` / `aria-label` / 代替テキストがない。凡例ボタンは読み上げられるが、**データそのものにアクセスする手段がゼロ**。
- **モバイル文脈**: VoiceOver / TalkBack はモバイル支援技術の主流。かつ、タッチでツールチップが実用でない（P1-4）ため、**晴眼ユーザーにとっても「値を正確に読む手段」がデータテーブルしかない**状況になり得る。
- **改善案**:
  - 各 `chartWrapper` に `role="img"` ＋ データ要約の `aria-label`（例:「消費者物価指数 主要指数、1994年1月から2026年6月、総合は 90.2 から 112.4 へ推移」）。
  - `<details>` で折りたたんだデータテーブル（`<table>`）を各グラフに併設。モバイルでの値読み取り手段・SEO の両方に効く。

### P4-4. ダークモードの手動切替がない

- **現状**: `prefers-color-scheme` のみ（`globals.css:31`）。OS 設定に完全従属。
- **モバイル文脈**: iOS/Android は時刻連動の自動ダークモードが一般的で、外出先で意図せず切り替わる。屋外では明るいテーマの方が読める場面も多い。
- **改善案**: ヘッダー（または P2-1 のタブバー）にライト/ダーク/システムの 3 状態トグル。`data-theme` 属性ベースに切り替え、`useChartTheme` からも参照できるようにする。FOUC 回避のためインラインスクリプトで初期テーマを適用。
- **併せて**: `layout.tsx` に `themeColor` の指定がないため、モバイルブラウザのアドレスバー色がテーマと合わない。`export const viewport: Viewport = { themeColor: [...] }` を追加する。

### P4-5. 12 色パレットの識別性

- **箇所**: `chartConstants.ts` の `stackedColors`（12 色）
- **評価**: 濃紺 → 青 → 水色 → 緑 → 黄 → 橙 → 赤 → 暗赤 という順序性のあるグラデーションで、積み上げエリアチャートとしては**方向性が読み取れる良い設計**。ただし隣接する `#4647ea`/`#3481fe`、`#22c55e`/`#85e022` などは 1 型・2 型色覚で判別が困難。
- **モバイル文脈**: 小画面では各帯の面積が小さく、色差の識別がさらに難しい。加えて屋外の低コントラスト環境が加わる。
- **改善案**: 積み上げ内の隣接領域に細い境界線（`stroke`）を入れて面の切れ目を明示する。凡例チップのタップで該当系列をハイライト（他系列を減光）する。パレット自体の差し替えは順序性が失われるため推奨しない。

---

## P5 — モバイルのパフォーマンス（Core Web Vitals）

### P5-1. 7 つの Recharts チャートを初期表示で同時マウント

- **現状**: 4 コンポーネントは `dynamic()` されているが `ssr` 制御・遅延マウントはなく、**マウント自体は即時**。7 つの SVG チャートが同時にレイアウト計算・描画される。
- **モバイルでの影響**: ミドルレンジのスマホでは CPU 性能が PC の 1/4〜1/6。INP / TBT が悪化し、初回スクロールが引っかかる。Lighthouse のモバイルスコアは PC より 4 倍のスロットリングで測られるため、影響がスコアに直結する。
- **修正**: P2-1 案 4 の `IntersectionObserver` による遅延マウント。ファーストビューの 1 本目だけ即マウントし、残りは接近時に。

### P5-2. スケルトンと実チャートの高さ不一致で CLS が発生

- **箇所**: `CpiChart.module.css:490` — `.chartSkeleton { height: 400px }` に対し `.chartWrapper` はモバイル 500px。
- **影響**: 読み込み完了時に 1 チャートあたり 100px のレイアウトシフト。**7 チャート分が積み上がる**。CLS はモバイル Core Web Vitals の評価対象であり、実ユーザー体験としても「読んでいた場所が飛ぶ」。
- **修正**: スケルトンの寸法を `.chartWrapper` と完全に一致させる（同じ CSS 変数から高さを引く）。

### P5-3. `overflow-x: hidden` で横溢れを隠している

- **箇所**: `globals.css:71` の `html, body { max-width: 100vw; overflow-x: hidden; }`
- **問題**: 横方向のはみ出しを「なかったこと」にしているだけで原因は残っている。副作用として `position: sticky` の不具合要因になり（P2-1 案 2 の前提）、`100vw` はスクロールバー幅を含むため環境によっては逆に溢れる。
- **修正**: 一旦この宣言を外して 375px で実際に何が溢れているかを特定し、個別に対処（グラフの `margin`、チップ列、長い日本語ラベルの `overflow-wrap` など）。sticky を導入するなら必須の前段作業。

---

## P6 — 大画面・仕上げ

### P6-1. 641px 以上で全要素が一段階で「巨大化」する

モバイル値を基準にすると、`min-width: 641px` を越えた瞬間に以下が当たる:

| 要素 | モバイル | 641px 以上 | 倍率 |
|---|---|---|---|
| `.title` | 3rem | **4.5rem** | 1.5× |
| `.description` | 1.125rem | **1.688rem** | 1.5× |
| `.chartTitle` | 1.25rem | **3.375rem** | 2.7× |
| `.select` | 0.875rem | **2rem** (padding 1.5rem 5rem) | 2.3× |
| `.filterItem` | 0.875rem | **2rem** | 2.3× |
| `.legendItem` | 0.875rem | **1.5rem** | 1.7× |
| `.cagrResultValue` | 2rem | **4rem** | 2× |
| 軸ラベル (`globals.css:142`) | 12px | **24px** | 2× |
| `.popup` (`ChartInfoButton`) | 画面幅-2rem | **1280px 固定** | — |

- **問題**: 641px（小型タブレット）でも 1920px（デスクトップ）でも同じ「巨大サイズ」。641px 幅で `font-size: 2rem` のセレクトが 2 つ並ぶと横幅を食い潰し、`chartTitle` 3.375rem は折り返す。**この帯は大型スマホの横持ちが入り得る領域でもあるため、モバイル観点でも修正が必要**（P0-1 と併せて）。
- **改善案（推奨）**: 段階指定をやめ、`clamp()` による流体タイポグラフィに置き換える。モバイル基準値を下限、現在の大画面値を上限に取れば、両端の意図を保ったまま断崖が消える。
  ```css
  .chartTitle { font-size: clamp(1.25rem, 1rem + 2.2vw, 3.375rem); }
  .title      { font-size: clamp(1.5rem, 1.2rem + 3.5vw, 4.5rem); }
  ```
- **併せて**: `.recharts-cartesian-axis-tick-value` の 24px も `clamp(12px, 0.6vw + 9px, 24px)` 相当に。`.popup` の `width: 1280px` も `min(1280px, calc(100vw - 4rem))` に。

### P6-2. コンテナ幅の二重指定

- **箇所**: `globals.css` の `.container` は 1536px まで段階的に拡大、`page.module.css:4` の `.pageWrapper` は `max-width: 80rem`(1280px)。両方が同じ要素（`page.tsx` のルート `div`）に当たっている。
- **影響**: `.container` の 1536px 分岐は永久に無効。意図が読めず、将来の変更で事故る。
- **修正**: どちらか一方に統一する。

### P6-3. エラーメッセージが開発者向け

- **箇所**: `page.tsx` の `.errorSubMessage`「public/cpi_data.csv ファイルを確認してください。」
- **修正**: エンドユーザーには「データを読み込めませんでした。時間をおいて再度お試しください。」を表示し、開発者向け詳細は `process.env.NODE_ENV === "development"` の時のみ出す。

### P6-4. バッジの `text-transform: uppercase`

- **箇所**: `page.module.css:40`。中身は「経済指標ダッシュボード」（日本語）なので `uppercase` は無効果。`letter-spacing: 0.05em` は日本語では字間が不自然に開く。
- **修正**: 両方削除、もしくはバッジ文言を英語（`ECONOMIC DASHBOARD`）にして意図を成立させる。モバイルではファーストビューの節約（P2-1 案 1）としてバッジ自体を削る選択肢もある。

### P6-5. メタデータに OGP がない

- **箇所**: `layout.tsx` に `title` / `description` のみ。
- **モバイル文脈**: モバイルでの流入・共有は SNS 経由が中心で、OGP カードの有無が到達率を大きく左右する。
- **修正**: `openGraph` / `twitter` / `metadataBase` を追加。OG 画像は `opengraph-image.tsx`（Next.js の動的 OG 生成）で最新データを載せる。P4-4 の `themeColor` もここで併せて設定。

### P6-6. データのエクスポート手段がない

- **改善案**: 各グラフに「CSV ダウンロード」「PNG 保存」。モバイルでは PNG 保存＋共有シートが特に相性が良い（`navigator.share` によるネイティブ共有）。優先度は低いが、データ層（`chartUtils.ts`）が既に整っているため実装コストは小さい。

---

## 実行順序の提案

| フェーズ | 内容 | 見積 | モバイルでの効果 |
|---|---|---|---|
| **1** | P0 全件（ブレークポイント統一 / CSS 変数 2 件 / `dvh` / codemap 訂正） | 小 | ダークモードの表示崩れ・大型端末横持ちの崩壊・不要スクロールが消える |
| **2** | P1-1 タップターゲット 44px、P1-2 `@media (hover: hover)`、P3-3 文言統一 | 小 | 「押せない・貼り付く」が解消し、まず操作できる状態になる |
| **3** | P2-1 案 1（ヘッダー圧縮）、P2-3 チャート高さ `svh` 化、P5-2 スケルトン一致 | 小 | ファーストビューにグラフが入り、横持ちが実用になり、CLS が消える |
| **4** | P1-3 凡例の折りたたみ、P1-5 期間プリセット | 中 | 凡例が画面を占有しなくなり、最頻操作が 1 タップになる |
| **5** | P2-1 案 2（スティッキータブバー、P5-3 が前提）、P2-2 範囲シート、P3-1 URL 同期 | 中〜大 | 7 グラフ間の回遊が成立し、復帰・共有で状態が消えなくなる |
| **6** | P1-4 ツールチップ固定表示、P3-2 CAGR stale、P3-4 solo、P2-4 実質グラフ注記 | 中 | 値の読み取りと誤解を生む挙動が解消 |
| **7** | P4 全件（フォーカス / reduced-motion / SR 対応 / テーマトグル / パレット境界線）、P5-1 遅延マウント | 中〜大 | アクセシビリティとモバイル性能の底上げ |
| **8** | P6 全件（clamp / 幅統一 / OGP / エクスポート） | 中 | 大画面での破綻解消と仕上げ |

---

## 検証方針

### Playwright にモバイルプロジェクトを追加する（前提作業）

- **現状**: `playwright.config.ts` の `projects` は `Desktop Chrome` のみ。**モバイル観点の回帰を一切検知できない。**
- **追加**: `devices["iPhone 13"]`（390×664, `hasTouch`, `isMobile`）と `devices["Pixel 7"]` 相当のプロジェクトを追加。既存の `tests/e2e/range-change.e2e.spec.ts` を両プロジェクトで走らせる。

### 追加すべき検証

- **タップターゲット**: 全インタラクティブ要素の `boundingBox()` が 44×44px 以上であることをアサート（P1-1 の回帰防止。ルールとして書けるので費用対効果が高い）。
- **横溢れ**: 375px 幅で `document.documentElement.scrollWidth <= clientWidth`（P5-3。`overflow-x: hidden` を外した後に有効になる）。
- **ダークモード × 凡例タップ後の残留 hover とコントラスト**（P0-3 / P1-2 の回帰防止）。`colorScheme: "dark"` のプロジェクトで検証。
- **ビジュアル確認幅**: 375px / 430px / 横持ち 844×390 / 768px / 1280px の 5 パターン（P0-1, P2-3, P6-1）。
- **CLS 計測**: モバイルスロットリング下で読み込み時のシフトを測る（P5-2）。
- **キーボードのみでの全操作通し**（P4-1）。
- **Lighthouse モバイル**（Performance / Accessibility）を改善前後で計測。PC ではなく**モバイルプリセット**で測る。

### 仕様書

`AGENTS.md` の規約に従い、コンポーネント追加（セクションタブバー、期間プリセット、凡例ボトムシート、テーマトグル）とアーキテクチャ変更（URL 状態同期、遅延マウント）は `openspec/specs/nextjstest/spec.md` の Component Tree / Requirements に WHEN/THEN 形式で反映する。

---

## 補足: 今回は「改善しない」と判断した点

- **Recharts からの移行**: 現状の要件（静的データ・7 グラフ）に対して十分機能しており、移行コストに見合わない。モバイル性能は遅延マウント（P5-1）で対処する。
- **PWA 化 / オフライン対応**: データが静的で `revalidate = false` のため CDN キャッシュで実用上足りる。Service Worker の導入コストに見合わない。
- **`stackedColors` パレットの全面差し替え**: 順序性のあるグラデーションという設計意図が明確で、置き換えると積み上げの読み取りやすさを損なう。境界線とハイライトで対処する（P4-5）。
- **状態管理ライブラリの導入**: `useState` ＋ カスタムフックで足りている。URL 同期（P3-1）を入れれば単一の真実の源も確保できる。
- **モバイル専用の別ページ/別コンポーネント**: 分岐が二重管理になり保守コストが跳ねる。単一のレスポンシブ実装をモバイル基準で組み直す方針を採る。
