import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// デフォルトの社長接続ステータス（org_settings未設定時フォールバック）
const DEFAULT_CEO_STATUSES = ['社長再コール', 'アポ獲得', '社長お断り']

// チーム名 → org_settings Webhookキー マッピング
const TEAM_WEBHOOK_KEYS: Record<string, string> = {
  '成尾': 'slack_webhook_report_nario',
  '高橋': 'slack_webhook_report_takahashi',
}

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'
const PAGE_SIZE = 1000
const JST_OFFSET = 9 * 60 * 60 * 1000

// JST日付文字列を返す
function jstDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + JST_OFFSET).toISOString().slice(0, 10)
}

// 人ごとの稼働時間を計算（calcWorkHours移植）
// 日ごとに min(called_at) 〜 max(called_at) の差分を合算
function calcWorkHours(calls: { called_at: string }[]): number {
  const dayBounds: Record<string, { min: number; max: number }> = {}
  for (const r of calls) {
    const ms = new Date(r.called_at).getTime()
    const date = jstDateOf(r.called_at)
    if (!dayBounds[date]) {
      dayBounds[date] = { min: ms, max: ms }
    } else {
      if (ms < dayBounds[date].min) dayBounds[date].min = ms
      if (ms > dayBounds[date].max) dayBounds[date].max = ms
    }
  }
  return Object.values(dayBounds).reduce(
    (sum, d) => sum + Math.max((d.max - d.min) / 3600000, 0),
    0
  )
}

// 集計期間を算出（JST基準）
function getDateRange(period: string, jstNow: Date): { from: string; to: string } {
  const y = jstNow.getUTCFullYear()
  const m = jstNow.getUTCMonth()
  const d = jstNow.getUTCDate()
  const today = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  if (period === 'daily') {
    return { from: today, to: today }
  }
  if (period === 'weekly') {
    const dayOfWeek = jstNow.getUTCDay()
    // 月曜始まり: 月=0, 火=1, ..., 日=6
    const offsetToMonday = (dayOfWeek + 6) % 7
    const monday = new Date(Date.UTC(y, m, d - offsetToMonday))
    const monStr = monday.toISOString().slice(0, 10)
    return { from: monStr, to: today }
  }
  // monthly
  const firstDay = `${y}-${String(m + 1).padStart(2, '0')}-01`
  return { from: firstDay, to: today }
}

// 月末判定（monthly cronは28-31日に毎日実行されるため）
function isLastDayOfMonth(jstNow: Date): boolean {
  const y = jstNow.getUTCFullYear()
  const m = jstNow.getUTCMonth()
  const d = jstNow.getUTCDate()
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return d === lastDay
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // period パラメータ取得
    let period = 'daily'
    try {
      const body = await req.json()
      if (body.period) period = body.period
    } catch { /* default to daily */ }

    if (!['daily', 'weekly', 'monthly'].includes(period)) {
      return new Response(
        JSON.stringify({ error: 'Invalid period. Use: daily, weekly, monthly' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 月次: 月末でなければスキップ
    const nowUtc = new Date()
    const jstNow = new Date(nowUtc.getTime() + JST_OFFSET)
    if (period === 'monthly' && !isLastDayOfMonth(jstNow)) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'Not last day of month' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // --- 集計期間 ---
    const { from, to } = getDateRange(period, jstNow)
    const fromUtc = new Date(from + 'T00:00:00+09:00').toISOString()
    const toUtc = new Date(to + 'T23:59:59.999+09:00').toISOString()

    // --- メンバー取得（チーム情報） ---
    const { data: members, error: membersErr } = await supabase
      .from('members')
      .select('name, team')
      .eq('org_id', ORG_ID)
      .eq('is_active', true)
    if (membersErr) throw new Error(`Members fetch error: ${membersErr.message}`)

    const teamMap: Record<string, string> = {}
    for (const mb of (members || [])) {
      if (mb.name && !/^user_/i.test(mb.name)) {
        teamMap[mb.name] = mb.team || '営業統括'
      }
    }

    // --- org_settings取得 ---
    const { data: settings } = await supabase
      .from('org_settings')
      .select('setting_key, setting_value')
      .eq('org_id', ORG_ID)
    const settingsMap: Record<string, string> = {}
    for (const s of (settings || [])) {
      settingsMap[s.setting_key] = s.setting_value
    }

    // 社長接続ステータス
    let ceoLabels = new Set(DEFAULT_CEO_STATUSES)
    if (settingsMap['call_statuses']) {
      try {
        const parsed = JSON.parse(settingsMap['call_statuses'])
        if (Array.isArray(parsed)) {
          ceoLabels = new Set(
            parsed.filter((s: { ceo_connect?: boolean }) => s.ceo_connect).map((s: { label: string }) => s.label)
          )
        }
      } catch { /* use defaults */ }
    }

    // --- call_records取得（ページネーション） ---
    type CallRecord = { getter_name: string; status: string; called_at: string }
    let records: CallRecord[] = []
    let offset = 0
    while (true) {
      const { data, error } = await supabase
        .from('call_records')
        .select('getter_name, status, called_at')
        .eq('org_id', ORG_ID)
        .gte('called_at', fromUtc)
        .lte('called_at', toUtc)
        .not('getter_name', 'is', null)
        .order('called_at', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)
      if (error) throw new Error(`call_records fetch: ${error.message}`)
      if (!data || data.length === 0) break
      records = records.concat(data)
      if (data.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    // --- appointments取得（ページネーション） ---
    type AppoRecord = { getter_name: string; created_at: string }
    let appoRecords: AppoRecord[] = []
    offset = 0
    while (true) {
      const { data, error } = await supabase
        .from('appointments')
        .select('getter_name, created_at')
        .eq('org_id', ORG_ID)
        .gte('created_at', fromUtc)
        .lte('created_at', toUtc)
        .not('getter_name', 'is', null)
        .range(offset, offset + PAGE_SIZE - 1)
      if (error) throw new Error(`appointments fetch: ${error.message}`)
      if (!data || data.length === 0) break
      appoRecords = appoRecords.concat(data)
      if (data.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    // --- 人ごと集計 ---
    type PersonStats = { calls: number; ceo: number; appo: number; callRecords: { called_at: string }[] }
    const personStats: Record<string, PersonStats> = {}

    for (const r of records) {
      const name = r.getter_name
      if (!name) continue
      if (!personStats[name]) personStats[name] = { calls: 0, ceo: 0, appo: 0, callRecords: [] }
      personStats[name].calls++
      personStats[name].callRecords.push({ called_at: r.called_at })
      if (ceoLabels.has(r.status)) personStats[name].ceo++
      if (r.status === 'アポ獲得') personStats[name].appo++
    }

    // appointments テーブルからのアポ数を追加
    const appoByPerson: Record<string, number> = {}
    for (const a of appoRecords) {
      if (!a.getter_name) continue
      appoByPerson[a.getter_name] = (appoByPerson[a.getter_name] || 0) + 1
    }
    // appointments テーブルのアポ数を優先（call_records のアポ獲得カウントより正確）
    for (const [name, count] of Object.entries(appoByPerson)) {
      if (!personStats[name]) personStats[name] = { calls: 0, ceo: 0, appo: 0, callRecords: [] }
      personStats[name].appo = count
    }

    // --- チーム別にグループ化 ---
    const EXCLUDED_TEAMS = new Set(['営業統括', 'その他'])
    type TeamReport = {
      teamName: string
      members: { name: string; calls: number; ceo: number; appo: number; cph: number | null }[]
      totalCalls: number
      totalCeo: number
      totalAppo: number
    }
    const teamReports: Record<string, TeamReport> = {}

    for (const [name, stats] of Object.entries(personStats)) {
      if (stats.calls === 0) continue // 架電0件は除外
      const team = teamMap[name] || '営業統括'
      if (EXCLUDED_TEAMS.has(team)) continue

      const teamKey = team
      if (!teamReports[teamKey]) {
        teamReports[teamKey] = { teamName: team + 'チーム', members: [], totalCalls: 0, totalCeo: 0, totalAppo: 0 }
      }

      const workHours = calcWorkHours(stats.callRecords)
      const cph = workHours > 0.01 ? Math.round((stats.calls / workHours) * 10) / 10 : null

      teamReports[teamKey].members.push({ name, calls: stats.calls, ceo: stats.ceo, appo: stats.appo, cph })
      teamReports[teamKey].totalCalls += stats.calls
      teamReports[teamKey].totalCeo += stats.ceo
      teamReports[teamKey].totalAppo += stats.appo
    }

    // メンバーを架電数降順でソート
    for (const report of Object.values(teamReports)) {
      report.members.sort((a, b) => b.calls - a.calls)
    }

    // --- レポートフォーマット ---
    const periodLabels: Record<string, string> = { daily: '日次', weekly: '週次', monthly: '月次' }
    const periodLabel = periodLabels[period]
    const dateLabel = from === to ? from.replace(/-/g, '/') : `${from.replace(/-/g, '/')} 〜 ${to.replace(/-/g, '/')}`

    function formatReport(report: TeamReport): string {
      const lines: string[] = []
      lines.push(`📊 ${report.teamName} ${periodLabel}レポート（${dateLabel}）`)
      lines.push('')

      report.members.forEach((m, i) => {
        const cphStr = m.cph !== null ? `${m.cph}件/h` : '-件/h'
        const connectRate = m.calls > 0 ? (m.ceo / m.calls * 100).toFixed(1) : '0.0'
        const appoRate = m.calls > 0 ? (m.appo / m.calls * 100).toFixed(1) : '0.0'
        lines.push(
          `${String(i + 1).padStart(2, ' ')}. ${m.name} — ${m.calls}件 | ${cphStr} | 社長${m.ceo} (${connectRate}%) | アポ${m.appo} (${appoRate}%)`
        )
      })

      lines.push('')
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━')
      const totalConnectRate = report.totalCalls > 0 ? (report.totalCeo / report.totalCalls * 100).toFixed(1) : '0.0'
      const totalAppoRate = report.totalCalls > 0 ? (report.totalAppo / report.totalCalls * 100).toFixed(1) : '0.0'
      lines.push(
        `合計: ${report.totalCalls}件 | 社長${report.totalCeo} (${totalConnectRate}%) | アポ${report.totalAppo} (${totalAppoRate}%)`
      )

      return lines.join('\n')
    }

    // --- Slack投稿 ---
    const results: { team: string; ok: boolean; error?: string }[] = []

    for (const [teamKey, report] of Object.entries(teamReports)) {
      const webhookSettingKey = TEAM_WEBHOOK_KEYS[teamKey]
      if (!webhookSettingKey) {
        results.push({ team: report.teamName, ok: false, error: 'No webhook key mapping' })
        continue
      }

      const webhookUrl = settingsMap[webhookSettingKey]
      if (!webhookUrl || !webhookUrl.startsWith('http')) {
        results.push({ team: report.teamName, ok: false, error: `Webhook not configured: ${webhookSettingKey}` })
        continue
      }

      const text = formatReport(report)

      try {
        const slackRes = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })

        if (!slackRes.ok) {
          const body = await slackRes.text()
          console.error(`[notify-team-report] Slack error for ${report.teamName}:`, slackRes.status, body)
          results.push({ team: report.teamName, ok: false, error: body })
        } else {
          results.push({ team: report.teamName, ok: true })
        }
      } catch (err) {
        results.push({ team: report.teamName, ok: false, error: (err as Error).message })
      }
    }

    const jstHour = jstNow.getUTCHours()
    const jstMin = jstNow.getUTCMinutes()
    const timeStr = `${String(jstHour).padStart(2, '0')}:${String(jstMin).padStart(2, '0')}`

    console.log(`[notify-team-report] ${period} report posted at JST ${timeStr} / records: ${records.length} / results:`, results)

    return new Response(
      JSON.stringify({ ok: true, period, dateRange: { from, to }, timeStr, recordCount: records.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[notify-team-report] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
