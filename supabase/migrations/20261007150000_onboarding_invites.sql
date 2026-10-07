-- 入社手続きの自動化（2026-10-07 むー様決定・すべて推奨案）
-- 招待リンク → 本人が4情報を入力 → Spanavi内で契約に同意 → Slack・Zoom・LINE の案内
-- 公開ページからの読み書きは Edge Function（onboarding-join）が service role で行う。画面からは管理者だけが見られる。

create table if not exists public.onboarding_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  name_hint text,                       -- 発行時のメモ（例：山田さん）
  start_date date,                      -- 入社日＝契約開始日（空なら入力日）
  template_id uuid,                     -- 業務委託契約書のひな形
  status text not null default 'sent',  -- sent → submitted → signed → done／revoked
  member_id uuid,
  email text,
  submitted jsonb,                      -- 本人が入れた4情報（口座は member_invoice_profiles にも保存）
  steps jsonb not null default '{}'::jsonb, -- {slack:'joined', zoom:'created'|'active'|'no_license', line:'shown', ...}
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  submitted_at timestamptz,
  signed_at timestamptz
);
alter table public.onboarding_invites enable row level security;
create policy onboarding_invites_admin on public.onboarding_invites for all
  using (org_id = get_user_org_id() and exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'))
  with check (org_id = get_user_org_id() and exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'));

-- 契約への同意の記録（Spanavi内の署名）。同意した文書そのもの（docx）を保存し、その SHA-256 を残す
create table if not exists public.contract_agreements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  member_id uuid not null,
  invite_id uuid references public.onboarding_invites(id),
  contract_id uuid,
  template_id uuid,
  signer_name text not null,
  signer_email text not null,
  document_path text not null,          -- storage: contract-agreements/{org}/{member}/{id}.docx
  document_sha256 text not null,
  agreed_at timestamptz not null default now(),
  ip text,
  user_agent text
);
alter table public.contract_agreements enable row level security;
create policy contract_agreements_select on public.contract_agreements for select
  using (org_id = get_user_org_id() and (
    exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
    or exists (select 1 from members m where m.id = contract_agreements.member_id and m.user_id = auth.uid())));
-- 書き込みは Edge Function だけ（policy なし）

-- 組織ごとの案内（Slack の参加リンクは30日で切れるので貼り替える）
create table if not exists public.onboarding_settings (
  org_id uuid primary key,
  slack_invite_url text,
  slack_invite_set_at timestamptz,
  line_group_url text,
  default_template_id uuid,
  updated_at timestamptz not null default now()
);
alter table public.onboarding_settings enable row level security;
create policy onboarding_settings_admin on public.onboarding_settings for all
  using (org_id = get_user_org_id() and exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'))
  with check (org_id = get_user_org_id() and exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'));
-- 入社した本人は、自分の案内（Slack・LINEのリンク）だけ読める
create policy onboarding_settings_member_read on public.onboarding_settings for select
  using (org_id = get_user_org_id());

insert into storage.buckets (id, name, public) values ('contract-agreements', 'contract-agreements', false)
  on conflict (id) do nothing;
