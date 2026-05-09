// 検索クエリ文字列 → text-embedding-3-small で 1536次元 vector を返す Edge Function
//   - chat-to-filter から自然言語の "意味検索クエリ" を受けて埋め込みを生成
//   - クライアントから直接呼んで RPC に渡す形を想定
//
// 入力: { "query": "上流工程の素材・鉄鋼・樹脂メーカー" }
// 出力: { "embedding": [0.012, -0.034, ...] }   ← 長さ 1536

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) return json({ error: 'OPENAI_API_KEY not set' }, 500)

    const { query } = await req.json()
    if (typeof query !== 'string' || !query.trim()) {
      return json({ error: 'query is required' }, 400)
    }

    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: query.slice(0, 4000),
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      return json({ error: 'OpenAI embedding error', detail: errText.slice(0, 500) }, 500)
    }
    const data = await res.json()
    return json({ embedding: data.data[0].embedding })
  } catch (err) {
    console.error('[embed-query] error', err)
    return json({ error: (err as Error).message }, 500)
  }
})
