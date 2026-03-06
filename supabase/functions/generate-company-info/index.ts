const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const { url } = await req.json()
    if (!url) return json({ error: 'url is required' }, 400)

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500)

    const prompt = `以下のURLの企業ホームページを参照して、企業概要を作成してください。\n\nURL: ${url}\n\n以下の形式で出力してください（マークダウン不使用、プレーンテキスト）：\n\n【企業名】\n【所在地】\n【事業内容】\n【代表取締役】\n【ホームページ】${url}\n【特徴】\n・（箇条書きで1〜3つ）`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      }),
    })

    const data = await res.json()
    if (!res.ok) return json({ error: data.error?.message || 'Anthropic API error' }, res.status)

    const text = (data.content || [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')

    return json({ text })
  } catch (err) {
    console.error('[generate-company-info] Error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
