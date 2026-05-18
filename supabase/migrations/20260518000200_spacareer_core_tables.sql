-- ============================================================
-- スパキャリ基盤構築 Migration 3/5: コア17テーブル作成
-- ----------------------------------------------------------------
-- 仕様書: tasks/spacareer-spec.md §4 - データモデル概要
-- テーブル命名: spacareer_* プレフィックス
-- 共通カラム: id (uuid PK) / org_id (FK organizations) / created_at / updated_at
-- ============================================================

set local search_path = public, extensions;

-- ----------------------------------------------------------------
-- 1. spacareer_customers - 受講生マスタ
-- ----------------------------------------------------------------
-- 受講生は members に 'student' rank で登録され、spacareer_customers と1:1で紐づく。
-- 既存認証基盤（useAuth）をそのまま使う。
create table if not exists public.spacareer_customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade unique,

  -- 編集可（受講生本人）
  nickname text,
  profile_image_url text,

  -- 編集不可（運営登録時に確定）
  birthdate date,
  occupation text,
  current_annual_income numeric,
  target_annual_income numeric,

  -- 契約情報
  contract_started_at timestamptz,
  contract_ended_at timestamptz,
  status text not null default 'pre_kickoff'
    check (status in ('pre_kickoff','in_progress','graduated','cancelled')),

  -- 進捗（spacareer_sessions と同期）
  current_session_no smallint not null default 0
    check (current_session_no between 0 and 8),
  progress_percent numeric(5,2) not null default 0
    check (progress_percent >= 0 and progress_percent <= 100),

  -- 担当トレーナー（手動アサイン、自動なし）
  assigned_trainer_id uuid references public.members(id) on delete set null,
  assigned_at timestamptz,

  -- 第4回突入時の直案件DB閲覧権限付与日時
  direct_db_access_granted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_spacareer_customers_org on public.spacareer_customers(org_id);
create index if not exists idx_spacareer_customers_member on public.spacareer_customers(member_id);
create index if not exists idx_spacareer_customers_trainer on public.spacareer_customers(assigned_trainer_id);
create index if not exists idx_spacareer_customers_status on public.spacareer_customers(status);

comment on table public.spacareer_customers is 'スパキャリ受講生マスタ。members と1:1。担当トレーナーは手動アサイン。';

-- ----------------------------------------------------------------
-- 2. spacareer_sessions - 第0〜8回セッション実体
-- ----------------------------------------------------------------
create table if not exists public.spacareer_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.spacareer_customers(id) on delete cascade,

  session_no smallint not null check (session_no between 0 and 8),
  scheduled_at timestamptz,        -- 予定日時（キックオフ時に決めた大枠日程）
  started_at timestamptz,          -- 実際に開始した日時
  completed_at timestamptz,        -- 完了ボタン押下日時
  zoom_url text,

  status text not null default 'not_started'
    check (status in ('not_started','next_up','completed')),

  -- セッション議事録（AI生成 → トレーナー編集）
  minutes_draft text,              -- AI議事録ドラフト
  minutes_final text,              -- トレーナー編集後の最終版
  hearing_sheet_json jsonb,        -- ヒアリングシートの構造化記録
  hearing_sheet_completed boolean not null default false,

  completed_by uuid references public.members(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (customer_id, session_no)
);
create index if not exists idx_spacareer_sessions_customer on public.spacareer_sessions(customer_id);
create index if not exists idx_spacareer_sessions_scheduled on public.spacareer_sessions(scheduled_at);
create index if not exists idx_spacareer_sessions_status on public.spacareer_sessions(status);

comment on table public.spacareer_sessions is '第0〜第8回のセッション実体。1顧客につき9行（status: not_started/next_up/completed）。';

-- ----------------------------------------------------------------
-- 3. spacareer_session_videos - セッション動画+AI議事録
-- ----------------------------------------------------------------
-- 既存 roleplay_sessions のパターンを踏襲。Storage バケット: spacareer-session-videos
create table if not exists public.spacareer_session_videos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.spacareer_sessions(id) on delete cascade,

  storage_path text,               -- Supabase Storage パス
  recording_url text,              -- 署名付きURL or 公開URL
  drive_file_id text,              -- Google Drive ID（既存ロープレと互換）
  duration_seconds integer,
  file_size_bytes bigint,

  ai_status text not null default 'pending'
    check (ai_status in ('pending','processing','done','error')),
  transcript text,                 -- Whisper 文字起こし
  ai_feedback jsonb,               -- Claude 整形済み議事録（構造化）
  ai_error text,                   -- 失敗時のエラーメッセージ

  uploaded_by uuid references public.members(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  processed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_spacareer_session_videos_session on public.spacareer_session_videos(session_id);
create index if not exists idx_spacareer_session_videos_status on public.spacareer_session_videos(ai_status);

comment on table public.spacareer_session_videos is 'セッション動画＋AI議事録（Whisper→Claude Haiku 4.5）。analyze-spacareer-session Edge Function で処理。';

-- ----------------------------------------------------------------
-- 4. spacareer_kickoff_checks - ヒアリングシート（第0回専用）
-- ----------------------------------------------------------------
create table if not exists public.spacareer_kickoff_checks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.spacareer_customers(id) on delete cascade unique,

  -- PDF §4.3.1〜4.3.9 の9項目
  check_unclear_points boolean not null default false,      -- 4.3.1
  check_session_content boolean not null default false,     -- 4.3.2
  check_refund_policy boolean not null default false,       -- 4.3.3
  check_reschedule_rules boolean not null default false,    -- 4.3.4
  check_weekly_pace boolean not null default false,         -- 4.3.5
  check_zoom_recording boolean not null default false,      -- 4.3.6
  check_schedule_done boolean not null default false,       -- 4.3.7
  check_all_sessions_dated boolean not null default false,  -- 4.3.8
  check_first_session_confirmed boolean not null default false, -- 4.3.9

  -- お客様からの質問記録
  customer_questions_log text,

  -- 第1〜第8回の大枠日程
  session_1_date date,
  session_2_date date,
  session_3_date date,
  session_4_date date,
  session_5_date date,
  session_6_date date,
  session_7_date date,
  session_8_date date,

  -- 第1回開始日時（時間含む）
  session_1_start_at timestamptz,

  completed_at timestamptz,
  completed_by uuid references public.members(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_spacareer_kickoff_checks_customer on public.spacareer_kickoff_checks(customer_id);

comment on table public.spacareer_kickoff_checks is 'キックオフ（第0回）のヒアリングシート。全項目チェック完了で「完了」ボタン押下可。';

-- ----------------------------------------------------------------
-- 5. spacareer_homework - 顧客×回の事前課題ヘッダ
-- ----------------------------------------------------------------
-- 第1回〜第8回前の事前課題（全8サイクル）。第0回には事前課題なし。
create table if not exists public.spacareer_homework (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.spacareer_customers(id) on delete cascade,
  session_id uuid not null references public.spacareer_sessions(id) on delete cascade,

  session_no smallint not null check (session_no between 1 and 8),

  status text not null default 'unnotified'
    check (status in ('unnotified','unsubmitted','partial','submitted','completed')),

  notified_at timestamptz,         -- 「完了・通知」押下日時（クライアントポータル公開時刻）
  due_at timestamptz,              -- 提出期限（次回セッションの3日前）
  submitted_at timestamptz,        -- 100%提出完了日時
  reviewed_at timestamptz,         -- トレーナーが全項目OK判定した日時

  ai_generated_at timestamptz,     -- AI30項目生成日時
  template_version integer,        -- 配信時点のテンプレ版数（変更時の固定用）

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (customer_id, session_no)
);
create index if not exists idx_spacareer_homework_customer on public.spacareer_homework(customer_id);
create index if not exists idx_spacareer_homework_session on public.spacareer_homework(session_id);
create index if not exists idx_spacareer_homework_status on public.spacareer_homework(status);
create index if not exists idx_spacareer_homework_due on public.spacareer_homework(due_at);

comment on table public.spacareer_homework is '顧客×第1〜8回の事前課題ヘッダ。配信時点のテンプレ版数を template_version で固定。';

-- ----------------------------------------------------------------
-- 6. spacareer_homework_items - 事前課題項目（回答・添付・OK判定）
-- ----------------------------------------------------------------
create table if not exists public.spacareer_homework_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  homework_id uuid not null references public.spacareer_homework(id) on delete cascade,

  position smallint not null,      -- 表示順
  question_text text not null,     -- 設問本文
  question_hint text,              -- 補助テキスト
  is_required boolean not null default true,
  max_length integer,              -- 文字数カウンタ上限

  answer_text text,                -- 受講生の回答
  attached_files jsonb,            -- 添付ファイル（最大3、URL/サイズ配列）

  submitted_at timestamptz,
  ok_judged boolean not null default false,
  ok_judged_at timestamptz,
  ok_judged_by uuid references public.members(id) on delete set null,
  trainer_comment text,            -- トレーナーが追記するコメント

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_spacareer_homework_items_homework on public.spacareer_homework_items(homework_id);
create index if not exists idx_spacareer_homework_items_position on public.spacareer_homework_items(homework_id, position);

comment on table public.spacareer_homework_items is '事前課題の項目単位レコード。受講生の回答・添付（最大3）・OK判定を保持。';

-- ----------------------------------------------------------------
-- 7. spacareer_session_feedbacks - 満足度アンケート
-- ----------------------------------------------------------------
create table if not exists public.spacareer_session_feedbacks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.spacareer_customers(id) on delete cascade,
  session_id uuid not null references public.spacareer_sessions(id) on delete cascade,

  satisfaction_score smallint check (satisfaction_score between 1 and 5),
  free_comment text,               -- 自由記述（必須）
  responses jsonb,                 -- その他設問の回答（構造化）

  due_at timestamptz,              -- 回答期限（期限後も回答可）
  submitted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (customer_id, session_id)
);
create index if not exists idx_spacareer_session_feedbacks_customer on public.spacareer_session_feedbacks(customer_id);
create index if not exists idx_spacareer_session_feedbacks_session on public.spacareer_session_feedbacks(session_id);

comment on table public.spacareer_session_feedbacks is 'セッション後の満足度アンケート。未提出は全額返金保証対象外（運用ルール）。';

-- ----------------------------------------------------------------
-- 8. spacareer_social_style_responses - ソーシャルスタイル診断回答
-- ----------------------------------------------------------------
create table if not exists public.spacareer_social_style_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.spacareer_customers(id) on delete cascade,

  -- 完了前は customer_id NULL（アカウント未生成）、token で識別
  invite_token text unique,
  invite_email text,               -- 招待先メアド（アカウント生成前）

  -- 30問の回答
  answers jsonb not null default '[]'::jsonb,
  current_question_no smallint not null default 0,  -- 中断・再開用

  -- 判定結果
  result_type text check (result_type in ('analytical','driver','expressive','amiable')),
  result_scores jsonb,             -- 各タイプのスコアバランス

  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_spacareer_social_style_customer on public.spacareer_social_style_responses(customer_id);
create index if not exists idx_spacareer_social_style_token on public.spacareer_social_style_responses(invite_token);

comment on table public.spacareer_social_style_responses is 'ソーシャルスタイル診断（30問4タイプ）。完了時に顧客アカウント自動生成。中断・再開対応。';

-- ----------------------------------------------------------------
-- 9. spacareer_strength_responses - 強み診断回答
-- ----------------------------------------------------------------
create table if not exists public.spacareer_strength_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.spacareer_customers(id) on delete cascade,

  answers jsonb not null default '[]'::jsonb,
  strengths jsonb,                 -- 抽出された強みの配列
  values_text text,                -- 価値観テキスト
  scores jsonb,                    -- スコアバランス

  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (customer_id)
);
create index if not exists idx_spacareer_strength_customer on public.spacareer_strength_responses(customer_id);

comment on table public.spacareer_strength_responses is '強み診断（第2回事前課題タイミングで実施）。プロフィールの「強み・価値観」タブに反映。';

-- ----------------------------------------------------------------
-- 10. spacareer_course_categories - 講座カテゴリ（運営自由追加）
-- ----------------------------------------------------------------
create table if not exists public.spacareer_course_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,

  name text not null,
  position integer not null default 0,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_spacareer_course_categories_org on public.spacareer_course_categories(org_id);
create index if not exists idx_spacareer_course_categories_position on public.spacareer_course_categories(position);

comment on table public.spacareer_course_categories is 'AI講座のカテゴリ。運営が自由追加・編集・並び替え可能。';

-- ----------------------------------------------------------------
-- 11. spacareer_course_videos - AI講座動画
-- ----------------------------------------------------------------
create table if not exists public.spacareer_course_videos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.spacareer_course_categories(id) on delete set null,

  title text not null,
  description text,
  duration_seconds integer,
  thumbnail_url text,

  storage_path text,               -- Supabase Storage
  video_url text,                  -- 再生用URL
  position integer not null default 0,  -- カテゴリ内並び順
  is_active boolean not null default true,

  uploaded_by uuid references public.members(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_spacareer_course_videos_category on public.spacareer_course_videos(category_id);
create index if not exists idx_spacareer_course_videos_position on public.spacareer_course_videos(category_id, position);

comment on table public.spacareer_course_videos is 'AI講座動画。全員一括配信、視聴80%以上で「視聴済み」判定。';

-- ----------------------------------------------------------------
-- 12. spacareer_video_views - 視聴ログ
-- ----------------------------------------------------------------
create table if not exists public.spacareer_video_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.spacareer_customers(id) on delete cascade,
  video_id uuid not null references public.spacareer_course_videos(id) on delete cascade,

  progress_percent numeric(5,2) not null default 0,
  watched_seconds integer not null default 0,
  status text not null default 'not_watched'
    check (status in ('not_watched','watching','watched')),

  first_viewed_at timestamptz,
  last_viewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (customer_id, video_id)
);
create index if not exists idx_spacareer_video_views_customer on public.spacareer_video_views(customer_id);
create index if not exists idx_spacareer_video_views_video on public.spacareer_video_views(video_id);
create index if not exists idx_spacareer_video_views_status on public.spacareer_video_views(status);

comment on table public.spacareer_video_views is '受講生×動画の視聴ログ。80%以上で status=watched。';

-- ----------------------------------------------------------------
-- 13. spacareer_video_favorites - お気に入り
-- ----------------------------------------------------------------
create table if not exists public.spacareer_video_favorites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.spacareer_customers(id) on delete cascade,
  video_id uuid not null references public.spacareer_course_videos(id) on delete cascade,

  created_at timestamptz not null default now(),

  unique (customer_id, video_id)
);
create index if not exists idx_spacareer_video_favorites_customer on public.spacareer_video_favorites(customer_id);
create index if not exists idx_spacareer_video_favorites_video on public.spacareer_video_favorites(video_id);

comment on table public.spacareer_video_favorites is '受講生のお気に入り動画。運営側はお気に入り数ランキングで需要分析。';

-- ----------------------------------------------------------------
-- 14. spacareer_templates - 11種テンプレマスタ
-- ----------------------------------------------------------------
-- type で区別: homework_1 / homework_base / ai_prompt / ok_criteria /
--             kickoff_hearing / session_feedback /
--             social_style_questions / social_style_descriptions /
--             notify_unstarted / notify_due / notify_published
create table if not exists public.spacareer_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,

  template_type text not null
    check (template_type in (
      'homework_1','homework_base','ai_prompt','ok_criteria',
      'kickoff_hearing','session_feedback',
      'social_style_questions','social_style_descriptions',
      'notify_unstarted','notify_due','notify_published'
    )),

  name text not null,
  content jsonb not null,          -- テンプレ本体（JSON構造）
  version integer not null default 1,

  is_active boolean not null default true,

  updated_by uuid references public.members(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (org_id, template_type, version)
);
create index if not exists idx_spacareer_templates_type on public.spacareer_templates(template_type, is_active);

comment on table public.spacareer_templates is '11種類のテンプレマスタ。version で履歴管理、is_active で無効化制御（物理削除なし）。';

-- ----------------------------------------------------------------
-- 15. spacareer_template_history - テンプレ編集履歴
-- ----------------------------------------------------------------
create table if not exists public.spacareer_template_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.spacareer_templates(id) on delete cascade,

  prev_content jsonb,
  new_content jsonb,
  changed_by uuid references public.members(id) on delete set null,
  changed_at timestamptz not null default now(),

  change_note text                 -- 任意のメモ
);
create index if not exists idx_spacareer_template_history_template on public.spacareer_template_history(template_id);
create index if not exists idx_spacareer_template_history_changed_at on public.spacareer_template_history(changed_at desc);

comment on table public.spacareer_template_history is 'テンプレ編集履歴。誰が・いつ・何を変えたかを保持。';

-- ----------------------------------------------------------------
-- 16. spacareer_slack_channels - 顧客ごとのSlackチャンネル
-- ----------------------------------------------------------------
create table if not exists public.spacareer_slack_channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.spacareer_customers(id) on delete cascade unique,

  channel_id text not null,        -- Slack channel ID
  channel_name text not null,      -- フルネーム漢字
  created_by uuid references public.members(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_spacareer_slack_channels_customer on public.spacareer_slack_channels(customer_id);
create index if not exists idx_spacareer_slack_channels_channel on public.spacareer_slack_channels(channel_id);

comment on table public.spacareer_slack_channels is '受講生ごとのSlackゲストチャンネル。顧客本人・担当トレーナー・運営の3者参加。';

-- ----------------------------------------------------------------
-- 17. spacareer_ai_usage_logs - AI機能利用ログ
-- ----------------------------------------------------------------
create table if not exists public.spacareer_ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.spacareer_customers(id) on delete set null,

  feature text not null
    check (feature in (
      'minutes_generation',          -- 議事録生成
      'homework_30items',            -- 事前課題30項目生成
      'social_style',                -- ソーシャルスタイル判定
      'strength_diagnosis',          -- 強み診断
      'phrase_extraction',           -- フレーズ抽出（あなたの原動力）
      'daily_message'                -- 今日のひとこと
    )),

  model text,                      -- claude-haiku-4-5-20251001 等
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(12,6),

  status text not null default 'success'
    check (status in ('success','error')),
  error_message text,

  created_at timestamptz not null default now()
);
create index if not exists idx_spacareer_ai_usage_logs_customer on public.spacareer_ai_usage_logs(customer_id);
create index if not exists idx_spacareer_ai_usage_logs_feature on public.spacareer_ai_usage_logs(feature);
create index if not exists idx_spacareer_ai_usage_logs_created on public.spacareer_ai_usage_logs(created_at desc);

comment on table public.spacareer_ai_usage_logs is 'AI機能利用ログ。設定>AI利用状況および分析レポート>AIコストタブで集計。';
