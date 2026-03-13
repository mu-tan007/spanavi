import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 社長接続とみなすステータス
const CEO_STATUSES = new Set(['社長再コール', 'アポ獲得', '社長お断り'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // JST の現在時刻を計算（日本はDST無し、常にUTC+9）
    const nowUtc = new Date()
    const jstOffset = 9 * 60 * 60 * 1000
    const jstNow = new Date(nowUtc.getTime() + jstOffset)

    // JST での今日の開始・終了（UTC）
    const jstDateStr = jstNow.toISOString().slice(0, 10) // 'YYYY-MM-DD'
    const todayStartUtc = new Date(jstDateStr + 'T00:00:00+09:00').toISOString()
    const todayEndUtc   = new Date(jstDateStr + 'T23:59:59+09:00').toISOString()

    // 当日の架電レコードを取得
    const { data: records, error } = await supabase
      .from('call_records')
      .select('getter_name, status, called_at')
      .gte('called_at', todayStartUtc)
      .lte('called_at', todayEndUtc)
      .not('getter_name', 'is', null)

    if (error) throw new Error(`DB fetch error: ${error.message}`)

    // getter_name ごとに集計
    const stats: Record<string, { calls: number; ceo: number; appo: number }> = {}
    for (const rec of (records || [])) {
      const name = rec.getter_name as string
      if (!name) continue
      if (!stats[name]) stats[name] = { calls: 0, ceo: 0, appo: 0 }
      stats[name].calls++
      if (CEO_STATUSES.has(rec.status)) stats[name].ceo++
      if (rec.status === 'アポ獲得') stats[name].appo++
    }

    // 上位3件を取得するヘルパー
    type StatKey = 'calls' | 'ceo' | 'appo'
    const top3 = (key: StatKey): [string, number][] =>
      Object.entries(stats)
        .filter(([, s]) => s[key] > 0)
        .sort((a, b) => b[1][key] - a[1][key])
        .slice(0, 3)
        .map(([name, s]) => [name, s[key]])

    const formatSection = (entries: [string, number][], unit = '件'): string => {
      if (entries.length === 0) return '該当なし'
      return entries.map(([name, count], i) => `${i + 1}. ${name} — ${count}${unit}`).join('\n')
    }

    const jstHour = jstNow.getUTCHours()
    const jstMin  = jstNow.getUTCMinutes()
    const timeStr = `${String(jstHour).padStart(2, '0')}:${String(jstMin).padStart(2, '0')}`

    const text = [
      `📊 本日の架電ランキング（${timeStr}時点）`,
      '',
      '🔥 架電件数 TOP3',
      formatSection(top3('calls')),
      '',
      '📞 社長接続数 TOP3',
      formatSection(top3('ceo')),
      '',
      '🎯 アポ取得数 TOP3',
      formatSection(top3('appo')),
    ].join('\n')

    // org_settings から Webhook URL を取得（なければ env var にフォールバック）
    const { data: orgSetting } = await supabase
      .from('org_settings')
      .select('setting_value')
      .eq('org_id', 'a0000000-0000-0000-0000-000000000001')
      .eq('setting_key', 'slack_webhook_ranking')
      .maybeSingle()
    const webhookUrl = (orgSetting?.setting_value && orgSetting.setting_value.startsWith('http'))
      ? orgSetting.setting_value
      : Deno.env.get('SLACK_RANKING_WEBHOOK_URL')
    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: 'SLACK_RANKING_WEBHOOK_URL not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const slackRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    if (!slackRes.ok) {
      const body = await slackRes.text()
      console.error('[notify-ranking] Slack webhook error:', slackRes.status, body)
      return new Response(
        JSON.stringify({ ok: false, error: body }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[notify-ranking] posted at JST', timeStr, '/ records:', records?.length ?? 0)
    return new Response(
      JSON.stringify({ ok: true, timeStr, recordCount: records?.length ?? 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[notify-ranking] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
