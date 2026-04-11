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

    // GET: freeBusy で空き時間取得
    if (req.method === 'GET') {
      const timeMin = url.searchParams.get('timeMin')
      const timeMax = url.searchParams.get('timeMax')
      if (!timeMin || !timeMax) return json({ error: 'timeMin and timeMax required' }, 400)

      // 複数カレンダー対応: calendarIds=primary,client@example.com
      const calendarIdsParam = url.searchParams.get('calendarIds')
      const items = calendarIdsParam
        ? calendarIdsParam.split(',').map(id => ({ id: id.trim() }))
        : [{ id: calendarId }]

      const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeMin, timeMax, items }),
      })
      const data = await res.json()
      if (!res.ok) return json({ error: data.error?.message || 'freeBusy failed' }, res.status)

      // 複数カレンダーの場合: カレンダーIDごとにbusy配列を返す
      if (calendarIdsParam) {
        const calendars: Record<string, any[]> = {}
        const calendarErrors: Record<string, any[]> = {}
        for (const [id, cal] of Object.entries(data.calendars || {})) {
          calendars[id] = (cal as any).busy || []
          if ((cal as any).errors?.length) {
            calendarErrors[id] = (cal as any).errors
          }
        }
        return json({ calendars, ...(Object.keys(calendarErrors).length ? { calendarErrors } : {}) })
      }

      // 後方互換: 単一カレンダーの場合は既存フォーマット
      const busy = Object.values(data.calendars || {}).flatMap((cal: any) => cal.busy || [])
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
