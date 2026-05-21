// 企業名・住所・代表者から公式ホームページURLを推定する Edge Function
//
// Input (POST JSON):
//   { company_name: string, address?: string, prefecture?: string, representative?: string }
// Output:
//   { url: string | null, confidence: 'high'|'medium'|'low', reason: string }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    const { company_name, address, prefecture, representative } = await req.json()
    if (!company_name || typeof company_name !== 'string') {
      return json({ url: null, confidence: 'low', reason: 'company_name is required' }, 400)
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim()
    if (!apiKey) return json({ url: null, confidence: 'low', reason: 'ANTHROPIC_API_KEY not set' }, 500)

    const userPrompt = `次の日本企業の公式ホームページ(コーポレートサイト)のURLを web search で検索し、1つだけ特定してください。

企業名: ${company_name}
${prefecture ? `都道府県: ${prefecture}\n` : ''}${address ? `住所: ${address}\n` : ''}${representative ? `代表者: ${representative}\n` : ''}
最終回答は以下の JSON 形式のみで出力してください (前置き・解説は不要):

{"url": "https://example.co.jp/" or null, "confidence": "high" or "medium" or "low", "reason": "判断根拠の短い説明"}

注意:
- 公式コーポレートサイト（ドメインがその会社のもの）を優先。SNS・求人掲載ページ・第三者媒体は除外。
- 同名企業が複数ある場合は住所/代表者で識別。判別できない場合は confidence を low にして reason に明記。
- 見つからない場合は url を null。`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[lookup-company-homepage] anthropic error:', response.status, errText)
      return json({ url: null, confidence: 'low', reason: `API error ${response.status}` }, 502)
    }

    const data = await response.json()
    // 最後のテキストブロックから JSON を抽出
    const blocks = data.content || []
    const lastText = blocks.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
    const match = lastText.match(/\{[\s\S]*?\}/)
    if (!match) {
      return json({ url: null, confidence: 'low', reason: 'no JSON in response', raw: lastText })
    }
    try {
      const result = JSON.parse(match[0])
      // 簡易バリデーション
      if (result.url && typeof result.url === 'string' && !/^https?:\/\//i.test(result.url)) {
        result.url = null
        result.confidence = 'low'
        result.reason = 'invalid url format'
      }
      return json(result)
    } catch (e) {
      return json({ url: null, confidence: 'low', reason: 'failed to parse JSON', raw: lastText })
    }
  } catch (err) {
    console.error('[lookup-company-homepage] error:', err)
    return json({ url: null, confidence: 'low', reason: (err as Error).message || 'unknown error' }, 500)
  }
})
