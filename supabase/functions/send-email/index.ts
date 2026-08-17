const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GOOGLE_CLIENT_ID = '570031099308-ni4qokds1jc1m5s0p080t6g2gb3vu8md.apps.googleusercontent.com'
const FROM_EMAIL = 'shinomiya@ma-sp.co'
const FROM_NAME = '篠宮'

/** Gmail の1通あたり上限 (25MiB)。base64 化・改行込みのメッセージ全体に効く */
const GMAIL_MAX_MESSAGE_BYTES = 25 * 1024 * 1024

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

/**
 * base64 文字列を 76 文字毎に CRLF で折り返し、約 512KB 単位のかたまりで push する（RFC 2045）。
 * `b64.match(/.{1,76}/g)` は数十万個の小さな文字列を同時に抱えて 546 (Memory limit exceeded) の
 * 直接原因になるため使わない。かたまり単位で join することで一時オブジェクトを常に一定量に抑える。
 */
function pushWrappedBase64(parts: BlobPart[], b64: string): void {
  const LINE = 76
  const LINES_PER_CHUNK = 6900 // 6900 行 ≒ 525KB / チャンク
  let lines: string[] = []
  for (let i = 0; i < b64.length; i += LINE) {
    lines.push(b64.slice(i, i + LINE))
    if (lines.length >= LINES_PER_CHUNK) {
      parts.push(lines.join('\r\n') + '\r\n')
      lines = []
    }
  }
  if (lines.length > 0) parts.push(lines.join('\r\n'))
}

/**
 * RFC 2822 形式のメールを Blob（= message/rfc822 の生バイト列）として組み立てる。
 *
 * 旧実装は「全体を1本の Uint8Array に連結 → base64url 文字列化 → JSON に載せる」ため、
 * 添付1に対しメッセージ全体のコピーが5〜6本メモリに乗り、10MB 程度の添付で 256MB を超えていた。
 * Gmail の media upload エンドポイントは生の MIME をそのまま受け取れるので、
 * base64url への再エンコード（サイズが更に 4/3 倍になる）を丸ごと不要にする。
 */
function buildMimeMessage(params: {
  to: string
  subject: string
  body: string
  cc?: string
  bcc?: string
  attachments?: { filename: string; data: string; mimeType: string }[]
}): Blob {
  const hasAttachments = params.attachments && params.attachments.length > 0

  const headerLines: string[] = [
    `From: ${mimeEncode(FROM_NAME)} <${FROM_EMAIL}>`,
    `To: ${params.to}`,
  ]
  if (params.cc) headerLines.push(`Cc: ${params.cc}`)
  if (params.bcc) headerLines.push(`Bcc: ${params.bcc}`)
  headerLines.push(`Subject: ${mimeEncode(params.subject)}`)
  headerLines.push('MIME-Version: 1.0')

  const bodyBase64 = btoa(unescape(encodeURIComponent(params.body)))

  if (!hasAttachments) {
    headerLines.push(
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      bodyBase64,
    )
    return new Blob([headerLines.join('\r\n')], { type: 'message/rfc822' })
  }

  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`
  headerLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
  headerLines.push('')
  headerLines.push(`--${boundary}`)
  headerLines.push('Content-Type: text/plain; charset=UTF-8')
  headerLines.push('Content-Transfer-Encoding: base64')
  headerLines.push('')
  headerLines.push(bodyBase64)

  const parts: BlobPart[] = [headerLines.join('\r\n')]

  for (const att of params.attachments!) {
    const encodedFilename = mimeEncode(att.filename)
    parts.push(
      `\r\n--${boundary}\r\n` +
      `Content-Type: ${att.mimeType}; name="${encodedFilename}"\r\n` +
      `Content-Transfer-Encoding: base64\r\n` +
      `Content-Disposition: attachment; filename*=UTF-8''${encodeURIComponent(att.filename)}; filename="${encodedFilename}"\r\n` +
      `\r\n`
    )
    pushWrappedBase64(parts, att.data)
    // 添付1件ぶんの base64 文字列は Blob 側に移したので、参照を切って GC 対象にする
    att.data = ''
  }
  parts.push(`\r\n--${boundary}--`)

  return new Blob(parts, { type: 'message/rfc822' })
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

    // Gmail 上限の事前チェック（送信を試みる前に、原因の分かる日本語で返す）
    if (Array.isArray(attachments) && attachments.length > 0) {
      // base64 文字数 ≒ 転送サイズ。76文字毎の CRLF ぶん (2/76) を上乗せして見積もる
      const estimated = attachments.reduce(
        (sum: number, a: { data?: string }) => sum + Math.ceil((a?.data?.length || 0) * (78 / 76)),
        body.length,
      )
      if (estimated > GMAIL_MAX_MESSAGE_BYTES) {
        const rawMB = (attachments.reduce((s: number, a: { data?: string }) => s + (a?.data?.length || 0), 0) * 3 / 4 / 1024 / 1024).toFixed(1)
        return json({
          error: `添付ファイルが大きすぎます（合計 約${rawMB}MB）。Gmail の1通あたり上限 25MB を超えるため送信できません。ファイルを圧縮するか、共有リンクでの送付をご検討ください。`,
        }, 413)
      }
    }

    const accessToken = await getAccessToken()
    const message = buildMimeMessage({ to, subject, body, cc, bcc, attachments })

    // media upload エンドポイント: 生の MIME をそのまま送る（raw への base64url 再エンコードが不要）
    const res = await fetch(
      'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'message/rfc822',
        },
        body: message,
      }
    )

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
