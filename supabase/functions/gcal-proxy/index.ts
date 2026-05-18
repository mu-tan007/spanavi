const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
}

const GOOGLE_CLIENT_ID = '570031099308-ni4qokds1jc1m5s0p080t6g2gb3vu8md.apps.googleusercontent.com'

async function getAccessToken(): Promise<string> {
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

  if (!refreshToken || !clientSecret) {
    throw new Error('Missing GOOGLE_REFRESH_TOKEN or GOOGLE_CLIENT_SECRET in environment')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: clientSecret,
    }),
  })

  const data = await res.json()
  if (!data.access_token) {
    throw new Error('Token exchange failed: ' + (data.error_description || data.error || JSON.stringify(data)))
  }
  return data.access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const url = new URL(req.url)
    const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID') || 'primary'
    const accessToken = await getAccessToken()

    // GET: 期間内のbusy区間を返す（終日イベントは除外）。
    //
    // 取得経路は 2 段階:
    //   (1) events.list を試す — 共有レベルが「予定の詳細を表示」の場合、各イベントの
    //       start.date / start.dateTime / transparency / status で確実に終日判別できる
    //   (2) 403/404 で失敗した場合は freeBusy にフォールバック — 共有レベルが
    //       「予定の有無のみ表示」のときは events.list は使えないため、freeBusy 結果から
    //       「JST 00:00 開始 + 24h 倍数の長さ」の区間を終日として除外する
    if (req.method === 'GET') {
      const timeMin = url.searchParams.get('timeMin')
      const timeMax = url.searchParams.get('timeMax')
      if (!timeMin || !timeMax) return json({ error: 'timeMin and timeMax required' }, 400)

      const calendarIdsParam = url.searchParams.get('calendarIds')
      const calIds = calendarIdsParam
        ? calendarIdsParam.split(',').map(id => id.trim()).filter(Boolean)
        : [calendarId]

      // ── 終日判定（freeBusy 用ヒューリスティック） ──
      // JST(+09:00) の 00:00 開始かつ duration が 24h の整数倍 → 終日扱い
      const DAY_MS = 24 * 60 * 60 * 1000
      const isAllDayBusy = (start: string, end: string) => {
        const s = new Date(start)
        const e = new Date(end)
        if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false
        // JST に変換: UTCタイムスタンプ + 9h オフセットを足してから UTC 表示の H:M:S を見る
        const jstS = new Date(s.getTime() + 9 * 60 * 60 * 1000)
        if (jstS.getUTCHours() !== 0 || jstS.getUTCMinutes() !== 0 || jstS.getUTCSeconds() !== 0) return false
        const span = e.getTime() - s.getTime()
        if (span <= 0) return false
        // 24h ぴったり or 24h の整数倍 (連日終日イベント)
        return span % DAY_MS === 0
      }

      // ── 経路 (1): events.list ──
      const fetchViaEventsList = async (id: string): Promise<{ ok: boolean; busy?: any[]; status?: number }> => {
        const params = new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: 'true',         // 繰り返しイベントを展開
          orderBy: 'startTime',
          maxResults: '250',
        })
        const r = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?${params.toString()}`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        )
        if (!r.ok) return { ok: false, status: r.status }
        const d = await r.json()
        const busy: any[] = []
        for (const ev of (d.items || [])) {
          // 終日イベント: start.date / end.date のみ持つ → 除外
          if (ev.start?.date && !ev.start?.dateTime) continue
          // 「空き時間として表示」、キャンセル済みは除外
          if (ev.transparency === 'transparent') continue
          if (ev.status === 'cancelled') continue
          if (!ev.start?.dateTime || !ev.end?.dateTime) continue
          busy.push({ start: ev.start.dateTime, end: ev.end.dateTime })
        }
        return { ok: true, busy }
      }

      // ── 経路 (2): freeBusy フォールバック（終日ヒューリスティック適用） ──
      const fetchViaFreeBusy = async (ids: string[]): Promise<Record<string, { busy: any[]; errors?: any[] }>> => {
        const items = ids.map(id => ({ id }))
        const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeMin, timeMax, items }),
        })
        const d = await r.json()
        const out: Record<string, { busy: any[]; errors?: any[] }> = {}
        if (!r.ok) {
          ids.forEach(id => { out[id] = { busy: [], errors: [{ reason: d.error?.message || 'freeBusy failed', code: r.status }] } })
          return out
        }
        for (const [id, cal] of Object.entries(d.calendars || {})) {
          const rawBusy = ((cal as any).busy || []) as Array<{ start: string; end: string }>
          // 終日ブロック (JST 00:00 起点 / 24h 倍数) を除外
          const filtered = rawBusy.filter(b => !isAllDayBusy(b.start, b.end))
          const errs = (cal as any).errors
          out[id] = { busy: filtered, ...(errs?.length ? { errors: errs } : {}) }
        }
        for (const id of ids) {
          if (!out[id]) out[id] = { busy: [] }
        }
        return out
      }

      // カレンダーごとに events.list を試行。失敗（403/404 等）→ freeBusy フォールバック
      const calendarResults: Record<string, { busy: any[]; errors?: any[] }> = {}
      const fallbackIds: string[] = []
      await Promise.all(calIds.map(async (id) => {
        const r = await fetchViaEventsList(id)
        if (r.ok) {
          calendarResults[id] = { busy: r.busy || [] }
        } else {
          fallbackIds.push(id)
        }
      }))
      if (fallbackIds.length > 0) {
        const fb = await fetchViaFreeBusy(fallbackIds)
        Object.assign(calendarResults, fb)
      }

      // 複数カレンダーの場合: カレンダーIDごとにbusy配列を返す
      if (calendarIdsParam) {
        const calendars: Record<string, any[]> = {}
        const calendarErrors: Record<string, any[]> = {}
        for (const id of calIds) {
          const r = calendarResults[id] || { busy: [] }
          calendars[id] = r.busy
          if (r.errors?.length) calendarErrors[id] = r.errors
        }
        return json({ calendars, ...(Object.keys(calendarErrors).length ? { calendarErrors } : {}) })
      }

      // 後方互換: 単一カレンダーの場合は既存フォーマット
      const busy = calIds.flatMap(id => (calendarResults[id]?.busy) || [])
      return json({ busy })
    }

    // POST: イベント作成
    if (req.method === 'POST') {
      const eventBody = await req.json()

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(eventBody),
        }
      )
      const data = await res.json()
      if (!res.ok) return json({ error: data.error?.message || 'Event creation failed' }, res.status)
      return json({ eventId: data.id })
    }

    // DELETE: イベント削除
    if (req.method === 'DELETE') {
      const eventId = url.searchParams.get('eventId')
      if (!eventId) return json({ error: 'eventId required' }, 400)

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      )
      // 404 = すでに削除済み → 正常扱い
      if (!res.ok && res.status !== 404) {
        return json({ error: 'Delete failed' }, res.status)
      }
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    console.error('[gcal-proxy] Error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
