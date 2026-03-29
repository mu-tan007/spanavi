import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const { item_id, company, representative } = await req.json()
    if (!company) return json({ error: 'company is required' }, 400)

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500)

    const searchQuery = representative
      ? `${company} ${representative}`
      : company

    const prompt = `「${searchQuery}」でWeb検索し、この企業のホームページを見つけて以下の情報をJSON形式で返してください。

企業名: ${company}
${representative ? `代表者: ${representative}` : ''}

必ず以下のJSON形式で出力してください（他のテキストは不要）：
{
  "overview": "企業概要を2〜3文で簡潔に（創業年、所在地、主な事業内容、規模感など）",
  "strengths": "特徴・強みを箇条書きで1〜3つ（各項目は「・」で始める、改行区切り）"
}

注意：
- ホームページが見つからない場合は、検索結果から得られる情報で作成してください
- overviewもstrengthsも日本語で記述してください
- JSON以外のテキストは出力しないでください`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      }),
    })

    const data = await res.json()
    if (!res.ok) return json({ error: data.error?.message || 'Anthropic API error' }, res.status)

    const text = (data.content || [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')

    // JSONを抽出（コードブロックやテキストに囲まれている場合も対応）
    let parsed: { overview?: string; strengths?: string } = {}
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    } catch {
      console.error('[generate-company-info] JSON parse failed, raw text:', text)
      parsed = { overview: text, strengths: '' }
    }

    const overview = parsed.overview || ''
    const strengths = parsed.strengths || ''

    // item_idが提供されていればDBに保存
    if (item_id) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, serviceKey)

      const { error: updateError } = await supabase
        .from('call_list_items')
        .update({
          ai_overview: overview,
          ai_strengths: strengths,
          ai_generated_at: new Date().toISOString(),
        })
        .eq('id', item_id)

      if (updateError) {
        console.error('[generate-company-info] DB update error:', updateError)
      }
    }

    return json({ overview, strengths })
  } catch (err) {
    console.error('[generate-company-info] Error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
