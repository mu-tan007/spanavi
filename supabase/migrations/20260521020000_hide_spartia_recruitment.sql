-- =====================================================================
-- Spartia Recruitment を一旦非表示にする
-- ---------------------------------------------------------------------
-- 経緯:
--   Spartia Recruitment 事業はローンチまで時間がかかるため、Spanavi UI上
--   から一旦非表示にする。product.is_active=false で各セレクタから除外し、
--   engagement.status='paused' で active フィルタからも外す。
-- =====================================================================

set local search_path = public, extensions;

update public.products
   set is_active = false,
       updated_at = now()
 where slug = 'spartia_recruitment_biz';

update public.engagements
   set status = 'paused',
       updated_at = now()
 where slug = 'spartia_recruitment';
