-- キックオフヒアリングに「あなたの原動力」専用質問を追加する。
--
-- 背景:
--   マイページ上部に表示する driving_phrase を AI 生成から、
--   受講生本人が直接書いた一文に切替える。AI 生成のブレを避け、
--   本人が「ここに表示される」と認識した状態で言語化したものを使う。
--
-- 設計:
--   - 新セクション K「あなたの原動力」を新設、74問目として1問だけ追加
--   - 必須、短文（200字）
--   - help_text で「マイページの基本情報の上部に表示されます」を明示
--   - 提出時にこの回答を spacareer_customers.driving_phrase に書き写す
--     （フロント側 ClientKickoffHearingView.handleSubmit で実装）

set local search_path = public, extensions;

INSERT INTO public.spacareer_kickoff_hearing_questions (
  org_id, section_code, section_name, question_number,
  question_text, answer_type, is_required, char_limit,
  placeholder, help_text, display_order, is_active
)
SELECT
  'a0000000-0000-0000-0000-000000000001',
  'K',
  'K. あなたの原動力',
  74,
  '心がくじけそうになった時に、自分自身にかけて元気づけられる・前を向けるような言葉を教えてください',
  'short_text',
  true,
  200,
  '例: 自分が信じた道を、最後まで自分の足で歩ききる',
  'ここに記入した内容は、マイページの基本情報の上部に「あなたの原動力」として表示されます。受講中いつでも見返せる、自分を奮い立たせる一文を書いてください。',
  74,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.spacareer_kickoff_hearing_questions
  WHERE org_id='a0000000-0000-0000-0000-000000000001' AND question_number = 74
);
