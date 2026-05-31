// 請求書を Slack / Chatwork に送信する Edge Function
// (メールは既存 invokeSendEmail を使うためここでは扱わない)
//
// Input: {
//   channel_type: 'slack' | 'chatwork',
//   target: string,  // slack webhook_url または chatwork room_id
//   text: string,    // 本文
//   attachment_url: string,  // PDF への署名付きURL
//   attachment_filename?: string,
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
    const { channel_type, target, text, attachment_url, attachment_filename } = await req.json()
    if (!channel_type || !target || !text) {
      return json({ ok: false, error: 'channel_type, target, text は必須' }, 400)
    }

    if (channel_type === 'slack') {
      // Slack Incoming Webhook へ POST
      const slackBody = attachment_url
        ? `${text}\n\n請求書PDF: <${attachment_url}|${attachment_filename || 'ダウンロード'}>`
        : text
      const res = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: slackBody }),
      })
      if (!res.ok) {
        const errText = await res.text()
        return json({ ok: false, error: `Slack HTTP ${res.status}: ${errText.slice(0, 200)}` }, 502)
      }
      return json({ ok: true, channel: 'slack' })
    }

    if (channel_type === 'chatwork') {
      const apiToken = Deno.env.get('CHATWORK_API_TOKEN')?.trim()
      if (!apiToken) {
        return json({ ok: false, error: 'CHATWORK_API_TOKEN がシークレットに未設定' }, 500)
      }
      const chatworkBody = attachment_url
        ? `${text}\n\n請求書PDF: ${attachment_url}`
        : text
      const formData = new URLSearchParams()
      formData.set('body', chatworkBody)
      const res = await fetch(
        `https://api.chatwork.com/v2/rooms/${encodeURIComponent(target)}/messages`,
        {
          method: 'POST',
          headers: {
            'X-ChatWorkToken': apiToken,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        }
      )
      if (!res.ok) {
        const errText = await res.text()
        return json({ ok: false, error: `Chatwork HTTP ${res.status}: ${errText.slice(0, 200)}` }, 502)
      }
      return json({ ok: true, channel: 'chatwork' })
    }

    return json({ ok: false, error: `unsupported channel_type: ${channel_type}` }, 400)
  } catch (err) {
    console.error('[send-invoice-to-channel] error:', err)
    return json({ ok: false, error: (err as Error).message || 'unknown error' }, 500)
  }
})
