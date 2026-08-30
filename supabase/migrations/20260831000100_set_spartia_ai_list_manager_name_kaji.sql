-- =====================================================================
-- Spartia AI の4リストの「担当者」を鍛冶 雅也にする
-- ---------------------------------------------------------------------
-- 経緯:
--   20260831000000 で contact_ids（クライアント担当者への参照）だけを設定したが、
--   架電リスト画面の「担当者」列が表示しているのは call_lists.manager_name のほうで、
--   画面上は空欄のままだった。
--     ListView.jsx        manager 列
--     useSpanaviData.jsx  manager: cl.manager_name
--   contact_ids はメール差し込み（templateRenderer の primaryContact）と
--   カレンダー連携に使う別項目。両方に入れておく必要がある。
--
--   表示は shortManagerName() が苗字だけに縮めるので、既存の「金融商品仲介業者」
--   （'篠宮 拓武'）に合わせてフルネームで保存する。同姓の担当者がいなければ「鍛冶」と出る。
-- =====================================================================

set local search_path = public, extensions;
set local lock_timeout = '5s';

update call_lists
   set manager_name = '鍛冶 雅也'
 where client_id = '51af9005-2534-4c1f-b6f2-f64dc427b20f'
   and industry in ('Spartia AI_建築工事', 'Spartia AI_管工事',
                    'Spartia AI_土木工事', 'Spartia AI_電気工事');
