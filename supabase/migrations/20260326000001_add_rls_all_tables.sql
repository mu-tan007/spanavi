-- ============================================================
-- 全テーブルにorg_idベースのRLSポリシーを追加
-- マルチテナント対応: get_user_org_id() で自組織のみアクセス
-- ============================================================

-- ==================== clients ====================
alter table public.clients enable row level security;

create policy "clients_select_own_org"
  on public.clients for select to authenticated
  using (org_id = public.get_user_org_id());

create policy "clients_insert_own_org"
  on public.clients for insert to authenticated
  with check (org_id = public.get_user_org_id());

create policy "clients_update_own_org"
  on public.clients for update to authenticated
  using (org_id = public.get_user_org_id());

create policy "clients_delete_own_org"
  on public.clients for delete to authenticated
  using (org_id = public.get_user_org_id());

-- ==================== call_lists ====================
alter table public.call_lists enable row level security;

create policy "call_lists_select_own_org"
  on public.call_lists for select to authenticated
  using (org_id = public.get_user_org_id());

create policy "call_lists_insert_own_org"
  on public.call_lists for insert to authenticated
  with check (org_id = public.get_user_org_id());

create policy "call_lists_update_own_org"
  on public.call_lists for update to authenticated
  using (org_id = public.get_user_org_id());

create policy "call_lists_delete_own_org"
  on public.call_lists for delete to authenticated
  using (org_id = public.get_user_org_id());

-- ==================== call_records ====================
alter table public.call_records enable row level security;

create policy "call_records_select_own_org"
  on public.call_records for select to authenticated
  using (org_id = public.get_user_org_id());

create policy "call_records_insert_own_org"
  on public.call_records for insert to authenticated
  with check (org_id = public.get_user_org_id());

create policy "call_records_update_own_org"
  on public.call_records for update to authenticated
  using (org_id = public.get_user_org_id());

-- ==================== call_sessions ====================
alter table public.call_sessions enable row level security;

create policy "call_sessions_select_own_org"
  on public.call_sessions for select to authenticated
  using (org_id = public.get_user_org_id());

create policy "call_sessions_insert_own_org"
  on public.call_sessions for insert to authenticated
  with check (org_id = public.get_user_org_id());

create policy "call_sessions_update_own_org"
  on public.call_sessions for update to authenticated
  using (org_id = public.get_user_org_id());

create policy "call_sessions_delete_own_org"
  on public.call_sessions for delete to authenticated
  using (org_id = public.get_user_org_id());

-- ==================== appointments ====================
alter table public.appointments enable row level security;

create policy "appointments_select_own_org"
  on public.appointments for select to authenticated
  using (org_id = public.get_user_org_id());

create policy "appointments_insert_own_org"
  on public.appointments for insert to authenticated
  with check (org_id = public.get_user_org_id());

create policy "appointments_update_own_org"
  on public.appointments for update to authenticated
  using (org_id = public.get_user_org_id());

create policy "appointments_delete_own_org"
  on public.appointments for delete to authenticated
  using (org_id = public.get_user_org_id());

-- ==================== members (SELECT/INSERT追加) ====================
-- UPDATE/DELETEは既にポリシーあり。SELECT/INSERTのみ追加

create policy "members_select_own_org"
  on public.members for select to authenticated
  using (org_id = public.get_user_org_id());

create policy "members_insert_own_org"
  on public.members for insert to authenticated
  with check (org_id = public.get_user_org_id());

-- ==================== shifts ====================
alter table public.shifts enable row level security;

create policy "shifts_select_own_org"
  on public.shifts for select to authenticated
  using (org_id = public.get_user_org_id());

create policy "shifts_insert_own_org"
  on public.shifts for insert to authenticated
  with check (org_id = public.get_user_org_id());

create policy "shifts_update_own_org"
  on public.shifts for update to authenticated
  using (org_id = public.get_user_org_id());

create policy "shifts_delete_own_org"
  on public.shifts for delete to authenticated
  using (org_id = public.get_user_org_id());

-- ==================== reward_types ====================
-- reward_typesはorg_id列がない可能性あり。ある場合のみ有効
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reward_types' and column_name = 'org_id'
  ) then
    execute 'alter table public.reward_types enable row level security';
    execute 'create policy "reward_types_select_own_org" on public.reward_types for select to authenticated using (org_id = public.get_user_org_id())';
    execute 'create policy "reward_types_insert_own_org" on public.reward_types for insert to authenticated with check (org_id = public.get_user_org_id())';
    execute 'create policy "reward_types_update_own_org" on public.reward_types for update to authenticated using (org_id = public.get_user_org_id())';
  end if;
end $$;

-- ==================== reward_tiers ====================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reward_tiers' and column_name = 'org_id'
  ) then
    execute 'alter table public.reward_tiers enable row level security';
    execute 'create policy "reward_tiers_select_own_org" on public.reward_tiers for select to authenticated using (org_id = public.get_user_org_id())';
    execute 'create policy "reward_tiers_insert_own_org" on public.reward_tiers for insert to authenticated with check (org_id = public.get_user_org_id())';
    execute 'create policy "reward_tiers_update_own_org" on public.reward_tiers for update to authenticated using (org_id = public.get_user_org_id())';
  end if;
end $$;
