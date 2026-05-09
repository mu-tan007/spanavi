// company_master.embedding を OpenAI text-embedding-3-small で埋める Edge Function
//   - リクエストごとに最大 batch_size 行処理（embedding NULL のレコードを id 昇順で）
//   - 1回の OpenAI API call で最大 1024 行を埋め込み（API リミット 8192 input items 以内）
//   - 完了行は embedding + embedded_at を UPDATE
//
// 呼び出し:
//   POST /backfill-embeddings { "batch_size": 2000 }
//   { processed: 2000, last_id: 12345, remaining: 488123 }
//
// 環境変数:
//   OPENAI_API_KEY (Required)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// 1社あたり embedding 用テキスト構成
function buildEmbedText(row: Record<string, unknown>): string {
  const parts: string[] = []
  if (row.industry_major) parts.push(`[業種] ${row.industry_major}`)
  if (row.industry_sub) parts.push(`> ${row.industry_sub}`)
  if (row.company_name) parts.push(`[企業] ${row.company_name}`)
  if (row.business_description) parts.push(`[事業] ${row.business_description}`)
  if (row.clients) parts.push(`[取引先] ${row.clients}`)
  if (row.remarks) parts.push(`[備考] ${row.remarks}`)
  return parts.join(' | ').slice(0, 4000) // 安全に4000文字cap
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) return json({ error: 'OPENAI_API_KEY not set' }, 500)

    const body = await req.json().catch(() => ({}))
    const batchSize: number = Math.min(Math.max(body.batch_size || 2000, 100), 5000)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // 未埋め込み行を id 昇順で取得
    const { data: rows, error: selErr } = await supabase
      .from('company_master')
      .select('id, company_name, business_description, industry_major, industry_sub, clients, remarks')
      .is('embedding', null)
      .order('id', { ascending: true })
      .limit(batchSize)

    if (selErr) return json({ error: selErr.message }, 500)
    if (!rows || rows.length === 0) {
      const { count } = await supabase.from('company_master').select('id', { count: 'exact', head: true }).is('embedding', null)
      return json({ processed: 0, last_id: null, remaining: count ?? 0, done: true })
    }

    const texts = rows.map(r => buildEmbedText(r))

    // OpenAI embedding 呼び出し（最大 1024 inputs / 1 call で安全に）
    const CHUNK = 1024
    const allEmbeddings: number[][] = []
    for (let i = 0; i < texts.length; i += CHUNK) {
      const slice = texts.slice(i, i + CHUNK)
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: slice,
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        return json({ error: 'OpenAI embedding error', detail: errText, processed_chunk: i }, 500)
      }
      const data = await res.json()
      for (const d of data.data) allEmbeddings.push(d.embedding)
    }

    if (allEmbeddings.length !== rows.length) {
      return json({ error: 'embedding count mismatch', expected: rows.length, got: allEmbeddings.length }, 500)
    }

    // バルク UPDATE: 1行ずつだと遅いので RPC 経由でJSON配列を渡す
    const payload = rows.map((r, i) => ({ id: r.id, emb: allEmbeddings[i] }))
    const { error: updErr } = await supabase.rpc('apply_company_embeddings', { p_payload: payload })
    if (updErr) return json({ error: 'apply_company_embeddings failed: ' + updErr.message }, 500)

    const lastId = rows[rows.length - 1].id
    const { count } = await supabase
      .from('company_master')
      .select('id', { count: 'exact', head: true })
      .is('embedding', null)

    return json({
      processed: rows.length,
      last_id: lastId,
      remaining: count ?? 0,
      done: (count ?? 0) === 0,
    })
  } catch (err) {
    console.error('[backfill-embeddings] error', err)
    return json({ error: (err as Error).message }, 500)
  }
})
