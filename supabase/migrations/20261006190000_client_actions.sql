-- 1社に予定（次の一手）を複数持てるようにする（2026-10-06）
-- 例：支援中の会社に「次のリスト依頼 10/20」と「報告書の提出 10/31」を別々に持つ。
-- 一覧の「次の一手」列は、まだ済んでいない予定のうち一番早いものを clients.next_action* に写して出す（トリガー）。
create table if not exists public.client_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null default 'その他',   -- 次のリスト依頼 / 報告書の提出 / 催促 / 支援開始の見込み / 再開の打診 / 再営業 / 再度の切り出し / その他
  note text,                             -- 中身（例：10/5配布リストの次を依頼）
  owner text not null default '当方',    -- 当方 / 先方
  due date,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_actions_client_idx on public.client_actions(client_id);
create index if not exists client_actions_due_idx on public.client_actions(org_id, due) where done_at is null;

alter table public.client_actions enable row level security;
-- 社内の人だけ（クライアント様のポータルからは見えない）
create policy client_actions_select on public.client_actions for select to authenticated
  using (org_id = get_user_org_id() and not is_client_user());
create policy client_actions_insert on public.client_actions for insert to authenticated
  with check (org_id = get_user_org_id() and not is_client_user());
create policy client_actions_update on public.client_actions for update to authenticated
  using (org_id = get_user_org_id() and not is_client_user());
create policy client_actions_delete on public.client_actions for delete to authenticated
  using (org_id = get_user_org_id() and not is_client_user());

-- 一番早い未完了の予定を clients.next_action* に写す（一覧・要対応の絞り込みはこれを見る）
create or replace function public.sync_client_next_action(p_client uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select kind, note, owner, due into a
    from client_actions
   where client_id = p_client and done_at is null
   order by due nulls last, created_at
   limit 1;
  update clients set
    next_action = case when a.kind is null then null
                       when coalesce(a.note, '') = '' then a.kind
                       when a.kind = 'その他' then a.note
                       else a.kind || '：' || a.note end,
    next_action_owner = a.owner,
    next_action_due = a.due
   where id = p_client;
end $$;

create or replace function public.trg_client_actions_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger client_actions_touch before update on public.client_actions
  for each row execute function public.trg_client_actions_sync();

create or replace function public.trg_client_actions_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform sync_client_next_action(coalesce(new.client_id, old.client_id));
  if tg_op = 'UPDATE' and new.client_id is distinct from old.client_id then
    perform sync_client_next_action(old.client_id);
  end if;
  return null;
end $$;
create trigger client_actions_after after insert or update or delete on public.client_actions
  for each row execute function public.trg_client_actions_after();

-- いま clients に入っている「次の一手」を、予定1件として移す（状態から種類を推定）
insert into public.client_actions (org_id, client_id, kind, note, owner, due)
select c.org_id, c.id,
       case c.status when '停止中' then '再開の打診'
                     when '中期フォロー' then '再営業'
                     when '失注' then '再度の切り出し'
                     else 'その他' end,
       c.next_action, coalesce(nullif(c.next_action_owner, ''), '当方'), c.next_action_due
  from public.clients c
 where coalesce(c.next_action, '') not in ('', 'なし')
   and not exists (select 1 from public.client_actions x where x.client_id = c.id);
