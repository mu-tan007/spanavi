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
    if (!url || typeof url !== 'string') return json({ error: 'url is required' }, 400)

    const trimmed = url.trim()
    if (!/^https?:\/\//i.test(trimmed)) return json({ error: 'url must start with http(s)://' }, 400)
    if (trimmed.length > 1000) return json({ error: 'url too long' }, 400)

    let host = ''
    try { host = new URL(trimmed).host } catch { return json({ error: 'invalid url' }, 400) }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500)

    const prompt = `以下のURLに対応する企業のホームページをWeb検索で参照し、企業情報を構造化して返してください。

対象URL: ${trimmed}
ドメイン: ${host}

このドメインのコーポレートサイト（会社概要・企業情報・代表挨拶・事業内容ページなど）を中心に確認し、以下のJSON形式で日本語で返してください。他のテキストは一切出力しないでください。

{
  "company_name": "正式な会社名（株式会社等も含む）",
  "address": "本社所在地（都道府県から番地・ビル名まで）",
  "business": "主な事業内容（1〜2文で簡潔に）",
  "representative": "代表者の役職と氏名（例: 代表取締役 〇〇 〇〇）",
  "features": ["特徴・強み1", "特徴・強み2", "特徴・強み3"]
}

注意:
- features は3項目程度の箇条書き、各項目は具体的な強み・差別化要素を1文で
- 情報が見つからない項目は空文字（features の場合は空配列）
- 同名異社と取り違えないよう、必ず指定されたドメイン (${host}) を参照すること
- JSON 以外のテキストは出力しないこと`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      }),
    })

    const data = await res.json()
    if (!res.ok) return json({ error: data.error?.message || 'Anthropic API error' }, res.status)

    const text = (data.content || [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')

    let parsed: {
      company_name?: string
      address?: string
      business?: string
      representative?: string
      features?: string[]
    } | null = null
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    } catch {
      parsed = null
    }
    if (!parsed) {
      console.error('[extract-company-from-url] JSON parse failed, raw text:', text.slice(0, 500))
      return json({ error: 'parse_failed', raw: text.slice(0, 200) })
    }

    const stripCite = (s: string) => (s || '').replace(/<\/?cite[^>]*>/g, '').trim()
    const companyName = stripCite(parsed.company_name || '')
    const address = stripCite(parsed.address || '')
    const business = stripCite(parsed.business || '')
    const representative = stripCite(parsed.representative || '')
    const features = Array.isArray(parsed.features)
      ? parsed.features.map(stripCite).filter(Boolean)
      : []

    if (!companyName && !address && !business && features.length === 0) {
      return json({ error: 'not_found' })
    }

    const lines: string[] = []
    if (companyName) lines.push(`企業名: ${companyName}`)
    if (address) lines.push(`所在地: ${address}`)
    if (business) lines.push(`事業内容: ${business}`)
    if (representative) lines.push(`代表取締役: ${representative}`)
    lines.push(`HP: ${trimmed}`)
    if (features.length > 0) {
      lines.push('特徴:')
      for (const f of features) lines.push(`　・${f}`)
    }
    const overview = lines.join('\n')

    return json({
      overview,
      raw: { company_name: companyName, address, business, representative, features },
    })
  } catch (err) {
    console.error('[extract-company-from-url] Error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
