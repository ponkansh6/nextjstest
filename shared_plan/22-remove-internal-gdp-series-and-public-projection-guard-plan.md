# GDP内部系列の公開除去・公開projection防止計画

## 調査状況（2026-09-10）

判定: **実装完了（テスト未実行）**

画面に追加された「GDP名目原値」「GDP名目比較指数」等は、公開仕様として新設した系列ではなく、raw値と2025年平均=100の比較指数を内部で保持する実装が、既存の民間最終消費支出系列への接続時に公開projectionへ流出したものと判断する。

## 追加の経緯と根拠

- Plan 20のコミット `5e6f25a` で、名目・実質のraw/indexを内部保持し、既存の「民間最終消費支出」経路へ接続した。
- Plan 21のコミット `b09424b` で `mergeQuarterlyGdpView`、`chartConstants`、`CpiChart` から4キーを公開する経路が追加され、内部データ契約と公開Viewの境界が曖昧になった。
- その結果、名目/実質のraw系列と比較系列が、凡例・描画・tooltip・表・CSVの共通projectionに混入した。
- E2Eがこの4系列の出現を固定化し、誤った公開状態を回帰防止テストとして扱っていた。

## 目的と公開仕様

削除対象は次の4系列である。

- GDP名目原値
- GDP名目比較指数
- GDP実質原値
- GDP実質比較指数

4系列を凡例、描画、tooltip、表、CSVから完全に除去する。内部のraw/index、metadata、validation、独立照合結果は保持する。内部データをadvanced/hiddenとして利用者へ公開するのではなく、public projectionの対象外とする。

公開するのは既存の「民間最終消費支出（名目）」と「民間最終消費支出（実質）」を各1系列だけとし、これらを2025年平均=100の比較線として維持する。内部raw値は計算・検証のみに使い、公開系列名・凡例名・CSV列として露出させない。

## 再発防止設計

- 実装前P0としてPlan 21とopenspecの公開raw/comparison要件を、「内部契約として保持するがpublic projectionには含めない」契約へ同期する。同期完了を実装着手のゲートとする。
- 内部型（raw/index、metadata、validation）と公開View型を分離し、公開View型へ明示的な変換を必須にする。
- 公開可能な系列キーを型付きallowlistとして一元化し、chart、legend、tooltip、table、CSVが同じprojectionを利用する。
- legend labelの定義と公開許可を別管理にし、ラベルを定義しただけでは公開されない契約にする。
- advanced/hiddenフラグではなく、全surface共通のpublic projectionで除外する。
- 内部キーから公開キーへの重複意味系列を検出し、同じ概念のraw/indexを追加できない検証を設ける。
- 仕様書、Plan 21、info文章、テストを公開仕様と同期する。

## 実装・検証対象（実装済み）

影響ファイル候補:

- `server/lib/view-models/quarterlyAggregation.ts`
- `server/lib/data-loader/cpi.ts`
- `components/charts/CpiChart.tsx`
- `components/charts/chartConstants.ts`
- 凡例、tooltip、データ表、CSV出力のprojection実装
- `tests/`、`tests/e2e/`
- `openspec/specs/nextjstest/spec.md`
- `info`表示文書およびPlan 21

実装では `src/lib/quarterlyPublicProjection.ts` の型付きallowlistを、pageの四半期投影、CpiChartの描画キー、データ表/CSVキーで共有する。GDP raw/comparisonはloader・metadata・validationに残し、公開Viewへは渡さない。テストは依頼に従い実行していない。

仕様書の更新箇所は、該当するData Model、Data Flow、RequirementsとWHEN/THENシナリオを具体的に特定し、raw/indexの内部保持とpublic projection非包含を実装と同期させる。

実装順:

1. **P0**: Plan 21とopenspecの公開raw/comparison要件を内部契約・public projection非包含へ同期する。
2. 4系列の生成箇所と全公開surfaceの参照を棚卸しする。
3. Internal型とPublic View型、型付きallowlist、一元projectionを導入する。
4. 凡例・描画・tooltip・表・CSVをprojection経由へ統一する。
5. 既存の名目/実質各1系列を2025年平均=100比較線として確認し、内部raw/indexを計算経路に限定する。
6. 誤ったE2E期待値を削除し、公開除去を検証するテストへ置換する。
7. info、Plan 21、仕様書を更新し、重複意味系列検出とnegativeテストを追加する。

## テスト計画

- unit/component: allowlist外の4キーがpublic projectionへ出ないこと。
- unit/component: 内部raw/indexとmetadata/validationが保持され、計算結果を壊さないこと。
- negative unit: legend labelを追加しても公開許可がなければ出ないこと。
- negative component: 各surface（chart、legend、tooltip、table、CSV）に4キーが現れないこと。
- E2E: 公開画面に既存の名目/実質各1系列だけが表示され、2025年平均=100比較線として動作すること。
- CSV: ヘッダーと行に4系列の列が存在しないこと。
- 重複意味系列検出: 同一概念のraw/index公開を失敗させること。

## ロールバック

内部raw/index、metadata、validationは削除せず、projection変更のみを戻せるようにする。ただし4系列をpublic projectionへ戻すことはロールバックとみなさず、明示的な仕様変更と追加レビューを必要とする。公開系列が空になる場合はfail closedし、既存の2系列を維持する。

## 受入条件

- 4系列が凡例・描画・tooltip・表・CSVのすべてから除去される。
- 公開allowlistが正確に `民間最終消費支出（名目）` と `民間最終消費支出（実質）` の2キーだけを維持し、名称揺れやaliasによる重複公開がない。
- 上記2系列が各1系列だけ公開され、2025年平均=100比較線として維持される。
- 内部raw/index、metadata、validation、独立照合結果が保持される。
- 型付きallowlistと共通projectionが全surfaceで使われる。
- negative unit/component/E2E/CSVテスト、重複意味系列検出が追加される。
- openspec、Plan 21、info文章が実装と一致する。
- 実装・検証完了後にのみコミット対象とする。現時点では調査完了・未実装であり、コミットやgit操作は行わない。

## Plan23による最新状態（2026-09-10）

- 当時の「テスト未実行」はPlan22作成時点の記録であり、その後の検証状況を示すものではない。
- Plan23で公開2系列契約を再検証し、公開projectionが既存の名目・実質各1系列のみであることを確認した。内部raw/indexの4系列は非公開のまま保持する。
- 四半期ラベルと、2025Q1〜Q4の表・CSV・tooltipにおける数値一致を確認するE2Eを追加・実行した。
- Plan23時点で残る範囲は、この追記時点の記録とする。外部公表値との再照合や、それを完了したことを示す保証は含まない。
