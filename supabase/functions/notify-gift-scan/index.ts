import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 二次元コードが読まれた会社を Slack に知らせる。
// -----------------------------------------------------------------------------
// 読まれた瞬間ではなく「30分後」に出す（むー様 2026-09-17）。読んだ3分後に電話が
// 鳴るのは相手から見て露骨なため。pg_cron が5分おきにこれを叩き、初回の読み取りから
// 所定の時間が経った会社だけを拾う。知らせるのは1社につき1回だけ。
// 遅らせる分数は org_settings.gift_scan_notify_delay_min で変えられる（既定30分）。

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'
const GIFT_LABEL: Record<string, string> = { beer: 'ビール', dorayaki: 'どら焼き' }
const TARGET_LABEL: Record<string, string> = {
  calendar: '日程調整', deck: '会社紹介資料', website: 'ホームページ',
}

const jst = (iso: string) =>
  new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { data: settings } = await supabase
      .from('org_settings')
      .select('setting_key, setting_value')
      .eq('org_id', ORG_ID)
      .in('setting_key', ['slack_webhook_gift', 'gift_scan_notify_delay_min'])

    const get = (k: string) => settings?.find((s) => s.setting_key === k)?.setting_value ?? ''
    const webhookUrl = get('slack_webhook_gift')
    const delayMin = Number(get('gift_scan_notify_delay_min')) || 30

    if (!webhookUrl.startsWith('http')) {
      return new Response(
        JSON.stringify({ error: 'org_settings.slack_webhook_gift が未設定です' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const cutoff = new Date(Date.now() - delayMin * 60_000).toISOString()

    // 初回の読み取りが delayMin 以上前で、まだ知らせていない会社
    const { data: rows, error } = await supabase
      .from('gift_shipment_stats')
      .select('id, company, addressee, title, tel, gift_type, delivered_on, shipped_on,'
        + ' first_scan_at, scan_count, clicked_calendar, clicked_deck, clicked_website')
      .eq('org_id', ORG_ID)
      .not('first_scan_at', 'is', null)
      .lte('first_scan_at', cutoff)
      .order('first_scan_at', { ascending: true })
    if (error) throw error

    // stats はビューなので通知済みフラグを持たない。本体側で未通知のものに絞る。
    const ids = (rows ?? []).map((r) => r.id)
    if (!ids.length) return new Response(JSON.stringify({ sent: 0 }), { headers: corsHeaders })
    const { data: pending } = await supabase
      .from('gift_shipments')
      .select('id')
      .in('id', ids)
      .is('scan_notified_at', null)
    const pendingIds = new Set((pending ?? []).map((p) => p.id))
    const targets = (rows ?? []).filter((r) => pendingIds.has(r.id))

    let sent = 0
    for (const r of targets) {
      const pressed = [
        r.clicked_calendar ? TARGET_LABEL.calendar : null,
        r.clicked_deck ? TARGET_LABEL.deck : null,
        r.clicked_website ? TARGET_LABEL.website : null,
      ].filter(Boolean).join('・')

      const since = r.delivered_on
        ? `到着から${Math.max(0, Math.floor(
            (Date.now() - new Date(r.delivered_on + 'T00:00:00+09:00').getTime()) / 86_400_000))}日目`
        : r.shipped_on
          ? `発送から${Math.max(0, Math.floor(
              (Date.now() - new Date(r.shipped_on + 'T00:00:00+09:00').getTime()) / 86_400_000))}日目`
          : ''

      const fields = [
        ['会社名', r.company],
        ['宛先', [r.title, r.addressee].filter(Boolean).join('　')],
        ['電話', r.tel],
        ['ギフト', [GIFT_LABEL[r.gift_type] ?? r.gift_type, since].filter(Boolean).join('・')],
        ['読み取り', `${jst(r.first_scan_at)}${r.scan_count > 1 ? `（計${r.scan_count}回）` : ''}`],
        ['押された導線', pressed || 'なし'],
      ].filter(([, v]) => v)

      const blocks = [
        {
          type: 'header',
          text: { type: 'plain_text', text: '二次元コードが読まれました', emoji: false },
        },
        {
          type: 'section',
          fields: fields.map(([k, v]) => ({ type: 'mrkdwn', text: `*${k}*\n${v}` })),
        },
        {
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: 'Renga Partners様のギフト同梱DM。この会社へのお電話をお願いします。',
          }],
        },
      ]

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `二次元コードが読まれました：${r.company}（${r.tel ?? ''}）`, blocks }),
      })
      if (!res.ok) {
        console.error('[notify-gift-scan] slack', res.status, await res.text())
        continue
      }
      // 送れたものだけ既読にする。落ちた分は次の回でもう一度拾われる。
      await supabase
        .from('gift_shipments')
        .update({ scan_notified_at: new Date().toISOString() })
        .eq('id', r.id)
      sent++
    }

    return new Response(JSON.stringify({ sent, candidates: targets.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[notify-gift-scan]', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
