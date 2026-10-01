import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// フォーム営業・メールで送ったコーポレートサイトのリンク（https://ma-sp.co/?t=<token>）の閲覧を記録する。
// -----------------------------------------------------------------------------
// ma-sp.co に置いた小さなスクリプト（components/VisitBeacon.tsx）が、?t= で来た訪問の各ページを送ってくる。
// token は doc_sends と同じ（1社1トークン）。実在する時だけ記録し、返すのは常に 204（相手の画面を止めない）。
// ブラウザで JavaScript が動いた時だけ届くので、メールの安全確認などの機械によるリンク取得はほぼ入らない。
// 人の初回閲覧なら、その場で Slack #contact に知らせる（1社1回。資料の閲覧と同じく「開かれた瞬間に」）。
// 二重通知は site_notified_at の原子的な取り合いで防ぐ。Slack が落ちたら戻して次の閲覧で再送。

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// gift-scan と同じ。機械の取得は数えないし知らせない
const BOT = /bot|crawler|spider|crawling|preview|slackbot|facebookexternalhit|twitterbot|whatsapp|line-?poker|discordbot|embedly|quora|pinterest|vkshare|skypeuripreview|google-?(read-?aloud|favicon)|bingpreview|curl|wget|python-requests|headless|lighthouse|monitor|uptime/i

const CHANNEL_LABEL: Record<string, string> = { form: '問い合わせフォーム', email: 'メール', sns: 'SNS' }

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const jst = (d: Date) =>
  d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const done = () => new Response(null, { status: 204, headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const token = String(body?.token ?? '').trim().toLowerCase()
    if (!/^[0-9a-f]{8}$/.test(token)) return done()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: send } = await supabase
      .from('doc_sends')
      .select('id, org_id, client_id, company, tel, channel, doc_key, sent_at, lead_item_id')
      .eq('token', token)
      .maybeSingle()
    if (!send) return done()

    const ua = req.headers.get('user-agent') ?? ''
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
    const ipHash = ip ? (await sha256(ip + '|' + token)).slice(0, 32) : null
    const isBot = BOT.test(ua) || ua === ''
    const path = String(body?.path ?? '').slice(0, 300) || '/'

    await supabase.from('site_visit_events').insert({
      org_id: send.org_id,
      client_id: send.client_id,
      send_id: send.id,
      session_id: String(body?.sid ?? '').slice(0, 64) || null,
      path,
      referrer: String(body?.ref ?? '').slice(0, 300) || null,
      user_agent: ua.slice(0, 300),
      ip_hash: ipHash,
      is_bot: isBot,
    })
    if (isBot) return done()

    // 初回だけ知らせる。取れた1回だけが送る権利を持つ
    const now = new Date()
    const { data: claimed } = await supabase
      .from('doc_sends')
      .update({ site_notified_at: now.toISOString() })
      .eq('id', send.id)
      .is('site_notified_at', null)
      .select('id')
    if (!claimed?.length) return done()

    const release = () =>
      supabase.from('doc_sends').update({ site_notified_at: null }).eq('id', send.id)

    const { data: setting } = await supabase
      .from('org_settings')
      .select('setting_value')
      .eq('org_id', send.org_id)
      .eq('setting_key', 'slack_webhook_contact')
      .maybeSingle()
    const webhookUrl = String(setting?.setting_value ?? '').trim()
    if (!webhookUrl.startsWith('http')) {
      console.error('[site-visit] org_settings.slack_webhook_contact が未設定')
      await release()
      return done()
    }

    // 最新の架電結果を添える（電話する人がそのまま動けるように）
    const { data: rec } = await supabase
      .from('call_records')
      .select('status, called_at')
      .eq('item_id', send.lead_item_id)
      .order('called_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const since = send.sent_at
      ? `送付から${Math.max(0, Math.floor(
          (now.getTime() - new Date(send.sent_at).getTime()) / 86_400_000))}日目`
      : ''
    const fields = [
      ['会社名', send.company],
      ['電話', send.tel],
      ['送付経路', [CHANNEL_LABEL[send.channel] ?? send.channel, since].filter(Boolean).join('・')],
      ['閲覧', jst(now)],
      ['最初に開いたページ', `ma-sp.co${path}`],
      ['最新の架電結果', rec?.status ?? '未架電'],
    ].filter(([, v]) => v)

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `ホームページが閲覧されました：${send.company}（${send.tel ?? ''}）`,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: 'ホームページが閲覧されました', emoji: false } },
          { type: 'section', fields: fields.map(([k, v]) => ({ type: 'mrkdwn', text: `*${k}*\n${v}` })) },
          {
            type: 'context',
            elements: [{
              type: 'mrkdwn',
              text: '営業で送ったリンクから ma-sp.co を開いています。この会社へのお電話をお願いします。',
            }],
          },
        ],
      }),
    })
    if (!res.ok) {
      console.error('[site-visit] slack', res.status, await res.text())
      await release()
    }
    return done()
  } catch (e) {
    console.error('[site-visit]', e)
    return done()
  }
})
