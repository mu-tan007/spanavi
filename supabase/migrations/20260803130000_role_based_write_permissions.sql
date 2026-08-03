-- ============================================================
-- 権限の絞り込み（2026-08-03 むー様指示）
-- ----------------------------------------------------------------
-- これまで RLS は「同じ組織なら誰でも読み書きできる」だけだったため、
-- 一般メンバーでも他人の報酬額の閲覧・書き換え、インセンティブ率の変更、
-- 他人のアポの編集・削除ができる状態だった。
--
-- 決めた方針:
--   - チームリーダー・営業統括に固有の書き込み権限は与えない
--   - 一般メンバーは「自分のもの」だけ触れる
--   - お金と実績に関わる操作はすべて管理者(users.role='admin')のみ
--
-- 適用は業務時間外に行うこと（架電・アポ登録が止まるリスクがあるため）。
-- ============================================================

-- ── 判定ヘルパー ────────────────────────────────────────────────
-- RLS のポリシー内から users を参照すると users 側の RLS に引っかかるため
-- SECURITY DEFINER で回避する。
create or replace function public.is_org_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  );
$$;

-- ログイン中のユーザーに対応する members.id
create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select id from public.members
  where user_id = auth.uid() and is_active is distinct from false
  limit 1;
$$;

-- ログイン中のユーザーの氏名（appointments.getter_name / payroll_snapshots.member_name は
-- ID ではなく氏名で紐づいているため必要）
create or replace function public.current_member_name()
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select name from public.members
  where user_id = auth.uid() and is_active is distinct from false
  limit 1;
$$;

grant execute on function public.is_org_admin() to authenticated;
grant execute on function public.current_member_id() to authenticated;
grant execute on function public.current_member_name() to authenticated;

-- ============================================================
-- 1. payroll_snapshots（確定済みの報酬額）
--    閲覧: 本人の行 + 管理者。書き込み: 管理者のみ
-- ============================================================
drop policy if exists payroll_snapshots_select_own_org on public.payroll_snapshots;
drop policy if exists payroll_snapshots_insert_own_org on public.payroll_snapshots;
drop policy if exists payroll_snapshots_update_own_org on public.payroll_snapshots;
drop policy if exists payroll_snapshots_delete_own_org on public.payroll_snapshots;

create policy payroll_snapshots_select on public.payroll_snapshots
  for select to authenticated
  using (
    org_id = (public.get_user_org_id())::text
    and (public.is_org_admin() or member_name = public.current_member_name())
  );

create policy payroll_snapshots_write_admin on public.payroll_snapshots
  for all to authenticated
  using (org_id = (public.get_user_org_id())::text and public.is_org_admin())
  with check (org_id = (public.get_user_org_id())::text and public.is_org_admin());

-- ============================================================
-- 2. payroll_adjustments（月次のディスカウント）: 管理者のみ
-- ============================================================
drop policy if exists payroll_adjustments_select on public.payroll_adjustments;
drop policy if exists payroll_adjustments_insert on public.payroll_adjustments;
drop policy if exists payroll_adjustments_update on public.payroll_adjustments;
drop policy if exists payroll_adjustments_delete on public.payroll_adjustments;

create policy payroll_adjustments_admin_only on public.payroll_adjustments
  for all to authenticated
  using (org_id = public.get_user_org_id() and public.is_org_admin())
  with check (org_id = public.get_user_org_id() and public.is_org_admin());

-- ============================================================
-- 3. members（名簿）
--    - 誰でも読める設定(USING true)を外し、同じ組織のログイン利用者だけに絞る
--    - 更新は「本人が自分のプロフィール列だけ」または管理者
--      列単位の制限は RLS では書けないためトリガーで担保する
-- ============================================================
drop policy if exists members_public_select on public.members;
drop policy if exists members_update_same_org on public.members;
drop policy if exists members_delete_same_org on public.members;
drop policy if exists members_insert_own_org on public.members;

create policy members_select_same_org on public.members
  for select to authenticated
  using (org_id = public.get_user_org_id());

create policy members_update_self_or_admin on public.members
  for update to authenticated
  using (org_id = public.get_user_org_id() and (public.is_org_admin() or user_id = auth.uid()))
  with check (org_id = public.get_user_org_id() and (public.is_org_admin() or user_id = auth.uid()));

create policy members_insert_admin on public.members
  for insert to authenticated
  with check (org_id = public.get_user_org_id() and public.is_org_admin());

create policy members_delete_admin on public.members
  for delete to authenticated
  using (org_id = public.get_user_org_id() and public.is_org_admin());

-- 本人が変更してよいのは氏名・メール・電話・アバターのみ。
-- 累計売上・ランク・インセンティブ率・チーム・役職・稼働可否は管理者だけが動かせる。
create or replace function public.members_guard_protected_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if public.is_org_admin() then
    return new;
  end if;
  if new.cumulative_sales is distinct from old.cumulative_sales
     or new.rank is distinct from old.rank
     or new.incentive_rate is distinct from old.incentive_rate
     or new.team is distinct from old.team
     or new.position is distinct from old.position
     or new.is_active is distinct from old.is_active
     or new.org_id is distinct from old.org_id
     or new.user_id is distinct from old.user_id
     or new.referral_paid_pay_month is distinct from old.referral_paid_pay_month
     or new.referrer_name is distinct from old.referrer_name
     or new.operation_start_date is distinct from old.operation_start_date then
    raise exception '報酬・所属に関わる項目は管理者のみ変更できます';
  end if;
  return new;
end;
$$;

drop trigger if exists members_guard_protected_columns_trg on public.members;
create trigger members_guard_protected_columns_trg
  before update on public.members
  for each row execute function public.members_guard_protected_columns();

-- ============================================================
-- 4. appointments
--    - 登録: 誰でも可（架電業務のため）
--    - 更新: 自分が取ったアポのみ。売上・面談日・報酬額・取得者は管理者のみ
--    - 削除: 管理者のみ
-- ============================================================
-- クライアントポータル用の appointments_select_client は残す（外部クライアントの閲覧用）
drop policy if exists appointments_select_own_org on public.appointments;
drop policy if exists appointments_insert_own_org on public.appointments;
drop policy if exists appointments_update_own_org on public.appointments;
drop policy if exists appo_delete on public.appointments;

create policy appointments_select on public.appointments
  for select to authenticated
  using (org_id = public.get_user_org_id());

create policy appointments_insert on public.appointments
  for insert to authenticated
  with check (org_id = public.get_user_org_id());

create policy appointments_update on public.appointments
  for update to authenticated
  using (
    org_id = public.get_user_org_id()
    and (public.is_org_admin() or getter_name = public.current_member_name())
  )
  with check (org_id = public.get_user_org_id());

create policy appointments_delete_admin on public.appointments
  for delete to authenticated
  using (org_id = public.get_user_org_id() and public.is_org_admin());

create or replace function public.appointments_guard_protected_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if public.is_org_admin() then
    return new;
  end if;
  if new.sales_amount is distinct from old.sales_amount
     or new.intern_reward is distinct from old.intern_reward
     or new.meeting_date is distinct from old.meeting_date
     or new.getter_name is distinct from old.getter_name
     or new.appointment_date is distinct from old.appointment_date
     or new.client_id is distinct from old.client_id then
    raise exception '売上・面談日・取得者の変更は管理者のみ行えます';
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_guard_protected_columns_trg on public.appointments;
create trigger appointments_guard_protected_columns_trg
  before update on public.appointments
  for each row execute function public.appointments_guard_protected_columns();

-- ============================================================
-- 5. call_sessions（架電セッション）
--    架電中の開始・更新は本人が行う。他人の履歴の書き換えと削除は管理者のみ
-- ============================================================
drop policy if exists call_sessions_select_own_org on public.call_sessions;
drop policy if exists call_sessions_insert_own_org on public.call_sessions;
drop policy if exists call_sessions_update_own_org on public.call_sessions;
drop policy if exists call_sessions_delete_own_org on public.call_sessions;

create policy call_sessions_select on public.call_sessions
  for select to authenticated
  using (org_id = public.get_user_org_id());

create policy call_sessions_insert on public.call_sessions
  for insert to authenticated
  with check (org_id = public.get_user_org_id());

create policy call_sessions_update on public.call_sessions
  for update to authenticated
  using (
    org_id = public.get_user_org_id()
    and (public.is_org_admin() or member_id = public.current_member_id())
  )
  with check (org_id = public.get_user_org_id());

create policy call_sessions_delete_admin on public.call_sessions
  for delete to authenticated
  using (org_id = public.get_user_org_id() and public.is_org_admin());

-- ============================================================
-- 6. clients（クライアント）: 追加・編集・削除は管理者のみ
--    架電からの開拓アポ登録でクライアントを自動作成する導線があるため、
--    そこだけシステム権限で通す関数を用意する（利用者に clients の権限は渡さない）
-- ============================================================
-- クライアントポータル用の clients_select_client_self は残す
drop policy if exists clients_select_own_org on public.clients;
drop policy if exists clients_insert_own_org on public.clients;
drop policy if exists clients_update_own_org on public.clients;
drop policy if exists clients_delete_own_org on public.clients;

create policy clients_select on public.clients
  for select to authenticated
  using (org_id = public.get_user_org_id());

create policy clients_write_admin on public.clients
  for all to authenticated
  using (org_id = public.get_user_org_id() and public.is_org_admin())
  with check (org_id = public.get_user_org_id() and public.is_org_admin());

-- 開拓リスト由来のクライアントだけを作る。既にあればその id を返す。
create or replace function public.ensure_prospecting_client(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_org uuid := public.get_user_org_id();
  v_id uuid;
begin
  if v_org is null or coalesce(trim(p_name), '') = '' then
    raise exception 'クライアント名が空です';
  end if;
  select id into v_id from public.clients where org_id = v_org and name = p_name limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.clients (org_id, name, status)
  values (v_org, p_name, '支援中')
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.ensure_prospecting_client(text) to authenticated;

-- ============================================================
-- 7. daily_reports（日報）: フィードバックの記入は管理者のみ
-- ============================================================
create or replace function public.daily_reports_guard_feedback()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if public.is_org_admin() then
    return new;
  end if;
  if new.feedback is distinct from old.feedback then
    raise exception '日報のフィードバックは管理者のみ記入できます';
  end if;
  return new;
end;
$$;

drop trigger if exists daily_reports_guard_feedback_trg on public.daily_reports;
create trigger daily_reports_guard_feedback_trg
  before update on public.daily_reports
  for each row execute function public.daily_reports_guard_feedback();
