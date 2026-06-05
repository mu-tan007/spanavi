# Spanavi メルマガ機能 実装プラン

最終更新: 2026-06-05

## 0. ゴール / スコープ

Spanavi の CRM に「セグメント配信できる HTML メルマガ機能」を内蔵する。

- **配信対象セグメント**
  - `clients.status` ごと（支援中 / 準備中 / 停止中 / 保留 / 中期フォロー / 面談予定）
  - `client_lead_companies`（見込み客 / 営業メルマガ用）
- **配信元**: `newsletter@ma-sp.co`（新規ドメイン認証）
- **基盤**: Resend API（既存 Gmail SMTP の `send-email` とは別系統で並列運用）
- **コア機能**: HTML テンプレエディタ、開封率 / クリック率トラッキング、配信予約、オプトアウト管理
- **法務**: 特定電子メール法 取引関係例外で運用、全配信にオプトアウトリンク必須

## 1. 前提・既存資産の確認結果

- `clients.status` は text型・DB CHECK制約なし（AIプロンプト内のみで列挙）
- `client_contacts` は `email`, `is_primary` カラム保有（複数担当者対応済）
- `client_lead_companies` も `email` カラム保有（見込み客 CSV由来）
- `send-email` Edge Function は Google OAuth 経由の Gmail API（個人メアド from なのでメルマガ用途には不適、ただし個別フォロー用途では温存）
- `pg_cron` + `pg_net` で Edge Function 起動するパターンは既存実装あり
- `react-email` / `@react-email/*` は未導入

### 既存メール実装との役割分担（重複回避）

| 経路 | 用途 | 実装方針 |
|---|---|---|
| `BulkEmailModal` | 選択行を mailto で開いて個別編集送信 | 既存温存・触らない |
| `EmailFollowupModal` (BusinessOverviewView内) | AI生成1対1フォロー (Gmail API) | 既存温存・触らない |
| `send-email` Edge Function | 上記フォロー送信の実体 | 既存温存・触らない |
| **新規メルマガ機能** | **HTML一斉配信+テンプレ+トラッキング (Resend)** | **本プランで新規実装** |

メルマガ専用ボタンを CRMTable の選択行アクションにも追加（既存「一斉メール」ボタンと並列）、ただし既存 BulkEmailModal は残す。

## 2. 全体フェーズ

- [ ] **Phase 0**: Resend ドメイン認証・APIキー取得（DNS作業含む）
- [ ] **Phase 1**: DBスキーマ（migration 1本）
- [ ] **Phase 2**: Edge Function 2本（`send-campaign`, `resend-webhook`）
- [ ] **Phase 3**: react-email 導入 + テンプレートエディタ
- [ ] **Phase 4**: 配信先セグメント設定 UI
- [ ] **Phase 5**: 配信レポート UI（開封率 / クリック率）
- [ ] **Phase 6**: pg_cron 連携 + 本番疎通 + 1件検証

---

## Phase 0: Resend ドメイン認証

- [ ] 0.1 Resend アカウント作成（既存があれば共用、なければ無料プランで起票）
- [ ] 0.2 Resend 管理画面で `ma-sp.co` ドメイン追加（subdomain `newsletter.ma-sp.co` を切る方が既存メールに影響しない / 要判断）
- [ ] 0.3 表示された SPF/DKIM/DMARC TXT レコードをむー様に提示（DNS事業者はどこ？ お名前.com なら spanavi.jp と同じ流れ）
- [ ] 0.4 DNS 反映後（24h以内）Resend 側で verification 確認
- [ ] 0.5 Resend API キー発行 → Supabase Edge Function の env vars に `RESEND_API_KEY` を登録（**`.trim()` 必須**）
- [ ] 0.6 Resend Webhook URL（後で作る `resend-webhook` Edge Function）と署名検証用 secret を取得 → `RESEND_WEBHOOK_SECRET` も env vars 登録

**判断ポイント**: subdomain `newsletter.ma-sp.co` vs ルート `ma-sp.co` 直接。前者推奨（既存 ma-sp.co Google Workspace のSPFと衝突しない）。

---

## Phase 1: DBスキーマ

ファイル: `supabase/migrations/2026MMDDHHMMSS_email_marketing.sql`

**migration 冒頭テンプレ**:
```sql
set local search_path = public, extensions;
```

### 1.1 テーブル定義

- [ ] 1.1.1 `email_templates`
  - `id uuid pk`, `org_id uuid`, `name text`, `subject_template text`, `body_html text`, `body_text text`（フォールバック）, `from_name text`, `created_by uuid`, `created_at`, `updated_at`
- [ ] 1.1.2 `email_campaigns`
  - `id uuid pk`, `org_id uuid`, `template_id uuid fk`, `name text`, `subject text`, `from_email text`（既定 `newsletter@ma-sp.co`）, `from_name text`, `body_html text`（テンプレからスナップショット）, `body_text text`, `segment_definition jsonb`（条件式）, `status text check in ('draft','scheduled','sending','sent','canceled')`, `scheduled_at timestamptz`, `sent_at timestamptz`, `total_recipients int`, `created_by uuid`, `created_at`, `updated_at`
- [ ] 1.1.3 `email_campaign_recipients`
  - `id uuid pk`, `campaign_id uuid fk`, `org_id uuid`, `recipient_type text check in ('client_contact','lead_company','manual')`, `client_id uuid null`, `client_contact_id uuid null`, `lead_company_id uuid null`, `email text not null`, `display_name text`, `merge_vars jsonb`（差込変数のスナップショット）, `resend_message_id text`, `status text check in ('queued','sent','bounced','complained','failed')`, `sent_at`, `error_message text`
- [ ] 1.1.4 `email_events`
  - `id uuid pk`, `recipient_id uuid fk`, `event_type text check in ('delivered','opened','clicked','bounced','complained','unsubscribed')`, `occurred_at timestamptz`, `clicked_url text null`, `user_agent text null`, `ip_hash text null`, `raw_payload jsonb`
- [ ] 1.1.5 `email_unsubscribes`
  - `id uuid pk`, `org_id uuid`, `email text not null`, `scope text check in ('global','engagement')`, `engagement_id uuid null`, `unsubscribed_at timestamptz default now()`, `source text`（'link' / 'manual' / 'bounce' / 'complaint'）
  - unique (org_id, email, scope, engagement_id)

### 1.2 インデックス

- [ ] 1.2.1 `email_campaign_recipients (campaign_id, status)`
- [ ] 1.2.2 `email_campaign_recipients (email)` — オプトアウト判定用
- [ ] 1.2.3 `email_events (recipient_id, event_type)`
- [ ] 1.2.4 `email_unsubscribes (org_id, email)`
- [ ] 1.2.5 `email_campaigns (org_id, status, scheduled_at)` — pg_cron スキャン用

### 1.3 RLS

- [ ] 1.3.1 全テーブルに `enable row level security`
- [ ] 1.3.2 SELECT/INSERT/UPDATE/DELETE すべて `org_id = public.get_user_org_id()` パターン（既存 clients と統一）
- [ ] 1.3.3 `email_events` は recipient 経由で org_id 判定（join policy or recipient に org_id 冗長保持）→ 冗長保持の方が高速、後者を採用

### 1.4 ヘルパー RPC

- [ ] 1.4.1 `compute_campaign_segment(p_segment jsonb)` — segment_definition を解釈して recipient リストを返す SQL 関数。差込変数（contact_name, client_name, status等）も一緒に組み立て
- [ ] 1.4.2 `preview_campaign_recipients(p_campaign_id uuid, p_limit int default 20)` — UIプレビュー用

### 1.5 トリガ

- [ ] 1.5.1 `email_events` で `event_type='bounced'|'complained'` 時、自動で `email_unsubscribes` に global で追加（ハードバウンス対策）

---

## Phase 2: Edge Function

### 2.1 `supabase/functions/send-campaign/index.ts`

- [ ] 2.1.1 トリガ: 手動 invoke（即時送信）または pg_cron（scheduled 配信）
- [ ] 2.1.2 引数: `{ campaign_id: uuid }`
- [ ] 2.1.3 処理フロー:
  1. campaign を `sending` に更新
  2. `compute_campaign_segment` で recipient リスト生成 → `email_campaign_recipients` にバルクINSERT
  3. `email_unsubscribes` 突合で除外
  4. Resend `/emails/batch`（100件/req）で送信ループ、`resend_message_id` を保存
  5. レート制御（Resend は 10 req/s デフォルト、token bucket で制御）
  6. 完了後 campaign を `sent` に更新、`sent_at`、`total_recipients` 記録
- [ ] 2.1.4 各メール末尾にオプトアウトリンク `{{site_url}}/unsubscribe?token={{signed_token}}` を必ず差し込む（HMAC署名トークン）
- [ ] 2.1.5 トラッキングは Resend 標準（自動でlink wrapping & open pixel 挿入）
- [ ] 2.1.6 env: `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `UNSUBSCRIBE_HMAC_SECRET` 全部 `.trim()`

### 2.2 `supabase/functions/resend-webhook/index.ts`

- [ ] 2.2.1 Resend が `email.delivered/opened/clicked/bounced/complained` を POST
- [ ] 2.2.2 署名検証（Svix headers）
- [ ] 2.2.3 `resend_message_id` で recipient を引いて `email_events` に INSERT、`email_campaign_recipients.status` も最新イベントで更新
- [ ] 2.2.4 重要処理は DB trigger 側で（Edge Function bg task 末尾の fetch は打ち切られる前例ありのため、webhook 受信時に即座に同期処理する）

### 2.3 `supabase/functions/unsubscribe/index.ts`

- [ ] 2.3.1 GET エンドポイント、HMAC トークン検証
- [ ] 2.3.2 `email_unsubscribes` に追加
- [ ] 2.3.3 シンプルな HTML 完了画面を返す

### 2.4 デプロイ

- [ ] 2.4.1 `npx supabase functions deploy send-campaign --project-ref baiiznjzvzhxwwqzsozn`
- [ ] 2.4.2 同様に resend-webhook, unsubscribe をデプロイ
- [ ] 2.4.3 Resend 管理画面に webhook URL 登録
- [ ] 2.4.4 **本番1件検証**（テスト宛先1件のキャンペーンを実行 → 開封 → クリックまで全イベントが email_events に入るか確認）

---

## Phase 3: react-email + テンプレートエディタ

### 3.1 ライブラリ導入

- [ ] 3.1.1 `npm install react-email @react-email/components @react-email/render`
- [ ] 3.1.2 `src/email-templates/` ディレクトリ作成
- [ ] 3.1.3 デフォルトテンプレ 3種（ニュースレター / お知らせ / 営業フォロー）を React Email コンポーネントで作成
- [ ] 3.1.4 ブランドカラー（Spanavi デザイントークン）を統一適用

### 3.2 HTML テンプレートエディタ画面

- [ ] 3.2.1 ファイル: `src/components/views/email/EmailTemplateEditor.jsx`
- [ ] 3.2.2 ブロックエディタ方式（既製テンプレを base に、見出し / 本文 / 画像 / CTA ボタン / 区切り線をブロック追加）
  - **判断ポイント**: フルWYSIWYG（GrapesJS等の重量級）vs ブロック型（自前）。営業メルマガ用途なら後者で十分。最初は後者推奨
- [ ] 3.2.3 ライブプレビュー（PCビュー / スマホビュー切替）
- [ ] 3.2.4 差込変数パレット（`{{client_name}}` `{{contact_name}}` `{{status}}` `{{site_url}}` をクリックで挿入）
- [ ] 3.2.5 保存時に `@react-email/render` で HTML 文字列化して `email_templates.body_html` に保存

---

## Phase 4: 配信先セグメント設定 UI

### 4.1 キャンペーン作成画面

- [ ] 4.1.1 ファイル: `src/components/views/email/EmailCampaignFormModal.jsx`
- [ ] 4.1.2 step1: テンプレ選択（既存 or 新規）
- [ ] 4.1.3 step2: 件名・From 名編集
- [ ] 4.1.4 step3: セグメント設定
  - 対象種別: クライアント企業 / 見込み客 / 両方
  - クライアント企業: status 複数選択（支援中 / 準備中 / 停止中 / 保留 / 中期フォロー / 面談予定）+ 商材（engagement）絞り込み
  - 見込み客: lead_list 選択 + ステータス（未対応 / 架電済等）絞り込み
  - 担当者対象: 主担当のみ / 全担当者
- [ ] 4.1.5 step4: 配信先プレビュー（`preview_campaign_recipients` RPC で先頭20件 + 総件数表示）
- [ ] 4.1.6 step5: 送信タイミング（即時 / 日時予約）
- [ ] 4.1.7 即時送信は Edge Function 直 invoke、予約は `status='scheduled'` で保存し pg_cron が拾う

### 4.2 キャンペーン一覧画面

- [ ] 4.2.1 ファイル: `src/components/views/email/EmailCampaignList.jsx`
- [ ] 4.2.2 DataTable 統一API使用（既存 CRM画面のDataTableと統一、カラム揃え必須）
- [ ] 4.2.3 カラム: 件名 / ステータス / 送信日時 / 対象数 / 開封率 / クリック率 / 操作（複製・編集・キャンセル）

### 4.3 サイドナビ追加

- [ ] 4.3.1 CRM配下 or 独立メニュー「メルマガ」を追加（既存 `src/App.jsx` ルーティングに追加）

---

## Phase 5: 配信レポート UI

- [ ] 5.1 ファイル: `src/components/views/email/EmailCampaignReport.jsx`
- [ ] 5.2 KPI カード（Card正規API使用）: 配信総数 / 配信成功率 / 開封率 / クリック率 / バウンス率
- [ ] 5.3 受信者別テーブル（DataTable）: 企業名 / 担当者 / 開封 / クリックURL / 最終イベント時刻
- [ ] 5.4 クリックURL別ランキング（複数CTAある場合どこが効いたか）
- [ ] 5.5 時系列グラフ（送信〜24h、開封タイミング分布）

---

## Phase 6: pg_cron + 運用

### 6.1 pg_cron スケジュール

- [ ] 6.1.1 migration `2026MMDDHHMMSS_email_marketing_cron.sql`
- [ ] 6.1.2 1分毎に `scheduled` で `scheduled_at <= now()` のキャンペーンを拾って Edge Function `send-campaign` を起動（pg_net + Authorization + apikey ヘッダ必須）

### 6.2 オプトアウト除外運用

- [ ] 6.2.1 `email_unsubscribes` をクライアント詳細画面・見込み客詳細画面に表示（誰がいつ何経由で外れたか可視化）
- [ ] 6.2.2 手動オプトアウト追加機能（電話で「メール止めて」と言われた場合用）

### 6.3 本番検証

- [ ] 6.3.1 テンプレ1つ作成
- [ ] 6.3.2 テスト宛先（むー様個人メアド1件）でキャンペーン即時送信
- [ ] 6.3.3 受信確認、開封確認、CTAクリック確認、`email_events` 反映確認
- [ ] 6.3.4 オプトアウトリンクから unsubscribe → `email_unsubscribes` 反映確認
- [ ] 6.3.5 次回キャンペーンで自動除外されるか確認

---

## 注意事項（memory より反映済）

- 絵文字使用禁止（Spanavi UI/通知/レポート全般）
- migration 冒頭 `set local search_path = public, extensions;` 必須
- env vars は必ず `.trim()`
- Edge Function I/F 変更は Supabase 本番に必ず deploy + 1件検証
- 大規模 RLS 変更は低トラフィック時間帯に
- DataTable / Card は既存正規API 使用、カラム揃え統一
- pg_cron / DB trigger から Edge Function 呼ぶ時は Authorization + apikey 両方必須
- mainブランチが本番、別ブランチ commit は反映されない
- 並行作業時は worktree 隔離

## ペンディング判断事項

1. **subdomain `newsletter.ma-sp.co` vs ルート `ma-sp.co`**: 推奨は subdomain（既存 Google Workspace の SPF/DKIM と分離）
2. **Resend ドメイン認証の DNS 事業者**: ma-sp.co のDNSはどこ管理か要確認
3. **テンプレエディタ方式**: ブロック型自前 vs GrapesJS等のフル WYSIWYG。初期はブロック型推奨
4. **見込み客への送信スコープ**: `client_lead_companies.email` は CSV由来で精度バラつきあり、ハードバウンス率が高くなる可能性。初期は段階的に解放（10件 → 100件 → 全体）

## 工数見積

- Phase 0: 0.5日（DNS 反映待ち含めると実質1日）
- Phase 1: 1日（migration + RPC）
- Phase 2: 1.5日（Edge Function 3本 + デプロイ・1件検証）
- Phase 3: 1日（react-email 導入 + デフォルトテンプレ3種 + エディタ）
- Phase 4: 1日（フォーム + 一覧）
- Phase 5: 0.5日（レポート）
- Phase 6: 0.5日（pg_cron + 運用画面）
- **合計: 約6日**（DNS 反映待ち除く実工数 5〜6日）

## レビュー欄

（実装着手後、各 Phase 完了時に追記）
