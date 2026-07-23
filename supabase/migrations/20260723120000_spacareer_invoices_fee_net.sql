-- スパキャリ売上: Stripe手数料を控除した純売上高のため fee / net を保持
set local search_path = public, extensions;

alter table public.spacareer_invoices
  add column if not exists fee bigint,
  add column if not exists net bigint;

comment on column public.spacareer_invoices.fee is 'Stripe決済手数料（円）。charge.balance_transaction.fee 由来。';
comment on column public.spacareer_invoices.net is '手数料控除後の純入金額（円）。charge.balance_transaction.net 由来。';
