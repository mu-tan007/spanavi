import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ギフト同梱DMの二次元コードが読まれたことを記録する。
// -----------------------------------------------------------------------------
// 手紙に刷った https://spanavi.jp/g/<token> の中継ページ（GiftLanding.jsx）から呼ばれる。
// 読み手は当社の顧客ではなく手紙が届いた会社の方なので、ログインは無い（verify_jwt=false）。
// 誰でも叩ける入口なので、渡された token が送付先として実在する時だけ記録する。
// 返すのは常に 204。ここが失敗しても、相手の画面は絶対に止めない。

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 中身を読みに来る機械。人が読んだ件数に混ぜない（数え間違えるとクライアントへの報告が狂う）。
const BOT = /bot|crawler|spider|crawling|preview|slackbot|facebookexternalhit|twitterbot|whatsapp|line-?poker|discordbot|embedly|quora|pinterest|vkshare|skypeuripreview|google-?(read-?aloud|favicon)|bingpreview|curl|wget|python-requests|headless|lighthouse|monitor|uptime/i

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const done = () => new Response(null, { status: 204, headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const token = String(body?.token ?? '').trim().toLowerCase()
    if (!/^[a-z0-9]{8}$/.test(token)) return done()

    const eventType = body?.type === 'click' ? 'click' : 'scan'
    const target = ['calendar', 'deck', 'website'].includes(body?.target) ? body.target : null
    if (eventType === 'click' && !target) return done()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 実在する送付先のトークンでなければ、何も残さない
    const { data: ship } = await supabase
      .from('gift_shipments')
      .select('id, org_id, client_id')
      .eq('token', token)
      .maybeSingle()
    if (!ship) return done()

    const ua = req.headers.get('user-agent') ?? ''
    // 発信元そのものは持たない。同じ端末の読み直しを見分けられれば足りる。
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
    const ipHash = ip ? (await sha256(ip + '|' + token)).slice(0, 32) : null

    await supabase.from('gift_qr_events').insert({
      org_id: ship.org_id,
      client_id: ship.client_id,
      shipment_id: ship.id,
      event_type: eventType,
      target,
      user_agent: ua.slice(0, 300),
      ip_hash: ipHash,
      is_bot: BOT.test(ua) || ua === '',
      raw: { referrer: String(body?.ref ?? '').slice(0, 300) || null },
    })

    return done()
  } catch (e) {
    console.error('[gift-scan]', e)
    return done()
  }
})
