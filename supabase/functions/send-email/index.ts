const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GOOGLE_CLIENT_ID = '570031099308-ni4qokds1jc1m5s0p080t6g2gb3vu8md.apps.googleusercontent.com'
const FROM_EMAIL = 'shinomiya@ma-sp.co'
const FROM_NAME = '篠宮'

async function getAccessToken(): Promise<string> {
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

  if (!refreshToken || !clientSecret) {
    throw new Error('Missing GOOGLE_REFRESH_TOKEN or GOOGLE_CLIENT_SECRET in environment')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: clientSecret,
    }),
  })

  const data = await res.json()
  if (!data.access_token) {
    throw new Error('Token exchange failed: ' + (data.error_description || data.error || JSON.stringify(data)))
  }
  return data.access_token
}

/** MIME エンコード（日本語 Subject 用） */
function mimeEncode(str: string): string {
  const encoded = btoa(unescape(encodeURIComponent(str)))
  return `=?UTF-8?B?${encoded}?=`
}

/** RFC 2822 形式のメールを構築し base64url エンコードして返す */
function buildRawEmail(params: {
  to: string
  subject: string
  body: string
  cc?: string
  bcc?: string
}): string {
  const lines: string[] = [
    `From: ${FROM_NAME} <${FROM_EMAIL}>`,
    `To: ${params.to}`,
  ]
  if (params.cc) lines.push(`Cc: ${params.cc}`)
  if (params.bcc) lines.push(`Bcc: ${params.bcc}`)
  lines.push(
    `Subject: ${mimeEncode(params.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(unescape(encodeURIComponent(params.body))),
  )

  const raw = lines.join('\r\n')
  // base64url エンコード（Gmail API が要求する形式）
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
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

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const { to, subject, body, cc, bcc } = await req.json()

    if (!to || !subject || !body) {
      return json({ error: 'to, subject, body are required' }, 400)
    }

    const accessToken = await getAccessToken()
    const raw = buildRawEmail({ to, subject, body, cc, bcc })

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('[send-email] Gmail API error:', data)
      return json({ error: data.error?.message || 'Gmail send failed' }, res.status)
    }

    return json({ messageId: data.id, threadId: data.threadId })
  } catch (err) {
    console.error('[send-email] Error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
