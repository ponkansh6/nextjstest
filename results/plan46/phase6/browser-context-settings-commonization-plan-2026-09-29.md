# Browser context・画面設定の共通化計画

## 目的

Chromiumを起点に、route commandに重複しているBrowserContextの生成・破棄とviewport/device設定の定義を段階的に共通化する。Chromiumから移行を始めるが、provider共有commandについてはWebKit variantも対象に含め、providerごとの互換性を確認して移行する。主な期待効果は、設定の一貫性、ライフサイクル処理の保守性、および例外時のcontext cleanupの確実性である。

この計画のscopeは共通化に伴う**実装差分**に限定する。検証・仕様同期は実装差分の妥当性を確認する作業として扱う。

各commandの実行ごとに新しいcontextを作る方針を維持する。helperやpresetを導入してもcontext起動回数は減らないため、runtime短縮を効果として前提にしない。contextをテスト間でpool/reuseする案は、状態漏れや順序依存を避けるため本計画に含めない。

## 現状と設計上の境界

- 22件はcommand実装単位で数えた現時点の暫定値であり、provider variantを含むinventory件数ではない。Stage 0で抽出条件と集計単位を明記して再集計し、数え方や根拠が曖昧なら実測値へ更新する。
- 共通化の責務は、呼び出し側が取得したPlaywright `Browser`から独立した`BrowserContext`を生成し、callbackを実行し、最後にcontextを閉じる範囲とする。
- provider判定・skip/failure判断・Browserの取得、route固有の入力と出力、assertion、待機、command固有failureの扱いはcommand側に残す。共通helperはこれらの意味や実行順を変えない。
- 最初の移行候補は、viewportだけを指定するChromium専用commandの7件とする。現時点の想定値は`next-route-poc`、`phase6-b03`、`phase6-b04`、`phase6-b05`が1280×800、`phase6-b07`、`phase6-b08`、`phase6-b09`が1280×720。Stage 0 inventoryと照合する。
- `batch4-b`、`batch5-standard`、`batch5-lazy`などWebKit variantも持つcommandは、providerごとのBrowser/API型互換性を確認してから扱う。
- helper導入によってBrowserContext/Page生成数は変わらない。測定を行う場合も、性能の合否判定ではなく観測として扱う。

## 提案する共通部品

### 1. 独立context lifecycle helper

配置先はStage 0で既存のhelper構成とimport境界を確認して決める。APIはまず、page生成をhelperの責務に含めないcontext-only callbackを第一候補とする。

```ts
withIsolatedContext(browser, contextOptions, callback);
```

callbackは受け取ったcontext上で必要な処理を行う。Stage 0 inventoryで対象全件が同形の`context.newPage()`直後に処理を開始し、pageの所有・返却形も揃うと確認できた場合に限り、page付きAPIを選択してよい。その場合はdecision gateに根拠を記録する。全件を確認するまではpage付きAPIを前提にしない。

共通helperは取得済みBrowserを受け取り、独立contextを1つ作成し、callbackを実行してcontextを1回だけcloseする。provider判定やBrowser取得をhelperへ移さない。context生成直後に`try`へ入り、その`finally`でcontextをcloseする構造とする。たとえば次の順序を守る（callbackとcloseがともに失敗した場合のエラー保持はFailure contractの選定方式に従う）。

```ts
const context = await browser.newContext(options);
let callbackFailed = false;
let callbackError: unknown;
try {
  return await callback(context);
} catch (error) {
  callbackFailed = true;
  callbackError = error;
  throw error;
} finally {
  try {
    await context.close();
  } catch (closeError) {
    if (callbackFailed) retainCloseError(callbackError, closeError);
    else throw closeError;
  }
}
```

上記は順序とerror precedenceを表す疑似コードであり、`retainCloseError`の具体的実装はStage 0/1で選定する。

実装ではFailure contractに従い、callback errorとclose errorの併発時にも元errorを優先して伝播できるようにする。page付きAPIを選んだ場合も、context取得直後からfinallyまでの保護を崩さない。

Failure contract:

1. `browser.newContext()`が失敗した場合、contextは存在しないためcloseを呼ばない。
2. context生成後に`newPage()`またはcallbackが失敗しても、contextのcloseを必ず一度だけ試みる。
3. callback / page作成時のエラーがある場合、その元エラーを優先して呼び出し元へ伝える。close時のエラーは補助情報として保持する。元errorを別errorでwrapしてidentityやstackを失わせない。
4. callbackが成功しcloseだけが失敗した場合は、close errorを呼び出し元へ伝える。
5. Stage 0/1で導入済みruntime・toolchainと既存エラー規約を確認し、close errorの補助情報を保持する具体的方法を選定して記録する。選択肢は、互換性が確認できた場合の`Error.cause` / `AggregateError`、または元errorをそのまま再throwしつつclose errorを別途記録する方式などとし、根拠なく特定方式を先決めしない。どの方式でも元errorのidentityとstackを保持し、元errorを呼び出し元へ伝えることを受入条件とする。

helperは`goto`、`waitUntil`、待機、route assertion、`__MOUNT_ALL__`送信、テスト固有操作を内包しない。これら、およびroute固有の入出力とskip/failureはcommandに置く。

### 2. immutable option preset builders

desktop viewport、Pixel/iPhone descriptor等の設定は、共有定数を直接返さず、呼び出しごとにfreshなtop-level options objectを返すbuilderにする。さらに呼び出し側が変更するnested object（例: `viewport`、`screen`）も呼び出しごとにcopyする。汎用deep cloneは導入せず、Playwrightに渡す既知の変更対象だけを明示してコピーする。

device presetとscenario overrideの適用順序は必ず「device descriptor → scenario固有override」とし、既存呼び出しで観測される順序を維持する。`userAgent`、`deviceScaleFactor`、`screen`、`isMobile`、`hasTouch`を含むdescriptor全体を保ち、viewportだけの部分presetへ縮退させない。可変幅・高さ、orientation、color scheme、reduced motion、境界値等はscenario固有設定として明示する。

## 実施ステージ

### Stage 0: inventory・契約・実行コマンドの確定

実装前に対象callsiteと検証手段を確定し、以下をinventory成果物（計画実装時に保存場所を決定）として残す。

- 抽出条件: route commandのうちBrowser Modeで実行され、BrowserContextを生成するものをprovider variantごとに抽出する。Chromiumを移行起点とし、Chromium/WebKit共有commandのWebKit variantも候補母集団に含める。provider上のskip/無効化/別suite等は対象variantから除外し、条件と理由を記録する。
- 集計単位: inventoryの1行を**移行予定command × provider variant**とする。同一commandのChromium/WebKit variantは別行、同一variant内の複数scenarioは同じ行に記録し、command/test path等のscenario差は行内に列挙する。22はcommand実装単位の暫定値なので、Stage 0でvariant行数とcommand実装数の両方を再集計し、根拠のある値をそれぞれ記録する。
- 各対象について、少なくともcommand/test path、provider（Chromium/WebKit）、spec/config由来（Playwright device descriptor、共通config、command local等）、context optionsの構成元とoverride、viewport値/scenario、`newContext`・`newPage`・`close`の位置、try/finallyの有無、skip/failure位置を記録する。
- Browserの取得元、context/pageの所有者、callbackへ渡す入出力、戻り値・例外の観測箇所を記録し、共通化境界と差分を可視化する。
- page付きhelperかcontext-only APIかをdecision gateで選ぶ。page付きAPIの許可判定の母集団は、**移行予定command × provider variantの全inventory行**とする。全行で`newPage()`直後に同形のcallbackを行い、戻り値・page ownership・failure behaviorも共通化可能と確認した場合だけpage付きAPIを採用する。ひとつでも差があればcontext-onlyを採用し、command側に差を残す。
- package scripts / configを確認して実行可能なlint、type-check、unit、focused Browser Mode、spec refs、smokeコマンドを確定する。`pnpm run test:all`がBrowser suiteを含むかをStage 0でconfigまで確認する。現行設定では`test:all`は既定`vitest.config.ts`を使い`tests/browser-mode/**`を除外し、Browser suiteは独立した`pnpm run test:browser`（`vitest.browser.config.ts`）で実行する構成である。この意図的除外を維持し、最終gateでは`test:all`と、必要なfocused Browser Modeに加えて独立のBrowser gateを明示する。確認方法は`package.json`のscriptsとVitest/Playwright config、対象テストの配置・selector、smoke scriptの引数仕様を読むこと。依存関係やselectorが未確認のコマンドを推測で書かず、Stage 0成果物に実在するコマンドを記録する。
- Next.js docsをこのhelper APIの根拠にしない。導入済みPlaywright/Vitestのバージョン、型定義と公式資料を確認し、Browser/BrowserContext/APIの境界とBrowser Mode runnerの実行方法の根拠を記録する。
- 作業前のstage/worktree差分を把握し、無関係な差分とstage状態を維持する。

現時点で`package.json`から確認できる共通ゲートは`pnpm run lint:fast`、`pnpm run type-check`、`pnpm run test:all`、Browser Mode全体用の`pnpm run test:browser`、およびbuilt route smoke用の`pnpm run test:browser:next-route-poc:built`である。`test:all`が使う既定`vitest.config.ts`は`tests/browser-mode/**`を除外し、Browser Mode suiteを含まない。したがってBrowser suiteの除外は意図された設定として維持し、全体suiteを最終確認する場合は`test:all`と`test:browser`を別々に実行する。個別route用の`test:browser:phase6-b03:built`等のscriptsもある。helper unitとfocused Browser Modeの実行コマンドは対象ファイル・Vitest config・script引数の受け渡しをStage 0で確認して確定し、確定した完全なコマンドと適用範囲をinventoryに記録する。spec refsの既存scriptがなければ、関連仕様ファイルと実装/テストの要件参照を照合する手順をStage 0で定義する。未確認のコマンドをplaceholderのまま後続stageへ持ち越さない。

### Stage 1: helper contractとfailure tests

- Stage 0 decision gateで選んだAPIとfailure contractを実装する。
- lifecycle unit testで次を検証する: newContext失敗（close 0回）、context-only APIでは**callback内で`context.newPage()`を呼び、その呼出しをrejectさせる**newPage失敗（close 1回）、callback success（戻り値同一・close 1回）、callback failure（元例外優先・close 1回）、close単独失敗（close error伝播）、callback failureとclose failureの併発（元例外優先・Stage 0/1で選定した方式でclose errorを補助保持）。closeが二重に呼ばれないことも各経路で確認する。
- Error補助記録方式は、Stage 0/1で導入済みruntime/toolchainと既存規約に基づき具体的に選定して記録する。テストでは元errorのidentityとstackが保持され、呼び出し元に同一の元errorが伝播することに加え、選定した方式でclose errorが保持されることを検証する。
- option builderのunit testで、device→scenario overrideの値と順序、呼び出しごとのtop-levelおよび変更対象nested objectの参照分離を確認する。
- gate: helper optionとcallbackの入出力、戻り値/例外の同一性、全failure pointのclose countがcontractどおりであること。lint/type-check/unitの具体的コマンドはStage 0で確定したものを使う。

### Stage 2: 代表command（device override含む）

- まずChromium専用の単純な7件（Stage 0のinventoryで再確認）を移行する。1280×800/720値とroute固有処理は維持する。
- つぎにPixel/iPhone等device descriptorとscenario overrideを組み合わせる代表commandを移行し、device descriptor全体とoverrideの適用順を検証する。viewport/themeなど異なる種類のoverrideを持つ代表を含める。
- 既存commandの入力、出力、skip/failure位置、provider判定、route assertions、待機、操作順を保つ。
- gate: context optionsの値と適用順序、nested reference isolation、provider選択、command出力、例外の同一性が移行前と一致する。unitと代表command focused Browser Mode、lint/type-checkを実行する。

### Stage 3: 残件を小グループで移行

inventory上の残りを複雑さごとに小分けし、各group完了後に差分とfocused検証を確認する。

- 固定desktop viewportを持つ残りのcommand。
- 可変viewportの`batch3-a`、768/769境界と部分的mobile propsを扱う`batch3-b`、`batch4-a`。
- 412×915 overrideを持つ`phase6-b12`。base device設定とcommand固有overrideの順序を維持する。
- dark/reduced-motion設定を持つ`phase6-b14`と、scenarioごとにtheme/viewportを切り替える`batch1`。
- `batch4-b`、`batch5-standard`、`batch5-lazy`などChromium/WebKit共有commandは最後に移行する。provider共通化で分岐や型変換が増える場合は個別実装を残す。

各groupのgateは、context optionの値/構造と順序同一性、provider/skip、出力・例外の同一性、失敗経路でのclose countを確認すること。Chromium専用群はChromium focused実行、共有provider群は対象のChromiumとWebKit focused実行を行う。互換性を保てないcommandは未移行のままにできる。

### Stage 4: 仕様同期と最終verification

- `openspec/specs/nextjstest/spec.md`のData Sources / Data Flow / Component Tree / Requirementsを実装に合わせる。少なくともBrowser Modeのcommandが取得済みBrowserからcommandごとの独立contextを作成し、callback完了後または例外後にcloseすること、およびproduction-route側のcontextがテスト間で共有されず独立していることを、WHEN/THENシナリオで明記する。
- helperのfailure contract、provider判定とroute固有入出力をcommandに保つ境界、device descriptor→scenario override順序も要件シナリオまたはData Flowに反映する。
- Stage 0で確定したspec refs手順で要件と実装・unit/focused testsの対応を確認する。
- 最終gate: lint、type-check、`test:all`、helper unit、対象Browser Mode、`test:browser`、spec refs、smokeをStage 0で確定した具体的コマンドで実施する。`test:all`はBrowser Mode除外、`test:browser`は独立したBrowser suite gateとして両方の適用範囲と結果を記録する。focused検証と全suite gateの適用範囲はStage 0 inventoryに沿って記録する。
- `git diff --check`とscope確認を実施し、今回の対象外差分やstage状態を変えていないことを確認する。

### Runtime観測（任意、合否判定に使わない）

本変更の目的は保守性とcleanup信頼性である。runtime値を求められる場合は、同じ対象/provider/条件で前後値を観測し、context生成・page生成・goto・test操作/待機の各時間を記録してよい。単発値はノイズを含むため、性能改善・劣化の合否や主張には使わない。context/page生成数が変わらないことを前提にし、context reuseは別計画とする。

## Technical key points / テクニカルキーポイント

- **Playwright/Vitest型境界:** Browser Mode runnerの実行環境と、Playwright `Browser` / `BrowserContext` / `Page`の型境界をStage 0で確認する。Next.jsの一般ドキュメントを根拠にせず、lockfile上の依存版に対応するPlaywright/Vitestの型定義と公式資料を根拠にする。provider間で型や機能が異なる場合、共通helperの型を無理に広げず、共通範囲かcommand別実装かを判断する。
- **Ownership / lifecycle:** Browserはcommand/setup側が取得・所有し、helperは渡されたBrowserから作成した単一contextのcleanupを所有する。pageをcallback内で作るAPIならpageの所有とcloseはcontextに従属し、helperの必須処理はcontext close一回とする。context生成前の失敗にcleanupを要求せず、生成後はpage作成も含めfinallyで保護する。
- **Exception precedence:** callback内のnewPage errorを含む処理エラーを優先し、cleanup errorは補助記録にする。callback成功時のclose errorは伝播する。保持方式はStage 0/1でruntime/toolchain互換性と既存規約を根拠に選定し、元例外のidentity/stackを保持して同じerrorを呼び出し元へ伝える。
- **Preset merge order / reference isolation:** device descriptorを先に適用し、scenario overrideを後に適用する。各呼出しで新しいtop-level objectと、変更されうる`viewport`/`screen`等のnested objectをcopyする。未知のobject graphを汎用deep cloneしない。
- **Provider isolation:** Chromium/WebKit判定、Browser取得、skip/failure、route固有入出力はcommand側に残す。provider共有は両方の実APIとconfigで検証し、互換性を損ねる場合は対象外にする。
- **過剰共通化の防止:** helperはcontext lifecycleだけを担い、navigation、wait、assertion、mount message、route固有操作、scenario列挙を引き受けない。設定の一貫化を目的に個別条件を消さない。
- **検証観測点:** options値/merge順/reference分離、provider判定、callback戻り値とerror identity、newContext/newPage/callback/close各failure pointのclose count、command出力とskip、Browser Mode実行結果、仕様のWHEN/THEN対応を記録する。

## 受け入れ条件

- Stage 0に抽出条件・集計単位・provider区分を伴うinventoryがあり、対象数を実際に再集計している。
- helper境界は取得済みBrowserから独立contextを作りcallback実行後にcloseする範囲に限られる。provider判定、Browser取得、route固有入出力/skip/failureはcommandに残る。
- API形はinventory gateで決め、page付きAPIは移行予定command × provider variantの全inventory行でnewPage/callback同形性を確認した場合に限る。
- Failure contractにある各failure pointでclose countとexception precedenceが確認され、closeは最大一回である。callbackとcloseの併発時は選定した方式でclose errorを保持し、元errorのidentityとstackを保って同一の元errorを伝播する。
- presetはdevice descriptor→scenario overrideの順を保ち、呼び出しごとにtop-levelと変更対象nested optionsを分離する。
- viewport/device/theme/reduced-motion/scenario設定、command出力、skip/provider挙動を維持する。
- `goto`、`__MOUNT_ALL__`、待機、route assertion、テスト順は変更しない。context pooling/reuseを導入しない。
- Chromium専用移行群はfocused Chromium検証に合格し、provider共有群は対象のChromiumとWebKit双方のfocused検証に合格する。互換性を保てない群は移行しない。
- Browser Mode共有contextとproduction-route独立contextの境界・cleanupが仕様書のWHEN/THENシナリオに反映される。
- lint/type-check/unit/focused Browser/spec refs/smokeのコマンドと結果・対象範囲が記録され、JEV reviewは仕様に従い通常検証の代用とせず実施される。
- 差分はhelper、preset、route command、tests、関連仕様に限定し、既存のstage/worktree状態を保持する。

## リスクと対応

| リスク                                      | 対応                                                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 22件の数え方が曖昧                          | Stage 0で抽出条件と集計単位を固定して再集計し、根拠のない場合は実数に修正する                               |
| callback/page failure後にcontextが残る      | context作成直後からfinallyで保護し、各failure pointのclose回数をunit testする                               |
| close errorが元のcallback errorを隠す       | 元エラーを優先しclose errorを補助記録する。error保持APIのtoolchain互換性を確認する                          |
| page lifecycleがcommand間で異なる           | 全件inventory前はcontext-only APIを使う。全件同形確認後だけpage付きAPIを選ぶ                                |
| preset共有参照やmerge順でmobile挙動が変わる | top-levelと変更対象nested objectをfresh copyし、device descriptor→scenario override順をunit/focused検証する |
| provider共通helperがAPI差を隠す             | WebKit共有群を最後に検証し、型/API差があればcommand別実装を残す                                             |
| 共通化を性能改善と誤認する                  | context数は変えず、単発runtime値は観測のみとして合否判定や性能主張に使わない                                |
| 検証コマンドが環境に合わない                | Stage 0でpackage scripts/config、selector、smoke引数を読み、実行可能な完全コマンドを確定して記録する        |

## ロールバック境界と非目標

問題がStage 1で出た場合、command移行前のhelper/API変更だけを再評価できる粒度に保つ。Stage 2以後はgroup単位に差分を分け、問題のあるgroupだけを戻せるようにする。共有provider群の互換性問題はChromium専用群の採用を妨げない。

本計画はBrowserContextの再利用による起動回数削減、テスト順・parallelismの変更、route/navigation/wait/assertionの抽象化、画面条件やテスト内容の削減、全suiteの一律再実行を扱わない。
