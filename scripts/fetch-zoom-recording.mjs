// Zoom Phone Recordings API から 2026-03-16 14:43 JST の録音を直接取得するスクリプト

const SUPABASE_URL = 'https://baiiznjzvzhxwwqzsozn.supabase.co'
const SUPABASE_SERVICE_KEY = 'sb_secret_Qz4ZW8lkQmt-G-J1-Xjyqg_yJpKm06c'
const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

// ─── Step 1: org_settings から Zoom 認証情報を取得 ───────────────────────
async function getZoomCreds() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/org_settings?org_id=eq.${ORG_ID}&select=zoom_account_id,zoom_client_id,zoom_client_secret`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    }
  })
  const rows = await res.json()
  console.log('[org_settings] HTTP:', res.status, '/ rows:', JSON.stringify(rows))
  if (rows?.[0]?.zoom_account_id) return rows[0]

  // フォールバック: .env.local の値を使用
  console.log('[org_settings] 取得できないため .env.local の値を使用')
  return {
    zoom_account_id: 'ZHz9CMbvRbinEtdouvFO9Q',
    zoom_client_id:  'PYRk9MqBRBmkjMGqfXCqA',
    zoom_client_secret: 'p5tO2M4VR1tTGpPhXtC1l6UiAWkkWrxI',
  }
}

// ─── Step 2: Zoom アクセストークン取得 ──────────────────────────────────
async function getZoomToken(accountId, clientId, clientSecret) {
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    }
  )
  const data = await res.json()
  console.log('[zoom token] HTTP:', res.status, '/ token_type:', data.token_type ?? '—')
  if (!data.access_token) { console.error('[zoom token] 取得失敗:', data); process.exit(1) }
  return data.access_token
}

// ─── Step 3: Zoom Phone Recordings 全件取得 ──────────────────────────────
async function fetchAllRecordings(token, from, to) {
  const all = []
  let nextPageToken = ''
  let page = 1
  do {
    const params = new URLSearchParams({ page_size: '100', from, to })
    if (nextPageToken) params.set('next_page_token', nextPageToken)
    const url = `https://api.zoom.us/v2/phone/recordings?${params}`
    console.log(`[zoom recordings] page ${page}:`, url)
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
    const data = await res.json()
    console.log(`[zoom recordings] HTTP:${res.status} total_records:${data.total_records ?? '?'} 件数:${(data.recordings || []).length}`)
    if (!res.ok) { console.error('[zoom recordings] エラー:', JSON.stringify(data)); break }
    all.push(...(data.recordings || []))
    nextPageToken = data.next_page_token || ''
    page++
  } while (nextPageToken)
  return all
}

// ─── Step 4: members テーブルから清水慧吾の zoom_user_id を取得 ────────
async function getShimizuZoomUserId() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/members?org_id=eq.${ORG_ID}&select=name,zoom_user_id`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    }
  })
  const rows = await res.json()
  console.log('\n[members]')
  rows.forEach(r => console.log(`  name=${r.name} / zoom_user_id=${r.zoom_user_id ?? '—'}`))
  const shimizu = rows.find(r => r.name?.includes('清水'))
  return shimizu?.zoom_user_id || null
}

// ─── メイン ─────────────────────────────────────────────────────────────
;(async () => {
  // 14:43 JST = 05:43 UTC
  const TARGET_UTC_MS = new Date('2026-03-16T05:43:00Z').getTime()
  const WINDOW_MS = 30 * 60 * 1000  // ±30分

  console.log('=== Zoom録音取得スクリプト ===')
  console.log(`対象: 2026-03-16 14:43 JST (${new Date(TARGET_UTC_MS).toISOString()} UTC)\n`)

  const creds = await getZoomCreds()
  const token = await getZoomToken(creds.zoom_account_id, creds.zoom_client_id, creds.zoom_client_secret)
  const shimizuZoomId = await getShimizuZoomUserId()
  console.log('\n[清水慧吾] zoom_user_id:', shimizuZoomId ?? '(未登録)')

  const allRecordings = await fetchAllRecordings(token, '2026-03-16', '2026-03-16')
  console.log(`\n[全録音] ${allRecordings.length} 件`)

  console.log('\n─── 全録音一覧 ───')
  allRecordings.forEach((r, i) => {
    const dt = r.date_time ? new Date(r.date_time) : null
    const jst = dt ? new Date(dt.getTime() + 9*60*60*1000).toISOString().replace('T',' ').slice(0,19) + ' JST' : '—'
    console.log(`[${i+1}] owner.id=${r.owner?.id ?? '—'} | owner.name=${r.owner?.name ?? '—'} | callee=${r.callee_number ?? '—'} | date_time=${r.date_time ?? '—'} (${jst}) | url=${r.download_url ? '(あり)' : '(なし)'}`)
  })

  // ±30分フィルタ
  const nearTarget = allRecordings.filter(r => {
    if (!r.date_time) return false
    const diff = Math.abs(new Date(r.date_time).getTime() - TARGET_UTC_MS)
    return diff <= WINDOW_MS
  })
  console.log(`\n─── 14:43 JST ±30分以内の録音: ${nearTarget.length} 件 ───`)
  nearTarget.forEach((r, i) => {
    const dt = new Date(r.date_time)
    const jst = new Date(dt.getTime() + 9*60*60*1000).toISOString().replace('T',' ').slice(0,19) + ' JST'
    console.log(`[${i+1}]`)
    console.log(`  owner.id   : ${r.owner?.id ?? '—'}`)
    console.log(`  owner.name : ${r.owner?.name ?? '—'}`)
    console.log(`  callee     : ${r.callee_number ?? '—'}`)
    console.log(`  date_time  : ${r.date_time} (${jst})`)
    console.log(`  download_url: ${r.download_url ?? '(なし)'}`)
  })

  // 清水慧吾でさらに絞り込み
  if (shimizuZoomId) {
    const shimizuRecs = nearTarget.filter(r => r.owner?.id === shimizuZoomId)
    console.log(`\n─── 清水慧吾 (${shimizuZoomId}) の録音: ${shimizuRecs.length} 件 ───`)
    shimizuRecs.forEach((r, i) => {
      const dt = new Date(r.date_time)
      const jst = new Date(dt.getTime() + 9*60*60*1000).toISOString().replace('T',' ').slice(0,19) + ' JST'
      console.log(`[${i+1}] ${r.date_time} (${jst}) | callee=${r.callee_number} | url=${r.download_url ?? '(なし)'}`)
    })
  }
})()
