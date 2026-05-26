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

/** Uint8Array を base64url にエンコード（チャンク処理でメモリ効率化） */
function bytesToBase64Url(bytes: Uint8Array): string {
  const chunkSize = 32768
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, sub as unknown as number[])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** base64 文字列を 76 文字毎に CRLF で折り返す（RFC 2045） */
function wrapBase64(b64: string): string {
  return (b64.match(/.{1,76}/g) || []).join('\r\n')
}

/** RFC 2822 形式のメールを構築し base64url エンコードして返す */
function buildRawEmail(params: {
  to: string
  subject: string
  body: string
  cc?: string
  bcc?: string
  attachments?: { filename: string; data: string; mimeType: string }[]
}): string {
  const hasAttachments = params.attachments && params.attachments.length > 0
  const encoder = new TextEncoder()

  const headerLines: string[] = [
    `From: ${mimeEncode(FROM_NAME)} <${FROM_EMAIL}>`,
    `To: ${params.to}`,
  ]
  if (params.cc) headerLines.push(`Cc: ${params.cc}`)
  if (params.bcc) headerLines.push(`Bcc: ${params.bcc}`)
  headerLines.push(`Subject: ${mimeEncode(params.subject)}`)
  headerLines.push('MIME-Version: 1.0')

  if (!hasAttachments) {
    // テキストメールのみ（従来挙動を維持）
    headerLines.push(
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(unescape(encodeURIComponent(params.body))),
    )
    return bytesToBase64Url(encoder.encode(headerLines.join('\r\n')))
  }

  // MIME multipart/mixed: ヘッダー部・本文部・各添付を別 Uint8Array で組み立て、
  // 最後に1度だけ結合 → base64url。添付の base64 データを文字列連結しないことで
  // 大きな添付（数MB〜）でもメモリ消費を線形に抑える。
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`
  headerLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
  headerLines.push('')
  headerLines.push(`--${boundary}`)
  headerLines.push('Content-Type: text/plain; charset=UTF-8')
  headerLines.push('Content-Transfer-Encoding: base64')
  headerLines.push('')
  headerLines.push(btoa(unescape(encodeURIComponent(params.body))))

  const parts: Uint8Array[] = [encoder.encode(headerLines.join('\r\n'))]

  for (const att of params.attachments!) {
    const encodedFilename = mimeEncode(att.filename)
    const partHeader =
      `\r\n--${boundary}\r\n` +
      `Content-Type: ${att.mimeType}; name="${encodedFilename}"\r\n` +
      `Content-Transfer-Encoding: base64\r\n` +
      `Content-Disposition: attachment; filename*=UTF-8''${encodeURIComponent(att.filename)}; filename="${encodedFilename}"\r\n` +
      `\r\n`
    parts.push(encoder.encode(partHeader))
    parts.push(encoder.encode(wrapBase64(att.data)))
  }
  parts.push(encoder.encode(`\r\n--${boundary}--`))

  const totalLen = parts.reduce((s, p) => s + p.length, 0)
  const raw = new Uint8Array(totalLen)
  let offset = 0
  for (const p of parts) {
    raw.set(p, offset)
    offset += p.length
  }
  return bytesToBase64Url(raw)
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
    const { to, subject, body, cc, bcc, attachments } = await req.json()

    if (!to || !subject || !body) {
      return json({ error: 'to, subject, body are required' }, 400)
    }

    const accessToken = await getAccessToken()
    const raw = buildRawEmail({ to, subject, body, cc, bcc, attachments })

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
