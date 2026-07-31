# 売上計上は面談日ベースに統一する（2026-07-31）

## 背景

「今月売上」が実態より大きい、という指摘から発覚。
`money.js` の月判定が `meetDate || getDate` になっており、**面談日が未入力のアポを
アポ登録日で当月に計上**していた。7月分では23件・¥2,530,000 が過大計上（浅井+¥1,760,000 /
瀬尾+¥660,000 / 後藤+¥110,000）。チームボーナスのリーダー料率も1段階ずれていた。

規約（money.js 冒頭）は「売上は面談実施日ベース」。実装がそれを守れていなかった。

## 決定したルール

1. **面談日(`meetDate`)が無いアポは、いかなる画面でも売上に加算しない。**
2. 売上の計上月は**面談実施日**で決める（アポ登録日へのフォールバックは廃止）。
3. インターン報酬も同じ母集団に従う（売上が立たない月に報酬だけ立てない・月跨ぎ二重支給も防ぐ）。

## やること

- [x] `money.js` に `salesAmountOf()` / `salesMonthOf()` を追加（ルールを1箇所に固定）
- [x] `money.js:105` calcMonthlyPayroll の `meetDate || getDate` フォールバック削除
- [x] `PayrollSelfDetailView.jsx:108,142,297` 同フォールバック削除
- [x] `MyPageView.jsx:151` 同フォールバック削除
- [x] `KPIScorecard.jsx` 売上KPIを面談日ベースへ（件数KPIはアポ取得日のまま）
- [x] `StatsView.jsx` 売上合計を `salesAmountOf()` に統一
- [x] `Funnel.jsx` 同上
- [x] `BusinessOverviewView.jsx:202,1774` 同上
- [x] `AppoListView.jsx:642,650` 同上
- [x] `AIAssistantView.jsx:19` 同上
- [x] `PayrollView.jsx:368` 累計売上への加算にも面談日ガード（members.cumulative_sales は永続・ランク影響）
- [x] `money.test.js` フィクスチャ更新＋回帰テスト追加
- [x] `npm test` 通す
- [x] commit & push

## 既に正しく面談日ベースだった箇所（変更不要）

- `analytics/salesPeriod.js`（`isSalesAppo`）→ SalesRanking / OverallSummary
- `analytics/TeamComparison.jsx:94`
- `SourcingDashboardView.jsx`（`inSalesPeriod(a.meetDate)`）
- `AppoListView.jsx` の monthStats
- `crm/CRMKPIDashboard.jsx`（SQL で `meeting_date` 範囲指定）

## レビュー

2026-07-31 完了。commit `144f6a2` を main へ push 済み。

**入れた仕組み:** `money.js` の `salesAmountOf()` が「面談日なし → 0」「クライアント開拓 → 0」を
両方担保する。売上を合計する画面はすべてこの関数を通すので、以後どの画面でも
面談前の売上が立つことはない。期間の切り方（アポ取得日 or 面談日）は画面ごとの
裁量のまま残してあるが、金額の可否だけは一元化されている。

**検証:**
- `npm test` 53件パス（回帰テスト2件を追加）
- `vite build` 成功
- 修正後の7月（面談実施日ベース）: 成尾チーム ¥4,301,000 / 高橋チーム ¥924,000
  （修正前は ¥6,721,000 / ¥1,034,000）

**残課題:**
- 面談日が未入力のまま残っている23件は、日程が決まり次第 `meeting_date` を入れる運用が必要。
  入れるまでその売上はどの月にも立たない（＝実態どおり）。
- `StatsView` の売上基準トグル既定は `apo_date`（アポ取得日）のまま。金額の可否は
  今回のガードで正しくなったが、既定を面談日基準に変えるかは未判断。
