-- ============================================================
-- 2026-05-18: 旧「社長*」ラベル残存分の再バックフィル（v2）
-- ------------------------------------------------------------
-- 経緯:
--   20260515000000_rename_ceo_to_keyman.sql / 20260515010000 で
--   既存「社長*」を「キーマン*」へ書き換え済み。
--   しかしその後、古いSPAバンドルを開きっぱなしのクライアントから
--   再び旧ラベル「社長再コール」「社長不在」「社長お断り」が
--   call_records / call_list_items に流入していた。
--   再コール一覧が新ラベルのみを抽出するため取りこぼしが発生。
--   ここで残存分を一括クリーンアップする。
-- ============================================================
set local search_path = public, extensions;

UPDATE call_records SET status = 'キーマン再コール' WHERE status = '社長再コール';
UPDATE call_records SET status = 'キーマン不在'   WHERE status = '社長不在';
UPDATE call_records SET status = 'キーマン断り'   WHERE status = '社長お断り';

UPDATE call_list_items SET call_status = 'キーマン再コール' WHERE call_status = '社長再コール';
UPDATE call_list_items SET call_status = 'キーマン不在'   WHERE call_status = '社長不在';
UPDATE call_list_items SET call_status = 'キーマン断り'   WHERE call_status = '社長お断り';
