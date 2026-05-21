-- =====================================================================
-- クライアント × タイプ（engagement）単位の報酬体系
-- ---------------------------------------------------------------------
-- 経緯:
--   1クライアントに対して 売り手ソーシング と 買い手マッチング 等
--   別タイプを任せる場合、報酬体系も別建てになるケースが実在する
--   （例: 株式会社LST は売り手は売上連動4段階、買い手は固定10万円）。
--   clients.reward_type が1つなので、現状は1報酬体系しか持てない。
--
-- 変更:
--   client_engagement_reward_settings テーブルを新設し、
--   (client_id, engagement_id) ごとに reward_type を上書き可能にする。
--   レコードが無い engagement では従来通り clients.reward_type に
--   フォールバック（後方互換）。
-- =====================================================================

set local search_path = public, extensions;

create table if not exists public.client_engagement_reward_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  reward_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, client_id, engagement_id)
);

create index if not exists idx_cers_org_id on public.client_engagement_reward_settings(org_id);
create index if not exists idx_cers_client_id on public.client_engagement_reward_settings(client_id);
create index if not exists idx_cers_engagement_id on public.client_engagement_reward_settings(engagement_id);

alter table public.client_engagement_reward_settings enable row level security;

drop policy if exists cers_tenant_isolation on public.client_engagement_reward_settings;
create policy cers_tenant_isolation on public.client_engagement_reward_settings
  using (org_id = public.get_user_org_id());

comment on table public.client_engagement_reward_settings is
  'クライアント×タイプ(engagement)単位の報酬体系上書き。なければ clients.reward_type にフォールバック';

-- LST × 買い手マッチング を固定10万円(税別) = type_id "K" に設定
insert into public.client_engagement_reward_settings (org_id, client_id, engagement_id, reward_type)
values (
  'a0000000-0000-0000-0000-000000000001'::uuid,
  '78755af2-a967-442f-aaad-3562e572fca7'::uuid,  -- 株式会社LST
  '80f5ac5f-5ec0-46b7-bd99-539c9bc5bf25'::uuid,  -- matching
  'K'
)
on conflict (org_id, client_id, engagement_id) do nothing;
