// ============================================================
// sync-list-to-sheets
// ------------------------------------------------------------
// pg_cron が30秒ごとに呼ぶ。sheet_sync_queue から dirty な
// list_id を取り出し、各リストの全データを Google Sheets に
// 全置換で書き込む。
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SHEETS_CLIENT_ID = '570031099308-99lcefvcduu9l5etibuqostp261jpker.apps.googleusercontent.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
}

async function getAccessToken(): Promise<string> {
  const refreshToken = Deno.env.get('GOOGLE_SHEETS_REFRESH_TOKEN')
  const clientSecret = Deno.env.get('GOOGLE_SHEETS_CLIENT_SECRET')
  if (!refreshToken || !clientSecret) {
    throw new Error('Missing GOOGLE_SHEETS_REFRESH_TOKEN or GOOGLE_SHEETS_CLIENT_SECRET')
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: SHEETS_CLIENT_ID,
      client_secret: clientSecret,
    }),
  })
  const data = await res.json()
  if (!data.access_token) {
    throw new Error('token exchange failed: ' + JSON.stringify(data))
  }
  return data.access_token as string
}

const CONNECTED = new Set(['社長不在', '社長再コール', '社長お断り', 'アポ獲得'])

function buildSheetData(list: any, items: any[], records: any[]) {
  // record map: item_id -> round -> {status, date}
  const recordMap: Record<string, Record<number, { status: string; date: string }>> = {}
  for (const r of records) {
    if (!recordMap[r.item_id]) recordMap[r.item_id] = {}
    const calledAt = r.called_at
      ? new Date(new Date(r.called_at).getTime() + 9 * 60 * 60 * 1000)
          .toISOString().slice(0, 10).replace(/-/g, '/')
      : ''
    recordMap[r.item_id][r.round] = { status: r.status, date: calledAt }
  }
  const maxRound = records.length > 0 ? Math.max(...records.map((r: any) => r.round)) : 0

  // ===== Sheet 1: リストデータ =====
  const header = [
    'No.', '企業名', '事業内容', '住所', '売上高（千円）', '当期純利益（千円）',
    '代表者', '電話番号', '備考',
  ]
  for (let i = 1; i <= maxRound; i++) {
    header.push(`${i}回目日付`)
    header.push(`${i}回目結果`)
  }
  const rows: any[][] = [header]
  for (const item of items) {
    let memoText = ''
    try { const p = JSON.parse(item.memo || ''); memoText = p.biko ?? '' } catch { memoText = item.memo || '' }
    const row: any[] = [
      item.no ?? '',
      item.company || '',
      item.business || '',
      (item.address || '').replace(/\/$/, ''),
      item.revenue ?? '',
      item.net_income ?? '',
      item.representative || '',
      item.phone || '',
      memoText,
    ]
    const recs = recordMap[item.id] || {}
    for (let i = 1; i <= maxRound; i++) {
      row.push(recs[i]?.date || '')
      row.push(recs[i]?.status || '')
    }
    rows.push(row)
  }

  // ===== Sheet 2: レポート =====
  const weekMap: Record<string, { calls: number; connected: number; appo: number }> = {}
  for (const r of records) {
    if (!r.called_at) continue
    const d = new Date(r.called_at)
    const dow = (d.getDay() + 6) % 7
    const mon = new Date(d); mon.setDate(d.getDate() - dow)
    const wk = mon.toISOString().slice(0, 10)
    if (!weekMap[wk]) weekMap[wk] = { calls: 0, connected: 0, appo: 0 }
    weekMap[wk].calls++
    if (CONNECTED.has(r.status)) weekMap[wk].connected++
    if (r.status === 'アポ獲得') weekMap[wk].appo++
  }
  const weeks = Object.keys(weekMap).sort()
  const totalCalls = records.length
  const totalConnected = records.filter((r: any) => CONNECTED.has(r.status)).length
  const totalAppo = records.filter((r: any) => r.status === 'アポ獲得').length
  const connRateTotal = totalCalls > 0 ? (totalConnected / totalCalls * 100).toFixed(1) + '%' : '0.0%'
  const appoRateTotal = totalCalls > 0 ? (totalAppo / totalCalls * 100).toFixed(1) + '%' : '0.0%'
  const dates = records.map((r: any) => r.called_at?.slice(0, 10)).filter(Boolean).sort()
  const firstDate = dates[0] || ''
  const lastDate = dates[dates.length - 1] || ''

  const reportRows: any[][] = []
  reportRows.push(['週', '架電件数', '通電数', '通電率', 'アポ数', 'アポ率'])
  for (const wk of weeks) {
    const { calls, connected, appo } = weekMap[wk]
    const cr = calls > 0 ? (connected / calls * 100).toFixed(1) + '%' : '0.0%'
    const ar = calls > 0 ? (appo / calls * 100).toFixed(1) + '%' : '0.0%'
    reportRows.push([`${wk}〜`, calls, connected, cr, appo, ar])
  }
  reportRows.push(['月間合計', totalCalls, totalConnected, connRateTotal, totalAppo, appoRateTotal])
  reportRows.push([])
  reportRows.push(['【レポートサマリー】'])
  reportRows.push([`対象期間: ${firstDate.replace(/-/g, '/')} 〜 ${lastDate.replace(/-/g, '/')}`])
  reportRows.push([`総架電件数: ${totalCalls}件`])
  reportRows.push([`社長通電数: ${totalConnected}件（通電率: ${connRateTotal}）`])
  reportRows.push([`アポ取得数: ${totalAppo}件（アポ率: ${appoRateTotal}）`])
  reportRows.push([`週平均架電件数: ${weeks.length > 0 ? Math.round(totalCalls / weeks.length) : 0}件`])

  return { rows, reportRows }
}

// シート名は call_lists.industry を使う。長さ制限と無効文字をクリーニング。
function sheetTabName(prefix: string, list: any): string {
  const base = `${prefix}_${list.industry || list.name || 'リスト'}`
  const cleaned = base.replace(/[\[\]\*\?\/\\:]/g, '_')
  return cleaned.slice(0, 95)
}

async function ensureSheetTabs(accessToken: string, spreadsheetId: string, tabNames: string[]) {
  // 既存タブを取得
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const meta = await metaRes.json()
  if (!metaRes.ok) throw new Error('get metadata failed: ' + JSON.stringify(meta))
  const existing = new Set<string>((meta.sheets || []).map((s: any) => s.properties.title))
  const requests: any[] = []
  for (const t of tabNames) {
    if (!existing.has(t)) requests.push({ addSheet: { properties: { title: t } } })
  }
  if (requests.length === 0) return
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    }
  )
  const j = await r.json()
  if (!r.ok) throw new Error('addSheet failed: ' + JSON.stringify(j))
}

async function writeSheetTab(accessToken: string, spreadsheetId: string, tabName: string, values: any[][]) {
  // まずシートをクリア
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabName)}:clear`,
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }
  )
  // 全置換書き込み
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabName)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    }
  )
  const j = await r.json()
  if (!r.ok) throw new Error(`write ${tabName} failed: ` + JSON.stringify(j))
}

async function syncList(supabase: any, accessToken: string, listId: string) {
  // list取得
  const { data: list, error: listErr } = await supabase
    .from('call_lists').select('*').eq('id', listId).single()
  if (listErr || !list) throw new Error(`list not found: ${listId}`)

  // client_sheets取得
  const { data: cs, error: csErr } = await supabase
    .from('client_sheets').select('*').eq('client_id', list.client_id).single()
  if (csErr || !cs) {
    // クライアントが未連携 → キューから削除して終了
    return
  }

  // items + records
  const [{ data: items }, { data: records }] = await Promise.all([
    supabase.from('call_list_items').select('*').eq('list_id', listId).order('no'),
    supabase.from('call_records').select('*').eq('list_id', listId).order('round'),
  ])

  const { rows, reportRows } = buildSheetData(list, items || [], records || [])
  const dataTab = sheetTabName('リストデータ', list)
  const reportTab = sheetTabName('レポート', list)

  await ensureSheetTabs(accessToken, cs.spreadsheet_id, [dataTab, reportTab])
  await writeSheetTab(accessToken, cs.spreadsheet_id, dataTab, rows)
  await writeSheetTab(accessToken, cs.spreadsheet_id, reportTab, reportRows)

  // last_synced_at更新
  await supabase.from('client_sheets').update({ last_synced_at: new Date().toISOString() }).eq('id', cs.id)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  // 認証: pg_cronから or 管理画面からの手動キックを許可
  const syncSecret = Deno.env.get('SHEET_SYNC_SECRET')
  const headerSecret = req.headers.get('x-sync-secret')
  if (!syncSecret || headerSecret !== syncSecret) {
    return json({ error: 'unauthorized' }, 401)
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // body で list_id 指定があれば単発同期、なければキュー全消化
    let listIds: string[] = []
    try {
      const body = await req.json()
      if (body?.list_id) listIds = [body.list_id]
    } catch { /* empty body OK */ }

    if (listIds.length === 0) {
      const { data: queue } = await supabase
        .from('sheet_sync_queue').select('list_id').limit(20)
      listIds = (queue || []).map((q: any) => q.list_id)
    }

    if (listIds.length === 0) return json({ ok: true, synced: 0 })

    const accessToken = await getAccessToken()

    const results: any[] = []
    for (const listId of listIds) {
      try {
        await syncList(supabase, accessToken, listId)
        await supabase.from('sheet_sync_queue').delete().eq('list_id', listId)
        results.push({ list_id: listId, ok: true })
      } catch (e) {
        const msg = String(e instanceof Error ? e.message : e)
        await supabase.from('sheet_sync_queue').update({
          attempts: 1,
          last_error: msg.slice(0, 500),
        }).eq('list_id', listId)
        results.push({ list_id: listId, ok: false, error: msg })
      }
    }
    return json({ ok: true, synced: results.filter(r => r.ok).length, results })
  } catch (e) {
    console.error('[sync-list-to-sheets]', e)
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
