import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
  if (!refreshToken || !clientSecret) throw new Error('Missing Google OAuth credentials')

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
  if (!data.access_token) throw new Error('Token exchange failed')
  return data.access_token
}

async function sendAlertEmail(to: string, memberName: string, ip: string, userAgent: string, loginTime: string) {
  const accessToken = await getAccessToken()

  const subject = '【Spanavi】いつもと異なる環境からのログインがありました'
  const body = `${memberName} 様

いつもSpanaviをご利用いただきありがとうございます。

以下の環境から、あなたのアカウントへのログインがありました。

─────────────────────
日時: ${loginTime}
IPアドレス: ${ip}
ブラウザ: ${userAgent}
─────────────────────

このログインに心当たりがない場合は、速やかにパスワードを変更してください。
また、管理者（篠宮）までご連絡ください。

※ このメールはSpanaviのセキュリティ機能により自動送信されています。`

  const encodedSubject = '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(subject))) + '?='
  const rawEmail = [
    `From: ${FROM_NAME} <${FROM_EMAIL}>`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(unescape(encodeURIComponent(body))),
  ].join('\r\n')

  const encodedMessage = btoa(rawEmail).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encodedMessage }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[check-login] Email send failed:', err)
  }
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
    const { user_id, member_name, email, ip_address, user_agent } = await req.json()

    if (!user_id || !ip_address) {
      return json({ error: 'user_id and ip_address required' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // 過去のログイン履歴でこのIPが使われたことがあるか確認
    const { data: existing } = await supabase
      .from('login_history')
      .select('id')
      .eq('user_id', user_id)
      .eq('ip_address', ip_address)
      .limit(1)

    const isNewIp = !existing || existing.length === 0

    // ログイン履歴を記録
    await supabase.from('login_history').insert({
      user_id,
      member_name: member_name || null,
      email: email || null,
      ip_address,
      user_agent: user_agent || null,
    })

    // 新しいIPの場合、メール通知を送信（本人 + 管理者）
    if (isNewIp && email) {
      const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
      const name = member_name || 'ユーザー'
      try {
        await sendAlertEmail(email, name, ip_address, user_agent || '不明', now)
        // 管理者にも通知（本人が管理者の場合は重複送信しない）
        if (email !== 'shinomiya@ma-sp.co') {
          await sendAlertEmail('shinomiya@ma-sp.co', name, ip_address, user_agent || '不明', now)
        }
      } catch (e) {
        console.error('[check-login] Alert email error:', e)
      }
    }

    return json({ ok: true, new_ip: isNewIp })
  } catch (err) {
    console.error('[check-login] Error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
