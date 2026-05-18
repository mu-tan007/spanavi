const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const USER_AGENT = 'Mozilla/5.0 (compatible; SpanaviCompanyInfoBot/1.0; +https://spanavi.app)'

async function fetchPageText(url: string, timeoutMs = 12000): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'ja,en;q=0.8' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    })
    if (!res.ok) return ''
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return ''
    const html = await res.text()
    return html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/\s+/g, ' ')
      .trim()
  } catch {
    return ''
  }
}

function stripCite(s: string): string {
  return (s || '').replace(/<\/?cite[^>]*>/g, '').trim()
}

function stripRepresentativeTitle(rep: string): string {
  // ラベル側に「代表取締役:」を出すので、値側の役職プレフィックス重複を防ぐ
  return rep.replace(/^(代表取締役社長|代表取締役会長|代表取締役CEO|代表取締役|代表執行役員|代表執行役|代表理事|代表者|代表)[\s　]+/, '').trim()
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

    let parsedUrl: URL
    try { parsedUrl = new URL(trimmed) } catch { return json({ error: 'invalid url' }, 400) }
    const host = parsedUrl.host
    const origin = parsedUrl.origin

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500)

    // 入力URL + 同一ドメインの会社概要系サブパスを並列取得（他社情報の混入防止）
    const subPaths = ['/company/', '/about/', '/corporate/', '/profile/', '/about-us/', '/company', '/about']
    const candidateUrls = new Set<string>([trimmed])
    for (const p of subPaths) candidateUrls.add(origin + p)

    const fetched = await Promise.all(
      [...candidateUrls].map(u => fetchPageText(u).then(text => ({ url: u, text })))
    )
    const pages = fetched.filter(p => p.text.length >= 300)
    const pageContext = pages
      .map(p => `=== ${p.url} ===\n${p.text.slice(0, 8000)}`)
      .join('\n\n')
      .slice(0, 40000)

    const hasDirectContent = pageContext.length > 0

    const promptHeader = `次の企業のホームページから企業情報を抽出し、JSONで返してください。

対象URL: ${trimmed}
ドメイン: ${host}`

    const promptInstructions = `必ず以下のJSON形式で日本語で出力してください。他のテキストは一切出力しないでください。

{
  "company_name": "正式な会社名（株式会社等も含む）",
  "address": "本社所在地（都道府県から番地・ビル名まで、HPに記載の通り正確に）",
  "business": "主な事業内容（1〜2文で簡潔に、HPに記載の事業内容を要約）",
  "representative": "代表者の氏名のみ（『代表取締役』『社長』等の役職プレフィックスは含めない。例: 篠宮拓武 / 渡邉広康。代表取締役以外の役職（会長/CEO等）の場合のみ役職を含める）",
  "features": ["特徴・強み1", "特徴・強み2", "特徴・強み3"]
}

厳守事項:
- features は3項目程度の箇条書き、各項目は具体的な強み・差別化要素を1文で
- 情報が見つからない項目は空文字（features の場合は空配列）。**推測・他社情報からの推定は絶対に行わない**
- 同名異社と取り違えないよう、必ず指定されたドメイン (${host}) のコンテンツのみを根拠にする
- 所在地は HP に記載された住所をそのまま転記すること（他のソースの古い住所を使わない）
- JSON 以外のテキスト（説明文・前置き・末尾コメント）は出力しないこと`

    let prompt: string
    let tools: unknown[]

    if (hasDirectContent) {
      // HP本文を取得できた場合: その本文のみを根拠にさせる（web_searchは使わない）
      prompt = `${promptHeader}

以下は指定HPおよび同一ドメインの会社概要系ページから抽出した本文です。**この本文のみを根拠に**抽出してください。本文に記載のない情報は空文字で返し、推測しないでください。

--- HP本文 ---
${pageContext}
--- HP本文ここまで ---

${promptInstructions}`
      tools = []
    } else {
      // HP直接取得に失敗した場合のみ web_search にフォールバック
      prompt = `${promptHeader}

ホームページの本文を直接取得できませんでした。Web検索ツールで ${host} ドメインのコーポレートサイトを参照し、企業情報を抽出してください。

${promptInstructions}`
      tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }]
    }

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
        ...(tools.length > 0 ? { tools } : {}),
      }),
    })

    const data = await res.json()
    if (!res.ok) return json({ error: data.error?.message || 'Anthropic API error' }, res.status)

    const text = (data.content || [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')

    let extracted: {
      company_name?: string
      address?: string
      business?: string
      representative?: string
      features?: string[]
    } | null = null
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) extracted = JSON.parse(jsonMatch[0])
    } catch {
      extracted = null
    }
    if (!extracted) {
      console.error('[extract-company-from-url] JSON parse failed, raw text:', text.slice(0, 500))
      return json({ error: 'parse_failed', raw: text.slice(0, 200) })
    }

    const companyName = stripCite(extracted.company_name || '')
    const address = stripCite(extracted.address || '')
    const business = stripCite(extracted.business || '')
    const representative = stripRepresentativeTitle(stripCite(extracted.representative || ''))
    const features = Array.isArray(extracted.features)
      ? extracted.features.map(stripCite).filter(Boolean)
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
      source: hasDirectContent ? 'direct_fetch' : 'web_search',
      pages_fetched: pages.length,
    })
  } catch (err) {
    console.error('[extract-company-from-url] Error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
