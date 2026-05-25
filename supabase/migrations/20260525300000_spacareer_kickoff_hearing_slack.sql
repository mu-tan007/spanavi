-- ============================================================
-- スパキャリ キックオフヒアリング Slack自動配信基盤 (§9.1 / Phase F)
-- ----------------------------------------------------------------
-- 含むもの:
--   1. spacareer_kickoff_hearing_sessions.reminder_24h_sent_at 追加
--   2. 通知テンプレ3種を spacareer_templates にseed
--      - notify_kickoff_hearing_published    顧客向け配信通知
--      - notify_kickoff_hearing_reminder     顧客向け24h前リマインダー
--      - notify_kickoff_hearing_operator_digest 運営向けAI抽出ダイジェスト
--   3. pg_cron 'kickoff-hearing-reminder-hourly' 毎時実行ジョブ
--
-- 前提:
--   - kickoff-hearing-reminder Edge Function が本番にdeploy済 (Phase F-3/F-6)
--   - SLACK_BOT_TOKEN 環境変数設定済 (運営エンジニア作業)
--   - 受講生のSlackチャンネル(spacareer_slack_channels)が作成済
-- ============================================================

set local search_path = public, extensions;

-- ── 1. reminder_24h_sent_at カラム追加 ───────────────────────
alter table public.spacareer_kickoff_hearing_sessions
  add column if not exists reminder_24h_sent_at timestamptz;

comment on column public.spacareer_kickoff_hearing_sessions.reminder_24h_sent_at is
  '72h期限の24時間前リマインダー送信日時。重複送信防止に使用。';

-- ── 1.5. spacareer_templates.template_type CHECK拡張 ────────
alter table public.spacareer_templates
  drop constraint if exists spacareer_templates_template_type_check;
alter table public.spacareer_templates
  add constraint spacareer_templates_template_type_check
  check (template_type in (
    'homework_1','homework_base','ai_prompt','ok_criteria',
    'kickoff_hearing','session_feedback',
    'social_style_questions','social_style_descriptions',
    'notify_unstarted','notify_due','notify_published',
    -- §6.2A / Phase F: 第1回前70問キックオフヒアリング通知
    'notify_kickoff_hearing_published',
    'notify_kickoff_hearing_reminder',
    'notify_kickoff_hearing_operator_digest'
  ));

-- ── 2. 通知テンプレ3種seed (運営編集可) ─────────────────────
insert into public.spacareer_templates (org_id, template_type, name, content, version, is_active)
values
  (
    'a0000000-0000-0000-0000-000000000001',
    'notify_kickoff_hearing_published',
    'キックオフヒアリング配信通知（顧客向け）',
    jsonb_build_object('body',
      '{顧客名}様' || E'\n\n' ||
      'スパキャリへのお申し込みありがとうございます。' || E'\n' ||
      '第1回セッションを最大限有意義な時間にするため、事前ヒアリング（70問・所要60〜90分）をお送りします。' || E'\n\n' ||
      '回答ページ: {ヒアリングURL}' || E'\n' ||
      '提出期限: 初回アクセスから72時間以内' || E'\n\n' ||
      'お時間のあるときにご回答ください。途中保存も可能です。'
    ),
    1, true
  ),
  (
    'a0000000-0000-0000-0000-000000000001',
    'notify_kickoff_hearing_reminder',
    'キックオフヒアリング 期限24時間前リマインダー（顧客向け）',
    jsonb_build_object('body',
      '{顧客名}様' || E'\n\n' ||
      'キックオフヒアリングの提出期限まで残り24時間となりました。' || E'\n' ||
      '回答ページ: {ヒアリングURL}' || E'\n\n' ||
      '途中保存しているものがあれば、引き続きご記入をお願いします。'
    ),
    1, true
  ),
  (
    'a0000000-0000-0000-0000-000000000001',
    'notify_kickoff_hearing_operator_digest',
    'キックオフヒアリング AI抽出ダイジェスト（運営向け）',
    jsonb_build_object('body',
      ':bulb: キックオフヒアリング提出 + AI抽出完了' || E'\n\n' ||
      '顧客: {顧客名}' || E'\n' ||
      '提出日時: {提出日時}' || E'\n\n' ||
      '*重要発言ハイライト Top5*' || E'\n' ||
      '{ハイライト}' || E'\n\n' ||
      '*深掘り候補 3つ*' || E'\n' ||
      '{深掘り}' || E'\n\n' ||
      '詳細: {顧客個人ページURL}'
    ),
    1, true
  )
on conflict (org_id, template_type, version) do nothing;

-- ── 3. pg_cron 毎時リマインダー ─────────────────────────────
-- Spanavi本番のanon JWTをそのまま使用（既存パターン feedback_pgcron_jwt_debug 参照）。
-- Edge Function 内で SUPABASE_SERVICE_ROLE_KEY で書き込みを行うので、verify_jwt=false で問題なし。
do $$
begin
  -- 既存ジョブがあれば一度削除（idempotent化）
  perform cron.unschedule('kickoff-hearing-reminder-hourly')
  where exists (select 1 from cron.job where jobname = 'kickoff-hearing-reminder-hourly');
exception when others then null;
end $$;

select cron.schedule(
  'kickoff-hearing-reminder-hourly',
  '5 * * * *',  -- 毎時5分（他のcronと時刻分散）
  $cron$
  select net.http_post(
    url := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/kickoff-hearing-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g'
    ),
    body := '{}'::jsonb
  );
  $cron$
);
