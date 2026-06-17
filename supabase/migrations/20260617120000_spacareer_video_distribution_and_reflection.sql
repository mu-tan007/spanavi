set local search_path = public, extensions;

-- ============================================================
-- AI講座: 動画の個別配信（assignment）＋視聴後アウトプット（reflection）
-- ------------------------------------------------------------
-- 1. spacareer_course_videos.audience を追加
--    'all'      … 全受講生に公開（従来動作・既定）
--    'assigned' … spacareer_video_assignments で指定した受講生のみに配信
-- 2. spacareer_video_assignments テーブル新設（動画×受講生の配信割当）
-- 3. spacareer_video_views に視聴後アウトプット欄（200文字程度）を追加
--    reflection_text          … 受講生が記入した「理解したこと/活かしたいこと」
--    reflection_submitted_at  … 保存日時
-- ============================================================

-- ------------------------------------------------------------
-- 1. 公開範囲フラグ
-- ------------------------------------------------------------
alter table public.spacareer_course_videos
  add column if not exists audience text not null default 'all';

comment on column public.spacareer_course_videos.audience is
  '公開範囲。all=全受講生に公開 / assigned=spacareer_video_assignmentsで指定した受講生のみ。';

-- ------------------------------------------------------------
-- 2. 配信割当テーブル
-- ------------------------------------------------------------
create table if not exists public.spacareer_video_assignments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  video_id    uuid not null references public.spacareer_course_videos(id) on delete cascade,
  customer_id uuid not null references public.spacareer_customers(id) on delete cascade,
  assigned_by uuid,
  assigned_at timestamptz not null default now(),
  unique (video_id, customer_id)
);

create index if not exists idx_spacareer_video_assignments_customer
  on public.spacareer_video_assignments (customer_id);
create index if not exists idx_spacareer_video_assignments_video
  on public.spacareer_video_assignments (video_id);

comment on table public.spacareer_video_assignments is
  'AI講座動画の個別配信割当。audience=assigned の動画を、どの受講生に配信したかを表す。';

alter table public.spacareer_video_assignments enable row level security;

-- 閲覧: org内で admin / 担当トレーナーの顧客 / 受講生本人
drop policy if exists spacareer_video_assignments_select on public.spacareer_video_assignments;
create policy spacareer_video_assignments_select on public.spacareer_video_assignments
  for select to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
      or customer_id = public.spacareer_current_customer_id()
    )
  );

-- 書込（配信/解除）: admin または 担当トレーナーのみ
drop policy if exists spacareer_video_assignments_write on public.spacareer_video_assignments;
create policy spacareer_video_assignments_write on public.spacareer_video_assignments
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

-- ------------------------------------------------------------
-- 3. 視聴後アウトプット欄
-- ------------------------------------------------------------
alter table public.spacareer_video_views
  add column if not exists reflection_text text,
  add column if not exists reflection_submitted_at timestamptz;

comment on column public.spacareer_video_views.reflection_text is
  '視聴後アウトプット（200文字程度）。動画を通じて理解したこと・今後活かしたいこと。';
comment on column public.spacareer_video_views.reflection_submitted_at is
  'アウトプットの保存日時。';
