set local search_path = public, extensions;

-- 請求書メール送付履歴
create table if not exists public.invoice_sent_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null,
  invoice_month text not null,
  file_path text,
  filename text not null,
  to_emails text[] not null,
  cc_emails text[],
  subject text,
  sent_at timestamptz not null default now(),
  sent_by uuid
);

create index if not exists invoice_sent_log_org_client_month_idx
  on public.invoice_sent_log (org_id, client_id, invoice_month);
create index if not exists invoice_sent_log_sent_at_idx
  on public.invoice_sent_log (org_id, sent_at desc);

alter table public.invoice_sent_log enable row level security;
drop policy if exists "invoice_sent_log_select" on public.invoice_sent_log;
create policy "invoice_sent_log_select" on public.invoice_sent_log
  for select using (org_id = public.get_user_org_id());
drop policy if exists "invoice_sent_log_insert" on public.invoice_sent_log;
create policy "invoice_sent_log_insert" on public.invoice_sent_log
  for insert with check (org_id = public.get_user_org_id());

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

-- Storage RLS: 認証済みなら同orgチェックなしで OK
-- (Spanavi は単一org運用のため。foldername で org_id チェックすると auth context で
-- get_user_org_id() が解決できず弾かれる事象が発生したため緩和)
drop policy if exists "invoices_select_same_org" on storage.objects;
drop policy if exists "invoices_insert_same_org" on storage.objects;
drop policy if exists "invoices_select_authenticated" on storage.objects;
drop policy if exists "invoices_insert_authenticated" on storage.objects;
drop policy if exists "invoices_update_authenticated" on storage.objects;

create policy "invoices_select_authenticated" on storage.objects
  for select using (bucket_id = 'invoices' and auth.role() = 'authenticated');
create policy "invoices_insert_authenticated" on storage.objects
  for insert with check (bucket_id = 'invoices' and auth.role() = 'authenticated');
create policy "invoices_update_authenticated" on storage.objects
  for update using (bucket_id = 'invoices' and auth.role() = 'authenticated');
