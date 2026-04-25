# Spanavi SaaS — 現状構造・機能オーバービュー

**作成日:** 2026-04-16
**バージョン:** 1.0.1
**Tech Stack:** Vite + React 18 + Supabase (PostgreSQL + Edge Functions) + Stripe
**Deployment:** Vercel from GitHub (`mu-tan007/spanavi`)
**Domain:** spanavi.jp

> このドキュメントは、Spanavi の構造改革を進めるにあたり、Web 版 Claude 等の外部アシスタントに現状を共有するためのスナップショットです。

---

## 1. トップレベル構造

### 1.1 ルートファイル

- **package.json**: Node ESM, React 18.3 / React Router 7.1 / Supabase.js 2.49 / TailwindCSS 3.4 / Vite 6 / PWA
- **vite.config.js**: Vite + React, PWA manifest (Supabase は NetworkFirst、Google Fonts は CacheFirst), asset hash (`[name]-[hash]-v3.js`)
- **vercel.json**: SPA rewrites (全ルート → `/index.html`)
- **tailwind.config.js / postcss.config.js**
- **.env.local**: Supabase / Stripe / Zoom OAuth クレデンシャル

### 1.2 ディレクトリ構成

```
spanavi/
├── src/
│   ├── App.jsx                 # トップレベル router
│   ├── main.jsx                # React entry (AuthProvider)
│   ├── components/
│   │   ├── SpanaviApp.jsx      # メインアプリシェル (サイドバー、view dispatch)
│   │   ├── LoginPage.jsx, ResetPasswordPage.jsx
│   │   ├── admin/              # 管理画面パネル
│   │   │   ├── BillingSettings.jsx
│   │   │   ├── BrandingSettings.jsx
│   │   │   ├── CallStatusSettings.jsx
│   │   │   ├── ClientManagement.jsx
│   │   │   ├── MemberManagement.jsx
│   │   │   ├── RewardSettings.jsx
│   │   │   ├── SlackZoomSettings.jsx
│   │   │   └── IndustryRuleSettings.jsx
│   │   ├── views/              # 機能ビュー (37+)
│   │   │   ├── CallFlowView.jsx        # メイン架電 UI
│   │   │   ├── CallingScreen.jsx       # 電話ダイヤル
│   │   │   ├── AppoListView.jsx        # アポ管理
│   │   │   ├── RoleplayView.jsx        # ロープレ
│   │   │   ├── CompanySearchView.jsx   # M&A 企業DB検索
│   │   │   ├── CRMView.jsx             # クライアント一覧
│   │   │   ├── LiveStatusView.jsx      # リアルタイム稼働
│   │   │   ├── StatsView.jsx           # パフォーマンス分析
│   │   │   ├── ShiftManagementView.jsx
│   │   │   ├── PayrollView.jsx
│   │   │   ├── PreCheckView.jsx
│   │   │   ├── ListView.jsx, DatabaseView.jsx
│   │   │   ├── ScriptView.jsx
│   │   │   ├── IncomingCallsView.jsx
│   │   │   └── ...
│   │   ├── common/             # 共有コンポーネント
│   │   │   ├── SubscriptionGuard.jsx   # 課金状態によるアクセス制御
│   │   │   ├── PiPWidget.jsx           # フローティング通話ウィンドウ
│   │   │   ├── QuickAppoModal.jsx
│   │   │   ├── InlineAudioPlayer.jsx
│   │   │   ├── ClientCalendarPanel.jsx
│   │   ├── public/             # 公開ページ
│   │   │   ├── LandingPage.jsx
│   │   │   ├── SignupPage.jsx, SignupCompletePage.jsx
│   │   │   └── TokushohoPage.jsx       # 特商法
│   │   ├── dashboard/, mobile/, database/
│   ├── hooks/
│   │   ├── useAuth.jsx                 # セッション + プロファイル
│   │   ├── useSpanaviData.jsx          # テナントデータ一括取得
│   │   ├── useCallStatuses.js          # org_settings からステータス動的取得
│   │   ├── useBranding.js              # ロゴ・色 (CSS 変数反映)
│   │   ├── useZoomAuth.js              # Zoom OAuth
│   │   ├── useIsMobile.js
│   │   └── ...
│   ├── lib/
│   │   ├── supabase.js                 # Supabase client
│   │   ├── supabaseWrite.js            # 2,482 行の CRUD (要分割候補)
│   │   ├── orgContext.js               # グローバル org_id シングルトン
│   │   ├── zoomPhoneStore.js           # Zoom Smart Embed postMessage
│   │   ├── pushNotification.js         # Web push
│   │   ├── logo.js
│   ├── constants/ (colors, callResults)
│   └── utils/ (calculations, industry, memo)
├── supabase/
│   ├── config.toml
│   ├── functions/              # Edge Functions (32個)
│   └── migrations/             # 60+ SQL migration
├── scripts/                    # データ import/export (Python/Node)
├── public/                     # PWA アセット
├── oauth_server.cjs            # ローカル OAuth 用補助サーバ
└── CLAUDE.md
```

### 1.3 主要依存

| Dep | Ver | 用途 |
|---|---|---|
| react | 18.3.1 | UI |
| react-router-dom | 7.1.1 | SPA routing |
| @supabase/supabase-js | 2.49.1 | Backend |
| vite-plugin-pwa | 1.2.0 | オフライン + push |
| recharts | 3.8.0 | 分析チャート |
| lucide-react | 0.577 | アイコン |
| @ffmpeg/ffmpeg | 0.12.15 | クライアント音声変換 |
| exceljs | 4.4.0 | Excel export |
| jspdf / html2canvas | 4.2.1 / 1.4.1 | PDF 生成 |

---

## 2. フロントエンド

### 2.1 認証フロー (`src/hooks/useAuth.jsx`)

1. `getSession()` (sessionStorage キャッシュあり)
2. プロファイル探索: `users` → `members.user_id` → `members.email` (フォールバック)
3. `members` から `org_id` 抽出 → `setOrgId()` でグローバル保持
4. `onAuthStateChange()` で同期

**マルチテナントのユーザー解決チェーン**:
1. `users` テーブル (RLS direct)
2. `members.user_id` (最も信頼性高)
3. email パターン `user_<member_id>@masp-internal.com` (MASP内部)
4. `members.email` (外部テナント = 実メール)

### 2.2 ルーティング (`src/App.jsx`)

公開ルート:
```
/                       → LandingPage
/login                  → LoginPage
/signup                 → SignupPage
/signup/complete        → SignupCompletePage
/signup/canceled        → SignupCanceledPage
/tokushoho              → 特商法
/*                      → MainApp (保護: セッション + プロファイル必須)
```

保護ルート (`SpanaviApp.jsx` の view state で dispatch):
- `/call-flow`, `/calling`, `/appointments`, `/roleplay`
- `/company-search`, `/crm`, `/stats`, `/admin`, `/manager`
- `/database`, `/my-page`, など 20+ ビュー

### 2.3 データフロー

**`useSpanaviData.jsx`** (~480 行):
- 起動時に clients, call_lists, members, appointments, reward_types, client_contacts を一括 fetch
- Supabase 行を**旧ハードコード形式に変換** (最小改修方針)
- `SpanaviApp` に渡して各ビューに分配

**状態管理**:
- Auth → React Context (`useAuth`)
- ブランディング → `useBranding` (CSS 変数)
- コールステータス → `useCallStatuses` (モジュールキャッシュ)
- Zoom トークン → localStorage

### 2.4 共有コンポーネント

| Component | 役割 |
|---|---|
| `SubscriptionGuard` | `organizations.plan_status` チェック (active/past_due/canceled) |
| `Layout` | サイドバー + ヘッダー |
| `PiPWidget` | フローティング通話ウィンドウ |
| `QuickAppoModal` | インラインアポ登録 |
| `InlineAudioPlayer` | 通話録音再生 (タイムスタンプ対応) |
| `ClientCalendarPanel` | Google Calendar busy slot 表示 |
| `DetailModal` | 汎用エンティティ inspector |

### 2.5 カスタムフック

| Hook | 役割 |
|---|---|
| `useAuth` | セッション + プロファイル + org_id |
| `useSpanaviData` | 全テナントデータ取得 |
| `useCallStatuses` | コール結果タイプ (org_settings) |
| `useBranding` | テナントロゴ・色 |
| `useZoomAuth` | Zoom OAuth 交換 |
| `useIsMobile` | レスポンシブ判定 |
| `useCompanySearch` | M&A 企業マスタ検索 |
| `useColumnConfig` | ユーザー定義列表示 |

---

## 3. 機能ドメイン

### 3.1 架電コア

**CallFlowView** (2,288 行):
- Zoom Smart Embed (iframe postMessage) で発信
- `call_records` にアウトカム記録 (カスタマイズ可能なステータス)
- 録音再生・文字起こし
- 手動録音URL入力フォールバック
- ユーザータグ付きメモシステム

**CallingScreen** (793 行):
- 電話番号入力 (貼付けクリーニング)
- 発信表示、通話時間追跡
- ステータスボタン → `call_record` 挿入

**Call Records / Appointments**:
- `call_records`: timestamp, outcome, recording_url, user_id, org_id
- `appointments`: 再コール予約 (meeting time/location)
- 録音ブックマーク: セグメント保存 + メモ

### 3.2 クライアント管理 (CRM)

**ClientManagement.jsx** (admin):
- `clients` CRUD
- フィールド: name, industry, status, supply_target, google_calendar_id, slack_webhook_url
- ソート順の永続化

**client_contacts** (担当者):
- クライアント別の意思決定者
- name, email, slack_member_id, google_calendar_id, scheduling_url (複数可)
- アポに紐付く

**CRMView**: クライアントパイプライン全体

### 3.3 アポイント・スケジュール

**AppoListView** (2,714 行):
- リスト + カレンダービュー
- アポ CRUD (insertAppointment, updateAppointment, deleteAppointment)
- AppoReportModal によるレポート
- Google Calendar + Slack 連携

**スケジュール機能**:
- Google Calendar OAuth → `gcal-proxy` edge function で busy slot チェック
- Slack にアポ作成通知
- 担当者ごとに複数の予約URL

### 3.4 ロープレ・トレーニング

**RoleplayView** (458 行):
- AI パートナーパターン: strict_reception, gentle_ceo, busy_ceo, interested_ceo, claim_ceo
- チャット形式の練習
- Google Calendar で ロープレセッション予約

**TrainingRoleplaySection** (1,369 行):
- 段階: day1_philosophy, day1_workflow, day2_final
- 録画 + AI フィードバック (`analyze-roleplay` edge function)
- ユーザーごとの進捗追跡

**Backend**:
- `training_progress`: stage_key, completed, passed
- `roleplay_sessions`: session_type, recording_path, recording_url, ai_feedback (JSONB), ai_status
- `roleplay_recordings` S3 bucket (RLS 設定済み)

### 3.5 録音・文字起こし

- Zoom Webhook → `receive-zoom-webhook` で録音メタ取得
- `transcribe-recording` (Deno + FFmpeg) → 文字起こし JSON
- 録音ブックマーク (`recording_bookmarks` テーブル)
- `upload-recording-to-drive` で Google Drive に保管
- `ClientReportPDF` で録音から PDF レポート生成

### 3.6 企業データベース (M&A sourcing)

**CompanySearchView** (1,830 行):
- `company_master` (50K+ 社) を検索
- フィルタ: 都市、業種、売上、従業員数、代表者名、株主種別
- TSR カテゴリマッチング (`known_corporate_shareholders`)
- ページング付き動的 SQL クエリ

**テーブル**:
- `company_master`: id, name, code, industry, city, employees, revenue, rep_name, headquarters, ...
- `tsr_category_master`: 業種分類
- `known_corporate_shareholders`: 法人株主ルール + 代表マッチング
- `search_company_master()`: 動的 PG 関数

### 3.7 パフォーマンス・分析

**StatsView** (1,004 行): チーム日次/週次/月次
**PerformanceView** (508 行): 個人メトリクス (ヒートマップ、円グラフ)
**Reports**:
- AppoReportModal
- CSV エクスポート

### 3.8 メンバー管理

**MemberManagement.jsx** (admin):
- CRUD: name, email, rank (caller/manager/admin), zoom_user_id, zoom_phone_number
- `sync-zoom-users` で Zoom Phone と同期
- 報酬割当 + 給与調整
- **メンバー追加/削除時に Stripe 席数自動同期**

### 3.9 課金 (Stripe)

**BillingSettings.jsx** (admin):
- Stripe customer + subscription ID
- 席数管理 (`stripe-update-seats`)
- plan_status: active / trialing / past_due / canceled / unpaid / none
- Stripe Customer Portal リンク

**SubscriptionGuard.jsx**:
- 未払/解約テナントをブロック (signup リダイレクト)
- legacy MASP org (stripe_customer_id = NULL) はバイパス
- past_due は利用可能 (警告バナー)

**料金**:
- 初期費用 110,000 円(税込) `price_1TF7h6CNR3pP6XRzlCTQhAQm`
- 月額 7,700 円/ユーザー(税込) `price_1TF7k1CNR3pP6XRzO0M2NZxQ`
- 現状サンドボックスモード (本番キー切替が残タスク)

### 3.10 ブランディング

**BrandingSettings.jsx**:
- ロゴURL → `org-logos` バケット
- primary / accent / highlight 色
- `org_settings.setting_key = 'brand_*'`

**useBranding**: CSS 変数 (--brand-primary 等) にマップ。デフォルトは Spanavi ブランド (Navy #032D60 / Blue #0176D3 / Gold #C8A84B)

### 3.11 ステータスカスタマイズ

**CallStatusSettings.jsx**:
- カスタムアウトカム定義 (id, label, color, bg, ceo_connect, excluded)
- `org_settings.setting_key = 'call_statuses'` に JSON
- ショートカット F1-F10 / Cmd+1-9 (Mac)

### 3.12 その他

| 機能 | ビュー | 備考 |
|---|---|---|
| 着信 | IncomingCallsView | Zoom webhook 経由 |
| 事前確認 | PreCheckView | 架電前のチェック |
| シフト | ShiftManagementView | チームスケジュール |
| 給与 | PayrollView | `payroll_adjustments` テーブル |
| 報酬 | RewardMasterView | インセンティブポイント |
| ルール | RulesView / InternRulesView | 架電ルール |
| スクリプト | ScriptView | ロープレマーカー対応 |
| 再コール | RecallListView | フォローアップキュー |
| Quick Appo | QuickAppoModal | スピード予約 |
| AI Assistant | AIAssistantView | 実験機能 (スタブ) |
| Tips | TeleappoTipsView | ユーザーガイド |
| Database | DatabaseView | 企業マスタ検索 UI |
| CSV Import | CSVPhoneList | 電話リスト一括 |
| Live Status | LiveStatusView | リアルタイム稼働 |
| My Page | MyPageView | プロファイル |
| Logs | LogView | イベントログ |

---

## 4. バックエンド (Supabase)

### 4.1 DB スキーマ概要

**コアテーブル**:

| テーブル | 用途 | 主要カラム |
|---|---|---|
| `organizations` | テナント | id (uuid), name, slug, stripe_customer_id, plan_status, seat_count, current_period_end |
| `members` | チームユーザー | id, org_id, user_id (auth), name, email, rank, zoom_user_id, zoom_phone_number |
| `clients` | M&A ターゲット | id, org_id, name, industry, status, supply_target, google_calendar_id, slack_webhook_url(_internal) |
| `client_contacts` | 意思決定者 | id, org_id, client_id, name, email, slack_member_id, google_calendar_id, scheduling_url(_2), scheduling_notes |
| `call_lists` | 架電キャンペーン | id, org_id, client_id, name, industry, status, total_count, manager_name, contact_ids[] |
| `call_list_items` | 見込み顧客 | id, org_id, list_id, list_no, phone, company, contact_name, status, memo, call_count, contacted_at, last_called_no |
| `call_records` | 架電アウトカム | id, org_id, user_id, call_list_item_id, status, duration, memo, recording_url, transcript |
| `appointments` | 再コール/会議 | id, org_id, client_id, contact_id, appointment_date, status, meeting_time, location, email_status |
| `training_progress` | 研修進捗 | user_id, org_id, stage_key, completed, passed |
| `roleplay_sessions` | ロープレ録画 | user_id, org_id, session_type, recording_url, ai_feedback (JSONB), ai_status |
| `org_settings` | テナント設定 | org_id, setting_key, setting_value (JSON) |
| `company_master` | M&A 企業DB | id, name, code, industry, city, employees, revenue, representative_name, headquarters, url |
| `known_corporate_shareholders` | 株主マッチング | org_id, representative_name, corporate_name, shareholder_type, match_type |
| `recording_bookmarks` | セグメント保存 | id, user_id, recording_url, company_name, note |
| `pending_signups` | 申込状態 | id, email, org_name, stripe_checkout_session_id, seat_count, status |
| `push_subscriptions` | Web push | id, user_id, subscription (JSONB) |
| `login_history` | セキュリティ監査 | user_id, ip_address, user_agent, login_at |
| `payroll_adjustments` | 給与調整 | id, org_id, member_id, amount, reason |
| `client_sheets` | Google Sheets 同期状態 | id, org_id, client_id, sheet_id, tab_name, sync_config |

### 4.2 RLS (テナント分離)

**中核関数**:
```sql
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid AS $$
  SELECT org_id FROM members
  WHERE user_id = auth.uid() OR email = auth.user().email
  LIMIT 1
$$ LANGUAGE sql;
```

全 org_id カラム持ちテーブルに `org_id = public.get_user_org_id()` ポリシー適用。
MASP 内部形式 (`user_<id>@masp-internal.com`) と実メール (外部テナント) の両対応が coalesce でされている。

### 4.3 Edge Functions (32個)

**Zoom**:
- `zoom-smart-embed-token` — OAuth code→token 交換
- `zoom-hangup` — 通話終了
- `receive-zoom-webhook` — 着信 + 録音メタ
- `sync-zoom-users` — Zoom アカウント→members 同期
- `get-zoom-recording` — 録音詳細取得

**架電**:
- `check-login` — 異常ログイン検知
- `generate-call-report` — AI コールサマリー
- `send-appo-report` — Slack 投稿

**アポ・通知**:
- `post-appo-to-slack`
- `appo-ai-report`
- `send-email` — SendGrid 経由アウトバウンド
- `send-push`, `notify-pre-check`, `notify-ranking`, `notify-team-report`

**録音・文字起こし**:
- `transcribe-recording` (60s, FFmpeg)
- `upload-recording-to-drive`

**Google**:
- `gcal-proxy` — カレンダー busy slot
- `upload-to-gdrive`
- `create-client-sheet`
- `sync-list-to-sheets` (双方向, 586 行)

**Stripe**:
- `stripe-webhook` — イベント処理
- `stripe-create-checkout` — 申込 checkout
- `stripe-customer-portal`
- `stripe-update-seats`

**ロープレ**:
- `analyze-roleplay` — AI フィードバック
- `post-roleplay-to-slack`

**その他**:
- `generate-company-info`
- `migrate-auth-to-email`
- `auto-close-sessions` — 古い call_sessions クリーンアップ

### 4.4 主要 Migration

**Auth & RLS 基盤**:
- `20260311000000-004`: ユーザーポリシー、プロファイル画像 RLS
- `20260325000000`: `get_user_org_id()` 動的 RLS
- `20260325000001`: organizations テーブル
- `20260325000002`: user_id + email 両対応

**マルチテナント**:
- `20260326000002`: Stripe 課金カラム + pending_signups

**コア**:
- `20260313000001`: org_settings (ステータス + ブランディング)
- `20260401000000`: client_contacts
- `20260403000000`: company_master + tsr_category_master
- `20260407000001`: payroll_adjustments

**研修・ロープレ**:
- `20260319000000`: training_progress, roleplay_sessions
- `20260319000001-009`: roleplay_recordings bucket RLS

**高度な機能**:
- `20260408000000-004`: recording_bookmarks, report styles, call_record 拡張
- `20260409100000-120000`: Google Sheets 同期 (client_sheets, sheet_sync_queue, sheet_sync_config)
- `20260409230000`: 株主分類 + 代表マッチング
- `20260410000000`: 代表者株主マッチフィルタ

### 4.5 Storage Buckets

| Bucket | 用途 | RLS |
|---|---|---|
| `org-logos` | テナントロゴ | org admin upload, public read |
| `roleplay_recordings` | ロープレ録画 | user upload own folder, admin read |
| `call_recordings` | (レガシー?) 架電録音 | - |

---

## 5. 連携

### 5.1 Zoom Phone

**Smart Embed**:
- OAuth: `zoom-smart-embed-token`
- iframe postMessage 制御 (`zoomPhoneStore.js`)
- Commands: `zp-make-call`, `zp-end-call`
- Events: `zp-call-ringing-event`, `zp-call-connected-event`, `zp-call-ended-event`

**録音同期**: webhook → `receive-zoom-webhook` → `get-zoom-recording` → `transcribe-recording`
**ユーザー同期**: `sync-zoom-users`

### 5.2 Google

- Calendar: `gcal-proxy` で busy slot チェック
- Drive: `upload-to-gdrive`, `upload-recording-to-drive`
- Sheets: `sync-list-to-sheets` (双方向, 586 行)
- クライアント予約URL、Drive フォルダ、Sheets テンプレ

### 5.3 Stripe

- シートベース SaaS
- Checkout → pending_signup → organization 生成
- webhook: `checkout.session.completed` → org プロビジョニング + admin 招待
- plan_status: active / trialing / past_due / canceled / unpaid / none
- `stripe-update-seats` で席数変更

**Webhook events**:
- `checkout.session.completed` — org 生成
- `customer.subscription.updated` — 席数/プラン変更
- `customer.subscription.deleted` — canceled にセット
- `invoice.payment_failed` — past_due 昇格

### 5.4 Slack

- アポ作成 → `clients.slack_webhook_url` または `_internal` へ投稿
- ロープレ完了 → `post-roleplay-to-slack`
- 日次チームレポート → `notify-team-report`
- `members.slack_member_id` で @mention

### 5.5 Email

`send-email` (157 行): SendGrid 等の SMTP proxy、HTML + 添付対応

### 5.6 セキュリティ監視

`check-login`: IP + user agent ログ、`login_history` に保存、異常フラグ

---

## 6. スクリプト・ツール

### 6.1 データ import/export (`scripts/`)

| スクリプト | 用途 | 言語 |
|---|---|---|
| `import-client-lists.py` | 架電キャンペーン一括 | Python |
| `import-csv-lists.py` | CSV 電話リスト | Python |
| `import-downloads.py` | M&A リスト処理 | Python |
| `export-company-master-csv.py` | 企業DB export | Python |
| `import-company-master.py` | 初期企業DBロード | Python |
| `format-noah-sheets.mjs` | Noah 財務DB 変換 | JS |
| `fetch-zoom-recording.mjs` | 録音一括DL | JS |
| `post-existing-to-slack.mjs` | Slack backfill | JS |
| `check-appo-state.mjs` | アポ状態監査 | JS |
| `setup-and-import.py` | テナントフルプロビジョニング | Python |

### 6.2 Build / Deploy

```bash
npm run dev      # Vite 3000 port, auto-open
npm run build    # → dist/
npm run preview  # production プレビュー
```

Vercel: main push で自動デプロイ、rewrite → /index.html、env は Vercel dashboard

---

## 7. 既知の負債・構造的課題

### 7.1 TODO / コメント

1. **Stripe webhook 署名検証** (`stripe-webhook/index.ts:39`)
   - コメント「TODO: 本番では有効化」 — 現状スキップ
2. **Zoom Smart Embed** (`SpanaviApp.jsx:33`)
   - ZoomPhoneEmbed コンポーネントはコメントアウト (Smart Embed 経由での架電不可のため)
   - postMessage ベース制御 (`zoomPhoneStore.js`) に代替
3. **AI ロープレ** (`RoleplayView.jsx:42`)
   - チャット応答は「（AI ロープレ機能は準備中です）」プレースホルダ
4. **旧形式変換** (`useSpanaviData.jsx`)
   - Supabase 行→ハードコード形式変換 (最小改修方針)
   - データモデル安定後は全 UI リライト候補

### 7.2 アーキテクチャ観察

**強み**:
- 強固な RLS 分離 (`get_user_org_id`)
- webhook 駆動 (Zoom, Stripe, Slack)
- PWA でオフライン対応
- 豊富なドメイン機能

**改善候補**:
- `supabaseWrite.js` が 2,482 行 → ドメイン別分割推奨 (calls, clients, appointments)
- Edge Functions にロギング/エラー処理の共通化なし
- 企業DB検索の動的SQLが複雑
- 文字起こしが client-side (FFmpeg WASM) で帯域負荷大
- core コールフローに Supabase Realtime 未使用

### 7.3 技術スタック成熟度

- React 18 / Vite 6: 安定
- Supabase: production-ready (RLS + Edge Functions)
- Stripe: 成熟
- Zoom Smart Embed: iframe 制約あり
- Google APIs: 標準 OAuth (rate limit 注意)

---

## 8. デプロイ・運用

### 8.1 ホスティング

- **Frontend**: Vercel (SPA)
- **Backend**: Supabase Cloud (PG + Edge Functions)
- **Storage**: Supabase S3 互換 bucket
- **Payments**: Stripe

### 8.2 環境変数 (`.env.local` / Vercel)

```
VITE_SUPABASE_URL=https://...supabase.co
VITE_SUPABASE_ANON_KEY=<anon>
VITE_ZOOM_SMART_EMBED_CLIENT_ID=<id>
STRIPE_SECRET_KEY=<secret>
STRIPE_WEBHOOK_SECRET=<secret>
(+ Google / Slack / SendGrid 資格)
```

**注意**: サーバー側で読む env は必ず `.trim()` する (Vercel 貼付けで改行混入 → invalid_client 事故あり)

### 8.3 Migration

```bash
supabase migration list
supabase migration up
```

---

## 9. 現況サマリ

Spanavi は M&A sourcing 向け架電管理 SaaS 本番プラットフォーム:

1. **マルチテナント**: Supabase RLS (org_id 分離)
2. **ドメイン機能**: 架電、アポ、研修 (ロープレ)、M&A DB 検索
3. **連携**: Zoom (WebRTC), Google (Calendar/Drive/Sheets), Stripe, Slack
4. **モダン FE**: React 18 + Vite + PWA
5. **サーバレス BE**: Supabase Edge Functions (Deno) + PostgreSQL RLS
6. **課金**: Stripe シート課金型 multi-org

現状は稼働中だが、構造改革フェーズに入っており、近日の migration (shareholder matching, sheets sync, company master 拡張) でアクティブに進化している。

### 次の主要マイルストーン

- Stripe Customer Portal 設定
- 本番 Stripe キー切替 (サンドボックス→本番)
- E2E テスト (申込→Checkout→テナント作成→招待→ログイン)
- ランディングページ LP 化 (spanavi.jp トップ)
- `supabaseWrite.js` 分割リファクタ
- AI ロープレ実装
- Zoom Smart Embed 代替案の確定
