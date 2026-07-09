-- スパキャリ: 第2回 固定課題マスターの修正・追加（むー様指示 2026-07-09）
--
-- 変更内容:
--   1. position1（応募課題）を「中〜高単価・固定報酬8,000円以上・30件応募＋応募文章共有＋2件FB」に変更
--   2. position2（プロフィール課題）を簡素化（記載指示を撤廃し「フィードバックをもらってください」で終える）
--   3. 実践アクションに「副業系プラットフォーム5つ登録」課題を position4 に新規追加
--
-- 本ファイルはマスター（spacareer_homework_fixed_items）のみを対象とする。
-- 既に配信済みの未提出受講生への反映（spacareer_homework_items のバックフィル）は
-- 提出状況に依存するランタイムデータ操作のため、別途一括SQLで適用する。

set local search_path = public, extensions;

-- 1. 応募課題（position 1）
update public.spacareer_homework_fixed_items
set question_text = '中〜高単価案件（固定報酬制で8,000円以上のもの）に30件応募してください。応募した案件と、その際の応募文章をSlackでトレーナーに共有し、フィードバックをもらってください（フィードバックをもらう案件は2件ほどで構いません）。',
    question_hint = '応募文章はSlackでトレーナーに共有し、2件ほどフィードバックをもらいましょう。',
    updated_at = now()
where session_no = 2 and position = 1;

-- 2. プロフィール課題（position 2）：記載指示を撤廃し、フィードバック取得までで終える
update public.spacareer_homework_fixed_items
set question_text = 'クラウドワークスのプロフィール文章を作成し、Slackでトレーナーに送付して添削（フィードバック）をもらってください。',
    question_hint = null,
    updated_at = now()
where session_no = 2 and position = 2;

-- 3. 新規課題「副業系プラットフォーム5つ登録」を実践アクション（position 4）に挿入。
--    unique(org_id, session_no, position) 制約を避けるため、position>=4 を一旦退避 → 挿入 → 復帰。
update public.spacareer_homework_fixed_items
set position = position + 100
where session_no = 2 and position >= 4;

insert into public.spacareer_homework_fixed_items
  (org_id, session_no, position, section, question_text, question_hint, is_required, item_type)
select o.org_id, 2, 4, '実践アクション',
  'ランサーズ、複業クラウド、シューマツワーカーなど、副業系のプラットフォームにクラウドワークスを含めて5つ登録してください。登録したプラットフォーム名もテキストにて記載してください。',
  '例）クラウドワークス、ランサーズ、複業クラウド、シューマツワーカー など5つを登録し、プラットフォーム名を記載してください。',
  true, 'text'
from (select distinct org_id from public.spacareer_customers) o
where not exists (
  select 1 from public.spacareer_homework_fixed_items f
  where f.org_id = o.org_id and f.session_no = 2 and f.section = '実践アクション'
    and f.question_text like 'ランサーズ、複業クラウド、シューマツワーカー%'
);

update public.spacareer_homework_fixed_items
set position = position - 99
where session_no = 2 and position >= 104;
