-- キックオフヒアリング第2版 文言・文字数下限・原動力フレーズ対応。
--
-- 主な変更:
--   1. spacareer_kickoff_hearing_questions に min_chars カラム追加（必須項目の下限文字数）
--   2. spacareer_customers に driving_phrase カラム追加
--      （キックオフヒアリングAI抽出から生成、マイページ上部に表示）
--   3. 62問目（五感描写）を is_active=false で論理削除
--   4. 29 / 30 / 31 / 40 / 42 / 59 / 61 / 63 問目に min_chars 設定
--   5. 17 / 33 / 41 / 42 問目に help_text 追加・修正
--   6. 31 / 63 / 71 問目の question_text を修正
--   7. 72 問目に placeholder 追加

set local search_path = public, extensions;

-- ============================================================
-- 1. カラム追加
-- ============================================================

ALTER TABLE public.spacareer_kickoff_hearing_questions
  ADD COLUMN IF NOT EXISTS min_chars INTEGER NULL;

COMMENT ON COLUMN public.spacareer_kickoff_hearing_questions.min_chars IS
  '必須項目の最低文字数。NULLなら下限なし。提出時にこの値未満ならアラート。';

ALTER TABLE public.spacareer_customers
  ADD COLUMN IF NOT EXISTS driving_phrase TEXT NULL;

COMMENT ON COLUMN public.spacareer_customers.driving_phrase IS
  'マイページ上部に表示する「あなたの原動力」フレーズ。キックオフヒアリング AI 抽出から生成。';

-- ============================================================
-- 2. 62問目を論理削除（五感描写）
-- ============================================================

UPDATE public.spacareer_kickoff_hearing_questions
SET is_active = false, updated_at = now()
WHERE question_number = 62;

-- ============================================================
-- 3. 質問文・補足文・プレースホルダー・min_chars 更新
-- ============================================================

-- 17問目: 可処分所得の補足
UPDATE public.spacareer_kickoff_hearing_questions
SET help_text = '可処分所得＝手取りから家賃・通信費などの固定費を引いた、自由に使えるお金です。趣味・交際費・自己投資などに回せる金額の目安をお書きください。',
    updated_at = now()
WHERE question_number = 17;

-- 29問目: 動機・理由を300文字以上で記載
UPDATE public.spacareer_kickoff_hearing_questions
SET min_chars = 300, updated_at = now()
WHERE question_number = 29;

-- 30問目: 決めた瞬間を300文字以上で
UPDATE public.spacareer_kickoff_hearing_questions
SET min_chars = 300, updated_at = now()
WHERE question_number = 30;

-- 31問目: 質問文に「理由もあわせて」を追加、min_chars=300
UPDATE public.spacareer_kickoff_hearing_questions
SET question_text = 'もし今回参加していなかったら、半年後どうなっていると思うか。理由もあわせて教えてください',
    min_chars = 300,
    updated_at = now()
WHERE question_number = 31;

-- 33問目: お金そのものではなく…の補足
UPDATE public.spacareer_kickoff_hearing_questions
SET help_text = 'お金そのものではなく、お金があることで手に入れられるものや、余裕ができて得られるものを記入してください。',
    updated_at = now()
WHERE question_number = 33;

-- 40問目: 挫折経験＋学びを300文字以上
UPDATE public.spacareer_kickoff_hearing_questions
SET min_chars = 300, updated_at = now()
WHERE question_number = 40;

-- 41問目: 成功体験なくてもOKの補足
UPDATE public.spacareer_kickoff_hearing_questions
SET help_text = '成功体験がなくても、この瞬間が嬉しかったなと思うような内容でも大丈夫です！',
    updated_at = now()
WHERE question_number = 41;

-- 42問目: 些細でもOKの補足、min_chars=100
UPDATE public.spacareer_kickoff_hearing_questions
SET help_text = '些細なことでも大丈夫です！どんな環境のどの要素が効いたかをお書きください。',
    min_chars = 100,
    updated_at = now()
WHERE question_number = 42;

-- 59問目: 5年後の未来像 300文字以上
UPDATE public.spacareer_kickoff_hearing_questions
SET min_chars = 300, updated_at = now()
WHERE question_number = 59;

-- 60問目: 下限なし明示（NULL のままだが念のため）
UPDATE public.spacareer_kickoff_hearing_questions
SET min_chars = NULL, updated_at = now()
WHERE question_number = 60;

-- 61問目: min_chars=100
UPDATE public.spacareer_kickoff_hearing_questions
SET min_chars = 100, updated_at = now()
WHERE question_number = 61;

-- 63問目: 質問文修正＋理由を求める＋300文字以上
UPDATE public.spacareer_kickoff_hearing_questions
SET question_text = '目標達成までの最大の障害は何だと自覚しているか。その理由も教えてください',
    min_chars = 300,
    updated_at = now()
WHERE question_number = 63;

-- 71問目: 第1回がゴール設計セッションである旨を踏まえて質問文を修正
UPDATE public.spacareer_kickoff_hearing_questions
SET question_text = '第1回は「ゴール設計セッション」です。5年後・3年後・1年後・3か月後・1か月後まで具体的にゴールを明確化していくセッションを踏まえて、聞きたいことを自由に記載してください',
    updated_at = now()
WHERE question_number = 71;

-- 72問目: placeholder で理想状態の例示
UPDATE public.spacareer_kickoff_hearing_questions
SET placeholder = '例: 5年後の目標から1ヶ月後まで、具体的に自分が何をしたら、どのように目標設計をしたらいいのかを理解できる状態になっていること',
    updated_at = now()
WHERE question_number = 72;
