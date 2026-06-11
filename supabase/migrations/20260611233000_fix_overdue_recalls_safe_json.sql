set local search_path = public, extensions;

-- 再コール超過RPCの安全化（2026-06-11、本番適用済み）
-- 問題: memo::jsonb の無条件キャストが、JSON形式でないmemoを持つ行で
--       22P02エラーを起こし関数全体が落ち、スマートキューの
--       受付/キーマン再コール超過が「ありません」と誤表示していた
--       （実際はキーマン57件・受付544件存在した）。
-- 対策: memoが '{' で始まる場合のみ jsonb として解析（CASEの遅延評価を利用）。
-- 適用内容は本番の dashboard_overdue_recalls /
-- dashboard_overdue_reception_recalls を参照（memo_j CTE化）。
