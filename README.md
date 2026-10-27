# 日本の経済指標ダッシュボード

CPI（消費者物価指数）、賃金、消費動向をチャートで確認する Next.js アプリです。実行時データはリポジトリ内の `data/source/` に同梱しており、通常のローカル起動に e-Stat API の認証情報は必要ありません。データを更新するときは e-Stat API を利用するため、`ESTAT_APP_ID` を設定してください。

## 必要環境

- Node.js 24.22.1 LTS or a later 24.x patch release
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

古いv2 semantic stateにCPI approval manifestが欠落している場合に限り、state移行は明示的なSHA-256 pin付きで行います。現在のstate hashを取得し、まずcheckを実行してください。checkはcanonical outputs/stateをpublishしません。成功した場合に同じhashを指定してpublishします。manifestが存在して不正なstateや、clean/HEAD一致などのrebaseline前提を満たさない状態は拒否されます。

```bash
state_sha256="$(sha256sum .data-refresh/semantic-state.json | cut -d ' ' -f 1)"
pnpm data:refresh --check --rebaseline-semantic-state="$state_sha256"
pnpm data:refresh --rebaseline-semantic-state="$state_sha256"
```

## 検証コマンド

```bash
pnpm run lint:fast
pnpm run type-check
pnpm run test:coverage
pnpm run test:browser:all
pnpm run build
pnpm run test:build-parity
pnpm run security-check
```

ブラウザーテストは `pnpm run test:browser:standard`（1280×800）と
`pnpm run test:browser:pixel7`（Pixel 7相当の412×915）で実行できます。
`pnpm run test:browser:all` はstandardの後にPixel 7を実行し、Next buildや
production serverは起動しません。現行manifestはstandard 14件、Pixel 7 22件の
計36件です。Pixel 7のgeometry checks 112/140/79とoverflow checks 120/127/142は
それぞれ1回のrenderでまとめて検証し、CagrPanelも各2ケースへまとめています。
B12 #307と
B13 #473/#508/#535をローカルcomponent/page fixture上のsynthetic pointer interaction
で確認します。B12 #430のroute navigation caseは削除しました。fixtureはproduction
route compositionやtrusted physical-touch deliveryを検証しません。複数のspending
legend・hover・filter acceptanceは1つのcomposite caseにまとめています。standardの
nominal/real tooltip totalも1 caseで確認します。各projectはstandard 14件・Pixel 7
22件のchecked-in `fullName` manifestとreportを照合し、
`BROWSER_MODE_REPORT_PATH` を設定すると完全なJSON reportを保持できます。
2026-10-27のpost-merge実行では `pnpm run test:browser:all` が成功し、standard 14件と
Pixel 7 22件がmanifest/count validationを通過しました。関連unit 3 files/17 tests、
`type-check`、`lint:fast`も成功しました。この結果にbuild/full pre-pushは含みません。

pre-pushはpush impactに応じて関連テストまたはfull static/unit gatesを選び、
standardとPixel 7を実行してbuild後に `127.0.0.1:3001` でNext serverの起動と
readinessだけを確認します。この確認ではrouteやbrowser interactionを実行しません。
