// 指定メンバー・指定期間の call_records に、Zoom Phone の録音URLを遡って焼き込む。
//
// 通常は架電直後に get-zoom-recording が1件ずつ引くが、members.zoom_user_id が
// 未設定のまま架電した期間は録音URLが1件も保存されない（黙ってスキップされる）。
// その取りこぼしを後から埋めるための管理用関数。
//
// POST { getter_name, from_date, to_date, dry_run }
//   - Zoom の録音一覧は「日付範囲で1回だけ」取得し、owner.id で当人の分だけ残す
//     （1件ずつ get-zoom-recording を叩くとZoom APIを架電件数ぶんページングしてしまう）
//   - 突合は 電話番号 + 時間窓。窓は架電直後の実装と同じ考え方で
//     MAX(前回架電, 架電-3h) < 録音開始 <= MIN(架電+10分, 次回架電)
//   - recording_url が既に入っているレコードには触らない

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ZoomRecording = {
  owner?: { id?: string }
  callee_number?: string
  caller_number?: string
  download_url?: string
  date_time?: string
  duration?: number
}

// "+81312345678" / "03-1234-5678" → "0312345678"
function normalizePhone(n: string | null | undefined): string {
  if (!n) return ''
  const digits = String(n).replace(/\D/g, '')
  if (digits.startsWith('81')) return '0' + digits.slice(2)
  return digits
}

async function getZoomToken(accountId: string, clientId: string, clientSecret: string): Promise<string | null> {
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  )
  const data = await res.json()
  if (!data.access_token) {
    console.error('[backfill-zoom-recordings] トークン取得失敗:', JSON.stringify(data))
    return null
  }
  return data.access_token
}

// 当人の録音だけをその場で絞って溜める（全件を配列に持つとメモリ上限に当たる）
async function fetchOwnerRecordings(token: string, from: string, to: string, ownerId: string) {
  const mine: { phones: string[]; start: number; url: string; dateTime: string; duration: number }[] = []
  let scanned = 0
  let nextPageToken = ''
  let page = 1
  do {
    const params = new URLSearchParams({ page_size: '100', from, to })
    if (nextPageToken) params.set('next_page_token', nextPageToken)
    const res = await fetch(`https://api.zoom.us/v2/phone/recordings?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) {
      console.error('[backfill-zoom-recordings] 録音API エラー:', JSON.stringify(data))
      throw new Error(`Zoom recordings API: ${data.message ?? res.status}`)
    }
    const recs: ZoomRecording[] = data.recordings || []
    scanned += recs.length
    for (const r of recs) {
      if (r.owner?.id !== ownerId) continue
      if (!r.download_url || !r.date_time) continue
      const phones = [normalizePhone(r.callee_number), normalizePhone(r.caller_number)].filter(Boolean)
      if (phones.length === 0) continue
      mine.push({
        phones,
        start: new Date(r.date_time).getTime(),
        url: r.download_url,
        dateTime: r.date_time,
        duration: Number(r.duration) || 0,
      })
    }
    nextPageToken = data.next_page_token || ''
    page++
  } while (nextPageToken)
  console.log(`[backfill-zoom-recordings] Zoom録音: 全体${scanned}件 / 当人${mine.length}件 (${page - 1}ページ)`)
  return mine
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { getter_name, from_date, to_date, dry_run = true } = await req.json()
    if (!getter_name || !from_date || !to_date) {
      return new Response(
        JSON.stringify({ error: 'getter_name, from_date, to_date は必須です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const zoomAccountId    = Deno.env.get('ZOOM_ACCOUNT_ID')
    const zoomClientId     = Deno.env.get('ZOOM_CLIENT_ID')
    const zoomClientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')
    const supabaseUrl      = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!zoomAccountId || !zoomClientId || !zoomClientSecret || !supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const restHeaders = {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey,
      'Content-Type': 'application/json',
    }

    // ── 1. メンバーの zoom_user_id ────────────────────────────────────────
    const memberRes = await fetch(
      `${supabaseUrl}/rest/v1/members?select=id,name,zoom_user_id&name=eq.${encodeURIComponent(getter_name)}`,
      { headers: restHeaders }
    )
    const memberRows = await memberRes.json()
    const zoomUserId: string | null = memberRows?.[0]?.zoom_user_id || null
    if (!zoomUserId) {
      return new Response(
        JSON.stringify({ error: `${getter_name} の zoom_user_id が未設定です（先にZoom同期を実行してください）` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    console.log(`[backfill-zoom-recordings] ${getter_name} / zoom_user_id=${zoomUserId} / ${from_date}〜${to_date} / dry_run=${dry_run}`)

    // ── 2. 対象の架電記録（録音URL未設定のもの）────────────────────────────
    type Rec = { id: string; called_at: string; item_id: string | null; recording_url: string | null; call_list_items: { phone: string | null } | null }
    const records: Rec[] = []
    const PAGE = 1000
    for (let offset = 0; ; offset += PAGE) {
      const url = `${supabaseUrl}/rest/v1/call_records`
        + `?select=id,called_at,item_id,recording_url,call_list_items(phone)`
        + `&getter_name=eq.${encodeURIComponent(getter_name)}`
        + `&called_at=gte.${from_date}T00:00:00%2B09:00`
        + `&called_at=lte.${to_date}T23:59:59%2B09:00`
        + `&order=called_at.asc&limit=${PAGE}&offset=${offset}`
      const res = await fetch(url, { headers: restHeaders })
      if (!res.ok) throw new Error(`call_records fetch: ${await res.text()}`)
      const rows: Rec[] = await res.json()
      records.push(...rows)
      if (rows.length < PAGE) break
    }
    const targets = records.filter(r => !r.recording_url && r.call_list_items?.phone && r.called_at)
    console.log(`[backfill-zoom-recordings] 架電記録 ${records.length}件 / うち録音未設定＋電話あり ${targets.length}件`)

    // ── 3. Zoom の録音（当人の分だけ）───────────────────────────────────
    const zoomToken = await getZoomToken(zoomAccountId, zoomClientId, zoomClientSecret)
    if (!zoomToken) {
      return new Response(
        JSON.stringify({ error: 'Failed to get Zoom token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const recordings = await fetchOwnerRecordings(zoomToken, from_date, to_date, zoomUserId)

    // 電話番号 → 録音（開始時刻の昇順）
    const recByPhone = new Map<string, typeof recordings>()
    for (const rec of recordings) {
      for (const p of new Set(rec.phones)) {
        if (!recByPhone.has(p)) recByPhone.set(p, [])
        recByPhone.get(p)!.push(rec)
      }
    }
    for (const list of recByPhone.values()) list.sort((a, b) => a.start - b.start)

    // ── 4. 突合（電話番号 + 時間窓）──────────────────────────────────────
    // 同じ番号への複数回架電が混ざらないよう、窓の上下限を前後の架電時刻で締める
    const byPhone = new Map<string, Rec[]>()
    for (const r of targets) {
      const p = normalizePhone(r.call_list_items!.phone)
      if (!p) continue
      if (!byPhone.has(p)) byPhone.set(p, [])
      byPhone.get(p)!.push(r)
    }
    // 前後関係は「同じ番号への全架電（録音済みも含む）」で判定する
    const allByPhone = new Map<string, Rec[]>()
    for (const r of records) {
      const p = normalizePhone(r.call_list_items?.phone)
      if (!p || !r.called_at) continue
      if (!allByPhone.has(p)) allByPhone.set(p, [])
      allByPhone.get(p)!.push(r)
    }
    for (const list of allByPhone.values()) list.sort((a, b) => new Date(a.called_at).getTime() - new Date(b.called_at).getTime())

    const TEN_MIN = 10 * 60 * 1000
    const THREE_H = 3 * 60 * 60 * 1000
    const used = new Set<string>()
    const matches: { id: string; url: string; called_at: string; date_time: string }[] = []

    for (const [phone, recs] of byPhone) {
      const timeline = allByPhone.get(phone) || recs
      const candidates = recByPhone.get(phone) || []
      if (candidates.length === 0) continue
      for (const r of recs) {
        const t = new Date(r.called_at).getTime()
        const idx = timeline.findIndex(x => x.id === r.id)
        const prevT = idx > 0 ? new Date(timeline[idx - 1].called_at).getTime() : null
        const nextT = idx >= 0 && idx < timeline.length - 1 ? new Date(timeline[idx + 1].called_at).getTime() : null
        const lower = Math.max(prevT ?? -Infinity, t - THREE_H)
        const upper = Math.min(nextT ?? Infinity, t + TEN_MIN)
        // 窓内の最後（＝架電直前）の録音を採る
        let picked: typeof candidates[0] | null = null
        for (const c of candidates) {
          if (c.start <= lower) continue
          if (c.start > upper) break
          if (used.has(c.url)) continue
          picked = c
        }
        if (picked) {
          used.add(picked.url)
          matches.push({ id: r.id, url: picked.url, called_at: r.called_at, date_time: picked.dateTime })
        }
      }
    }
    console.log(`[backfill-zoom-recordings] 突合: ${matches.length}/${targets.length} 件`)

    // ── 5. 書き込み（dry_run では書かない）────────────────────────────────
    let updated = 0
    const errors: string[] = []
    if (!dry_run) {
      const CONCURRENCY = 8
      for (let i = 0; i < matches.length; i += CONCURRENCY) {
        const chunk = matches.slice(i, i + CONCURRENCY)
        await Promise.all(chunk.map(async m => {
          // recording_url が空のままの行だけを更新（二重実行しても上書きしない）
          const res = await fetch(
            `${supabaseUrl}/rest/v1/call_records?id=eq.${m.id}&recording_url=is.null`,
            { method: 'PATCH', headers: { ...restHeaders, 'Prefer': 'return=representation' }, body: JSON.stringify({ recording_url: m.url }) }
          )
          if (!res.ok) { errors.push(`${m.id}: ${await res.text()}`); return }
          const rows = await res.json()
          if (Array.isArray(rows) && rows.length > 0) updated++
        }))
      }
      console.log(`[backfill-zoom-recordings] 更新: ${updated}件 / エラー ${errors.length}件`)
    }

    return new Response(
      JSON.stringify({
        getter_name,
        zoom_user_id: zoomUserId,
        range: `${from_date}〜${to_date}`,
        dry_run,
        call_records: records.length,
        targets: targets.length,
        zoom_recordings_owned: recordings.length,
        matched: matches.length,
        updated,
        errors: errors.slice(0, 5),
        samples: matches.slice(0, 3).map(m => ({ called_at: m.called_at, recording_at: m.date_time })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[backfill-zoom-recordings] 予期せぬエラー:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
