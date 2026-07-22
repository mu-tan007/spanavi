# スパキャリ「売上管理」タブ × Stripe連携（2026-07-22）

## 確定前提（むー様確認済）
- Stripeアカウントは1つ（M&Aソーシングパートナーズ / acct_1TJTB7F5Pr1oSwve = 既存 STRIPE_SECRET_KEY と同一）
- スパキャリ受講料は「手動で請求書(Invoice)発行」
- 受講生突合キー = メールアドレス（Stripe customer.email → members.email → spacareer_customers）
- 既存 stripe-webhook（テナント課金・organizations用）には触らない。専用の第2エンドポイント新設
- 新ページは売上を「表示」するだけ。Stripe上で決済は作らない（読み取り専用）

## 既定の設計判断（違えば修正）
- 売上集計の基準 = 入金日(paid_at)ベース。当月/累計は paid Invoiceの paid_at 月で集計
- 閲覧権限 = スパキャリ管理者（既存adminへ member_page_permissions シード）
- コース/商材別内訳 = Invoice明細(line items)の description/price で集計

## データモデル（新規テーブル）
- [ ] `spacareer_invoices` … Stripe Invoiceミラー
      id(text,PK), stripe_customer_id, customer_email,
      spacareer_customer_id(uuid,null,FK), member_id(uuid,null),
      number, status(draft/open/paid/uncollectible/void),
      currency, subtotal, tax, total, amount_due, amount_paid, amount_remaining,
      hosted_invoice_url, invoice_pdf, description,
      period_start, period_end, due_date, finalized_at, paid_at, stripe_created_at,
      raw jsonb, synced_at
- [ ] `spacareer_invoice_items` … 明細（コース別内訳用）
      id(text,PK), invoice_id(FK), description, amount, quantity, price_id, product_name
- [ ] メール突合で spacareer_customer_id / member_id を解決（同期時に埋める）
- [ ] RLS: service_roleで書込、閲覧は権限持ちメンバーのみ

## Edge Functions
- [ ] `stripe-spacareer-webhook` … 第2エンドポイント。invoice.created/finalized/updated/paid/
      payment_failed/voided, charge.refunded を constructEvent で署名検証→upsert
- [ ] `stripe-spacareer-sync` … バックフィル/手動全同期。stripe.invoices.list 全ページ→upsert

## UI: スパキャリ「売上管理」タブ (key=revenue)
- [ ] src/constants/pageRegistry.js に revenue 追加
- [ ] migration: _all_page_keys() に ('spartia_career','revenue')＋既存adminへ権限シード
- [ ] SpacareerAdminSidebar.jsx ACTIVE_IDS に 'revenue'
- [ ] SpanaviApp.jsx 条件描画追加
- [ ] SpacareerRevenueView.jsx（DataTable/デザイントークン厳守）
      ① 月次売上ダッシュボード（推移グラフ＋当月/累計）
      ② 受講生別 入金状況（未入金/入金済/期限）
      ③ コース/商材別 内訳（invoice_items集計）
      ④ 入金消込・突合（メール不一致=未紐付けInvoiceを手動割当）

## むー様の作業（セットアップ）
- [ ] Stripe: Webhook第2エンドポイント追加（URLはデプロイ後に確定）
      対象: invoice.created/finalized/updated/paid/payment_failed/voided, charge.refunded
- [ ] whsec_... を STRIPE_SPACAREER_WEBHOOK_SECRET に登録（コマンド用意する）
- [ ] STRIPE_SECRET_KEY は既存を再利用（同一アカウント・読み取り専用）

## 検証
- [ ] 実Invoice 1件で webhook→保存→画面表示を確認
- [ ] 全同期でバックフィルし、Stripe総額と突合
- [ ] main へ commit & push（自動）＋ Edge Function 本番deploy＋1件検証

## Review（実装後に記入）
```
```
