-- =====================================================================
-- client_engagement_reward_settings に「intro 切替」フィールドを追加
-- ---------------------------------------------------------------------
-- 経緯:
--   株式会社日本提携支援（売り手ソーシング）の報酬体系が
--     1〜3 件目（面談済になった 3 件まで）: 固定 ¥100,000 (税別) = K
--     4 件目以降                              : 高単価売上連動 4 段階 = F
--   というハイブリッド構造。現状の cers は (client_id, engagement_id) ごとに
--   reward_type を 1 つしか持てないので、先頭 N 件だけ別タイプに切り替える
--   汎用カラムを足す。reward_types マスタには手を入れない。
--
--   resolver: appointments で同一 (client_id, engagement_id) かつ
--             status='面談済' の件数を数え、intro_count 未満なら
--             intro_reward_type、それ以外は reward_type を採用する。
-- =====================================================================

set local search_path = public, extensions;

alter table public.client_engagement_reward_settings
  add column if not exists intro_count int not null default 0,
  add column if not exists intro_reward_type text null;

-- intro_count > 0 のときは intro_reward_type 必須
alter table public.client_engagement_reward_settings
  drop constraint if exists cers_intro_consistency;
alter table public.client_engagement_reward_settings
  add constraint cers_intro_consistency check (
    (intro_count = 0 and intro_reward_type is null)
    or (intro_count > 0 and intro_reward_type is not null)
  );

comment on column public.client_engagement_reward_settings.intro_count is
  '面談済になった最初の N 件は intro_reward_type を適用 (0 なら無し)';
comment on column public.client_engagement_reward_settings.intro_reward_type is
  '初回 intro_count 件に適用する reward_types.type_id';

-- 株式会社日本提携支援 (売り手ソーシング) に 3件 -> K の intro 設定
update public.client_engagement_reward_settings
   set intro_count = 3,
       intro_reward_type = 'K',
       updated_at = now()
 where client_id = '5e5dd839-47df-4e8f-8ee9-455efed84eb2'
   and engagement_id = '417f478d-c913-476c-9362-c33b58e6d301';
