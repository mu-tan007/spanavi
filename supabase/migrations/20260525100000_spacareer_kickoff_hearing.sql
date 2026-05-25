-- ============================================================
-- スパキャリ「第1回前70問キックオフヒアリング」基盤
-- ----------------------------------------------------------------
-- 仕様書: tasks/spacareer-spec.md §6.2A / §8.7 / §9.1 / §10.1
-- 実装todo: tasks/spacareer-kickoff-hearing-todo.md Phase A
--
-- 第1回前のみ起動する独立フロー。既存 §6.2 (AI 30問) とは別画面・別テーブル。
-- 受講生1人につき1セッション、70問固定。72h期限、途中保存可、センシティブ任意。
-- 提出完了 → AI抽出（ハイライトTop5 + 深掘り候補3つ）→ 運営Slackダイジェスト配信。
--
-- 含むもの:
--   1. spacareer_kickoff_hearing_questions  - 70問マスタ
--   2. spacareer_kickoff_hearing_sessions   - 受講生1人=1セッション、進捗管理
--   3. spacareer_kickoff_hearing_responses  - 顧客×質問×回答
--   4. spacareer_kickoff_hearing_ai_extractions - AI抽出結果（immutable）
--   5. updated_at triggers (3テーブル、ai_extractionsはimmutable)
--   6. 顧客INSERT → セッション自動生成 trigger
--   7. 初回回答 → first_accessed_at/deadline_at/status 自動セット trigger
--   8. RLS policies (admin/trainer/student の3ロール)
-- ============================================================

set local search_path = public, extensions;

-- ============================================================
-- 1. spacareer_kickoff_hearing_questions（70問マスタ）
-- ============================================================
-- 内容固定の70問+ボーナス。テンプレマスタ画面で運営のみ編集可。
-- section_code: A〜J + BONUS。is_required はセクションG/Iと BONUS のみ false。
create table if not exists public.spacareer_kickoff_hearing_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,

  section_code text not null,             -- 'A','B','C','D','E','F','G','H','I','J','BONUS'
  section_name text not null,             -- 'A. 基本情報' など
  question_number smallint not null,      -- 1〜70（BONUSは71〜）

  question_text text not null,
  answer_type text not null default 'long_text'
    check (answer_type in ('short_text','long_text','date','number','select_one','select_many')),
  options jsonb,                          -- select_one/select_many 用の選択肢配列

  is_required boolean not null default true,
  char_limit integer,                     -- 文字数カウンタ上限（null = 無制限）
  placeholder text,                       -- 入力欄プレースホルダ
  help_text text,                         -- 補助テキスト

  display_order smallint not null,        -- 表示順（question_number と独立）
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (org_id, question_number)
);
create index if not exists idx_spacareer_kh_questions_org_order
  on public.spacareer_kickoff_hearing_questions(org_id, display_order)
  where is_active;
create index if not exists idx_spacareer_kh_questions_section
  on public.spacareer_kickoff_hearing_questions(org_id, section_code, display_order)
  where is_active;

comment on table public.spacareer_kickoff_hearing_questions is
  '第1回前70問キックオフヒアリングの質問マスタ。テンプレマスタ画面で運営のみ編集可。';
comment on column public.spacareer_kickoff_hearing_questions.section_code is
  'A〜J + BONUS。G(健康)・I(家族)・BONUS は is_required=false 運用';
comment on column public.spacareer_kickoff_hearing_questions.options is
  'select_one/select_many の選択肢配列 [{value, label}, ...]';

-- ============================================================
-- 2. spacareer_kickoff_hearing_sessions（受講生1人=1セッション）
-- ============================================================
-- ステータス遷移:
--   unnotified  → 顧客作成直後、Slack DM 配信前
--   unstarted   → DM 配信済、受講生が一度もアクセスしていない
--   in_progress → 一時保存記録あり、未提出
--   submitted   → 必須項目全回答済み、AI抽出処理待ち
--   ai_extracted → AI抽出完了、運営確認待ち
--   completed   → 運営確認済 or キックオフ実施で自動完了
create table if not exists public.spacareer_kickoff_hearing_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.spacareer_customers(id) on delete cascade unique,

  status text not null default 'unnotified'
    check (status in ('unnotified','unstarted','in_progress','submitted','ai_extracted','completed')),

  notified_at timestamptz,                -- Slack DM 配信完了日時（Phase F で更新）
  first_accessed_at timestamptz,          -- 受講生の初回アクセス（trigger自動セット）
  deadline_at timestamptz,                -- first_accessed_at + 72h（trigger自動計算）
  deadline_extended_to timestamptz,       -- 運営手動延長後の最終期限（adminのみ更新）
  submitted_at timestamptz,               -- 必須回答完了+提出ボタン押下
  ai_extracted_at timestamptz,            -- AI抽出完了（Phase E）
  completed_at timestamptz,               -- 運営確認 or キックオフ実施で自動

  completed_by uuid references public.members(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_spacareer_kh_sessions_customer
  on public.spacareer_kickoff_hearing_sessions(customer_id);
create index if not exists idx_spacareer_kh_sessions_status
  on public.spacareer_kickoff_hearing_sessions(status);
create index if not exists idx_spacareer_kh_sessions_deadline
  on public.spacareer_kickoff_hearing_sessions(deadline_at)
  where status in ('unstarted','in_progress');

comment on table public.spacareer_kickoff_hearing_sessions is
  '受講生1人=1レコード。70問キックオフヒアリングの進捗管理。72h期限は first_accessed_at から自動計算。';

-- ============================================================
-- 3. spacareer_kickoff_hearing_responses（顧客×質問×回答）
-- ============================================================
create table if not exists public.spacareer_kickoff_hearing_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.spacareer_customers(id) on delete cascade,
  question_id uuid not null references public.spacareer_kickoff_hearing_questions(id) on delete restrict,

  answer_text text,                       -- 受講生回答（select系は値をカンマ結合 or JSON文字列で格納）
  is_draft boolean not null default true, -- 提出ボタン押下で false
  answered_at timestamptz,                -- 直近の保存日時

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (customer_id, question_id)
);
create index if not exists idx_spacareer_kh_responses_customer
  on public.spacareer_kickoff_hearing_responses(customer_id);
create index if not exists idx_spacareer_kh_responses_question
  on public.spacareer_kickoff_hearing_responses(question_id);

comment on table public.spacareer_kickoff_hearing_responses is
  '70問キックオフヒアリングの回答。1顧客×1質問でunique（upsert運用）。is_draft=trueは一時保存中。';

-- ============================================================
-- 4. spacareer_kickoff_hearing_ai_extractions（AI抽出結果・immutable）
-- ============================================================
-- 再実行時は新規レコード追加（updated_at 不要、履歴として蓄積）
create table if not exists public.spacareer_kickoff_hearing_ai_extractions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.spacareer_customers(id) on delete cascade,

  extraction_type text not null
    check (extraction_type in ('highlight_top5','deep_dive_3')),
  content_json jsonb not null,            -- highlight_top5: [{question_id, excerpt, why_important}]
                                          -- deep_dive_3:    [{topic, rationale, suggested_question}]
  source_response_ids jsonb not null default '[]'::jsonb,

  model text not null default 'claude-haiku-4-5-20251001',
  prompt_version text not null default 'v1',
  is_active boolean not null default true, -- 再実行時に旧版を false にする運用

  created_at timestamptz not null default now()
);
create index if not exists idx_spacareer_kh_ai_customer
  on public.spacareer_kickoff_hearing_ai_extractions(customer_id, extraction_type)
  where is_active;
create index if not exists idx_spacareer_kh_ai_created
  on public.spacareer_kickoff_hearing_ai_extractions(customer_id, created_at desc);

comment on table public.spacareer_kickoff_hearing_ai_extractions is
  'AI抽出結果（ハイライトTop5 / 深掘り候補3つ）。immutable、再実行時は新規追加して旧版を is_active=false に。';

-- ============================================================
-- 5. updated_at 自動更新トリガー
-- ============================================================
-- ai_extractions は immutable のため除外
do $$
declare
  t text;
  tables text[] := array[
    'spacareer_kickoff_hearing_questions',
    'spacareer_kickoff_hearing_sessions',
    'spacareer_kickoff_hearing_responses'
  ];
begin
  foreach t in array tables loop
    execute format(
      'drop trigger if exists set_updated_at_%1$s on public.%1$s; '
      'create trigger set_updated_at_%1$s '
      'before update on public.%1$s '
      'for each row execute function public.tg_set_updated_at();',
      t
    );
  end loop;
end $$;

-- ============================================================
-- 6. 顧客INSERT → kickoff_hearing_session 自動生成 trigger
-- ============================================================
-- 既存 fn_spacareer_create_customer_sessions（9セッション+kickoff_checks生成）とは
-- 別trigger として独立。同じ INSERT イベントで両方発火する。
create or replace function public.fn_spacareer_create_kickoff_hearing_session()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.spacareer_kickoff_hearing_sessions (org_id, customer_id, status)
  values (new.org_id, new.id, 'unnotified')
  on conflict (customer_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_spacareer_create_kickoff_hearing_session
  on public.spacareer_customers;
create trigger trg_spacareer_create_kickoff_hearing_session
  after insert on public.spacareer_customers
  for each row
  execute function public.fn_spacareer_create_kickoff_hearing_session();

comment on function public.fn_spacareer_create_kickoff_hearing_session() is
  '受講生作成時に kickoff_hearing_session を自動生成（status=unnotified）';

-- ============================================================
-- 7. 初回回答時 → first_accessed_at / deadline_at / status 自動セット
-- ============================================================
-- 受講生が初めて1問でも保存した瞬間に72h期限がスタート。
-- status は unstarted → in_progress に進める（unnotified の場合は触らない:
-- Slack DM 配信が先に走るべき設計のため、配信前のアクセスは想定外）。
create or replace function public.fn_spacareer_kickoff_hearing_on_response()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.spacareer_kickoff_hearing_sessions s
  set
    first_accessed_at = coalesce(s.first_accessed_at, now()),
    deadline_at = coalesce(
      s.deadline_at,
      coalesce(s.deadline_extended_to, now() + interval '72 hours')
    ),
    status = case
      when s.status in ('unstarted','unnotified') then 'in_progress'
      else s.status
    end
  where s.customer_id = new.customer_id;

  return new;
end;
$$;

drop trigger if exists trg_spacareer_kickoff_hearing_on_response_ins
  on public.spacareer_kickoff_hearing_responses;
create trigger trg_spacareer_kickoff_hearing_on_response_ins
  after insert on public.spacareer_kickoff_hearing_responses
  for each row
  execute function public.fn_spacareer_kickoff_hearing_on_response();

drop trigger if exists trg_spacareer_kickoff_hearing_on_response_upd
  on public.spacareer_kickoff_hearing_responses;
create trigger trg_spacareer_kickoff_hearing_on_response_upd
  after update on public.spacareer_kickoff_hearing_responses
  for each row
  when (new.answer_text is distinct from old.answer_text)
  execute function public.fn_spacareer_kickoff_hearing_on_response();

comment on function public.fn_spacareer_kickoff_hearing_on_response() is
  '初回回答時に first_accessed_at と deadline_at(+72h) を自動セット、status を in_progress に進める';

-- ============================================================
-- 8. RLS ポリシー（4テーブル）
-- ============================================================
-- ロール:
--   admin   - 全許可
--   trainer - 担当顧客のみ（spacareer_trainer_customer_ids() を利用）
--   student - 自分の customer_id のみ（spacareer_current_customer_id() を利用）
--
-- questions マスタは全認証ユーザー閲覧可・admin のみ編集可。

-- ----------------------------------------------------------------
-- 8.1 spacareer_kickoff_hearing_questions
-- ----------------------------------------------------------------
alter table public.spacareer_kickoff_hearing_questions enable row level security;

drop policy if exists kh_questions_select on public.spacareer_kickoff_hearing_questions;
create policy kh_questions_select on public.spacareer_kickoff_hearing_questions
  for select to authenticated
  using (org_id = public.get_user_org_id());

drop policy if exists kh_questions_insert on public.spacareer_kickoff_hearing_questions;
create policy kh_questions_insert on public.spacareer_kickoff_hearing_questions
  for insert to authenticated
  with check (org_id = public.get_user_org_id() and public.spacareer_is_admin());

drop policy if exists kh_questions_update on public.spacareer_kickoff_hearing_questions;
create policy kh_questions_update on public.spacareer_kickoff_hearing_questions
  for update to authenticated
  using (org_id = public.get_user_org_id() and public.spacareer_is_admin());

drop policy if exists kh_questions_delete on public.spacareer_kickoff_hearing_questions;
create policy kh_questions_delete on public.spacareer_kickoff_hearing_questions
  for delete to authenticated
  using (org_id = public.get_user_org_id() and public.spacareer_is_admin());

-- ----------------------------------------------------------------
-- 8.2 spacareer_kickoff_hearing_sessions
-- ----------------------------------------------------------------
alter table public.spacareer_kickoff_hearing_sessions enable row level security;

drop policy if exists kh_sessions_select on public.spacareer_kickoff_hearing_sessions;
create policy kh_sessions_select on public.spacareer_kickoff_hearing_sessions
  for select to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
      or customer_id = public.spacareer_current_customer_id()
    )
  );

drop policy if exists kh_sessions_insert on public.spacareer_kickoff_hearing_sessions;
create policy kh_sessions_insert on public.spacareer_kickoff_hearing_sessions
  for insert to authenticated
  with check (org_id = public.get_user_org_id() and public.spacareer_is_admin());

-- update: admin は全更新、trainer は status/deadline_extended_to/completed_at のみ、
-- student は触らない（trigger 経由で first_accessed_at が更新されるのは security definer 関数なのでRLSスルー）
drop policy if exists kh_sessions_update on public.spacareer_kickoff_hearing_sessions;
create policy kh_sessions_update on public.spacareer_kickoff_hearing_sessions
  for update to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
    )
  );

drop policy if exists kh_sessions_delete on public.spacareer_kickoff_hearing_sessions;
create policy kh_sessions_delete on public.spacareer_kickoff_hearing_sessions
  for delete to authenticated
  using (org_id = public.get_user_org_id() and public.spacareer_is_admin());

-- ----------------------------------------------------------------
-- 8.3 spacareer_kickoff_hearing_responses
-- ----------------------------------------------------------------
alter table public.spacareer_kickoff_hearing_responses enable row level security;

drop policy if exists kh_responses_select on public.spacareer_kickoff_hearing_responses;
create policy kh_responses_select on public.spacareer_kickoff_hearing_responses
  for select to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
      or customer_id = public.spacareer_current_customer_id()
    )
  );

-- student は自分の回答だけ insert/update 可能
drop policy if exists kh_responses_insert on public.spacareer_kickoff_hearing_responses;
create policy kh_responses_insert on public.spacareer_kickoff_hearing_responses
  for insert to authenticated
  with check (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id = public.spacareer_current_customer_id()
    )
  );

drop policy if exists kh_responses_update on public.spacareer_kickoff_hearing_responses;
create policy kh_responses_update on public.spacareer_kickoff_hearing_responses
  for update to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id = public.spacareer_current_customer_id()
    )
  );

drop policy if exists kh_responses_delete on public.spacareer_kickoff_hearing_responses;
create policy kh_responses_delete on public.spacareer_kickoff_hearing_responses
  for delete to authenticated
  using (org_id = public.get_user_org_id() and public.spacareer_is_admin());

-- ----------------------------------------------------------------
-- 8.4 spacareer_kickoff_hearing_ai_extractions
-- ----------------------------------------------------------------
-- 受講生は閲覧不可（AI抽出は運営側専用）。trainer は担当顧客のみ閲覧可。
alter table public.spacareer_kickoff_hearing_ai_extractions enable row level security;

drop policy if exists kh_ai_select on public.spacareer_kickoff_hearing_ai_extractions;
create policy kh_ai_select on public.spacareer_kickoff_hearing_ai_extractions
  for select to authenticated
  using (
    org_id = public.get_user_org_id() and (
      public.spacareer_is_admin()
      or customer_id in (select public.spacareer_trainer_customer_ids())
    )
  );

-- insert は基本 Edge Function (service role) から。admin の手動投入も許可。
drop policy if exists kh_ai_insert on public.spacareer_kickoff_hearing_ai_extractions;
create policy kh_ai_insert on public.spacareer_kickoff_hearing_ai_extractions
  for insert to authenticated
  with check (org_id = public.get_user_org_id() and public.spacareer_is_admin());

-- update は admin のみ（is_active を false に切替える運用）
drop policy if exists kh_ai_update on public.spacareer_kickoff_hearing_ai_extractions;
create policy kh_ai_update on public.spacareer_kickoff_hearing_ai_extractions
  for update to authenticated
  using (org_id = public.get_user_org_id() and public.spacareer_is_admin());

drop policy if exists kh_ai_delete on public.spacareer_kickoff_hearing_ai_extractions;
create policy kh_ai_delete on public.spacareer_kickoff_hearing_ai_extractions
  for delete to authenticated
  using (org_id = public.get_user_org_id() and public.spacareer_is_admin());

-- ============================================================
-- 9. 既存顧客への kickoff_hearing_session 遡及作成
-- ============================================================
-- すでに spacareer_customers にレコードがあるテスト顧客向けに
-- session レコードを補完投入。
insert into public.spacareer_kickoff_hearing_sessions (org_id, customer_id, status)
select c.org_id, c.id, 'unnotified'
from public.spacareer_customers c
left join public.spacareer_kickoff_hearing_sessions s on s.customer_id = c.id
where s.id is null;
