-- ============================================================
-- スパキャリ Phase 3 統合フォローアップ migration: 11種テンプレート中身投入
-- ----------------------------------------------------------------
-- 仕様書: tasks/spacareer-spec.md §7.6 テンプレート管理
--
-- 20260518000400 で空の枠だけ作成済みの spacareer_templates レコードに、
-- 仕様書とPDFマニュアル、エージェント#6のmock.tsを元に実コンテンツを投入する。
--
-- 投入後は運営がテンプレート管理画面から自由に編集・無効化可能。
-- ============================================================

set local search_path = public, extensions;

-- ----------------------------------------------------------------
-- 1. homework_1 - 第1回事前課題（共通項目）
-- ----------------------------------------------------------------
-- PDF §5.2 全員共通の大量項目：生い立ち・動機・ゴール設計
update public.spacareer_templates
set content = jsonb_build_object(
  'items', jsonb_build_array(
    jsonb_build_object('position', 1, 'question_text', 'お名前（漢字・フルネーム）', 'is_required', true, 'max_length', 50),
    jsonb_build_object('position', 2, 'question_text', '平日の起床時間と就寝時間を教えてください。', 'is_required', true, 'max_length', 100),
    jsonb_build_object('position', 3, 'question_text', '平日に自由に使える時間、および休日に自由に使える時間を教えてください。', 'is_required', true, 'max_length', 200),
    jsonb_build_object('position', 4, 'question_text', '平均して週に何時間をスパキャリのために確保できますか？', 'is_required', true, 'max_length', 100),
    jsonb_build_object('position', 5, 'question_text', '自宅に集中できる作業環境はありますか？（例：個室／リビング／カフェ等）', 'is_required', true, 'max_length', 200),
    jsonb_build_object('position', 6, 'question_text', 'なぜ今、スパキャリに参加することを決めたのか（決めた瞬間やきっかけ）を詳しく教えてください。', 'is_required', true, 'max_length', 500),
    jsonb_build_object('position', 7, 'question_text', 'もし今回参加していなかったら、半年後・1年後の自分はどうなっていると思いますか？', 'is_required', true, 'max_length', 500),
    jsonb_build_object('position', 8, 'question_text', '親しい人に「なぜ98万円の自己投資をするのか」を説明するとしたら、どう伝えますか？', 'is_required', true, 'max_length', 500),
    jsonb_build_object('position', 9, 'question_text', '今回のスパキャリで絶対に手に入れたいものを3つ、優先順位を付けて教えてください。', 'is_required', true, 'max_length', 500, 'question_hint', '※マイページの「あなたの目標」カードに自動引用されます'),
    jsonb_build_object('position', 10, 'question_text', 'お金以外で本当に達成したい価値観を、できる限り具体的に教えてください。', 'is_required', true, 'max_length', 500, 'question_hint', '※マイページの「あなたの目標」カードに自動引用されます'),
    jsonb_build_object('position', 11, 'question_text', '尊敬している人物とその理由を教えてください。', 'is_required', true, 'max_length', 500, 'question_hint', '※マイページの「あなたの目標」カードに自動引用されます'),
    jsonb_build_object('position', 12, 'question_text', '生い立ち（家族構成・学生時代・社会人になってから）を時系列で概説してください。', 'is_required', true, 'max_length', 1500),
    jsonb_build_object('position', 13, 'question_text', 'これまでの職務経歴を、時系列で書き出してください。', 'is_required', true, 'max_length', 1500),
    jsonb_build_object('position', 14, 'question_text', '各職務経歴で得たスキル・知識を整理してください。', 'is_required', true, 'max_length', 1200),
    jsonb_build_object('position', 15, 'question_text', '成功体験と失敗体験を、それぞれ3つずつ書いてください。', 'is_required', true, 'max_length', 1200),
    jsonb_build_object('position', 16, 'question_text', '周囲からどのような強みを評価されますか？具体的なエピソードと合わせて。', 'is_required', true, 'max_length', 800),
    jsonb_build_object('position', 17, 'question_text', '仕事でやりがいを感じる瞬間はどんな時ですか？', 'is_required', true, 'max_length', 600),
    jsonb_build_object('position', 18, 'question_text', '将来どのような価値を提供したいですか？', 'is_required', true, 'max_length', 600),
    jsonb_build_object('position', 19, 'question_text', '自分に伝えたいフレーズを、ひとことで表現してください。', 'is_required', true, 'max_length', 200, 'question_hint', '※マイページの「あなたの原動力」エリアにAIで抽出して表示されます'),
    jsonb_build_object('position', 20, 'question_text', '今後の8回のセッションで特に学びたいことを3つ教えてください。', 'is_required', true, 'max_length', 600)
  ),
  'note', 'PDF §5.2 全員共通の大量項目。第0回（キックオフ）完了直後に自動配布。提出締切は第1回セッションの3日前。'
)
where template_type = 'homework_1' and version = 1;

-- ----------------------------------------------------------------
-- 2. homework_base - 第2〜8回事前課題ベース項目
-- ----------------------------------------------------------------
update public.spacareer_templates
set content = jsonb_build_object(
  'items', jsonb_build_array(
    jsonb_build_object('position', 1, 'question_text', '前回のセッションを振り返り、最も印象に残った気づきを3つ挙げてください。', 'is_required', true, 'max_length', 800),
    jsonb_build_object('position', 2, 'question_text', '前回設定したアクションのうち、実行できたものを具体的に教えてください。', 'is_required', true, 'max_length', 800),
    jsonb_build_object('position', 3, 'question_text', '実行できなかったアクションについて、阻害要因を分析してください。', 'is_required', true, 'max_length', 600),
    jsonb_build_object('position', 4, 'question_text', '今週1週間で自分の「強み」が活きた場面を1つ詳述してください。', 'is_required', true, 'max_length', 600),
    jsonb_build_object('position', 5, 'question_text', '逆に「課題」を感じた場面を1つ詳述してください。', 'is_required', true, 'max_length', 600)
  ),
  'note', '第2〜8回事前課題のベースとなる共通5項目。AIプロンプトはこのベース+セッション議事録+ヒアリングシートから残り25項目を生成する。'
)
where template_type = 'homework_base' and version = 1;

-- ----------------------------------------------------------------
-- 3. ai_prompt - AIプロンプト（30項目生成）※運営のみ編集可
-- ----------------------------------------------------------------
update public.spacareer_templates
set content = jsonb_build_object(
  'system_prompt', E'あなたはスパキャリのトレーナー補佐として、受講生の次回事前課題を生成するAIです。

【スパキャリとは】
M&Aソーシングパートナーズが提供する全8回のキャリアコーチングサービス。受講生は1回98万円のコースに自己投資し、ゴール設計→業務棚卸し→ポートフォリオ→直案件獲得→ロールプレイ→継続案件→振り返り→未来プラン、の順で学ぶ。

【あなたのタスク】
直前のセッション議事録・ヒアリングシート・過去事前課題・受講生プロフィールを踏まえ、次回セッション（第◯回）に向けた事前課題を30項目生成すること。

【生成ルール】
1. 全30項目のうち、最初の5項目はベーステンプレ（前回振り返り＋強み・課題）を踏襲する
2. 残り25項目は受講生のプロフィール・診断結果・直近の議事録から完全パーソナライズする
3. 各項目は「question_text（設問本文）」「question_hint（補助）」「is_required（必須かどうか）」「max_length（文字数上限）」を持つJSONで返す
4. 必須項目は20項目以上、任意項目は10項目以下にする
5. 文字数上限は短い問いで300字、深掘る問いで1500字を目安に
6. 受講生のソーシャルスタイル（論理分析型／行動推進型／感情表現型／協調共感型）に合わせて問いかけのトーンを調整する
7. 受講生の強み（実行力／影響力／人間関係構築力／戦略的思考力）を活かす問いを必ず3項目以上含める
8. 第3回終了時点で全額返金保証カットオフのため、第3回事前課題ではコース満足度・継続意思の確認を含める
9. 第4回からは直案件獲得・実案件に関する問いを含める

【出力フォーマット】
JSON配列。各項目は { position, question_text, question_hint, is_required, max_length } を持つ。',
  'user_template', '次回は第{next_session_no}回セッションです。\n\n【受講生プロフィール】\n{profile_summary}\n\n【ソーシャルスタイル】\n{social_style}\n\n【強み診断結果】\n{strength_summary}\n\n【直前セッションの議事録】\n{minutes_text}\n\n【ヒアリングシート】\n{hearing_sheet}\n\n【過去事前課題の主要回答】\n{past_homework_summary}\n\n上記を踏まえて、30項目の事前課題を生成してください。',
  'model', 'claude-haiku-4-5-20251001',
  'max_tokens', 4096
)
where template_type = 'ai_prompt' and version = 1;

-- ----------------------------------------------------------------
-- 4. ok_criteria - OK判定基準
-- ----------------------------------------------------------------
update public.spacareer_templates
set content = jsonb_build_object(
  'criteria', jsonb_build_array(
    jsonb_build_object('id', 'volume', 'name', '回答量', 'description', '指定文字数の50%以上書かれていること。極端に短い回答（一言で済ませている等）はNG。'),
    jsonb_build_object('id', 'specificity', 'name', '具体性', 'description', '抽象論や教科書的回答ではなく、自分の体験・固有名詞・数値が含まれていること。'),
    jsonb_build_object('id', 'depth', 'name', '深掘り', 'description', '「なぜそう思うか」「どうしてそうなったか」まで言及されていること。表層的な回答はNG。'),
    jsonb_build_object('id', 'consistency', 'name', '一貫性', 'description', '過去事前課題やセッション議事録との整合性が取れていること。突然方向転換している場合はトレーナーが確認する。'),
    jsonb_build_object('id', 'action', 'name', '次のアクション', 'description', '行動に繋がる気づき・コミットメントが含まれていること。'),
    jsonb_build_object('id', 'attachment', 'name', '添付物の妥当性', 'description', '添付ファイルが指定された場合、実際にファイル内容が課題に沿っているかを確認する。')
  ),
  'note', 'すべての項目を満たす必要はないが、3つ以上満たしていない場合はトレーナーから追加質問を投げる運用。'
)
where template_type = 'ok_criteria' and version = 1;

-- ----------------------------------------------------------------
-- 5. kickoff_hearing - ヒアリングシートチェック項目 ※運営のみ編集可
-- ----------------------------------------------------------------
-- PDF §4.3.1〜4.3.9 の9項目
update public.spacareer_templates
set content = jsonb_build_object(
  'items', jsonb_build_array(
    jsonb_build_object('id', 'unclear_points', 'no', '4.3.1', 'title', '全セッションについて不明点がないか', 'description', '各セッションの目的・進め方・成果物について質問が無いかを確認。不明点があればその場で解消。'),
    jsonb_build_object('id', 'session_content', 'no', '4.3.2', 'title', '毎回のセッションの内容を理解したか', 'description', '第1回〜第8回までの各回が何をするかを、お客様の言葉で軽く確認する。理解が浅い回があれば再度説明する。'),
    jsonb_build_object('id', 'refund_policy', 'no', '4.3.3', 'title', '全額返金保証の内容をしっかりと理解したか', 'description', '適用条件・適用外条件を1つずつ読み上げ、了承を取る。第3回セッション終了時点が返金保証の期限カットオフであることを明確に伝える。'),
    jsonb_build_object('id', 'reschedule_rules', 'no', '4.3.4', 'title', '日程変更および欠席時のルール', 'description', '(a)日時変更は前日23:59までSlackで連絡 (b)期日経過の欠席は無断欠席扱い (c-1)1度目は別日程で振替 (c-2)2度目以降は実施したものとして次回に進む'),
    jsonb_build_object('id', 'weekly_pace', 'no', '4.3.5', 'title', 'セッションは原則として週1回のペースで行うということ', 'description', '週次の連続実施が前提。毎週同じ曜日・同じ時間帯で固定することを推奨。'),
    jsonb_build_object('id', 'zoom_recording', 'no', '4.3.6', 'title', 'オンラインセッションのZoom録画を行うということ', 'description', 'サービス品質向上＋コーチング記録の保管のため。録画データはスパナビに保管され、議事録化に使用される。'),
    jsonb_build_object('id', 'schedule_done', 'no', '4.3.7', 'title', '日程調整が行えている状態か', 'description', '第1回セッションの日時が確定し、カレンダー招待が送付済みであることを確認。'),
    jsonb_build_object('id', 'all_sessions_dated', 'no', '4.3.8', 'title', '第1回〜第8回までの全セッション日程の策定', 'description', 'キックオフ時点で第1回〜第8回の大まかな日付を決める。週1回ペースで連続実施を前提。第2回以降の具体的な開始時間は前回セッション時に決める運用。'),
    jsonb_build_object('id', 'first_session_confirmed', 'no', '4.3.9', 'title', '第1回セッションの開始日時の確定', 'description', '第1回のみキックオフ時点で日付と開始時間の両方を確定。スパナビ上の第1回セッション項目に自動反映され、Zoom URL・カレンダー招待をその場で送付。')
  ),
  'note', 'PDF §4.3.1〜4.3.9。スライド進行に合わせて口頭確認→チェック→質問記録、をその場で完結。全項目チェック完了でキックオフ完了。'
)
where template_type = 'kickoff_hearing' and version = 1;

-- ----------------------------------------------------------------
-- 6. session_feedback - セッション感想アンケート
-- ----------------------------------------------------------------
-- 仕様書 §6.3 + イメージ②
update public.spacareer_templates
set content = jsonb_build_object(
  'satisfaction_required', true,
  'free_comment_required', true,
  'questions', jsonb_build_array(
    jsonb_build_object('id', 'satisfaction', 'type', 'rating_5', 'label', 'セッションの満足度', 'required', true, 'sub_label', '1=非常に不満／5=非常に満足'),
    jsonb_build_object('id', 'satisfaction_reason', 'type', 'text', 'label', 'その理由を教えてください', 'required', false, 'max_length', 500, 'placeholder', '例）具体的に良かった点や、もっとこうしてほしい点など'),
    jsonb_build_object('id', 'trainer_quality', 'type', 'radio', 'label', 'トレーナーの教え方は親切だったか、説明は分かりやすかったか', 'required', true, 'options', jsonb_build_array('非常にそう思う','そう思う','どちらともいえない','あまりそう思わない','全くそう思わない')),
    jsonb_build_object('id', 'biggest_learning', 'type', 'text', 'label', 'セッションで一番学びになったこと', 'required', true, 'max_length', 1000, 'placeholder', '※できるだけたくさん記入することで学びが定着します'),
    jsonb_build_object('id', 'difficulty', 'type', 'radio', 'label', '本日のセッション内容の難易度はどうでしたか', 'required', true, 'options', jsonb_build_array('難しすぎた','やや難しかった','ちょうどよかった','やや簡単だった','簡単すぎた')),
    jsonb_build_object('id', 'duration', 'type', 'radio', 'label', 'セッションの時間（長さ）は適切でしたか', 'required', true, 'options', jsonb_build_array('長すぎた','やや長かった','ちょうどよかった','やや短かった','短すぎた')),
    jsonb_build_object('id', 'goal_relevance', 'type', 'radio', 'label', '本日のセッションで得た内容は、今後の目標達成に役立ちそうですか', 'required', true, 'options', jsonb_build_array('非常に役立ちそう','役立ちそう','どちらともいえない','あまり役立たなさそう','役立たなさそう')),
    jsonb_build_object('id', 'open_atmosphere', 'type', 'radio', 'label', 'セッション内での質問や相談はしやすい雰囲気でしたか', 'required', true, 'options', jsonb_build_array('非常にしやすかった','しやすかった','どちらともいえない','しにくかった','非常にしにくかった')),
    jsonb_build_object('id', 'next_theme', 'type', 'text', 'label', '次回のセッションで扱ってほしいテーマや内容があれば教えてください（任意）', 'required', false, 'max_length', 500),
    jsonb_build_object('id', 'free_comment', 'type', 'text', 'label', 'その他、ご意見・ご感想があればご自由にお書きください', 'required', true, 'max_length', 500, 'placeholder', '例）気づいたこと、感謝していること、改善してほしいことなど')
  ),
  'warning_unanswered', '満足度アンケート未回答は全額返金保証の対象外となります。',
  'note', '全セッション共通テンプレート。回答期限後も事後回答可能。'
)
where template_type = 'session_feedback' and version = 1;

-- ----------------------------------------------------------------
-- 7. social_style_questions - ソーシャルスタイル診断30問 ※運営のみ編集可
-- ----------------------------------------------------------------
-- mock.ts SOCIAL_STYLE_QUESTIONS（Merrill & Reid 1981 ベース）
update public.spacareer_templates
set content = jsonb_build_object(
  'scoring', jsonb_build_object('scale', 5, 'centering', 'value-3', 'axes', jsonb_build_array('assertiveness','responsiveness')),
  'questions', jsonb_build_array(
    jsonb_build_object('no', 1, 'text', '会議で自分の意見を明確に主張する方だ。', 'axis', 'assertiveness', 'reverse', false),
    jsonb_build_object('no', 2, 'text', '結論を早く出すことを好む。', 'axis', 'assertiveness', 'reverse', false),
    jsonb_build_object('no', 3, 'text', '初対面でも相手に対して自分から話を切り出すことが多い。', 'axis', 'assertiveness', 'reverse', false),
    jsonb_build_object('no', 4, 'text', '物事を決める時は、議論より直感で動くタイプだ。', 'axis', 'assertiveness', 'reverse', false),
    jsonb_build_object('no', 5, 'text', '人と意見が合わないとき、自分の立場を譲るより主張を通したい。', 'axis', 'assertiveness', 'reverse', false),
    jsonb_build_object('no', 6, 'text', '相手の話を最後まで聞いてから発言する方だ。', 'axis', 'assertiveness', 'reverse', true),
    jsonb_build_object('no', 7, 'text', '判断を急かされると不快に感じる。', 'axis', 'assertiveness', 'reverse', true),
    jsonb_build_object('no', 8, 'text', '集団の中ではリーダー役を担うことが多い。', 'axis', 'assertiveness', 'reverse', false),
    jsonb_build_object('no', 9, 'text', '指示を出すより指示を受ける方が落ち着く。', 'axis', 'assertiveness', 'reverse', true),
    jsonb_build_object('no', 10, 'text', '交渉やプレゼンに前向きである。', 'axis', 'assertiveness', 'reverse', false),
    jsonb_build_object('no', 11, 'text', '初対面の相手とは控えめに接することが多い。', 'axis', 'assertiveness', 'reverse', true),
    jsonb_build_object('no', 12, 'text', '物事のスピード感を重視する。', 'axis', 'assertiveness', 'reverse', false),
    jsonb_build_object('no', 13, 'text', '反対意見を言われても、根拠があれば自分の主張を曲げない。', 'axis', 'assertiveness', 'reverse', false),
    jsonb_build_object('no', 14, 'text', '行動より先に十分な検討期間を取りたい。', 'axis', 'assertiveness', 'reverse', true),
    jsonb_build_object('no', 15, 'text', '自分から働きかけて状況を変えることが多い。', 'axis', 'assertiveness', 'reverse', false),
    jsonb_build_object('no', 16, 'text', '嬉しさや悲しさを表情や声に出す方だ。', 'axis', 'responsiveness', 'reverse', false),
    jsonb_build_object('no', 17, 'text', '雑談で個人的なエピソードを共有することに抵抗がない。', 'axis', 'responsiveness', 'reverse', false),
    jsonb_build_object('no', 18, 'text', '感情より事実・データを重視する。', 'axis', 'responsiveness', 'reverse', true),
    jsonb_build_object('no', 19, 'text', '人前で自分の気持ちを表現するのは得意な方だ。', 'axis', 'responsiveness', 'reverse', false),
    jsonb_build_object('no', 20, 'text', '初対面の人とも雑談で打ち解けやすい。', 'axis', 'responsiveness', 'reverse', false),
    jsonb_build_object('no', 21, 'text', '人と関わるよりひとりで作業する方が落ち着く。', 'axis', 'responsiveness', 'reverse', true),
    jsonb_build_object('no', 22, 'text', 'ユーモアを交えて会話することが多い。', 'axis', 'responsiveness', 'reverse', false),
    jsonb_build_object('no', 23, 'text', '客観的・論理的な議論を好む。', 'axis', 'responsiveness', 'reverse', true),
    jsonb_build_object('no', 24, 'text', '他人の感情の変化に敏感である。', 'axis', 'responsiveness', 'reverse', false),
    jsonb_build_object('no', 25, 'text', '相手を励ましたり共感したりすることが自然にできる。', 'axis', 'responsiveness', 'reverse', false),
    jsonb_build_object('no', 26, 'text', '感情を表に出さず、冷静に振る舞うことが多い。', 'axis', 'responsiveness', 'reverse', true),
    jsonb_build_object('no', 27, 'text', 'チームの雰囲気を盛り上げる役割を担うことが多い。', 'axis', 'responsiveness', 'reverse', false),
    jsonb_build_object('no', 28, 'text', '結論より背景の物語に興味を持つ方だ。', 'axis', 'responsiveness', 'reverse', false),
    jsonb_build_object('no', 29, 'text', '感情よりプロセスや手順を優先する。', 'axis', 'responsiveness', 'reverse', true),
    jsonb_build_object('no', 30, 'text', '人とのつながり・関係性を仕事のモチベーションにしている。', 'axis', 'responsiveness', 'reverse', false)
  )
)
where template_type = 'social_style_questions' and version = 1;

-- ----------------------------------------------------------------
-- 8. social_style_descriptions - 各タイプの説明テキスト ※運営のみ編集可
-- ----------------------------------------------------------------
update public.spacareer_templates
set content = jsonb_build_object(
  'types', jsonb_build_object(
    'analytical', jsonb_build_object(
      'label', '論理分析型',
      'description_for_customer', '事実・データ・プロセスを重視し、十分な検討期間を経て意思決定を行うタイプ。慎重で正確、一貫性を好み、短期的な勢いより長期的な質を優先する傾向があります。',
      'approach_tips_for_trainer', '結論を急がせない。データ・根拠・前例を準備して提示。感情論ではなく事実ベースで対話を進める。沈黙を恐れず思考時間を許容する。'
    ),
    'driver', jsonb_build_object(
      'label', '行動推進型',
      'description_for_customer', '結果・スピード・効率を重視し、即断即決を好むタイプ。リーダーシップを発揮しやすく、目標達成への執着が強く、プロセスより成果に関心が向きます。',
      'approach_tips_for_trainer', '要点を先に伝える（結論→根拠の順）。雑談は短く。選択肢を提示し本人に決定権を渡す。曖昧な合意を避け、必ず次のアクションを確定させる。'
    ),
    'expressive', jsonb_build_object(
      'label', '感情表現型',
      'description_for_customer', 'アイデア・ビジョン・人とのつながりを重視するタイプ。明るく社交的、新しい刺激を好み、プロセスより共感と高揚を求めます。',
      'approach_tips_for_trainer', '本人の物語・夢に共感を示す。ビジョンを大きく描く対話を意識。細かいタスク管理は本人にとって苦痛なので、大枠の方向性合意を優先する。'
    ),
    'amiable', jsonb_build_object(
      'label', '協調共感型',
      'description_for_customer', '人間関係・調和・安心感を重視するタイプ。傾聴が得意で、周囲のサポート役を担うことが多く、急激な変化を避け、安定したペースを好みます。',
      'approach_tips_for_trainer', '本人の不安を丁寧に汲み取る。「正解を出す」より「一緒に考える」スタンス。締め切りより本人の納得感を優先。否定的フィードバックは関係性ベースで包む。'
    )
  ),
  'note', 'description_for_customer はクライアントポータルに表示。approach_tips_for_trainer は運営内部のみ（受講生には非表示）。'
)
where template_type = 'social_style_descriptions' and version = 1;

-- ----------------------------------------------------------------
-- 9. notify_unstarted - 事前課題未着手リマインドテンプレ
-- ----------------------------------------------------------------
update public.spacareer_templates
set content = jsonb_build_object(
  'text', E'{顧客名}様\n\nお世話になっております、{担当トレーナー}です。\n第{セッション番号}回セッションの事前課題が、まだ未着手の状態です。\n\n提出期限：{締切日}\n回答ページ：{ポータルURL}\n\nセッションをより有意義にするために、お時間を見つけてご回答いただけますと幸いです。\n何かご不明な点がございましたら、このSlackでお気軽にお声がけください。',
  'channels', jsonb_build_array('slack'),
  'note', '締切3日前に自動送信 or 「通知」ボタン押下で送信'
)
where template_type = 'notify_unstarted' and version = 1;

-- ----------------------------------------------------------------
-- 10. notify_due - 締切リマインドテンプレ
-- ----------------------------------------------------------------
update public.spacareer_templates
set content = jsonb_build_object(
  'text', E'{顧客名}様\n\n第{セッション番号}回事前課題の提出期限は本日 {締切日} までです。\n\n回答ページ：{ポータルURL}\n\n回答途中の状態でも構いませんので、お時間の許す範囲で更新をお願いいたします。\nセッション当日（{セッション日時}）にご回答内容をベースに進めさせていただきます。',
  'channels', jsonb_build_array('slack'),
  'note', '締切当日に自動送信 or 「通知」ボタン押下で送信'
)
where template_type = 'notify_due' and version = 1;

-- ----------------------------------------------------------------
-- 11. notify_published - クライアントポータル反映通知テンプレ
-- ----------------------------------------------------------------
update public.spacareer_templates
set content = jsonb_build_object(
  'text', E'{顧客名}様\n\n第{セッション番号}回セッションの議事録および第{セッション番号}回までの事前課題内容を、スパナビ クライアントポータルに反映しました。\n\nご確認ページ：{ポータルURL}\n\n次回（第◯回）セッション日時：{セッション日時}\n次回の事前課題は別途共有いたします。引き続きよろしくお願いいたします。',
  'channels', jsonb_build_array('slack'),
  'note', 'セッション完了押下・事前課題公開時に自動送信'
)
where template_type = 'notify_published' and version = 1;

-- ----------------------------------------------------------------
-- 投入結果確認用クエリ（コメントアウト）
-- ----------------------------------------------------------------
-- select template_type, jsonb_pretty(content) from public.spacareer_templates where org_id = 'a0000000-0000-0000-0000-000000000001' and is_active = true order by template_type;
