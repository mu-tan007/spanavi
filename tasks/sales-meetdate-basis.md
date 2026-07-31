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

- [ ] `money.js` に `salesAmountOf()` / `salesMonthOf()` を追加（ルールを1箇所に固定）
- [ ] `money.js:105` calcMonthlyPayroll の `meetDate || getDate` フォールバック削除
- [ ] `PayrollSelfDetailView.jsx:108,142,297` 同フォールバック削除
- [ ] `MyPageView.jsx:151` 同フォールバック削除
- [ ] `KPIScorecard.jsx` 売上KPIを面談日ベースへ（件数KPIはアポ取得日のまま）
- [ ] `StatsView.jsx` 売上合計を `salesAmountOf()` に統一
- [ ] `Funnel.jsx` 同上
- [ ] `BusinessOverviewView.jsx:202,1774` 同上
- [ ] `AppoListView.jsx:642,650` 同上
- [ ] `AIAssistantView.jsx:19` 同上
- [ ] `PayrollView.jsx:368` 累計売上への加算にも面談日ガード（members.cumulative_sales は永続・ランク影響）
- [ ] `money.test.js` フィクスチャ更新＋回帰テスト追加
- [ ] `npm test` 通す
- [ ] commit & push

## 既に正しく面談日ベースだった箇所（変更不要）

- `analytics/salesPeriod.js`（`isSalesAppo`）→ SalesRanking / OverallSummary
- `analytics/TeamComparison.jsx:94`
- `SourcingDashboardView.jsx`（`inSalesPeriod(a.meetDate)`）
- `AppoListView.jsx` の monthStats
- `crm/CRMKPIDashboard.jsx`（SQL で `meeting_date` 範囲指定）

## レビュー

（実装後に記載）
