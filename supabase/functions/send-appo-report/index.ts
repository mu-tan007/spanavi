const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

async function sendSlack(webhookUrl: string, text: string): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Slack webhook error ${res.status}: ${body}`)
  }
}

async function sendChatwork(roomId: string, body: string): Promise<void> {
  const apiToken = Deno.env.get('CHATWORK_API_TOKEN')
  if (!apiToken) throw new Error('CHATWORK_API_TOKEN not configured')

  const res = await fetch(`https://api.chatwork.com/v2/rooms/${roomId}/messages`, {
    method: 'POST',
    headers: {
      'X-ChatWorkToken': apiToken,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ body, self_unread: '0' }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Chatwork API error ${res.status}: ${text}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { channel, text, webhook_url, room_id } = await req.json()

    if (!text) return json({ error: 'text is required' }, 400)
    if (!channel) return json({ error: 'channel is required (slack | chatwork)' }, 400)

    if (channel === 'slack') {
      if (!webhook_url) return json({ error: 'webhook_url is required for Slack' }, 400)
      await sendSlack(webhook_url, text)
    } else if (channel === 'chatwork') {
      if (!room_id) return json({ error: 'room_id is required for Chatwork' }, 400)
      await sendChatwork(room_id, text)
    } else {
      return json({ error: `Unknown channel: ${channel}` }, 400)
    }

    return json({ ok: true })
  } catch (err) {
    console.error('[send-appo-report] Error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
