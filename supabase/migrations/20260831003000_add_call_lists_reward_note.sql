-- =====================================================================
-- call_lists.reward_note: 金額で言い表せないリストの報酬表示
-- ---------------------------------------------------------------------
-- Spartia AI はアポ1件あたりの支払いが無く、報酬は「顧客からの入金額
-- （税別・実費を除く）の5%を入金月の翌月に架電者へ」だけ。
-- 架電リストの当社売上列に「アポ単価なし」としか出ないと、インターンが
-- 何をすればいくらもらえるのか読めない。
--
-- appo_unit_price = 0 を見て「入金の5%」と決め打ちすると UI に事業ルールが
-- 埋まり、将来ほかの0円リストまで同じ表示になる。engagement の slug で
-- 判定するのも slug を変えた瞬間に壊れる。よってリスト単位の列で持つ。
-- =====================================================================

set local search_path = public, extensions;
set local lock_timeout = '5s';

alter table public.call_lists
  add column if not exists reward_note text;

comment on column public.call_lists.reward_note is
  '成果報酬型など金額で表せないリストの報酬表示（例: 入金の5%）。'
  '入っていれば架電リストの当社売上列に金額の代わりに出す。NULL=従来どおり金額を出す。';

update call_lists
   set reward_note = '入金の5%'
 where client_id = '51af9005-2534-4c1f-b6f2-f64dc427b20f'
   and industry in ('Spartia AI_建築工事', 'Spartia AI_管工事',
                    'Spartia AI_土木工事', 'Spartia AI_電気工事');

-- 詳細な条件は架電前に読む注意事項の末尾へ足す。
-- 見出し「⑤その他注意点」は建築工事の編集時に外れていたので、追記の形にする。
update call_lists
   set cautions = rtrim(coalesce(cautions, ''), chr(10)) || chr(10) ||
                  '⑤報酬' || chr(10) ||
                  '　・アポ1件あたりの支払いはなし' || chr(10) ||
                  '　・顧客からの入金額（税別・実費を除く）の5%' || chr(10) ||
                  '　・入金月の翌月に、そのアポを取った本人へ支給'
 where client_id = '51af9005-2534-4c1f-b6f2-f64dc427b20f'
   and industry in ('Spartia AI_建築工事', 'Spartia AI_管工事',
                    'Spartia AI_土木工事', 'Spartia AI_電気工事')
   and coalesce(cautions, '') not like '%入金額（税別・実費を除く）の5%%';
