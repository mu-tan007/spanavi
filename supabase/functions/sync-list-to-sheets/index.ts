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

// ============================================================
// デザイン適用（ブランドカラー統一）
// ============================================================
const NAVY = { red: 0.05, green: 0.13, blue: 0.28 }
const GOLD = { red: 0.78, green: 0.66, blue: 0.29 }
const _WHITE = { red: 1, green: 1, blue: 1 }
const LIGHT_GRAY = { red: 0.96, green: 0.97, blue: 0.98 }
const BORDER_CLR = { red: 0.85, green: 0.87, blue: 0.90 }
const TEXT_DARK = { red: 0.07, green: 0.09, blue: 0.11 }
const goldBorder = { style: 'SOLID', color: GOLD, width: 2 }
const thinBdr = { style: 'DOTTED', color: BORDER_CLR, width: 1 }

async function getSheetId(accessToken: string, spreadsheetId: string, tabName: string): Promise<number | null> {
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const meta = await r.json()
  const tab = (meta.sheets || []).find((s: any) => s.properties.title === tabName)
  return tab ? tab.properties.sheetId : null
}

async function applyBatchUpdate(accessToken: string, spreadsheetId: string, requests: any[]) {
  for (let i = 0; i < requests.length; i += 100) {
    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: requests.slice(i, i + 100) }),
      }
    )
    if (!r.ok) {
      const j = await r.json()
      console.error(`batchUpdate failed (batch ${i / 100 + 1}):`, JSON.stringify(j).slice(0, 300))
      // レート制限の場合はリトライ
      if (r.status === 429) {
        await new Promise(resolve => setTimeout(resolve, 10000))
        const retry = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: requests.slice(i, i + 100) }),
          }
        )
        if (!retry.ok) console.error(`batchUpdate retry failed (batch ${i / 100 + 1})`)
      }
    }
  }
}

// デフォルトの「シート1」タブを削除（リスト以外のゴミタブを除去）
async function removeDefaultSheet(accessToken: string, spreadsheetId: string) {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const meta = await metaRes.json()
  if (!metaRes.ok) return
  const sheets = (meta.sheets || [])
  // タブが2つ以上あり、デフォルト名のタブが存在すれば削除
  const defaultNames = new Set(['Sheet1', 'シート1'])
  if (sheets.length <= 1) return  // 最後の1タブは削除不可
  for (const s of sheets) {
    if (defaultNames.has(s.properties.title)) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: [{ deleteSheet: { sheetId: s.properties.sheetId } }] }),
        }
      )
    }
  }
}

function buildDataFormat(sheetId: number, rowCount: number, colCount: number) {
  const reqs: any[] = []
  // ヘッダー
  reqs.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
      cell: { userEnteredFormat: {
        backgroundColor: NAVY,
        textFormat: { bold: true, fontSize: 10, foregroundColor: _WHITE },
        horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
        borders: { bottom: goldBorder }, padding: { top: 6, bottom: 6 },
      }},
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders,padding)',
    }
  })
  reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: 'pixelSize' } })
  // ゼブラストライプ
  for (let r = 1; r < rowCount; r++) {
    reqs.push({
      repeatCell: {
        range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: colCount },
        cell: { userEnteredFormat: {
          backgroundColor: r % 2 === 1 ? _WHITE : LIGHT_GRAY,
          textFormat: { fontSize: 10, foregroundColor: TEXT_DARK },
          verticalAlignment: 'MIDDLE',
          borders: { bottom: thinBdr },
          padding: { top: 2, bottom: 2, left: 4 },
        }},
        fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,borders,padding)',
      }
    })
  }
  // 列幅（文字が切れないよう十分な幅を確保）
  // No., 企業名, 事業内容, 住所, 売上高, 当期純利益, 代表者, 電話番号, 備考
  const widths = [60, 300, 250, 360, 150, 170, 140, 160, 240]
  for (let i = 0; i < colCount; i++) {
    // 動的列（n回目日付 / n回目結果）はそれぞれ 130px
    reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: widths[i] || 130 }, fields: 'pixelSize' } })
  }
  reqs.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } })
  return reqs
}

function buildReportFormat(sheetId: number, rowCount: number, colCount: number, reportRows: any[][]) {
  const reqs: any[] = []
  // ヘッダー
  reqs.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
      cell: { userEnteredFormat: {
        backgroundColor: NAVY,
        textFormat: { bold: true, fontSize: 10, foregroundColor: _WHITE },
        horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
        borders: { bottom: goldBorder }, padding: { top: 6, bottom: 6 },
      }},
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders,padding)',
    }
  })
  reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: 'pixelSize' } })

  // サマリーセクションの開始行を特定（月間合計の次の空行の次）
  let summaryStartRow = -1
  for (let r = 1; r < rowCount; r++) {
    if (String(reportRows[r]?.[0] || '').includes('レポートサマリー')) {
      summaryStartRow = r
      break
    }
  }

  // 既存のセル結合を全解除（再同期時に結合が重複しないよう）
  reqs.push({
    unmergeCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: colCount },
    }
  })

  // データ行
  for (let r = 1; r < rowCount; r++) {
    const val = reportRows[r]?.[0] || ''
    const isSummarySection = summaryStartRow > 0 && r >= summaryStartRow

    if (val === '月間合計') {
      reqs.push({
        repeatCell: {
          range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: colCount },
          cell: { userEnteredFormat: {
            backgroundColor: GOLD,
            textFormat: { bold: true, fontSize: 11, foregroundColor: NAVY },
            horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
          }},
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
        }
      })
    } else if (String(val).includes('レポートサマリー')) {
      // サマリー見出し: セル結合 + ネイビー背景
      reqs.push({
        mergeCells: {
          range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: colCount },
          mergeType: 'MERGE_ALL',
        }
      })
      reqs.push({
        repeatCell: {
          range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: colCount },
          cell: { userEnteredFormat: {
            backgroundColor: NAVY,
            textFormat: { bold: true, fontSize: 12, foregroundColor: _WHITE },
            padding: { top: 8, bottom: 8 },
          }},
          fields: 'userEnteredFormat(backgroundColor,textFormat,padding)',
        }
      })
    } else if (isSummarySection && String(val).length > 0) {
      // サマリー詳細行: セル結合して全幅使用
      reqs.push({
        mergeCells: {
          range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: colCount },
          mergeType: 'MERGE_ALL',
        }
      })
      reqs.push({
        repeatCell: {
          range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: colCount },
          cell: { userEnteredFormat: {
            backgroundColor: r % 2 === 1 ? _WHITE : LIGHT_GRAY,
            textFormat: { fontSize: 11, foregroundColor: TEXT_DARK },
            verticalAlignment: 'MIDDLE',
            padding: { top: 4, bottom: 4, left: 8 },
          }},
          fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)',
        }
      })
    } else if (!isSummarySection) {
      reqs.push({
        repeatCell: {
          range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: colCount },
          cell: { userEnteredFormat: {
            backgroundColor: r % 2 === 1 ? _WHITE : LIGHT_GRAY,
            textFormat: { fontSize: 10, foregroundColor: TEXT_DARK },
            horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
            borders: { bottom: thinBdr },
          }},
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)',
        }
      })
    }
  }
  // 列幅（文字が切れないよう十分な幅を確保）
  // 週, 架電件数, 通電数, 通電率, アポ数, アポ率
  const widths = [180, 130, 130, 130, 120, 120]
  for (let i = 0; i < Math.min(widths.length, colCount); i++) {
    reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: widths[i] }, fields: 'pixelSize' } })
  }
  reqs.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } })
  return reqs
}

async function applyFormatting(accessToken: string, spreadsheetId: string, dataTab: string, reportTab: string, rows: any[][], reportRows: any[][]) {
  const dataSheetId = await getSheetId(accessToken, spreadsheetId, dataTab)
  if (dataSheetId !== null) {
    await applyBatchUpdate(accessToken, spreadsheetId, buildDataFormat(dataSheetId, rows.length, rows[0]?.length || 1))
  }
  const reportSheetId = await getSheetId(accessToken, spreadsheetId, reportTab)
  if (reportSheetId !== null) {
    await applyBatchUpdate(accessToken, spreadsheetId, buildReportFormat(reportSheetId, reportRows.length, reportRows[0]?.length || 6, reportRows))
  }
}

// リスト削除時にスプレッドシートからタブを削除
async function processTabDeletions(supabase: any, accessToken: string) {
  const { data: queue } = await supabase
    .from('sheet_tab_delete_queue').select('*').limit(20)
  if (!queue || queue.length === 0) return []

  // spreadsheet_id ごとにグループ化
  const grouped: Record<string, { ids: number[]; tabNames: string[] }> = {}
  for (const item of queue) {
    if (!grouped[item.spreadsheet_id]) grouped[item.spreadsheet_id] = { ids: [], tabNames: [] }
    grouped[item.spreadsheet_id].ids.push(item.id)
    grouped[item.spreadsheet_id].tabNames.push(item.tab_name)
  }

  const results: any[] = []
  for (const [spreadsheetId, { ids, tabNames }] of Object.entries(grouped)) {
    try {
      // 既存タブのメタデータを取得
      const metaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const meta = await metaRes.json()
      if (!metaRes.ok) throw new Error('get metadata failed: ' + JSON.stringify(meta))
      const sheetMap = new Map<string, number>()
      for (const s of (meta.sheets || [])) {
        sheetMap.set(s.properties.title, s.properties.sheetId)
      }

      // 該当タブを削除
      const requests: any[] = []
      for (const tabName of tabNames) {
        const sheetId = sheetMap.get(tabName)
        if (sheetId !== undefined) {
          requests.push({ deleteSheet: { sheetId } })
        }
      }
      if (requests.length > 0) {
        const r = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests }),
          }
        )
        if (!r.ok) {
          const j = await r.json()
          throw new Error('deleteSheet failed: ' + JSON.stringify(j))
        }
      }

      // キューから削除
      await supabase.from('sheet_tab_delete_queue').delete().in('id', ids)
      results.push({ spreadsheet_id: spreadsheetId, tabs: tabNames, ok: true })
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e)
      results.push({ spreadsheet_id: spreadsheetId, tabs: tabNames, ok: false, error: msg })
    }
  }
  return results
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
  await removeDefaultSheet(accessToken, cs.spreadsheet_id)
  await writeSheetTab(accessToken, cs.spreadsheet_id, dataTab, rows)
  await writeSheetTab(accessToken, cs.spreadsheet_id, reportTab, reportRows)

  // デザイン再適用（値の全置換後に書式を復元）
  await applyFormatting(accessToken, cs.spreadsheet_id, dataTab, reportTab, rows, reportRows)

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

    const accessToken = await getAccessToken()

    // タブ削除キューを処理
    const deleteResults = await processTabDeletions(supabase, accessToken)

    if (listIds.length === 0 && deleteResults.length === 0) return json({ ok: true, synced: 0 })

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
    return json({ ok: true, synced: results.filter(r => r.ok).length, results, deleted: deleteResults })
  } catch (e) {
    console.error('[sync-list-to-sheets]', e)
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
