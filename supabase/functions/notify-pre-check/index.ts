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

    // appointments テーブルを取得（status = 'アポ取得' かつ meeting_date が対象日）
    // meeting_date は timestamptz 型のため範囲クエリで取得し、JS側で3日分にフィルタ
    const { data: raw, error: apposError } = await supabase
      .from('appointments')
      .select('company_name, getter_name, meeting_date, client_id, notes')
      .eq('status', 'アポ取得')
      .gte('meeting_date', `${targetDates[0]}T00:00:00+00:00`)
      .lte('meeting_date', `${targetDates[2]}T23:59:59+00:00`)
      .order('meeting_date')
      .order('company_name')

    if (apposError) throw new Error(`appointments fetch error: ${apposError.message}`)

    const appos = (raw || []).filter(a => {
      const d = (a.meeting_date as string).slice(0, 10)
      return targetDates.includes(d)
    })

    if (!appos || appos.length === 0) {
      console.log('[notify-pre-check] 対象アポなし:', targetDates)
      return new Response(
        JSON.stringify({ ok: true, message: 'No appointments', targetDates }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // client_id → クライアント名 マップを構築
    const clientIds = [...new Set(appos.map(a => a.client_id).filter(Boolean))]
    const clientMap: Record<string, string> = {}

    if (clientIds.length > 0) {
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('id, name')
        .in('id', clientIds)
      if (clientsError) console.warn('[notify-pre-check] clients fetch warn:', clientsError.message)
      for (const c of (clients || [])) {
        clientMap[c.id] = c.name
      }
    }

    // 日付ごとにグループ化
    const grouped: Record<string, typeof appos> = {}
    for (const a of appos) {
      const dateKey = (a.meeting_date as string)?.slice(0, 10) || ''
      if (!grouped[dateKey]) grouped[dateKey] = []
      grouped[dateKey].push(a)
    }

    // 日付ラベル定義
    const dayLabels: Record<string, string> = {
      [toDateStr(day0)]: `【事前確認】${formatDateJP(day0)}（当日）`,
      [toDateStr(day1)]: `【事前確認】${formatDateJP(day1)}（1営業日後）`,
      [toDateStr(day2)]: `【事前確認】${formatDateJP(day2)}（2営業日後）`,
    }

    // Slack メッセージ組み立て
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

    // org_settings から Webhook URL を取得（なければ env var にフォールバック）
    const { data: orgSetting } = await supabase
      .from('org_settings')
      .select('setting_value')
      .eq('org_id', 'a0000000-0000-0000-0000-000000000001')
      .eq('setting_key', 'slack_webhook_precheck')
      .maybeSingle()
    const webhookUrl = (orgSetting?.setting_value && orgSetting.setting_value.startsWith('http'))
      ? orgSetting.setting_value
      : Deno.env.get('SLACK_PRECHECK_WEBHOOK_URL')
    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: 'SLACK_PRECHECK_WEBHOOK_URL not configured' }),
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
      console.error('[notify-pre-check] Slack error:', slackRes.status, body)
      return new Response(
        JSON.stringify({ ok: false, error: body }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[notify-pre-check] 送信完了 | アポ数:', appos.length, '| 対象日:', targetDates)
    return new Response(
      JSON.stringify({ ok: true, appoCount: appos.length, targetDates }),
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
