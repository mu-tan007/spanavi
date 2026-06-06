-- ============================================================
-- スパキャリ受講生 ソーシャルスタイル診断 オンボーディング刷新
-- ----------------------------------------------------------------
-- 仕様書: tasks/spacareer-social-style-onboarding.md Phase 1
--
-- 内容:
--   1. spacareer_customers にソーシャルスタイル診断結果のキャッシュ列追加
--      （顧客一覧のタイプバッジ表示と「未受講なら強制リダイレクト」判定の高速化）
--   2. spacareer_social_style_responses.completed_at セット時に
--      spacareer_customers の上記列を自動同期するトリガ
--   3. RLS: 受講生本人が自分の診断 response を読み書きできるようポリシー追加
-- ============================================================

set local search_path = public, extensions;

-- ============================================================
-- 1. キャッシュ列
-- ============================================================
alter table public.spacareer_customers
  add column if not exists social_style_completed_at timestamptz,
  add column if not exists social_style_type text;

comment on column public.spacareer_customers.social_style_completed_at is
  'ソーシャルスタイル診断の完了日時。spacareer_social_style_responses.completed_at から自動同期。';
comment on column public.spacareer_customers.social_style_type is
  'ソーシャルスタイル判定タイプ（analytical/driver/expressive/amiable）。診断完了時に自動同期。';

create index if not exists idx_spacareer_customers_social_style_completed
  on public.spacareer_customers (org_id, social_style_completed_at);

-- ============================================================
-- 2. 自動同期トリガ
-- ============================================================
create or replace function public.fn_spacareer_sync_customer_social_style()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.customer_id is null then
    return new;
  end if;

  if new.completed_at is distinct from old.completed_at
     or new.result_type is distinct from old.result_type then
    update public.spacareer_customers
    set social_style_completed_at = new.completed_at,
        social_style_type         = new.result_type
    where id = new.customer_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_spacareer_sync_customer_social_style on public.spacareer_social_style_responses;
create trigger trg_spacareer_sync_customer_social_style
  after update of completed_at, result_type, customer_id on public.spacareer_social_style_responses
  for each row
  execute function public.fn_spacareer_sync_customer_social_style();

comment on function public.fn_spacareer_sync_customer_social_style() is
  'ソーシャルスタイル診断完了時に spacareer_customers のキャッシュ列を同期';

-- ============================================================
-- 3. RLS: 受講生本人の self read/write
-- ----------------------------------------------------------------
-- 既存ポリシーは「運営が org 単位で全件読み書き」を前提に組まれている想定。
-- ここでは「受講生本人が自分の response を読み・回答更新できる」ポリシーのみ追加する。
-- ============================================================

drop policy if exists spacareer_social_style_self_select
  on public.spacareer_social_style_responses;
create policy spacareer_social_style_self_select
  on public.spacareer_social_style_responses
  for select
  to authenticated
  using (
    customer_id in (
      select sc.id
      from public.spacareer_customers sc
      join public.members m on m.id = sc.member_id
      where m.user_id = auth.uid()
    )
  );

drop policy if exists spacareer_social_style_self_update
  on public.spacareer_social_style_responses;
create policy spacareer_social_style_self_update
  on public.spacareer_social_style_responses
  for update
  to authenticated
  using (
    customer_id in (
      select sc.id
      from public.spacareer_customers sc
      join public.members m on m.id = sc.member_id
      where m.user_id = auth.uid()
    )
  )
  with check (
    customer_id in (
      select sc.id
      from public.spacareer_customers sc
      join public.members m on m.id = sc.member_id
      where m.user_id = auth.uid()
    )
  );

comment on policy spacareer_social_style_self_select on public.spacareer_social_style_responses is
  '受講生本人は自分の診断 response を読める';
comment on policy spacareer_social_style_self_update on public.spacareer_social_style_responses is
  '受講生本人は自分の診断 response の回答を更新できる（answers / current_question_no / completed_at / result_*）';
