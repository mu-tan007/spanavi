-- =====================================================================
-- Spartia AI の4リストをアポ単価0円にする
-- ---------------------------------------------------------------------
-- Spartia AI のインターン報酬は「顧客からの入金額（税別・実費を除く）の5%」だけで、
-- アポ1件あたりの支払いは無い。
--
-- 何もしないと clients.reward_type = 'MN'（MASP新規開拓 定額・税込12,000円・面談実施時）
-- にフォールバックして、アポ1件ごとに12,000円が計上されてしまう。
-- reward_type は M&A の新規開拓リストと共用なので、そちらを変えることはできない。
-- よってリスト単位の上書き call_lists.appo_unit_price（税別円）で0円を指定する。
--
-- 併せてアプリ側で appo_unit_price = 0 を「未設定」ではなく「0円」として扱うよう修正済み
-- （utils/money.js の hasListUnitPrice。従来は `> 0` 判定で0が無視されていた）。
-- =====================================================================

set local search_path = public, extensions;
set local lock_timeout = '5s';

update call_lists
   set appo_unit_price = 0
 where client_id = '51af9005-2534-4c1f-b6f2-f64dc427b20f'
   and industry in ('Spartia AI_建築工事', 'Spartia AI_管工事',
                    'Spartia AI_土木工事', 'Spartia AI_電気工事');
