-- =====================================================================
-- M&Aソーシングパートナーズ の重複 clients 行を統合し、Spartia AI の面談担当を登録する
-- ---------------------------------------------------------------------
-- 経緯:
--   clients に同名・同org の行が2つあり、スクリプト画面にカードが2枚出ていた。
--     A 51af9005-2534-4c1f-b6f2-f64dc427b20f  2026-05-14作成
--       M&A(472件) / 金融商品仲介業者(637件) の2リスト・アポ15件・報酬設定2件・reward_type='MN'
--     B da05ac2b-f950-45bb-b67c-7eddfcc5e050  2026-07-09作成
--       Spartia AI の4リストだけ。他13テーブルは全て0件。reward_type は NULL、contract_status='未'
--   B は空のまま作られた行で、2026-08-30 に作った Spartia AI のリストが誤って
--   こちらに紐づいていた。
--
-- 順番が重要:
--   clients への外部キーは大半が ON DELETE CASCADE。先に B を削除すると
--   Spartia AI の4リスト（建築工事の398件と保存済みスクリプト）が道連れで消える。
--   必ず「付け替え → 残存0件の確認 → 削除」の順で行う。
--
-- 報酬体系:
--   Spartia AI の4リストは engagement 64ca8e30（M&Aリストと同じ「クライアント開拓」枠）を
--   使っており、A 側には既に (A, 64ca8e30) → 'MN' の設定がある。
--   付け替えるだけで報酬体系が正しく解決されるため、追加設定は不要。
--
-- 併せて:
--   Spartia AI の顧客面談を担当する 鍛冶 雅也 を client_contacts に追加し、
--   Spartia AI の4リストの担当者に設定する。
--   members / users 側の鍛冶さん（ログイン用 kajimasayamasaya@icloud.com）は触らない。
--   ログイン用メールを変更するとログインできなくなる事故があるため。
-- =====================================================================

set local search_path = public, extensions;
set local lock_timeout = '5s';

-- ① Spartia AI の4リストを A へ付け替える（スクリプト列には触らない）
update call_lists
   set client_id = '51af9005-2534-4c1f-b6f2-f64dc427b20f'
 where client_id = 'da05ac2b-f950-45bb-b67c-7eddfcc5e050';

-- ② B に何も残っていないことを確認する。1件でも残っていれば例外で止める
--    （clients を参照している外部キーを持つ14テーブルを全て数える）
do $$
declare
  n bigint;
  b constant uuid := 'da05ac2b-f950-45bb-b67c-7eddfcc5e050';
begin
  select (select count(*) from appointment_report_templates      where client_id = b)
       + (select count(*) from appointments                      where client_id = b)
       + (select count(*) from call_lists                        where client_id = b)
       + (select count(*) from cap_ma_agencies                   where linked_client_id = b)
       + (select count(*) from client_contacts                   where client_id = b)
       + (select count(*) from client_engagement_reward_settings where client_id = b)
       + (select count(*) from client_lead_companies             where promoted_to_client_id = b)
       + (select count(*) from client_meetings                   where client_id = b)
       + (select count(*) from client_monthly_targets            where client_id = b)
       + (select count(*) from client_sheets                     where client_id = b)
       + (select count(*) from contact_voice_inputs              where client_id = b)
       + (select count(*) from contracts                         where client_id = b)
       + (select count(*) from deals                             where client_id = b)
       + (select count(*) from invoice_sent_log                  where client_id = b)
    into n;
  if n <> 0 then
    raise exception '重複行 B にまだ % 件ぶら下がっているため削除を中止しました', n;
  end if;
end $$;

-- ③ 空になった B を削除する
delete from clients
 where id = 'da05ac2b-f950-45bb-b67c-7eddfcc5e050';

-- ④ 鍛冶 雅也 をクライアント担当者（面談担当）として A に追加する
--    GoogleカレンダーIDは Google アカウントである必要があるため Gmail を使う
insert into client_contacts (org_id, client_id, name, email, google_calendar_id, is_primary)
select 'a0000000-0000-0000-0000-000000000001'::uuid,
       '51af9005-2534-4c1f-b6f2-f64dc427b20f'::uuid,
       '鍛冶 雅也',
       'kajimasaya0906@gmail.com',
       'kajimasaya0906@gmail.com',
       false
 where not exists (
   select 1 from client_contacts
    where client_id = '51af9005-2534-4c1f-b6f2-f64dc427b20f'
      and email = 'kajimasaya0906@gmail.com'
 );

-- ⑤ Spartia AI の4リストの担当者を鍛冶さんにする
--    contact_ids（UUID[]）と contact_id（先頭1件）の両方を書く。
--    アプリ側（lib/supabaseWrite.js）が両方を書いているため、片方だけだと表示がずれる
update call_lists l
   set contact_ids = array[k.id],
       contact_id  = k.id
  from (
    select id from client_contacts
     where client_id = '51af9005-2534-4c1f-b6f2-f64dc427b20f'
       and email = 'kajimasaya0906@gmail.com'
     limit 1
  ) k
 where l.client_id = '51af9005-2534-4c1f-b6f2-f64dc427b20f'
   and l.industry in ('Spartia AI_建築工事', 'Spartia AI_管工事',
                      'Spartia AI_土木工事', 'Spartia AI_電気工事');
