// クライアント企業の契約書用プロフィールを Claude + web search で一括取得する Edge Function
//
// Input (POST JSON):
//   { company_name: string, address_hint?: string }
// Output:
//   {
//     hp_url: string | null,
//     address: string | null,       // 当社表記 (一丁目1-2形式) を試行
//     representative: string | null, // 代表取締役 (氏名のみ)
//     confidence: 'high'|'medium'|'low',
//     reason: string
//   }

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
    const { company_name, address_hint } = await req.json()
    if (!company_name || typeof company_name !== 'string') {
      return json({ hp_url: null, address: null, representative: null, confidence: 'low', reason: 'company_name is required' }, 400)
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim()
    if (!apiKey) return json({ hp_url: null, address: null, representative: null, confidence: 'low', reason: 'ANTHROPIC_API_KEY not set' }, 500)

    const userPrompt = `次の日本企業の契約書作成に必要な情報を、web search で公式コーポレートサイトを特定して取得してください。

企業名: ${company_name}
${address_hint ? `住所のヒント: ${address_hint}\n` : ''}
取得項目:
1. 公式ホームページURL (コーポレートサイト)
2. 本社住所
3. 代表者氏名 (代表取締役の氏名のみ。役職名は含めない)

住所表記ルール (重要):
- 丁目部分の数字は漢数字 (例: 1丁目→一丁目、2丁目→二丁目)
- 丁目以降の番地・号は半角ハイフン区切り (例: 1番2号→1-2、3番→3、5号→5)
- 例: 「東京都港区赤坂1-11-44」→「東京都港区赤坂一丁目11-44」
- 例: 「東京都新宿区西新宿2丁目8番1号」→「東京都新宿区西新宿二丁目8-1」

最終回答は以下の JSON 形式のみで出力 (前置き・解説は不要):

{"hp_url": "https://example.co.jp/" or null, "address": "東京都港区赤坂一丁目11-44" or null, "representative": "山田 太郎" or null, "confidence": "high"|"medium"|"low", "reason": "判断根拠の短い説明"}

注意:
- 同名企業が複数ある場合、住所のヒントで識別する
- 不明な項目は null
- すべて null になる場合は confidence=low`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[extract-client-profile] anthropic error:', response.status, errText)
      return json({ hp_url: null, address: null, representative: null, confidence: 'low', reason: `API error ${response.status}` }, 502)
    }

    const data = await response.json()
    const blocks = data.content || []
    const lastText = blocks.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
    const match = lastText.match(/\{[\s\S]*\}/)
    if (!match) {
      return json({ hp_url: null, address: null, representative: null, confidence: 'low', reason: 'no JSON in response', raw: lastText.slice(0, 500) })
    }
    try {
      const result = JSON.parse(match[0])
      if (result.hp_url && typeof result.hp_url === 'string' && !/^https?:\/\//i.test(result.hp_url)) {
        result.hp_url = null
      }
      // 念のため必須キーを補完
      return json({
        hp_url: result.hp_url ?? null,
        address: result.address ?? null,
        representative: result.representative ?? null,
        confidence: result.confidence || 'low',
        reason: result.reason || '',
      })
    } catch (e) {
      return json({ hp_url: null, address: null, representative: null, confidence: 'low', reason: 'failed to parse JSON', raw: lastText.slice(0, 500) })
    }
  } catch (err) {
    console.error('[extract-client-profile] error:', err)
    return json({ hp_url: null, address: null, representative: null, confidence: 'low', reason: (err as Error).message || 'unknown error' }, 500)
  }
})
