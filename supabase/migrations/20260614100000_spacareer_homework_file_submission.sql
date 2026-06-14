set local search_path = public, extensions;

-- ============================================================
-- 事後課題にファイル提出形式の項目を追加できるようにする
-- ----------------------------------------------------------------
-- テキスト回答に加えて「テンプレートをダウンロード→記入→成果物をアップロード」
-- 形式の設問を、テキスト設問と同じ事後課題フォーム内に出せるようにする。
--   item_type     : 'text'(既定) | 'file'
--   template_url  : テンプレDLリンク（アプリ public/ 配信。例 /spacareer-templates/xxx.pptx）
--   template_name : ダウンロード時の表示ファイル名（日本語可）
-- 成果物アップロード自体は既存の attached_files（設問単位ファイル添付）を流用する。
-- ============================================================
alter table public.spacareer_homework_items
  add column if not exists item_type text not null default 'text',
  add column if not exists template_url text,
  add column if not exists template_name text;

comment on column public.spacareer_homework_items.item_type is
  '設問の入力形式。text=テキスト回答 / file=テンプレDL＋成果物アップロード。';
comment on column public.spacareer_homework_items.template_url is
  'file形式の設問でダウンロードさせるテンプレートのURL。';
comment on column public.spacareer_homework_items.template_name is
  'テンプレートDL時に提示するファイル名（日本語可）。';

-- ------------------------------------------------------------
-- 第1回事後課題(homework_1)に「私の人生の地図」ファイル提出項目を追加
-- 既に position=26 が存在する場合はスキップ（再実行で重複しない）。
-- ------------------------------------------------------------
update public.spacareer_templates
set content = jsonb_set(
  content,
  '{items}',
  (content->'items') || jsonb_build_array(
    jsonb_build_object(
      'position', 26,
      'section', 'STEP8：私の人生の地図（提出物）',
      'item_type', 'file',
      'template_url', '/spacareer-templates/my-life-map.pptx',
      'template_name', '私の人生の地図.pptx',
      'question_text', 'テンプレート「私の人生の地図」をダウンロードして記入し、完成したファイルをアップロードしてください。',
      'question_hint', '※ STEP1〜7の内容をもとに、あなたの人生の地図（目的地・現在地・ルート）を1枚にまとめます。記入後のファイルを下の「ファイル添付」からアップロードしてください。',
      'is_required', false
    )
  )
)
where template_type = 'homework_1' and version = 1
  and not ((content->'items') @> '[{"position": 26}]'::jsonb);
