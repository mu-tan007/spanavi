-- ============================================================
-- スパキャリ基盤構築 Migration 4/5: RLS ポリシー
-- ----------------------------------------------------------------
-- 仕様書: tasks/spacareer-spec.md §2.2 - 権限マトリクス
-- ロール:
--   admin    (public.users.role = 'admin')        - 全許可
--   trainer  (members.id = assigned_trainer_id)   - 担当顧客のみ
--   student  (members.id = customer.member_id)    - 自分のみ
-- ============================================================

set local search_path = public, extensions;

-- ============================================================
-- ヘルパー関数
-- ============================================================

-- 現在の auth ユーザーが admin か判定
create or replace function public.spacareer_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.users
    where users.id = auth.uid() and users.role = 'admin'
  );
$$;

-- 現在の auth ユーザーに対応する members.id を返す
create or replace function public.spacareer_current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    (
      select m.id from public.members m
      where m.id::text = substring(
        (select email from auth.users where id = auth.uid())
        from 'user_(.+)@'
      )
    ),
    (
      select m.id from public.members m
      where m.email = (select email from auth.users where id = auth.uid())
    )
  );
$$;

-- 現在の auth ユーザーに対応する spacareer_customers.id を返す（受講生本人用）
create or replace function public.spacareer_current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select c.id from public.spacareer_customers c
  where c.member_id = public.spacareer_current_member_id();
$$;

-- 現在の auth ユーザーがトレーナーとして担当している customer_id 集合
create or replace function public.spacareer_trainer_customer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select c.id from public.spacareer_customers c
  where c.assigned_trainer_id = public.spacareer_current_member_id();
$$;

comment on function public.spacareer_is_admin() is 'auth.uid() が admin ロールか判定';
comment on function public.spacareer_current_member_id() is 'auth.uid() に対応する members.id を返す（内部ユーザー/外部ユーザー両対応）';

-- ============================================================
-- RLS 有効化 + ポリシー（17テーブル）
-- ============================================================

-- ----------------------------------------------------------------
-- 1. spacareer_customers
-- ----------------------------------------------------------------
alter table public.spacareer_customers enable row level security;

drop policy if exists spacareer_customers_select on public.spacareer_customers;
create policy spacareer_customers_select on public.spacareer_customers
  for select to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or assigned_trainer_id = public.spacareer_current_member_id()
      or member_id = public.spacareer_current_member_id()
    )
  );

drop policy if exists spacareer_customers_insert on public.spacareer_customers;
create policy spacareer_customers_insert on public.spacareer_customers
  for insert to authenticated
  with check (org_id = public.get_user_org_id() and public.spacareer_is_admin());

drop policy if exists spacareer_customers_update on public.spacareer_customers;
create policy spacareer_customers_update on public.spacareer_customers
  for update to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or assigned_trainer_id = public.spacareer_current_member_id()
      or member_id = public.spacareer_current_member_id()
    )
  );

drop policy if exists spacareer_customers_delete on public.spacareer_customers;
create policy spacareer_customers_delete on public.spacareer_customers
  for delete to authenticated
  using (org_id = public.get_user_org_id() and public.spacareer_is_admin());

-- ----------------------------------------------------------------
-- 2. spacareer_sessions
-- ----------------------------------------------------------------
alter table public.spacareer_sessions enable row level security;

drop policy if exists spacareer_sessions_select on public.spacareer_sessions;
create policy spacareer_sessions_select on public.spacareer_sessions
  for select to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
      or customer_id = public.spacareer_current_customer_id()
    )
  );

drop policy if exists spacareer_sessions_write on public.spacareer_sessions;
create policy spacareer_sessions_write on public.spacareer_sessions
  for all to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
    )
  )
  with check (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
    )
  );

-- ----------------------------------------------------------------
-- 3. spacareer_session_videos（受講生は不可、議事録は session.minutes_final 経由）
-- ----------------------------------------------------------------
alter table public.spacareer_session_videos enable row level security;

drop policy if exists spacareer_session_videos_all on public.spacareer_session_videos;
create policy spacareer_session_videos_all on public.spacareer_session_videos
  for all to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or session_id in (
        select s.id from public.spacareer_sessions s
        where s.customer_id in (select public.spacareer_trainer_customer_ids())
      )
    )
  )
  with check (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or session_id in (
        select s.id from public.spacareer_sessions s
        where s.customer_id in (select public.spacareer_trainer_customer_ids())
      )
    )
  );

-- ----------------------------------------------------------------
-- 4. spacareer_kickoff_checks（受講生は不可）
-- ----------------------------------------------------------------
alter table public.spacareer_kickoff_checks enable row level security;

drop policy if exists spacareer_kickoff_checks_all on public.spacareer_kickoff_checks;
create policy spacareer_kickoff_checks_all on public.spacareer_kickoff_checks
  for all to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
    )
  )
  with check (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
    )
  );

-- ----------------------------------------------------------------
-- 5. spacareer_homework
-- ----------------------------------------------------------------
alter table public.spacareer_homework enable row level security;

drop policy if exists spacareer_homework_select on public.spacareer_homework;
create policy spacareer_homework_select on public.spacareer_homework
  for select to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
      or (customer_id = public.spacareer_current_customer_id() and notified_at is not null)
    )
  );

drop policy if exists spacareer_homework_write on public.spacareer_homework;
create policy spacareer_homework_write on public.spacareer_homework
  for all to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
    )
  )
  with check (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
    )
  );

-- ----------------------------------------------------------------
-- 6. spacareer_homework_items（受講生は自分の項目に回答可）
-- ----------------------------------------------------------------
alter table public.spacareer_homework_items enable row level security;

drop policy if exists spacareer_homework_items_select on public.spacareer_homework_items;
create policy spacareer_homework_items_select on public.spacareer_homework_items
  for select to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or homework_id in (
        select h.id from public.spacareer_homework h
        where h.customer_id in (select public.spacareer_trainer_customer_ids())
      )
      or homework_id in (
        select h.id from public.spacareer_homework h
        where h.customer_id = public.spacareer_current_customer_id()
          and h.notified_at is not null
      )
    )
  );

drop policy if exists spacareer_homework_items_update on public.spacareer_homework_items;
create policy spacareer_homework_items_update on public.spacareer_homework_items
  for update to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or homework_id in (
        select h.id from public.spacareer_homework h
        where h.customer_id in (select public.spacareer_trainer_customer_ids())
      )
      or homework_id in (
        select h.id from public.spacareer_homework h
        where h.customer_id = public.spacareer_current_customer_id()
          and h.notified_at is not null
      )
    )
  );

drop policy if exists spacareer_homework_items_admin_write on public.spacareer_homework_items;
create policy spacareer_homework_items_admin_write on public.spacareer_homework_items
  for insert to authenticated
  with check (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or homework_id in (
        select h.id from public.spacareer_homework h
        where h.customer_id in (select public.spacareer_trainer_customer_ids())
      )
    )
  );

drop policy if exists spacareer_homework_items_delete on public.spacareer_homework_items;
create policy spacareer_homework_items_delete on public.spacareer_homework_items
  for delete to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or homework_id in (
        select h.id from public.spacareer_homework h
        where h.customer_id in (select public.spacareer_trainer_customer_ids())
      )
    )
  );

-- ----------------------------------------------------------------
-- 7. spacareer_session_feedbacks（受講生本人が回答）
-- ----------------------------------------------------------------
alter table public.spacareer_session_feedbacks enable row level security;

drop policy if exists spacareer_session_feedbacks_all on public.spacareer_session_feedbacks;
create policy spacareer_session_feedbacks_all on public.spacareer_session_feedbacks
  for all to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
      or customer_id = public.spacareer_current_customer_id()
    )
  )
  with check (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
      or customer_id = public.spacareer_current_customer_id()
    )
  );

-- ----------------------------------------------------------------
-- 8. spacareer_social_style_responses
-- ----------------------------------------------------------------
alter table public.spacareer_social_style_responses enable row level security;

drop policy if exists spacareer_social_style_select on public.spacareer_social_style_responses;
create policy spacareer_social_style_select on public.spacareer_social_style_responses
  for select to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or (customer_id is not null and customer_id in (select public.spacareer_trainer_customer_ids()))
      or (customer_id is not null and customer_id = public.spacareer_current_customer_id())
    )
  );

drop policy if exists spacareer_social_style_write on public.spacareer_social_style_responses;
create policy spacareer_social_style_write on public.spacareer_social_style_responses
  for all to authenticated
  using (org_id = public.get_user_org_id() and public.spacareer_is_admin())
  with check (org_id = public.get_user_org_id() and public.spacareer_is_admin());

-- ----------------------------------------------------------------
-- 9. spacareer_strength_responses
-- ----------------------------------------------------------------
alter table public.spacareer_strength_responses enable row level security;

drop policy if exists spacareer_strength_all on public.spacareer_strength_responses;
create policy spacareer_strength_all on public.spacareer_strength_responses
  for all to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
      or customer_id = public.spacareer_current_customer_id()
    )
  )
  with check (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
      or customer_id = public.spacareer_current_customer_id()
    )
  );

-- ----------------------------------------------------------------
-- 10-11. course_categories / course_videos（全員 select 可、編集は admin のみ）
-- ----------------------------------------------------------------
alter table public.spacareer_course_categories enable row level security;
alter table public.spacareer_course_videos enable row level security;

drop policy if exists spacareer_course_categories_select on public.spacareer_course_categories;
create policy spacareer_course_categories_select on public.spacareer_course_categories
  for select to authenticated
  using (org_id = public.get_user_org_id());

drop policy if exists spacareer_course_categories_admin_write on public.spacareer_course_categories;
create policy spacareer_course_categories_admin_write on public.spacareer_course_categories
  for all to authenticated
  using (org_id = public.get_user_org_id() and public.spacareer_is_admin())
  with check (org_id = public.get_user_org_id() and public.spacareer_is_admin());

drop policy if exists spacareer_course_videos_select on public.spacareer_course_videos;
create policy spacareer_course_videos_select on public.spacareer_course_videos
  for select to authenticated
  using (org_id = public.get_user_org_id());

drop policy if exists spacareer_course_videos_admin_write on public.spacareer_course_videos;
create policy spacareer_course_videos_admin_write on public.spacareer_course_videos
  for all to authenticated
  using (org_id = public.get_user_org_id() and public.spacareer_is_admin())
  with check (org_id = public.get_user_org_id() and public.spacareer_is_admin());

-- ----------------------------------------------------------------
-- 12-13. video_views / video_favorites（受講生本人のみ書込）
-- ----------------------------------------------------------------
alter table public.spacareer_video_views enable row level security;
alter table public.spacareer_video_favorites enable row level security;

drop policy if exists spacareer_video_views_all on public.spacareer_video_views;
create policy spacareer_video_views_all on public.spacareer_video_views
  for all to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
      or customer_id = public.spacareer_current_customer_id()
    )
  )
  with check (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id = public.spacareer_current_customer_id()
    )
  );

drop policy if exists spacareer_video_favorites_all on public.spacareer_video_favorites;
create policy spacareer_video_favorites_all on public.spacareer_video_favorites
  for all to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
      or customer_id = public.spacareer_current_customer_id()
    )
  )
  with check (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id = public.spacareer_current_customer_id()
    )
  );

-- ----------------------------------------------------------------
-- 14. spacareer_templates
-- ----------------------------------------------------------------
-- 編集権限の詳細（運営のみ編集可な4種 / トレーナーも編集可な7種）はアプリ層で制御。
-- ここでは「テンプレ閲覧は org 内で誰でも、編集は admin」とし、
-- トレーナーの編集はアプリ層で template_type をフィルタしながら admin RPC 経由で行う想定。
-- もしくは将来 trainer_can_edit カラムを増やして RLS で分岐させる。
alter table public.spacareer_templates enable row level security;

drop policy if exists spacareer_templates_select on public.spacareer_templates;
create policy spacareer_templates_select on public.spacareer_templates
  for select to authenticated
  using (org_id = public.get_user_org_id());

drop policy if exists spacareer_templates_admin_write on public.spacareer_templates;
create policy spacareer_templates_admin_write on public.spacareer_templates
  for all to authenticated
  using (org_id = public.get_user_org_id() and public.spacareer_is_admin())
  with check (org_id = public.get_user_org_id() and public.spacareer_is_admin());

-- ----------------------------------------------------------------
-- 15. spacareer_template_history（admin のみ閲覧）
-- ----------------------------------------------------------------
alter table public.spacareer_template_history enable row level security;

drop policy if exists spacareer_template_history_admin on public.spacareer_template_history;
create policy spacareer_template_history_admin on public.spacareer_template_history
  for all to authenticated
  using (org_id = public.get_user_org_id() and public.spacareer_is_admin())
  with check (org_id = public.get_user_org_id() and public.spacareer_is_admin());

-- ----------------------------------------------------------------
-- 16. spacareer_slack_channels
-- ----------------------------------------------------------------
alter table public.spacareer_slack_channels enable row level security;

drop policy if exists spacareer_slack_channels_all on public.spacareer_slack_channels;
create policy spacareer_slack_channels_all on public.spacareer_slack_channels
  for all to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
    )
  )
  with check (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
    )
  );

-- ----------------------------------------------------------------
-- 17. spacareer_ai_usage_logs（admin のみ閲覧）
-- ----------------------------------------------------------------
alter table public.spacareer_ai_usage_logs enable row level security;

drop policy if exists spacareer_ai_usage_logs_admin on public.spacareer_ai_usage_logs;
create policy spacareer_ai_usage_logs_admin on public.spacareer_ai_usage_logs
  for select to authenticated
  using (org_id = public.get_user_org_id() and public.spacareer_is_admin());

drop policy if exists spacareer_ai_usage_logs_insert on public.spacareer_ai_usage_logs;
create policy spacareer_ai_usage_logs_insert on public.spacareer_ai_usage_logs
  for insert to authenticated
  with check (org_id = public.get_user_org_id());
