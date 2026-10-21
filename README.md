# 日本の経済指標ダッシュボード

CPI（消費者物価指数）、賃金、消費動向をチャートで確認する Next.js アプリです。実行時データはリポジトリ内の `data/source/` に同梱しており、通常のローカル起動に e-Stat API の認証情報は必要ありません。データを更新するときは e-Stat API を利用するため、`ESTAT_APP_ID` を設定してください。

## 必要環境

- Node.js 24.x
- pnpm 11.9.x

依存関係をインストールして開発サーバーを起動します。

```bash
pnpm install
pnpm dev
```

ブラウザーで <http://localhost:3000> を開きます。本番相当で確認する場合は次を実行します。

```bash
pnpm build
pnpm start
```

## データ更新

ローカル同梱データでアプリを使うだけなら、この節の設定は不要です。refresh CLI は必要な e-Stat API 情報を取得するため `ESTAT_APP_ID` を読み込みます。`.env.example` を参考に `.env.local` を作成して変数名を設定してください。認証値をREADME、コミット対象ファイル、ログへ記載しないでください。

まず `--check` で取得候補を検証します。このモードはcanonicalデータを更新しません。

```bash
pnpm data:refresh --check
```

検査結果を確認し、更新を反映するときに引数なしで実行します。全sourceの取得・staging・runtime品質検証が成功した後に publish します。失敗した場合は既存データを保持します。

```bash
pnpm data:refresh
```

## 検証コマンド

```bash
pnpm run lint:fast
pnpm run type-check
pnpm run test:coverage
pnpm run build
pnpm run test:browser:next-route-poc:built:all
pnpm run test:build-parity
pnpm run security-check
```

ブラウザーコンポーネント検証は `pnpm run test:browser:component:all` で実行できます。browser route コマンドは production build 済みのアプリを対象とするため、先に `pnpm build` を実行してください。
