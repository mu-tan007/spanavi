-- スパキャリ: 事後課題の「提出スナップショット」記録
--
-- 背景: spacareer_homework_items は提出のたびに上書き更新するため、
--  「1回目80% → 2回目90% → 3回目100%」のような提出回数ごとの達成率履歴が残らない。
--  受講生が「回答を提出」するたびに、その時点の達成率スナップショットを1行記録する。
--  （過去分は復元不可・本マイグレーション適用後の提出から蓄積）

set local search_path = public, extensions;

create table if not exists public.spacareer_homework_submissions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  homework_id  uuid not null references public.spacareer_homework(id) on delete cascade,
  customer_id  uuid not null references public.spacareer_customers(id) on delete cascade,
  session_no   smallint not null,
  due_at       timestamptz,                       -- 提出時点の締切（リスケで変わるため都度保存）
  submitted_at timestamptz not null default now(),-- 提出日時
  percentage   smallint not null default 0,       -- その時点の達成率(0-100)
  answered_items smallint not null default 0,
  total_items  smallint not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists idx_spacareer_hw_sub_customer
  on public.spacareer_homework_submissions (customer_id, session_no, submitted_at);
create index if not exists idx_spacareer_hw_sub_homework
  on public.spacareer_homework_submissions (homework_id, submitted_at);

-- org_id / session_no / due_at を親課題から補完（クライアントは customer_id を明示指定してRLSを通す）。
-- 既存値があれば尊重し、無いものだけ COALESCE で補完する。
create or replace function public.fn_spacareer_homework_submission_fill()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  h record;
begin
  select h2.org_id, h2.customer_id, h2.session_no, h2.due_at
    into h
  from public.spacareer_homework h2
  where h2.id = new.homework_id;

  new.org_id      := coalesce(new.org_id, h.org_id);
  new.customer_id := coalesce(new.customer_id, h.customer_id);
  new.session_no  := coalesce(new.session_no, h.session_no);
  new.due_at      := coalesce(new.due_at, h.due_at);
  return new;
end;
$$;

drop trigger if exists trg_spacareer_homework_submission_fill on public.spacareer_homework_submissions;
create trigger trg_spacareer_homework_submission_fill
before insert on public.spacareer_homework_submissions
for each row execute function public.fn_spacareer_homework_submission_fill();

-- RLS
alter table public.spacareer_homework_submissions enable row level security;

-- 受講生: 自分の課題にのみ INSERT / SELECT
drop policy if exists spacareer_hw_sub_student_insert on public.spacareer_homework_submissions;
create policy spacareer_hw_sub_student_insert on public.spacareer_homework_submissions
  for insert to authenticated
  with check (customer_id = public.spacareer_current_customer_id());

drop policy if exists spacareer_hw_sub_student_select on public.spacareer_homework_submissions;
create policy spacareer_hw_sub_student_select on public.spacareer_homework_submissions
  for select to authenticated
  using (customer_id = public.spacareer_current_customer_id());

-- トレーナー: 担当顧客の提出履歴を閲覧
drop policy if exists spacareer_hw_sub_trainer_select on public.spacareer_homework_submissions;
create policy spacareer_hw_sub_trainer_select on public.spacareer_homework_submissions
  for select to authenticated
  using (customer_id in (select public.spacareer_trainer_customer_ids()));

-- 管理者: 全件読み書き
drop policy if exists spacareer_hw_sub_admin_all on public.spacareer_homework_submissions;
create policy spacareer_hw_sub_admin_all on public.spacareer_homework_submissions
  for all to authenticated
  using (org_id = public.get_user_org_id() and public.spacareer_is_admin())
  with check (org_id = public.get_user_org_id() and public.spacareer_is_admin());
