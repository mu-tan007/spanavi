-- ============================================================
-- スパキャリ 第2回「マネタイズ領域診断」
-- ----------------------------------------------------------------
-- やりたいこと・興味・強み・業界経験から、6領域＋フリーランス副業市場の
-- どこで・どの業界で勝つかを高精度に診断する独立タブ用テーブル。
--
-- 内容:
--   1. spacareer_monetization_diagnosis_responses（受講生1名=1行、回答/結果/AIレポート）
--   2. RLS: 受講生本人の自己 select/insert/update ＋ 運営・トレーナーの閲覧
--      （spacareer_strength_responses と同型。本人が自分の行を upsert できる）
--   3. spacareer_customers に完了日時キャッシュ列 ＋ 完了同期トリガ
--      （social_style と同型。顧客一覧での判定高速化）
-- ============================================================

set local search_path = public, extensions;

-- ============================================================
-- 1. 回答テーブル
-- ============================================================
create table if not exists public.spacareer_monetization_diagnosis_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.spacareer_customers(id) on delete cascade,

  -- 設問回答（[{ question_id, value }]。value は数値 or 文字列 or 配列）
  answers jsonb not null default '[]'::jsonb,
  current_question_no smallint not null default 0,  -- 中断・再開ポインタ

  -- 診断結果（ランク付き 領域×業界 候補＋スコア内訳＋収益ファネル）
  result jsonb,

  -- 最終言語化レポート（Claude生成 or フォールバックのテンプレ文）
  report_text text,
  report_generated_at timestamptz,

  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (customer_id)
);

comment on table public.spacareer_monetization_diagnosis_responses is
  'スパキャリ第2回マネタイズ領域診断の回答・結果・AIレポート（受講生1名=1行）';

create index if not exists idx_spacareer_monetization_diag_org
  on public.spacareer_monetization_diagnosis_responses (org_id, completed_at);

-- updated_at 自動更新（既存の汎用トリガ関数があれば流用、なければ簡易定義）
create or replace function public.fn_spacareer_monetization_diag_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_spacareer_monetization_diag_touch
  on public.spacareer_monetization_diagnosis_responses;
create trigger trg_spacareer_monetization_diag_touch
  before update on public.spacareer_monetization_diagnosis_responses
  for each row execute function public.fn_spacareer_monetization_diag_touch();

-- ============================================================
-- 2. RLS（spacareer_strength_responses と同型：本人 upsert ＋ 運営/トレーナー閲覧）
-- ============================================================
alter table public.spacareer_monetization_diagnosis_responses enable row level security;

drop policy if exists spacareer_monetization_diag_all
  on public.spacareer_monetization_diagnosis_responses;
create policy spacareer_monetization_diag_all
  on public.spacareer_monetization_diagnosis_responses
  for all
  to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
      or customer_id = public.spacareer_current_customer_id()
    )
  )
  with check (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
      or customer_id = public.spacareer_current_customer_id()
    )
  );

comment on policy spacareer_monetization_diag_all
  on public.spacareer_monetization_diagnosis_responses is
  '受講生本人は自分の診断行を読み書き(upsert)でき、運営・担当トレーナーは閲覧できる';

-- ============================================================
-- 3. 完了日時キャッシュ列 ＋ 同期トリガ
-- ============================================================
alter table public.spacareer_customers
  add column if not exists monetization_diagnosis_completed_at timestamptz;

comment on column public.spacareer_customers.monetization_diagnosis_completed_at is
  'マネタイズ領域診断の完了日時。spacareer_monetization_diagnosis_responses.completed_at から自動同期。';

create or replace function public.fn_spacareer_sync_customer_monetization_diag()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.customer_id is null then
    return new;
  end if;
  if new.completed_at is distinct from old.completed_at then
    update public.spacareer_customers
    set monetization_diagnosis_completed_at = new.completed_at
    where id = new.customer_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_spacareer_sync_customer_monetization_diag
  on public.spacareer_monetization_diagnosis_responses;
create trigger trg_spacareer_sync_customer_monetization_diag
  after update of completed_at on public.spacareer_monetization_diagnosis_responses
  for each row
  execute function public.fn_spacareer_sync_customer_monetization_diag();

comment on function public.fn_spacareer_sync_customer_monetization_diag() is
  'マネタイズ領域診断完了時に spacareer_customers のキャッシュ列を同期';
