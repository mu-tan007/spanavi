// クライアント契約書作成用チャットアシスタント Edge Function
//
// Input: {
//   conversation: [{ role: 'user'|'assistant', content: string }],
//   client_name: string,
//   reward_table_text?: string,
//   current_values?: { address, representative, contract_date, period_start, period_months, tax, payment_site, custom_clauses }
// }
// Output: {
//   reply: string,
//   extracted: { client_address?, client_representative?, contract_date?, period_start?, period_months?, tax?, payment_site?, custom_clauses? },
//   ready: boolean
// }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const { conversation = [], client_name, reward_table_text, current_values = {} } = await req.json()
    if (!client_name) return json({ reply: '', extracted: {}, ready: false, error: 'client_name required' }, 400)

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim()
    if (!apiKey) return json({ reply: '', extracted: {}, ready: false, error: 'ANTHROPIC_API_KEY not set' }, 500)

    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

    const systemPrompt = `あなたは「クライアント契約書作成アシスタント」です。ユーザーと会話して以下の項目を埋めていき、揃ったら「生成準備OK」を伝える。

【対象クライアント】 ${client_name}
【今日の日付】 ${today}

【抽出フィールド】
- client_address: 本社住所 (当社表記: 丁目=漢数字, 番号=半角。例「赤坂一丁目11-44」)
- client_representative: 代表者氏名 (役職名除く)
- contract_date: 契約締結日 (YYYY-MM-DD)
- period_start: 契約開始日 (YYYY-MM-DD)
- period_months: 契約期間月数 (整数, デフォルト12)
- tax: 消費税 (「税別」または「税込」)
- payment_site: 支払サイト (デフォルト「毎月末日〆翌月15日払い」)
- custom_clauses: 特記事項 (任意。ユーザーが言った場合のみ記録)

【現在の入力状況】 (すでに埋まっている値)
${JSON.stringify(current_values, null, 2)}

【報酬体系 (CRMから自動取得済み)】
${reward_table_text || '(未設定)'}

【動作ルール】
1. 初回は誠実にアイスブレイクし、現状の入力状況を要約して足りない項目を聞く。
2. ユーザーは複数項目を一文で言うことが多いので、一括で抽出すること。
3. 住所は「赤坂1-11-44」のようなユーザー入力も「赤坂一丁目11-44」に正規化して返す。
4. 日付言表現「明日」「来週月曜」「6/1」などは今日を基準に YYYY-MM-DD に解釈。
5. 期間はデフォルト12ヶ月。ユーザーが「1年」と言ったらperiod_months=12、「半年」なら6。
6. それぞれ揃ったら、最終確認として全値を並べて「これで生成しますか？」と聞く。
7. ユーザーが「OK」「生成して」「これで進めて」「了解」等と言ったらready=true。
8. 住所/代表者が不明でユーザーも不明と言う場合、web_search で調べて試みる (max 2回)。
9. reply は簡潔に。Markdown使用OK。

【出力形式】 必ず以下 JSON のみ (前置き・解説不要):
{
  "reply": "ユーザーへの返信文",
  "extracted": { ...以上のフィールドのうち、今回の会話で明らかになったもののみ },
  "ready": true|false
}`

    // 会話履歴は Claude にそのまま渡す (初回は conversation が空なので、仮ダミーとして 'user' メッセージを追加)
    const messages = conversation.length === 0
      ? [{ role: 'user', content: '契約書作成を始めてください。現状の状況を要約して、不足している項目を教えてください。' }]
      : conversation

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
        system: systemPrompt,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
        messages,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[chat-contract-assistant] anthropic error:', response.status, errText)
      return json({ reply: '', extracted: {}, ready: false, error: `API error ${response.status}` }, 502)
    }

    const data = await response.json()
    const blocks = data.content || []
    const lastText = blocks.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
    const match = lastText.match(/\{[\s\S]*\}/)
    if (!match) {
      return json({ reply: lastText || '(応答を解析できませんでした)', extracted: {}, ready: false, raw: lastText.slice(0, 500) })
    }
    try {
      const result = JSON.parse(match[0])
      return json({
        reply: result.reply || '',
        extracted: result.extracted || {},
        ready: !!result.ready,
      })
    } catch (e) {
      return json({ reply: lastText, extracted: {}, ready: false, error: 'failed to parse JSON' })
    }
  } catch (err) {
    console.error('[chat-contract-assistant] error:', err)
    return json({ reply: '', extracted: {}, ready: false, error: (err as Error).message || 'unknown error' }, 500)
  }
})
