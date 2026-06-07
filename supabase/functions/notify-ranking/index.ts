import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// キーマン接続とみなすステータス（Analytics の _perf_keyman_connect_labels() と一致させること）
const KEYMAN_STATUSES = new Set(['キーマン再コール', 'アポ獲得', 'キーマン断り'])

// 個人売上ランキングと同じ集計条件（StatsView.jsx の COUNTABLE）
const APPO_COUNTABLE = new Set(['面談済', '事前確認済', 'アポ取得'])

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

    // 当日の架電レコードを取得（デフォルト1000件制限を回避するためページネーション）
    let records: { getter_name: string; status: string; called_at: string }[] = []
    let from = 0
    const PAGE_SIZE = 1000
    while (true) {
      const { data, error: fetchError } = await supabase
        .from('call_records')
        .select('getter_name, status, called_at')
        .gte('called_at', todayStartUtc)
        .lte('called_at', todayEndUtc)
        .not('getter_name', 'is', null)
        .order('called_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (fetchError) throw new Error(`DB fetch error: ${fetchError.message}`)
      if (!data || data.length === 0) break
      records = records.concat(data)
      if (data.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
    // getter_name ごとに集計
    const stats: Record<string, { calls: number; keyman: number; appo: number }> = {}
    for (const rec of (records || [])) {
      const name = rec.getter_name as string
      if (!name) continue
      if (!stats[name]) stats[name] = { calls: 0, keyman: 0, appo: 0 }
      stats[name].calls++
      if (KEYMAN_STATUSES.has(rec.status)) stats[name].keyman++
      if (rec.status === 'アポ獲得') stats[name].appo++
    }

    // ランキング取得ヘルパー
    type StatKey = 'calls' | 'keyman' | 'appo'
    const topN = (key: StatKey, limit: number | null): [string, number][] => {
      const sorted = Object.entries(stats)
        .filter(([, s]) => s[key] > 0)
        .sort((a, b) => b[1][key] - a[1][key])
        .map(([name, s]) => [name, s[key]] as [string, number])
      return limit === null ? sorted : sorted.slice(0, limit)
    }

    const formatSection = (entries: [string, number][], unit = '件'): string => {
      if (entries.length === 0) return '該当なし'
      return entries.map(([name, count], i) => `${i + 1}. ${name} — ${count}${unit}`).join('\n')
    }

    const jstHour = jstNow.getUTCHours()
    const jstMin  = jstNow.getUTCMinutes()
    const timeStr = `${String(jstHour).padStart(2, '0')}:${String(jstMin).padStart(2, '0')}`

    const callEntries = topN('calls', null) // 1件以上全員
    const lines = [
      `📊 本日の架電ランキング（${timeStr}時点）`,
      '',
      `🔥 架電件数（全${callEntries.length}名）`,
      formatSection(callEntries),
      '',
      '📞 キーマン接続数 TOP3',
      formatSection(topN('keyman', 3)),
      '',
      '🎯 アポ取得数 TOP3',
      formatSection(topN('appo', 3)),
    ]

    // 平日18時台（hourly cron の 09:00 UTC = JST 18:00）に今月の売上 TOP5 を追加
    // cron 'notify-ranking-hourly' は平日のみ '0 0,3,6,9 * * 1-5' で発火するため曜日判定は不要
    if (jstHour === 18) {
      const monthStartUtc = new Date(jstDateStr.slice(0, 7) + '-01T00:00:00+09:00').toISOString()
      const monthEndUtc = todayEndUtc

      // 今月の appointments を取得（ページネーション）
      type AppoRow = { getter_name: string | null; sales_amount: number | null; status: string | null; list_id: string | null }
      let appos: AppoRow[] = []
      let aFrom = 0
      while (true) {
        const { data, error: aErr } = await supabase
          .from('appointments')
          .select('getter_name, sales_amount, status, list_id')
          .gte('created_at', monthStartUtc)
          .lte('created_at', monthEndUtc)
          .not('getter_name', 'is', null)
          .order('created_at', { ascending: true })
          .range(aFrom, aFrom + PAGE_SIZE - 1)
        if (aErr) throw new Error(`appointments fetch error: ${aErr.message}`)
        if (!data || data.length === 0) break
        appos = appos.concat(data as AppoRow[])
        if (data.length < PAGE_SIZE) break
        aFrom += PAGE_SIZE
      }

      // クライアント開拓リスト由来は売上集計から除外（StatsView と同じ仕様）
      const listIds = Array.from(new Set(appos.map(a => a.list_id).filter(Boolean) as string[]))
      const prospectingMap: Record<string, boolean> = {}
      const CHUNK = 100
      for (let i = 0; i < listIds.length; i += CHUNK) {
        const chunk = listIds.slice(i, i + CHUNK)
        const { data: lists } = await supabase
          .from('call_lists').select('id, is_prospecting').in('id', chunk)
        ;(lists || []).forEach(l => {
          prospectingMap[l.id as string] = (l as { is_prospecting: boolean }).is_prospecting === true
        })
      }

      const salesMap: Record<string, number> = {}
      for (const a of appos) {
        const name = a.getter_name
        if (!name) continue
        if (!APPO_COUNTABLE.has(a.status || '')) continue
        if (a.list_id && prospectingMap[a.list_id]) continue
        salesMap[name] = (salesMap[name] || 0) + Number(a.sales_amount || 0)
      }

      const top5 = Object.entries(salesMap)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)

      const monthLabel = `${parseInt(jstDateStr.slice(5, 7), 10)}月`
      const fmtYen = (n: number) => '¥' + Math.round(n).toLocaleString('ja-JP')
      lines.push('')
      lines.push(`今月（${monthLabel}）の売上ランキング TOP5`)
      if (top5.length === 0) {
        lines.push('該当なし')
      } else {
        lines.push(...top5.map(([name, amt], i) => `${i + 1}. ${name} — ${fmtYen(amt)}`))
      }
    }

    const text = lines.join('\n')

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
