set local search_path = public, extensions;

-- ツリー型スクリプト（ノード＋リンク方式、合流可）。
-- { version, startId, nodes: [{ id, name, talk, responses: [{ label, nextId }] }] }
-- NULL = 従来のテキスト型(script_body)のみ。両者は共存し、既存スクリプトには影響しない。
alter table public.call_lists add column if not exists script_tree jsonb;
