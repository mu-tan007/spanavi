-- =====================================================================
-- 報酬体系をクライアント×タイプ単位に一本化
-- ---------------------------------------------------------------------
-- 経緯:
--   従来は clients.reward_type が「デフォルト」、
--   client_engagement_reward_settings が「上書き」という2層構造。
--   実態として 売り手ソーシング・買い手マッチングで報酬体系が異なる
--   ケースが大半で、「デフォルト」の概念が直感的でない。
--   クライアント開拓は会社売上ゼロのため報酬計算不要。
--
-- 変更:
--   既存 clients.reward_type を 売り手ソーシング (seller_sourcing) 行
--   へ自動コピー。client_engagement_reward_settings のみで管理する
--   一本化された構造に移行。
--
--   ※ clients.reward_type カラム自体は後方互換のため残す
--      （legacy AppoReportModal や旧コードがまだ参照する可能性）
-- =====================================================================

set local search_path = public, extensions;

-- seller_sourcing engagement を持つ org について、各 client の reward_type を
-- 売り手ソーシング行に自動コピー（重複は無視）
insert into public.client_engagement_reward_settings (org_id, client_id, engagement_id, reward_type)
select
  c.org_id,
  c.id,
  e.id,
  c.reward_type
from public.clients c
join public.engagements e
  on e.org_id = c.org_id
 and e.slug = 'seller_sourcing'
where c.reward_type is not null
  and c.reward_type <> ''
on conflict (org_id, client_id, engagement_id) do nothing;
