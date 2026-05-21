-- =====================================================================
-- アポ取得報告テンプレ機能 Phase 1: DB基盤
-- ---------------------------------------------------------------------
-- 経緯:
--   タイプ単位／クライアント単位／リスト単位でアポ取得報告フォーマットを
--   切り替える機能の基盤。詳細は tasks/appo_report_templates.md。
--
-- 設計:
--   - 1テーブル appointment_report_templates にスコープ別レコードを格納
--   - scope_level: 'engagement' | 'client' | 'list'
--     - engagement: engagement_id 単位のデフォルト
--     - client:     (engagement_id, client_id) 単位の上書き
--     - list:       call_lists.id 単位の上書き
--   - schema (JSONB): フィールド定義の配列
--     [{ key, label, type, required, placeholder, options? }]
--   - body_template: {{key}} 差し込み記法のテンプレ本文
--   - ai_prompt: AI添削時の追加指示
--
-- 継承順:
--   call_list.report_template_id（Phase 4 で追加）
--   → client × engagement 単位の override
--   → engagement のデフォルト
-- =====================================================================

set local search_path = public, extensions;

create table if not exists public.appointment_report_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  scope_level text not null check (scope_level in ('engagement', 'client', 'list')),
  engagement_id uuid references public.engagements(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  list_id uuid references public.call_lists(id) on delete cascade,
  schema jsonb not null default '[]'::jsonb,
  body_template text not null default '',
  ai_prompt text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- スコープごとに必要な参照が揃っているかチェック
  constraint appointment_report_templates_scope_check check (
    (scope_level = 'engagement' and engagement_id is not null and client_id is null and list_id is null)
    or (scope_level = 'client' and engagement_id is not null and client_id is not null and list_id is null)
    or (scope_level = 'list' and list_id is not null)
  )
);

-- インデックス
create index if not exists idx_apt_templates_org_id on public.appointment_report_templates(org_id);
create index if not exists idx_apt_templates_engagement_id on public.appointment_report_templates(engagement_id);
create index if not exists idx_apt_templates_client_id on public.appointment_report_templates(client_id) where client_id is not null;
create index if not exists idx_apt_templates_list_id on public.appointment_report_templates(list_id) where list_id is not null;

-- スコープ別ユニーク制約（is_active=true のみ）
create unique index if not exists apt_templates_engagement_uniq
  on public.appointment_report_templates (org_id, engagement_id)
  where scope_level = 'engagement' and is_active = true;

create unique index if not exists apt_templates_client_uniq
  on public.appointment_report_templates (org_id, client_id, engagement_id)
  where scope_level = 'client' and is_active = true;

create unique index if not exists apt_templates_list_uniq
  on public.appointment_report_templates (org_id, list_id)
  where scope_level = 'list' and is_active = true;

-- RLS
alter table public.appointment_report_templates enable row level security;

drop policy if exists appointment_report_templates_tenant_isolation on public.appointment_report_templates;
create policy appointment_report_templates_tenant_isolation on public.appointment_report_templates
  using (org_id = public.get_user_org_id());

-- updated_at 自動更新トリガー（既存のtrigger関数があれば使う、なければ簡易作成）
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then
    create or replace function public.set_updated_at()
    returns trigger language plpgsql as $f$
    begin new.updated_at = now(); return new; end;
    $f$;
  end if;
end $$;

drop trigger if exists trg_apt_templates_updated_at on public.appointment_report_templates;
create trigger trg_apt_templates_updated_at
  before update on public.appointment_report_templates
  for each row execute function public.set_updated_at();

comment on table public.appointment_report_templates is 'アポ取得報告のテンプレート。scope_level により engagement / client / list 単位で適用';
comment on column public.appointment_report_templates.schema is 'フィールド定義の配列 (JSON Schema 風): [{key, label, type, required, placeholder, options?}]';
comment on column public.appointment_report_templates.body_template is 'アポ報告本文の差し込みテンプレ ({{key}} 形式)';
comment on column public.appointment_report_templates.ai_prompt is 'AI添削時の追加指示文';
