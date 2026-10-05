-- 顧客管理 > 顧客詳細の「活動履歴」（Phalanx の企業情報ページにならう）
--   client_activities   … 人が書くメモと、送った・受けたメールの記録（手で書けるのはメモだけ。メールは取り込みで入れる）
--   client_status_log   … ステータスを変えた記録。clients.status が変わったら自動で1行足す（人は書かない）
--   面談（client_meetings）・アポ（appointments）・担当者メモ（contact_memo_events）は既存の表から画面で並べる

set lock_timeout = '5s';

create table if not exists public.client_activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null check (kind in ('note', 'email')),
  title text,
  body text,
  occurred_at timestamptz not null default now(),
  created_by_name text,
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_activities_client_idx on public.client_activities (client_id, occurred_at desc);
-- 同じメールを二度取り込まない（source_ref = Gmail のメッセージID など）
create unique index if not exists client_activities_source_ref_uq on public.client_activities (client_id, source_ref) where source_ref is not null;

alter table public.client_activities enable row level security;
drop policy if exists client_activities_org on public.client_activities;
create policy client_activities_org on public.client_activities
  for all to authenticated
  using (org_id = public.get_user_org_id())
  with check (org_id = public.get_user_org_id());

create table if not exists public.client_status_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  from_status text,
  to_status text,
  changed_by_name text,
  changed_at timestamptz not null default now()
);
create index if not exists client_status_log_client_idx on public.client_status_log (client_id, changed_at desc);

alter table public.client_status_log enable row level security;
drop policy if exists client_status_log_read on public.client_status_log;
create policy client_status_log_read on public.client_status_log
  for select to authenticated
  using (org_id = public.get_user_org_id());

create or replace function public.log_client_status_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status is distinct from old.status then
    insert into public.client_status_log (org_id, client_id, from_status, to_status, changed_by_name)
    values (
      new.org_id, new.id, old.status, new.status,
      (select m.name from public.members m where m.user_id = auth.uid() and m.org_id = new.org_id limit 1)
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists clients_status_log on public.clients;
create trigger clients_status_log
  after update of status on public.clients
  for each row execute function public.log_client_status_change();
