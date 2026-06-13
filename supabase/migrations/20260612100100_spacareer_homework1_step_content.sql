set local search_path = public, extensions;

-- ============================================================
-- 第1回事後課題（homework_1）を STEP1〜7 の新仕様に差し替え
-- ----------------------------------------------------------------
-- むー様指定の STEP1〜7（5年後ビジョン／お金／3年1年逆算／人生棚卸し／
-- 現在地4つの窓／成功者モデリング／3ヶ月ゴール）全25テキスト項目。
-- section 列に章立て見出しを持たせ、受講生画面でセクション区切り表示する。
-- STEP5 の記入用pptxアップロード項目は今回除外（別タスク）。
-- 文字数撤去方針に合わせ is_required は全て false（max_length は上限カウンタ）。
-- ============================================================
update public.spacareer_templates
set
  name = '第1回事後課題（共通）',
  content = jsonb_build_object(
  'items', jsonb_build_array(
    -- STEP1：5年後の在り方
    jsonb_build_object('position', 1, 'section', 'STEP1：5年後の在り方', 'question_text', '評判：5年後、まわりからどんな人だと思われていたいですか？', 'is_required', false, 'max_length', 60, 'question_hint', '例)「AIに強くて、相談すると必ず前に進めてくれる人」'),
    jsonb_build_object('position', 2, 'section', 'STEP1：5年後の在り方', 'question_text', '理想の1日：5年後の平日のある1日を、朝〜夜で具体的に（どこで・誰と・何を）', 'is_required', false, 'max_length', 80),
    jsonb_build_object('position', 3, 'section', 'STEP1：5年後の在り方', 'question_text', 'お金でできること：お金の面で何が「当たり前」になっていますか？', 'is_required', false, 'max_length', 60, 'question_hint', '例)「毎月◯万を自由に使える／親孝行にお金を使える」'),
    jsonb_build_object('position', 4, 'section', 'STEP1：5年後の在り方', 'question_text', '手にしているもの：今は無いけれど、5年後に手に入れている物を3つ', 'is_required', false, 'max_length', 60),
    jsonb_build_object('position', 5, 'section', 'STEP1：5年後の在り方', 'question_text', '5年後の自分を一言キャッチコピーで表すと？', 'is_required', false, 'max_length', 10),
    -- STEP2：5年後のお金（金額と根拠）
    jsonb_build_object('position', 6, 'section', 'STEP2：5年後のお金（金額と根拠）', 'question_text', '必要な月額の内訳を5項目以上挙げ、各項目について「なぜその額か」の根拠も書いてください。', 'is_required', false, 'max_length', 150),
    jsonb_build_object('position', 7, 'section', 'STEP2：5年後のお金（金額と根拠）', 'question_text', '理想ライン（月／年）', 'is_required', false, 'question_hint', '思いつく限りで構いません。'),
    jsonb_build_object('position', 8, 'section', 'STEP2：5年後のお金（金額と根拠）', 'question_text', '最低ライン（月／年）＋それを下回ると何が困るか', 'is_required', false, 'max_length', 30),
    -- STEP3：3年・1年に降ろす（月収＋根拠）
    jsonb_build_object('position', 9, 'section', 'STEP3：3年・1年に降ろす（月収＋根拠）', 'question_text', '3年後の状態（収入／スキル／人間関係／生活）＋月収＋なぜその月収か', 'is_required', false, 'max_length', 200),
    jsonb_build_object('position', 10, 'section', 'STEP3：3年・1年に降ろす（月収＋根拠）', 'question_text', '1年後の状態（収入／スキル／人間関係／生活）＋月収＋なぜその月収か', 'is_required', false, 'max_length', 200),
    jsonb_build_object('position', 11, 'section', 'STEP3：3年・1年に降ろす（月収＋根拠）', 'question_text', '収入の逆算ラダー（5年→3年→1年→3ヶ月）をまとめてください。', 'is_required', false, 'max_length', 40),
    -- STEP4：人生の棚卸し（自分史）
    jsonb_build_object('position', 12, 'section', 'STEP4：人生の棚卸し（自分史）', 'question_text', '〜高校期：夢中になったこと／頑張ったこと／うまくいったこと を各3つ', 'is_required', false, 'max_length', 300),
    jsonb_build_object('position', 13, 'section', 'STEP4：人生の棚卸し（自分史）', 'question_text', '大学・専門期：夢中になったこと／頑張ったこと／うまくいったこと を各3つ', 'is_required', false, 'max_length', 300),
    jsonb_build_object('position', 14, 'section', 'STEP4：人生の棚卸し（自分史）', 'question_text', '社会人〜現在：夢中になったこと／頑張ったこと／うまくいったこと を各3つ', 'is_required', false, 'max_length', 300),
    jsonb_build_object('position', 15, 'section', 'STEP4：人生の棚卸し（自分史）', 'question_text', '悔しかった・悲しかったこと（各時期1〜2個ずつ）', 'is_required', false, 'max_length', 150),
    jsonb_build_object('position', 16, 'section', 'STEP4：人生の棚卸し（自分史）', 'question_text', '全体を眺めて気づいたこと', 'is_required', false, 'max_length', 200),
    -- STEP5：現在地・4つの窓
    jsonb_build_object('position', 17, 'section', 'STEP5：現在地・4つの窓', 'question_text', '補足：経験の窓を詳しく（武器の材料を5項目以上）', 'is_required', false, 'max_length', 80),
    jsonb_build_object('position', 18, 'section', 'STEP5：現在地・4つの窓', 'question_text', '目的地（5年後）と比べて、一番大きいギャップは？', 'is_required', false, 'max_length', 15),
    -- STEP6：成功者モデリング
    jsonb_build_object('position', 19, 'section', 'STEP6：成功者モデリング', 'question_text', 'こうなりたい人を2〜3人（名前／ジャンル／今の様子＋なぜ惹かれるか）', 'is_required', false, 'max_length', 300),
    jsonb_build_object('position', 20, 'section', 'STEP6：成功者モデリング', 'question_text', '一番惹かれた1人の過去を逆再生（現在→半年前→1年前→2年前→始めた頃）', 'is_required', false, 'max_length', 400),
    jsonb_build_object('position', 21, 'section', 'STEP6：成功者モデリング', 'question_text', 'その人をなぞるなら、最初の3ヶ月で何をしますか？', 'is_required', false, 'max_length', 80),
    jsonb_build_object('position', 22, 'section', 'STEP6：成功者モデリング', 'question_text', '2〜3人の「惹かれた理由」の共通点（＝あなたの武器のヒント）', 'is_required', false, 'max_length', 60),
    -- STEP7：優先順位＋3ヶ月ゴール
    jsonb_build_object('position', 23, 'section', 'STEP7：優先順位＋3ヶ月ゴール', 'question_text', 'やりたいこと候補を全部書き出してください（5〜10個）', 'is_required', false, 'max_length', 60),
    jsonb_build_object('position', 24, 'section', 'STEP7：優先順位＋3ヶ月ゴール', 'question_text', 'その中で最優先の1個', 'is_required', false, 'max_length', 20),
    jsonb_build_object('position', 25, 'section', 'STEP7：優先順位＋3ヶ月ゴール', 'question_text', '3ヶ月の状態ゴール（①武器の方向 ②最初の一歩 ③週リズム・数字は必須）', 'is_required', false, 'max_length', 100)
  ),
  'note', 'STEP1〜7（むー様指定）。第1回セッション完了時に自動配布。提出締切は第2回セッションの3日前。STEP5のpptxアップロードは別タスクで追加。'
)
where template_type = 'homework_1' and version = 1;

-- ============================================================
-- 通知テンプレの文言を「事前課題」→「事後課題」へ統一
-- ----------------------------------------------------------------
-- notify_published は第1回事後課題の公開通知に再利用するため文面も刷新。
-- ============================================================
update public.spacareer_templates
set content = jsonb_build_object(
  'text', E'{顧客名}様\n\nお世話になっております、{担当トレーナー}です。\n第{セッション番号}回セッションの事後課題が、まだ未着手の状態です。\n\n提出期限：{締切日}\n回答ページ：{ポータルURL}\n\nセッションをより有意義にするために、お時間を見つけてご回答いただけますと幸いです。\n何かご不明な点がございましたら、このSlackでお気軽にお声がけください。',
  'channels', jsonb_build_array('slack'),
  'note', '締切3日前に自動送信 or 「通知」ボタン押下で送信'
)
where template_type = 'notify_unstarted' and version = 1;

update public.spacareer_templates
set content = jsonb_build_object(
  'text', E'{顧客名}様\n\n第{セッション番号}回事後課題の提出期限は本日 {締切日} までです。\n\n回答ページ：{ポータルURL}\n\n回答途中の状態でも構いませんので、お時間の許す範囲で更新をお願いいたします。\n次回セッション当日（{セッション日時}）にご回答内容をベースに進めさせていただきます。',
  'channels', jsonb_build_array('slack'),
  'note', '締切当日に自動送信 or 「通知」ボタン押下で送信'
)
where template_type = 'notify_due' and version = 1;

update public.spacareer_templates
set content = jsonb_build_object(
  'text', E'{顧客名}様\n\n第{セッション番号}回セッションの事後課題をクライアントポータルに公開しました。\n\n回答ページ：{ポータルURL}\n提出期限：{締切日}\n\nセッションを振り返りながら、お時間を見つけてご回答ください。途中保存もできます。\n引き続きよろしくお願いいたします。',
  'channels', jsonb_build_array('slack'),
  'note', 'セッション完了押下・事後課題公開時に自動送信'
)
where template_type = 'notify_published' and version = 1;
