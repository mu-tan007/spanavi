-- =====================================================================
-- Spartia AI: スクリプト展開 / 商材の新設 / 入金と5%バックの土台
-- ---------------------------------------------------------------------
-- 2026-08-31。本番へは MCP の apply_migration で適用済み。ここは記録用の正本。
-- =====================================================================

set local search_path = public, extensions;
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------
-- ① 管工事・土木工事・電気工事に、建築工事のスクリプトを展開する
--    本文の業種名だけを置換する。原文を手で写すと差異が入るので replace() で作る。
-- ---------------------------------------------------------------------
update call_lists t
   set script_body = replace(src.script_body, '建築工事', '管工事'),
       cautions    = src.cautions
  from (select script_body, cautions from call_lists
         where id = '0e870ca8-8b27-42b7-b852-0ffef9a3a703') src
 where t.id = '9bf87479-f5e4-4ea7-bb9a-6d9a82006d95';

update call_lists t
   set script_body = replace(src.script_body, '建築工事', '土木工事'),
       cautions    = src.cautions
  from (select script_body, cautions from call_lists
         where id = '0e870ca8-8b27-42b7-b852-0ffef9a3a703') src
 where t.id = '08bec79e-242d-41ae-aa64-ac50a9e39a62';

update call_lists t
   set script_body = replace(src.script_body, '建築工事', '電気工事'),
       cautions    = src.cautions
  from (select script_body, cautions from call_lists
         where id = '0e870ca8-8b27-42b7-b852-0ffef9a3a703') src
 where t.id = '81f48635-ebce-4e3c-8aaf-f118210418d1';

-- ---------------------------------------------------------------------
-- ② 商材「Spartia AI」を新設し、4リストをその配下の engagement へ移す
--    既存設計は business_categories（商材）ごとに engagement を1本持つ形
--    （SaaS/IFA/人材/コンサルと同じ）。それに揃える。
--
--    product は「営業代行」のまま。products は事業の単位で、Spanavi上は
--    営業代行チームが同じ架電画面で回すため。新 product を作ると
--    ReportTemplatesManagement の slug='sales_agency' 決め打ちなど、
--    営業代行前提の処理から外れる。
--
--    権限への影響なし: member_engagements に行があるのはトップ階層の
--    engagement だけ（seller_sourcing 58名 / spartia_career 20名 など）。
--    商材レベルには所属行が無いので、追加しても誰も締め出さない。
-- ---------------------------------------------------------------------
insert into business_categories (org_id, product_id, name, slug, display_order, is_active, description)
select 'a0000000-0000-0000-0000-000000000001'::uuid,
       '68030416-2e6f-4bf7-9c81-a045e4662bbf'::uuid,
       'Spartia AI', 'spartia_ai', 6, true,
       '建設業向けAI研修（自社商材）の新規開拓'
 where not exists (
   select 1 from business_categories
    where org_id = 'a0000000-0000-0000-0000-000000000001' and slug = 'spartia_ai');

insert into engagements (org_id, name, slug, type, status, display_order, description, product_id, category_id)
select 'a0000000-0000-0000-0000-000000000001'::uuid,
       'クライアント開拓', 'client_acquisition_spartia_ai', 'client_acquisition', 'active', 3,
       'Spartia AI クライアント開拓',
       '68030416-2e6f-4bf7-9c81-a045e4662bbf'::uuid,
       (select id from business_categories
         where org_id = 'a0000000-0000-0000-0000-000000000001' and slug = 'spartia_ai')
 where not exists (
   select 1 from engagements
    where org_id = 'a0000000-0000-0000-0000-000000000001'
      and slug = 'client_acquisition_spartia_ai');

update call_lists l
   set engagement_id = e.id
  from engagements e
 where e.org_id = 'a0000000-0000-0000-0000-000000000001'
   and e.slug = 'client_acquisition_spartia_ai'
   and l.client_id = '51af9005-2534-4c1f-b6f2-f64dc427b20f'
   and l.industry in ('Spartia AI_建築工事', 'Spartia AI_管工事',
                      'Spartia AI_土木工事', 'Spartia AI_電気工事');

-- 既に作られているアポも同じ engagement に揃える（取り残しを作らない）
update appointments a
   set engagement_id = l.engagement_id
  from call_lists l
 where l.id = a.list_id
   and l.client_id = '51af9005-2534-4c1f-b6f2-f64dc427b20f'
   and l.industry in ('Spartia AI_建築工事', 'Spartia AI_管工事',
                      'Spartia AI_土木工事', 'Spartia AI_電気工事')
   and a.engagement_id is distinct from l.engagement_id;

-- ---------------------------------------------------------------------
-- ③ spartia_receipts: 顧客入金と、そこから出る架電者への5%バック
--
--    ルール（2026-08-31決定）:
--      その月にその顧客から入金された額（税別・実費を除く）の5%を、
--      翌月に「その顧客のアポを取った架電者」へ支給する。
--      アポ1件あたりの支払いは無い。初回/更新の区別も期限も上限も無い。
--      在籍有無を問わず支払う。
--
--    設計:
--      - 率・金額・バック先は行にコピーして確定保存する。
--        将来 rate を変えても過去の支給額は動かない。
--      - 報酬画面に新しい列は足さず、既存の payroll_member_adjustments に
--        1行を自動生成して「調整」列に出す。あの列は確定済みの月でも
--        ライブで合算され、請求書PDFの明細にも入るため、
--        アポの何ヶ月も後に来る入金と相性が良い。
--      - 入金をアポの sales_amount に混ぜてはいけない。売上は面談日ベースなので
--        確定済みの過去月に金額が湧き、累計売上が跳ねて適用率まで動く。
-- ---------------------------------------------------------------------
create table if not exists public.spartia_receipts (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  appointment_id   uuid not null references public.appointments(id) on delete restrict,
  company_name     text not null,
  kickback_member_id   uuid references public.members(id) on delete set null,
  kickback_member_name text not null default '',
  received_month   text not null check (received_month ~ '^\d{4}-\d{2}$'),
  amount_excl_tax  integer not null check (amount_excl_tax >= 0),
  kickback_rate    numeric not null default 0.05 check (kickback_rate >= 0 and kickback_rate <= 1),
  kickback_amount  integer not null default 0,
  pay_month        text not null check (pay_month ~ '^\d{4}-\d{2}$'),
  note             text not null default '',
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (org_id, appointment_id, received_month)
);

create index if not exists spartia_receipts_pay_month_idx
  on public.spartia_receipts(org_id, pay_month);
create index if not exists spartia_receipts_member_idx
  on public.spartia_receipts(org_id, kickback_member_id);

comment on table public.spartia_receipts is
  'Spartia AI の顧客入金と架電者への5%バック。率と金額とバック先は行にコピーして確定保存する。payroll_member_adjustments へ自動同期。';

alter table public.payroll_member_adjustments
  add column if not exists receipt_id uuid references public.spartia_receipts(id) on delete cascade;

-- 手入力の調整行は receipt_id が null で複数あるため部分索引にする。
-- 部分索引は ON CONFLICT の推論に使えないので、同期関数は UPDATE→無ければ INSERT の形。
create unique index if not exists payroll_member_adjustments_receipt_uidx
  on public.payroll_member_adjustments(receipt_id) where receipt_id is not null;

-- 保存前に確定させる値を埋める
create or replace function public.spartia_receipts_fill()
returns trigger language plpgsql security definer
set search_path = public, extensions as $$
declare getter text;
begin
  if new.pay_month is null or new.pay_month = '' then
    new.pay_month := to_char((to_date(new.received_month, 'YYYY-MM') + interval '1 month'), 'YYYY-MM');
  end if;

  if new.kickback_member_id is null or new.company_name is null or new.company_name = '' then
    select a.getter_name, a.company_name into getter, new.company_name
      from appointments a where a.id = new.appointment_id;
    if new.kickback_member_id is null and getter is not null then
      select m.id into new.kickback_member_id
        from members m where m.org_id = new.org_id and m.name = getter limit 1;
    end if;
    if new.kickback_member_name = '' and getter is not null then
      new.kickback_member_name := getter;
    end if;
  end if;

  new.kickback_amount := round(new.amount_excl_tax * new.kickback_rate);
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists spartia_receipts_fill_trg on public.spartia_receipts;
create trigger spartia_receipts_fill_trg
  before insert or update on public.spartia_receipts
  for each row execute function public.spartia_receipts_fill();

-- 報酬画面の「調整」列へ同期する
create or replace function public.spartia_receipts_sync_payroll()
returns trigger language plpgsql security definer
set search_path = public, extensions as $$
declare v_label text; v_note text; v_hit integer;
begin
  if tg_op = 'DELETE' then
    delete from payroll_member_adjustments where receipt_id = old.id;
    return old;
  end if;

  -- バック先が特定できていない行は支給行を作らない（誰に払うか決まらないため）
  if new.kickback_member_id is null then
    delete from payroll_member_adjustments where receipt_id = new.id;
    return new;
  end if;

  v_label := 'Spartia AIバック（' || new.company_name || ' ' || new.received_month || '入金）';
  v_note  := '税別入金額 ' || new.amount_excl_tax::text || '円 × '
             || trim(to_char(new.kickback_rate * 100, 'FM990.99')) || '%';

  update payroll_member_adjustments
     set org_id = new.org_id, member_id = new.kickback_member_id,
         pay_month = new.pay_month, label = v_label,
         amount = new.kickback_amount, note = v_note, updated_at = now()
   where receipt_id = new.id;
  get diagnostics v_hit = row_count;

  if v_hit = 0 then
    insert into payroll_member_adjustments
      (org_id, member_id, pay_month, label, amount, note, receipt_id)
    values
      (new.org_id, new.kickback_member_id, new.pay_month, v_label,
       new.kickback_amount, v_note, new.id);
  end if;
  return new;
end $$;

drop trigger if exists spartia_receipts_sync_payroll_trg on public.spartia_receipts;
create trigger spartia_receipts_sync_payroll_trg
  after insert or update or delete on public.spartia_receipts
  for each row execute function public.spartia_receipts_sync_payroll();

-- 入金額は顧客の金額情報なので admin だけが読み書きする。
-- 架電者本人には、既存の payroll_member_adjustments 経由で支給額だけが見える。
alter table public.spartia_receipts enable row level security;

drop policy if exists spartia_receipts_admin_all on public.spartia_receipts;
create policy spartia_receipts_admin_all on public.spartia_receipts
  for all to authenticated
  using (
    org_id = public.get_user_org_id()
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (
    org_id = public.get_user_org_id()
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
