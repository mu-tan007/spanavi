set local search_path = public, extensions;

-- ============================================================
-- スパキャリ: セッション感想テンプレ調整 ＋ 第1回事後課題ファイル項目の既配信者バックフィル
-- ------------------------------------------------------------
-- 1. 既に第1回事後課題(homework session_no=1)が配信済みの受講生にも
--    「私の人生の地図」ファイル提出項目(position=26)を反映する。
--    テンプレ更新(20260614100000)はテンプレ本体のみ更新しており、既に
--    spacareer_homework_items 行へマテリアライズ済みの受講生には出ないため。
-- 2. セッション感想テンプレ(session_feedback)の設問調整。
--    - biggest_learning（セッションで一番学びになったこと）に min_length=50 を付与
--    - next_theme のラベルを「次回のセッションであらかじめ質問したいことが
--      あれば教えてください」に変更し「（任意）」表記を削除（required は false の
--      まま＝空欄でも提出可）
-- ============================================================

-- ------------------------------------------------------------
-- 1. 既配信 homework(session_no=1) へファイル提出項目をバックフィル
--    position=26 が既に存在する場合はスキップ（再実行で重複しない）。
-- ------------------------------------------------------------
insert into public.spacareer_homework_items
  (org_id, homework_id, position, section, question_text, question_hint,
   is_required, max_length, item_type, template_url, template_name)
select
  h.org_id,
  h.id,
  26,
  'STEP8：私の人生の地図（提出物）',
  'テンプレート「私の人生の地図」をダウンロードして記入し、完成したファイルをアップロードしてください。',
  '※ STEP1〜7の内容をもとに、あなたの人生の地図（目的地・現在地・ルート）を1枚にまとめます。記入後のファイルを下の「ファイル添付」からアップロードしてください。',
  false,
  null,
  'file',
  '/spacareer-templates/my-life-map.pptx',
  '私の人生の地図.pptx'
from public.spacareer_homework h
where h.session_no = 1
  and not exists (
    select 1 from public.spacareer_homework_items i
    where i.homework_id = h.id and i.position = 26
  );

-- ------------------------------------------------------------
-- 2. session_feedback テンプレの設問調整（順序を保持して該当2問のみ書き換え）
-- ------------------------------------------------------------
update public.spacareer_templates t
set content = jsonb_set(
  t.content,
  '{questions}',
  (
    select jsonb_agg(
             case
               when q->>'id' = 'biggest_learning'
                 then q || jsonb_build_object('min_length', 50)
               when q->>'id' = 'next_theme'
                 then q || jsonb_build_object(
                   'label', '次回のセッションであらかじめ質問したいことがあれば教えてください'
                 )
               else q
             end
             order by ord
           )
    from jsonb_array_elements(t.content->'questions') with ordinality as e(q, ord)
  )
)
where t.template_type = 'session_feedback'
  and t.content ? 'questions';
