-- クライアントごとの「アポ報告に足す項目」と「アポにしない条件」（2026-10-07 むー様決定）
-- 3段で上から重ねる：クライアント（contact_id・list_id とも null）→ 先方の担当者（contact_id）→ リスト（list_id）
--   items      : [{ key, label, type: text|number_oku|number_people|select, options?, required, ask }]
--                ask=true なら架電ページに「必ず聞くこと」として出す
--   conditions : [{ key, label, check?: { field: revenue_oku|employees|industry, op: '<'|'<='|'>='|'in', value }, note }]
--                登録のときに警告を出す（止めない）。check が無いものは確認のチェックだけ
create table if not exists public.report_rules (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  client_id   uuid not null references public.clients(id) on delete cascade,
  contact_id  uuid references public.client_contacts(id) on delete cascade,
  list_id     uuid references public.call_lists(id) on delete cascade,
  items       jsonb not null default '[]'::jsonb,
  conditions  jsonb not null default '[]'::jsonb,
  note        text,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create unique index if not exists report_rules_scope_uq
  on public.report_rules (client_id, coalesce(contact_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(list_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.report_rules enable row level security;
drop policy if exists report_rules_select on public.report_rules;
create policy report_rules_select on public.report_rules for select to authenticated using (org_id = (select get_user_org_id()));
drop policy if exists report_rules_write on public.report_rules;
create policy report_rules_write on public.report_rules for all to authenticated
  using (org_id = (select get_user_org_id()) and (select public.is_admin()))
  with check (org_id = (select get_user_org_id()) and (select public.is_admin()));
revoke all on public.report_rules from anon;
comment on table public.report_rules is 'アポ報告に足す項目とアポにしない条件。クライアント→先方の担当者→リストの順に重ねる';
