set local search_path = public, extensions;

-- ============================================================
-- スパキャリ: セッションの「実施トレーナー」を完了時点で確定させる
-- ----------------------------------------------------------------
-- むー様指示 2026-07-30:
--   従来はセッション記録の集計時に「顧客の現担当(assigned_trainer_id)」を
--   後付けで貼っていたため、担当が変わると過去の全セッションが新担当の実績に
--   付け替わっていた（本番で完了49件中29件が該当）。
--
--   セッション完了ボタンを押した時点の担当トレーナーをセッション行に焼き付け、
--   以後の帰属を不変にする。
--
-- 設計判断:
--   - 完了経路が「完了フロー」と「動画カードのスキップして完了」の2つあるため、
--     フロント側ではなく DBトリガー に置く（漏れを構造的に防ぐ）。
--   - trainer_id  = 実施時点の担当トレーナー（報酬算定の基準）
--     completed_by = 実際に完了ボタンを押したメンバー（運営代理押下の監査用）
--     この2つは一致しないことがあるので必ず別カラムで持つ。
-- ============================================================

-- ------------------------------------------------------------
-- 1. spacareer_sessions.trainer_id（実施時点の担当）
-- ------------------------------------------------------------
alter table public.spacareer_sessions
  add column if not exists trainer_id uuid references public.members(id) on delete set null;

comment on column public.spacareer_sessions.trainer_id is
  '実施時点の担当トレーナー(members.id)。完了時にトリガーで焼き付ける。報酬算定はこの列を使う。';
comment on column public.spacareer_sessions.completed_by is
  '完了ボタンを実際に押したメンバー(members.id)。運営が代理で押す場合があるため trainer_id とは別。';

create index if not exists idx_spacareer_sessions_trainer_completed
  on public.spacareer_sessions (trainer_id, completed_at)
  where status = 'completed';

-- ------------------------------------------------------------
-- 2. 完了時に担当トレーナーを焼き付けるトリガー
-- ------------------------------------------------------------
create or replace function public.fn_spacareer_stamp_session_trainer()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
begin
  -- 「未完了 → 完了」に変わる瞬間だけ処理する。
  -- 既に completed の行の再UPDATE では上書きしない（過去実績を守る）。
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed') then

    if new.completed_at is null then
      new.completed_at := now();
    end if;

    -- 実施時点の担当。既に入っている場合（手動補正・再実行）は尊重する。
    if new.trainer_id is null then
      select c.assigned_trainer_id into new.trainer_id
      from public.spacareer_customers c
      where c.id = new.customer_id;
    end if;

    -- 押した本人。cron等 auth 文脈がない場合は NULL のまま。
    if new.completed_by is null then
      new.completed_by := public.spacareer_current_member_id();
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_spacareer_stamp_session_trainer on public.spacareer_sessions;
create trigger trg_spacareer_stamp_session_trainer
  before insert or update on public.spacareer_sessions
  for each row execute function public.fn_spacareer_stamp_session_trainer();

-- ------------------------------------------------------------
-- 3. アサイン履歴
--    「その月に何名担当していたか」（固定給5万円の3名判定）と、
--    担当変更の監査に使う。
-- ------------------------------------------------------------
create table if not exists public.spacareer_trainer_assignments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.spacareer_customers(id) on delete cascade,
  trainer_id  uuid not null references public.members(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  assigned_by uuid references public.members(id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table public.spacareer_trainer_assignments is
  'トレーナーアサインの履歴。ended_at IS NULL が現担当。担当変更のたびに前行を閉じて新行を開く。';

create index if not exists idx_spacareer_trainer_assignments_customer
  on public.spacareer_trainer_assignments (customer_id, started_at desc);
create index if not exists idx_spacareer_trainer_assignments_trainer
  on public.spacareer_trainer_assignments (trainer_id, started_at, ended_at);
-- 1顧客につき「開いている」担当は1件だけ
create unique index if not exists uq_spacareer_trainer_assignments_open
  on public.spacareer_trainer_assignments (customer_id)
  where ended_at is null;

-- ------------------------------------------------------------
-- 4. アサイン変更を履歴に記録するトリガー
-- ------------------------------------------------------------
create or replace function public.fn_spacareer_track_trainer_assignment()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_at timestamptz;
begin
  if tg_op = 'UPDATE' and new.assigned_trainer_id is not distinct from old.assigned_trainer_id then
    return new;
  end if;

  -- 画面側が assigned_at を更新するのでそれを正とし、無ければ now()
  v_at := coalesce(new.assigned_at, now());

  -- 直前の担当を閉じる
  update public.spacareer_trainer_assignments
     set ended_at = v_at
   where customer_id = new.id
     and ended_at is null
     and trainer_id is distinct from new.assigned_trainer_id;

  -- 新担当を開く（未アサインに戻した場合は開かない）
  if new.assigned_trainer_id is not null then
    insert into public.spacareer_trainer_assignments
      (org_id, customer_id, trainer_id, started_at, assigned_by)
    select new.org_id, new.id, new.assigned_trainer_id, v_at, public.spacareer_current_member_id()
    where not exists (
      select 1 from public.spacareer_trainer_assignments
      where customer_id = new.id and ended_at is null
        and trainer_id = new.assigned_trainer_id
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_spacareer_track_trainer_assignment on public.spacareer_customers;
create trigger trg_spacareer_track_trainer_assignment
  after insert or update of assigned_trainer_id on public.spacareer_customers
  for each row execute function public.fn_spacareer_track_trainer_assignment();

-- ------------------------------------------------------------
-- 5. 既存データの初期投入
-- ------------------------------------------------------------

-- 5-1. 現在のアサインを履歴の1行目として投入
insert into public.spacareer_trainer_assignments
  (org_id, customer_id, trainer_id, started_at)
select c.org_id, c.id, c.assigned_trainer_id, coalesce(c.assigned_at, c.created_at)
from public.spacareer_customers c
where c.assigned_trainer_id is not null
  and not exists (
    select 1 from public.spacareer_trainer_assignments a where a.customer_id = c.id
  );

-- 5-2. 完了済みセッションのうち、「現担当のアサイン日以降に完了」した分だけ
--      現担当を実施トレーナーとして確定させる。
--      アサイン日より前に完了した分は前任者の可能性があるため NULL のまま残し、
--      むー様からの申告をもとに別途 UPDATE する（誤帰属のまま固定するのを避ける）。
update public.spacareer_sessions s
   set trainer_id = c.assigned_trainer_id
  from public.spacareer_customers c
 where c.id = s.customer_id
   and s.status = 'completed'
   and s.trainer_id is null
   and c.assigned_trainer_id is not null
   and c.assigned_at is not null
   and s.completed_at >= c.assigned_at;

-- ------------------------------------------------------------
-- 6. RLS
--    担当を外れた後も「自分が実施した回」は見えないと、
--    トレーナー本人が自分の実績・報酬を確認できない。
-- ------------------------------------------------------------
alter table public.spacareer_trainer_assignments enable row level security;

drop policy if exists spacareer_trainer_assignments_select on public.spacareer_trainer_assignments;
create policy spacareer_trainer_assignments_select
  on public.spacareer_trainer_assignments for select
  using (
    org_id = public.get_user_org_id()
    and (public.spacareer_is_admin() or trainer_id = public.spacareer_current_member_id())
  );

drop policy if exists spacareer_trainer_assignments_write on public.spacareer_trainer_assignments;
create policy spacareer_trainer_assignments_write
  on public.spacareer_trainer_assignments for all
  using (org_id = public.get_user_org_id() and public.spacareer_is_admin())
  with check (org_id = public.get_user_org_id() and public.spacareer_is_admin());

-- 過去に自分が実施したセッションを閲覧可能にする（現担当でなくても）
drop policy if exists spacareer_sessions_select on public.spacareer_sessions;
create policy spacareer_sessions_select
  on public.spacareer_sessions for select
  using (
    org_id = public.get_user_org_id()
    and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
      or customer_id = public.spacareer_current_customer_id()
      or trainer_id = public.spacareer_current_member_id()
    )
  );
