const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// "+81312345678" → "0312345678"（数字のみ抽出し、81始まりは0に変換）
function normalizePhone(n: string): string {
  if (!n) return ''
  const digits = n.replace(/\D/g, '')
  if (digits.startsWith('81')) return '0' + digits.slice(2)
  return digits
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { zoom_user_id, callee_phone, report_text, company_name, client_name } = await req.json()

    // ── 1. Zoom Phone 録音・文字起こし取得 ──────────────────────────────
    const zoomUserId: string | null = zoom_user_id || null
    let transcript = ''
    let hasTranscript = false

    if (zoomUserId) {
      const zoomAccountId    = Deno.env.get('ZOOM_ACCOUNT_ID')
      const zoomClientId     = Deno.env.get('ZOOM_CLIENT_ID')
      const zoomClientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')

      if (zoomAccountId && zoomClientId && zoomClientSecret) {
        try {
          // Server-to-Server OAuth トークン取得
          const tokenRes = await fetch(
            `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${zoomAccountId}`,
            {
              method: 'POST',
              headers: {
                'Authorization': 'Basic ' + btoa(`${zoomClientId}:${zoomClientSecret}`),
                'Content-Type': 'application/x-www-form-urlencoded',
              },
            }
          )
          const tokenData = await tokenRes.json()
          const zoomToken: string = tokenData.access_token

          if (zoomToken) {
            // アカウント全体の録音を取得（過去2時間、最大100件）
            const fromDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString().slice(0, 10)
            const toDate   = new Date().toISOString().slice(0, 10)
            const recRes = await fetch(
              `https://api.zoom.us/v2/phone/recordings?from=${fromDate}&to=${toDate}&page_size=100`,
              { headers: { 'Authorization': `Bearer ${zoomToken}` } }
            )
            const recData = await recRes.json()
            const allRecordings: {
              owner_id?: string
              callee_number?: string
              transcript_download_url?: string
              start_time?: string
            }[] = recData.recordings || []

            // owner_id で本人の録音に絞り込む
            const myRecordings = allRecordings.filter(r => r.owner_id === zoomUserId)

            // callee_phone が指定されている場合は電話番号でさらに絞り込む
            const calleePhoneNorm = normalizePhone(callee_phone || '')
            const matched = calleePhoneNorm
              ? myRecordings.filter(r => normalizePhone(r.callee_number || '') === calleePhoneNorm)
              : myRecordings

            // 最新の録音（start_time 降順の先頭）を使用
            const target = matched.length > 0
              ? matched.sort((a, b) =>
                  (b.start_time || '').localeCompare(a.start_time || '')
                )[0]
              : null

            if (target?.transcript_download_url) {
              const vttRes = await fetch(target.transcript_download_url, {
                headers: { 'Authorization': `Bearer ${zoomToken}` },
              })
              const vttText = await vttRes.text()
              // VTT → プレーンテキスト（ヘッダ・タイムスタンプ除去）
              transcript = vttText
                .replace(/^WEBVTT\n\n/, '')
                .replace(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}\n/g, '')
                .replace(/^\d+\n/gm, '')
                .trim()
              if (transcript) hasTranscript = true
            }
          }
        } catch (zoomErr) {
          console.error('[appo-ai-report] Zoom API error:', zoomErr)
          // トランスクリプトなしで続行
        }
      }
    }

    // ── 2. Claude で報告書を強化 ──────────────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    let enhancedReport = report_text

    if (anthropicKey) {
      try {
        const prompt = hasTranscript
          ? `以下のアポ取得報告書と通話トランスクリプトを元に、報告書を改善・補足してください。\n\n【現在の報告書】\n${report_text}\n\n【通話トランスクリプト】\n${transcript}\n\nトランスクリプトから有用な情報（担当者の発言、課題、ニーズ等）を報告書に追記してください。元の報告書の形式を保ちつつ、情報を充実させてください。`
          : `以下のアポ取得報告書を、読みやすく整理・改善してください。元の形式を保ちつつ、内容を明確にしてください。\n\n${report_text}`

        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }],
          }),
        })
        const claudeData = await claudeRes.json()
        enhancedReport = claudeData.content?.[0]?.text || report_text
      } catch (claudeErr) {
        console.error('[appo-ai-report] Anthropic API error:', claudeErr)
        // 元の報告書を使用
      }
    }

    // Slack 投稿は post-appo-to-slack に一本化したため当 Function からは行わない。
    // 過去は SLACK_BOT_TOKEN / SLACK_WEBHOOK_URL が設定されていると重複投稿されていた。
    return new Response(
      JSON.stringify({ enhancedReport, slackPosted: false, hasTranscript }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[appo-ai-report] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
