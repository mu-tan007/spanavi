set local search_path = public, extensions;

-- スパキャリ第2回の固定事後課題のうち「行動して Slack で報告・壁打ちする」系を
-- チェックボックス形式(item_type='checkbox')に変更する。
-- むー様指示 2026-07-10: 事後課題を事務作業でなく前進行動＋Slack報告＋チェックにする。
-- 概念アウトプット(信頼性/商談/痛み/リサーチ)は記述(text)のまま残す。
-- 既に公開済みの受講生の課題(homework_items)は触らない＝今後の公開分から適用。

-- pos3: Bizon/Yenta 導入 → 完了したら Slack 報告（記載を廃止）
update public.spacareer_homework_fixed_items
set item_type = 'checkbox',
    question_text = 'BizonとYentaのアプリを導入し、初期設定（プロフィール登録等）を完了してください。完了したらSlackでトレーナーに報告してください。',
    updated_at = now()
where session_no = 2 and position = 3 and is_active = true;

-- pos4: 副業プラットフォーム5つ登録 → 登録先を Slack 報告（記載を廃止）
update public.spacareer_homework_fixed_items
set item_type = 'checkbox',
    question_text = 'ランサーズ、複業クラウド、シューマツワーカーなど、副業系のプラットフォームにクラウドワークスを含めて5つ登録してください。登録したプラットフォームをSlackでトレーナーに報告してください。',
    updated_at = now()
where session_no = 2 and position = 4 and is_active = true;

-- pos9: ツール作成＋デプロイURL → URLを Slack で共有（記載/添付を廃止）
update public.spacareer_homework_fixed_items
set item_type = 'checkbox',
    question_text = '特定の業界・企業の「痛み」を補うツールを作成してください。Claude Codeなどで作成し、Vercel・NetlifyにデプロイしたURLをSlackでトレーナーに共有してください。',
    updated_at = now()
where session_no = 2 and position = 9 and is_active = true;

-- pos10: ツールの壁打ち → 実施したら Slack 報告（記載を廃止）
update public.spacareer_homework_fixed_items
set item_type = 'checkbox',
    question_text = '作成したツールについて、Slackのチャットでトレーナーに壁打ち（フィードバック）をもらってください。実施したらチェックを入れてください。',
    updated_at = now()
where session_no = 2 and position = 10 and is_active = true;

-- pos1・pos2 は既に「Slackで共有/添削」を含む行動課題のため、記述を廃してチェック化のみ。
update public.spacareer_homework_fixed_items
set item_type = 'checkbox', updated_at = now()
where session_no = 2 and position in (1, 2) and is_active = true;
