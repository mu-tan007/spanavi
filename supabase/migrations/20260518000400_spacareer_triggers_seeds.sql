-- ============================================================
-- スパキャリ基盤構築 Migration 5/5: トリガー・関数・初期データ
-- ----------------------------------------------------------------
-- 仕様書: tasks/spacareer-spec.md §5 - 業務フロー全体
-- 内容:
--   1. updated_at 自動更新トリガー（17テーブル）
--   2. セッション完了時の進捗率・status 自動同期
--   3. 第4回開始時の直案件DB権限自動付与
--   4. 第8回完了時の卒業ステータス自動移行
--   5. 講座カテゴリ初期データ（9種）
--   6. テンプレマスター初期レコード（11種、空コンテンツ）
-- ============================================================

set local search_path = public, extensions;

-- ============================================================
-- 1. updated_at 自動更新トリガー（既存 tg_set_updated_at を流用）
-- ============================================================

do $$
declare
  t text;
  spacareer_tables text[] := array[
    'spacareer_customers',
    'spacareer_sessions',
    'spacareer_session_videos',
    'spacareer_kickoff_checks',
    'spacareer_homework',
    'spacareer_homework_items',
    'spacareer_session_feedbacks',
    'spacareer_social_style_responses',
    'spacareer_strength_responses',
    'spacareer_course_categories',
    'spacareer_course_videos',
    'spacareer_video_views',
    'spacareer_templates',
    'spacareer_slack_channels'
  ];
begin
  foreach t in array spacareer_tables loop
    execute format(
      'drop trigger if exists set_updated_at_%1$s on public.%1$s; '
      'create trigger set_updated_at_%1$s '
      'before update on public.%1$s '
      'for each row execute function public.tg_set_updated_at();',
      t
    );
  end loop;
end $$;

-- ============================================================
-- 2. セッション完了時の進捗率・current_session_no 自動同期
-- ============================================================
-- spacareer_sessions.status が 'completed' に変わったら、
-- spacareer_customers.current_session_no と progress_percent を更新する。
-- 進捗率 = 完了済セッション数 / 9 * 100 （第0〜第8回の全9セッション基準）

create or replace function public.fn_spacareer_sync_customer_progress()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_completed_count int;
  v_max_completed_no smallint;
begin
  select count(*)::int, coalesce(max(session_no), 0)
    into v_completed_count, v_max_completed_no
  from public.spacareer_sessions
  where customer_id = new.customer_id
    and status = 'completed';

  update public.spacareer_customers
  set current_session_no = v_max_completed_no,
      progress_percent = round((v_completed_count::numeric / 9.0) * 100, 2),
      -- 第8回完了で卒業ステータス
      status = case
        when v_completed_count >= 9 then 'graduated'
        when v_completed_count >= 1 then 'in_progress'
        else status
      end,
      -- 第4回突入確認（第3回完了 = 直案件DB権限付与の起点）
      direct_db_access_granted_at = case
        when v_max_completed_no >= 3 and direct_db_access_granted_at is null then now()
        else direct_db_access_granted_at
      end
  where id = new.customer_id;

  return new;
end;
$$;

drop trigger if exists trg_spacareer_sync_customer_progress on public.spacareer_sessions;
create trigger trg_spacareer_sync_customer_progress
  after insert or update of status on public.spacareer_sessions
  for each row
  when (new.status = 'completed')
  execute function public.fn_spacareer_sync_customer_progress();

comment on function public.fn_spacareer_sync_customer_progress() is
  'セッション完了時に顧客の進捗率・current_session_no・status・直案件DB権限を自動同期';

-- ============================================================
-- 3. spacareer_customers 新規作成時に第0〜第8回セッションを自動生成
-- ============================================================
create or replace function public.fn_spacareer_create_customer_sessions()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  i smallint;
begin
  for i in 0..8 loop
    insert into public.spacareer_sessions (org_id, customer_id, session_no, status)
    values (
      new.org_id,
      new.id,
      i,
      case when i = 0 then 'next_up' else 'not_started' end
    )
    on conflict (customer_id, session_no) do nothing;
  end loop;

  -- キックオフ管理レコードも自動生成
  insert into public.spacareer_kickoff_checks (org_id, customer_id)
  values (new.org_id, new.id)
  on conflict (customer_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_spacareer_create_customer_sessions on public.spacareer_customers;
create trigger trg_spacareer_create_customer_sessions
  after insert on public.spacareer_customers
  for each row
  execute function public.fn_spacareer_create_customer_sessions();

comment on function public.fn_spacareer_create_customer_sessions() is
  '受講生作成時に第0〜第8回の9セッションとキックオフチェックを自動生成';

-- ============================================================
-- 4. セッション完了時、次のセッションを 'next_up' にマーク
-- ============================================================
create or replace function public.fn_spacareer_advance_next_session()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- 次の番号のセッションを 'next_up' に
  if new.session_no < 8 then
    update public.spacareer_sessions
    set status = 'next_up'
    where customer_id = new.customer_id
      and session_no = new.session_no + 1
      and status = 'not_started';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_spacareer_advance_next_session on public.spacareer_sessions;
create trigger trg_spacareer_advance_next_session
  after update of status on public.spacareer_sessions
  for each row
  when (new.status = 'completed')
  execute function public.fn_spacareer_advance_next_session();

comment on function public.fn_spacareer_advance_next_session() is
  'セッション完了時に次番号のセッションを next_up にマーク';

-- ============================================================
-- 5. 講座カテゴリ初期データ（9種、MASP org_id）
-- ============================================================
-- 既存の MASP org_id (a0000000-0000-0000-0000-000000000001) を使用。
-- 他orgはあとから運営が手動で作る。
insert into public.spacareer_course_categories (org_id, name, position)
values
  ('a0000000-0000-0000-0000-000000000001', 'はじめに見てほしい動画', 0),
  ('a0000000-0000-0000-0000-000000000001', '基礎スキル編', 1),
  ('a0000000-0000-0000-0000-000000000001', 'プロンプト基礎', 2),
  ('a0000000-0000-0000-0000-000000000001', 'プロンプト実践', 3),
  ('a0000000-0000-0000-0000-000000000001', '情報収集', 4),
  ('a0000000-0000-0000-0000-000000000001', '文章作成', 5),
  ('a0000000-0000-0000-0000-000000000001', 'アイデア発想', 6),
  ('a0000000-0000-0000-0000-000000000001', '資料作成', 7),
  ('a0000000-0000-0000-0000-000000000001', '業務効率化', 8)
on conflict do nothing;

-- ============================================================
-- 6. テンプレマスター初期レコード（11種、空コンテンツ・version=1）
-- ============================================================
-- 内容は後段の実装フェーズで運営が編集する。ここでは枠だけ用意。
insert into public.spacareer_templates (org_id, template_type, name, content, version, is_active)
values
  ('a0000000-0000-0000-0000-000000000001', 'homework_1', '第1回事前課題（共通）', '{"items":[]}'::jsonb, 1, true),
  ('a0000000-0000-0000-0000-000000000001', 'homework_base', '第2〜8回事前課題ベース項目', '{"items":[]}'::jsonb, 1, true),
  ('a0000000-0000-0000-0000-000000000001', 'ai_prompt', 'AIプロンプト（30項目生成）', '{"prompt":""}'::jsonb, 1, true),
  ('a0000000-0000-0000-0000-000000000001', 'ok_criteria', 'OK判定基準', '{"criteria":[]}'::jsonb, 1, true),
  ('a0000000-0000-0000-0000-000000000001', 'kickoff_hearing', 'ヒアリングシートチェック項目', '{"items":[]}'::jsonb, 1, true),
  ('a0000000-0000-0000-0000-000000000001', 'session_feedback', 'セッション感想アンケート', '{"questions":[]}'::jsonb, 1, true),
  ('a0000000-0000-0000-0000-000000000001', 'social_style_questions', 'ソーシャルスタイル診断質問項目（30問）', '{"questions":[]}'::jsonb, 1, true),
  ('a0000000-0000-0000-0000-000000000001', 'social_style_descriptions', '各タイプの説明テキスト', '{"types":{}}'::jsonb, 1, true),
  ('a0000000-0000-0000-0000-000000000001', 'notify_unstarted', '事前課題未着手リマインド', '{"text":""}'::jsonb, 1, true),
  ('a0000000-0000-0000-0000-000000000001', 'notify_due', '締切リマインド', '{"text":""}'::jsonb, 1, true),
  ('a0000000-0000-0000-0000-000000000001', 'notify_published', 'クライアントポータル反映通知', '{"text":""}'::jsonb, 1, true)
on conflict (org_id, template_type, version) do nothing;
