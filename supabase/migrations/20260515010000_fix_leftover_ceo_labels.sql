-- ============================================================
-- 取りこぼし旧ラベルの再修正
--   2026-05-15
--   ・20260514233224_rename_ceo_to_keyman 適用後も、古いSPAバンドルを
--     開いたままだったメンバーが旧labelで書き込み続けていたため、
--     5/15 JST 08:33〜の call_records 132件が '社長*' で残存していた。
--   ・Analytics のキーマン接続集計は新labelで filter するため、
--     これらが除外されメンバー別 0 表示が発生していた。
-- ============================================================
set local search_path = public, extensions;

UPDATE call_records SET status = 'キーマン不在'     WHERE status = '社長不在';
UPDATE call_records SET status = 'キーマン断り'     WHERE status = '社長お断り';
UPDATE call_records SET status = 'キーマン再コール' WHERE status = '社長再コール';
