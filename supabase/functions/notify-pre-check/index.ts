import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

/** date を n 営業日進める（土日スキップ） */
function addBusinessDays(date: Date, n: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < n) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return result
}

/** Date → 'YYYY-MM-DD' */
function toDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Date → '2026/03/05（水）' */
function formatDateJP(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const w = DAY_NAMES[date.getDay()]
  return `${y}/${m}/${d}（${w}）`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // JST 現在時刻
    const nowUtc = new Date()
    const jstNow = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000)
    const jstDateStr = jstNow.toISOString().slice(0, 10) // 'YYYY-MM-DD'
    // Date オブジェクトはローカル時刻を使わず UTC ベースで構築
    const todayJST = new Date(jstDateStr + 'T00:00:00Z')

    // 当日・1営業日後・2営業日後
    const day0 = todayJST
    const day1 = addBusinessDays(todayJST, 1)
    const day2 = addBusinessDays(todayJST, 2)
    const targetDates = [toDateStr(day0), toDateStr(day1), toDateStr(day2)]

    // 通知対象 org = org_settings.slack_webhook_precheck に有効URLが設定されている org のみ
    const { data: webhookRows, error: webhookErr } = await supabase
      .from('org_settings')
      .select('org_id, setting_value')
      .eq('setting_key', 'slack_webhook_precheck')
    if (webhookErr) throw new Error(`org_settings fetch error: ${webhookErr.message}`)

    const orgWebhooks: Array<{ org_id: string; url: string }> = []
    for (const row of (webhookRows || [])) {
      const url = (row.setting_value as string | null) || ''
      if (url.startsWith('http')) orgWebhooks.push({ org_id: row.org_id as string, url })
    }
    if (orgWebhooks.length === 0) {
      console.log('[notify-pre-check] slack_webhook_precheck 設定済 org なし')
      return new Response(
        JSON.stringify({ ok: true, message: 'No org webhook configured', targetDates }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const summary: Array<{ org_id: string; appoCount: number; sent: boolean }> = []

    for (const { org_id: orgId, url: webhookUrl } of orgWebhooks) {
      // 当該 org のアポのみ取得（status='アポ取得' / 対象日範囲）
      const { data: rawOrg, error: apposError } = await supabase
        .from('appointments')
        .select('company_name, getter_name, meeting_date, client_id, notes')
        .eq('org_id', orgId)
        .eq('status', 'アポ取得')
        .gte('meeting_date', `${targetDates[0]}T00:00:00+00:00`)
        .lte('meeting_date', `${targetDates[2]}T23:59:59+00:00`)
        .order('meeting_date')
        .order('company_name')
      if (apposError) {
        console.warn(`[notify-pre-check] org ${orgId} appos fetch warn:`, apposError.message)
        continue
      }

      const appos = (rawOrg || []).filter(a => {
        const d = (a.meeting_date as string).slice(0, 10)
        return targetDates.includes(d)
      })
      if (appos.length === 0) {
        summary.push({ org_id: orgId, appoCount: 0, sent: false })
        continue
      }

      // client_id → クライアント名 マップを構築（org スコープ）
      const clientIds = [...new Set(appos.map(a => a.client_id).filter(Boolean))]
      const clientMap: Record<string, string> = {}
      if (clientIds.length > 0) {
        const { data: clients, error: clientsError } = await supabase
          .from('clients')
          .select('id, name')
          .eq('org_id', orgId)
          .in('id', clientIds)
        if (clientsError) console.warn(`[notify-pre-check] org ${orgId} clients fetch warn:`, clientsError.message)
        for (const c of (clients || [])) clientMap[c.id] = c.name
      }

      // 日付ごとにグループ化
      const grouped: Record<string, typeof appos> = {}
      for (const a of appos) {
        const dateKey = (a.meeting_date as string)?.slice(0, 10) || ''
        if (!grouped[dateKey]) grouped[dateKey] = []
        grouped[dateKey].push(a)
      }

      const dayLabels: Record<string, string> = {
        [toDateStr(day0)]: `【事前確認】${formatDateJP(day0)}（当日）`,
        [toDateStr(day1)]: `【事前確認】${formatDateJP(day1)}（1営業日後）`,
        [toDateStr(day2)]: `【事前確認】${formatDateJP(day2)}（2営業日後）`,
      }

      const sections: string[] = []
      for (const dateStr of targetDates) {
        if (!grouped[dateStr]) continue
        sections.push(dayLabels[dateStr])
        for (const a of grouped[dateStr]) {
          const clientName = clientMap[a.client_id] || 'クライアント不明'
          sections.push(`・${a.company_name} / アポ取得者：${a.getter_name} / クライアント：${clientName}`)
          if (a.notes && (a.notes as string).trim()) {
            sections.push(`　備考：${(a.notes as string).trim()}`)
          }
        }
        sections.push('')
      }

      const text = sections.join('\n').trimEnd()
      const slackRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!slackRes.ok) {
        const body = await slackRes.text()
        console.error(`[notify-pre-check] org ${orgId} Slack error:`, slackRes.status, body)
        summary.push({ org_id: orgId, appoCount: appos.length, sent: false })
        continue
      }
      summary.push({ org_id: orgId, appoCount: appos.length, sent: true })
    }

    console.log('[notify-pre-check] 送信完了 | 対象日:', targetDates, '| summary:', summary)
    return new Response(
      JSON.stringify({ ok: true, targetDates, summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[notify-pre-check] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
