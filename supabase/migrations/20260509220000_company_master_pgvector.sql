-- =====================================================================
-- company_master に pgvector 列を追加
--   - text-embedding-3-small (1536次元) で事業内容等の埋め込みを保存
--   - 検索時に「上流工程の素材メーカー」のような自然言語と意味類似で検索可能にする
--
-- 注意: HNSW index は全件 embedding 投入後に手動 CREATE する（バッチ中の更新が
--       遅くなるため事前に作らない）。投入完了後の追加 migration で:
--         CREATE INDEX idx_cm_embedding_hnsw ON company_master
--           USING hnsw (embedding vector_cosine_ops);
-- =====================================================================

set local search_path = public, extensions;

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE company_master
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_cm_embed_pending
  ON company_master(id) WHERE embedding IS NULL;

-- 一括 UPDATE 用 RPC: payload は [{id, emb}] の jsonb 配列
CREATE OR REPLACE FUNCTION public.apply_company_embeddings(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE company_master cm
     SET embedding = (item->>'emb')::vector,
         embedded_at = now()
    FROM jsonb_array_elements(p_payload) AS item
   WHERE cm.id = (item->>'id')::bigint;
END;
$$;
