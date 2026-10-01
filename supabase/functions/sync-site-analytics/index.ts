// ============================================================
// sync-site-analytics
// ----------------------------------------------------------------
// ma-sp.co の Search Console（Google 検索）と GA4（サイト全体）の数字を日別で取り込み、
// site_metrics_daily / site_metrics_breakdown に上書き保存する。
// pg_cron 'sync-site-analytics' が毎朝 6:10（日本時間）に叩く。
//
//   既定は直近10日分を取り直す（Search Console は2〜3日遅れで確定するため）。
//   ?days=480 で過去分をまとめて取り込む（Search Console は最大16ヶ月）。
//   ?diag=1 で取得結果の件数だけ返す（書き込みなし）。
//
// Google の認証:
//   組織ポリシーでサービスアカウントの鍵が作れないため、むー様の Google アカウントで
//   読み取りだけ許可した更新トークンを google_oauth_tokens（name='site_analytics'）に持つ。
//   OAuth クライアントは他の関数と同じ Spanavi（GOOGLE_CLIENT_SECRET）。
//   許可のやり直し: google_oauth_tokens.pending_state に値を入れ、許可画面に state として渡し、
//   戻ってきた code を ?oauth_code=...&state=...&redirect_uri=... で渡すとトークンを保存する。
//
// 必要環境変数:
//   GOOGLE_CLIENT_SECRET  Spanavi の OAuth クライアントのシークレット（既存）
//   GA4_PROPERTY_ID       GA4 のプロパティID（数字）
//   GSC_SITE_URL          既定 'sc-domain:ma-sp.co'
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const SITE = 'ma-sp.co'
const BREAKDOWN_TOP_N = 50 // 1日あたり・種類ごとに保存する上位件数

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ── Google のアクセストークン（更新トークンから） ──────────────
const GOOGLE_CLIENT_ID = '570031099308-ni4qokds1jc1m5s0p080t6g2gb3vu8md.apps.googleusercontent.com'
const TOKEN_NAME = 'site_analytics'

async function googleToken(params: Record<string, string>) {
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientSecret) throw new Error('GOOGLE_CLIENT_SECRET が未設定')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: clientSecret, ...params }),
  })
  return await res.json()
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.from('google_oauth_tokens')
    .select('refresh_token').eq('name', TOKEN_NAME).maybeSingle()
  if (error) throw new Error(`トークン読込失敗: ${error.message}`)
  if (!data?.refresh_token) throw new Error('Google の許可がまだです（google_oauth_tokens にトークンなし）')
  const t = await googleToken({ grant_type: 'refresh_token', refresh_token: data.refresh_token })
  if (!t.access_token) throw new Error(`トークン取得失敗: ${JSON.stringify(t)}`)
  return t.access_token
}

// 許可画面から戻った code を更新トークンに換えて保存する
async function saveOAuthCode(code: string, state: string, redirectUri: string) {
  const { data } = await supabase.from('google_oauth_tokens')
    .select('pending_state').eq('name', TOKEN_NAME).maybeSingle()
  if (!data?.pending_state || data.pending_state !== state) throw new Error('state が一致しません')
  const t = await googleToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
  if (!t.refresh_token) throw new Error(`更新トークンが返りません: ${JSON.stringify(t)}`)
  const { error } = await supabase.from('google_oauth_tokens').update({
    refresh_token: t.refresh_token, scopes: t.scope ?? null, pending_state: null, updated_at: new Date().toISOString(),
  }).eq('name', TOKEN_NAME)
  if (error) throw new Error(`トークン保存失敗: ${error.message}`)
  return t.scope
}

// ── Search Console ──────────────────────────────────────────
type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }

async function gscQuery(token: string, siteUrl: string, start: string, end: string, dimensions: string[]): Promise<GscRow[]> {
  const out: GscRow[] = []
  const rowLimit = 25000
  for (let startRow = 0; ; startRow += rowLimit) {
    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: start, endDate: end, dimensions, rowLimit, startRow, dataState: 'all' }),
        signal: AbortSignal.timeout(60_000),
      },
    )
    const data = await res.json()
    if (!res.ok) throw new Error(`Search Console ${dimensions.join(',')}: ${res.status} ${JSON.stringify(data.error ?? data)}`)
    const rows: GscRow[] = data.rows ?? []
    out.push(...rows)
    if (rows.length < rowLimit) break
  }
  return out
}

// ── GA4 ─────────────────────────────────────────────────────
type Ga4Row = { dims: string[]; mets: number[] }

async function ga4Report(token: string, propertyId: string, start: string, end: string, dimensions: string[], metrics: string[]): Promise<Ga4Row[]> {
  const out: Ga4Row[] = []
  const limit = 100000
  for (let offset = 0; ; offset += limit) {
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: start, endDate: end }],
        dimensions: dimensions.map(name => ({ name })),
        metrics: metrics.map(name => ({ name })),
        limit, offset,
      }),
      signal: AbortSignal.timeout(60_000),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(`GA4 ${dimensions.join(',')}: ${res.status} ${JSON.stringify(data.error ?? data)}`)
    const rows = (data.rows ?? []).map((r: any) => ({
      dims: r.dimensionValues.map((d: any) => d.value),
      mets: r.metricValues.map((m: any) => Number(m.value)),
    }))
    out.push(...rows)
    if (out.length >= (data.rowCount ?? 0) || rows.length === 0) break
  }
  return out
}

// GA4 の date は 'YYYYMMDD'
const gaDate = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// 日ごとに上位 N 件だけ残す
function topPerDay<T extends { date: string }>(rows: T[], score: (r: T) => number, n: number): T[] {
  const byDate = new Map<string, T[]>()
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, [])
    byDate.get(r.date)!.push(r)
  }
  const out: T[] = []
  for (const list of byDate.values()) out.push(...list.sort((a, b) => score(b) - score(a)).slice(0, n))
  return out
}

async function upsertChunks(table: string, rows: Record<string, unknown>[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 1000), { onConflict })
    if (error) throw new Error(`${table} upsert: ${error.message}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const url = new URL(req.url)
    const oauthCode = url.searchParams.get('oauth_code')
    if (oauthCode) {
      const scope = await saveOAuthCode(oauthCode, url.searchParams.get('state') ?? '', url.searchParams.get('redirect_uri') ?? '')
      return json({ ok: true, saved: true, scope })
    }
    const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 10, 1), 490)
    const diag = url.searchParams.get('diag') === '1'
    const siteUrl = Deno.env.get('GSC_SITE_URL') || 'sc-domain:ma-sp.co'
    const propertyId = Deno.env.get('GA4_PROPERTY_ID')

    // 日本時間の「今日」を基準に、前日までを取る
    const todayJst = new Date(Date.now() + 9 * 3600_000)
    const end = new Date(todayJst); end.setUTCDate(end.getUTCDate() - 1)
    const start = new Date(todayJst); start.setUTCDate(start.getUTCDate() - days)
    const s = ymd(start), e = ymd(end)

    const token = await getAccessToken()
    const now = new Date().toISOString()
    const daily = new Map<string, Record<string, unknown>>()
    const day = (date: string) => {
      if (!daily.has(date)) daily.set(date, { site: SITE, date, updated_at: now })
      return daily.get(date)!
    }
    const breakdown: Record<string, unknown>[] = []
    const errors: string[] = []

    // Search Console
    try {
      for (const r of await gscQuery(token, siteUrl, s, e, ['date'])) {
        Object.assign(day(r.keys[0]), {
          gsc_clicks: r.clicks, gsc_impressions: r.impressions, gsc_ctr: r.ctr, gsc_position: r.position,
        })
      }
      for (const [dim, kind] of [['query', 'query'], ['page', 'page']] as const) {
        const rows = (await gscQuery(token, siteUrl, s, e, ['date', dim])).map(r => ({
          date: r.keys[0], key: r.keys[1], clicks: r.clicks, impressions: r.impressions, position: r.position,
        }))
        for (const r of topPerDay(rows, x => x.impressions, BREAKDOWN_TOP_N)) {
          breakdown.push({ site: SITE, kind, ...r, updated_at: now })
        }
      }
    } catch (err) {
      errors.push(String(err))
    }

    // GA4
    if (!propertyId) {
      errors.push('GA4_PROPERTY_ID が未設定')
    } else {
      try {
        const m = ['activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'engagedSessions', 'averageSessionDuration']
        for (const r of await ga4Report(token, propertyId, s, e, ['date'], m)) {
          Object.assign(day(gaDate(r.dims[0])), {
            ga_users: r.mets[0], ga_new_users: r.mets[1], ga_sessions: r.mets[2],
            ga_page_views: r.mets[3], ga_engaged_sessions: r.mets[4], ga_avg_session_sec: r.mets[5],
          })
        }
        const ch = (await ga4Report(token, propertyId, s, e, ['date', 'sessionDefaultChannelGroup'], ['sessions', 'activeUsers']))
          .map(r => ({ date: gaDate(r.dims[0]), key: r.dims[1], sessions: r.mets[0], users: r.mets[1] }))
        for (const r of topPerDay(ch, x => x.sessions, BREAKDOWN_TOP_N)) {
          breakdown.push({ site: SITE, kind: 'channel', ...r, updated_at: now })
        }
        const pg = (await ga4Report(token, propertyId, s, e, ['date', 'pagePath'], ['screenPageViews', 'activeUsers']))
          .map(r => ({ date: gaDate(r.dims[0]), key: r.dims[1], page_views: r.mets[0], users: r.mets[1] }))
        for (const r of topPerDay(pg, x => x.page_views, BREAKDOWN_TOP_N)) {
          breakdown.push({ site: SITE, kind: 'ga_page', ...r, updated_at: now })
        }
      } catch (err) {
        errors.push(String(err))
      }
    }

    // upsert は行ごとに列が揃っている必要がある（PostgREST の一括投入は列の和集合を null で埋める）。
    // 片方の取得が失敗した日でも、もう片方の既存値を null で潰さないよう、列のそろった組ごとに分けて書く。
    const groups = new Map<string, Record<string, unknown>[]>()
    for (const row of daily.values()) {
      const sig = Object.keys(row).sort().join(',')
      if (!groups.has(sig)) groups.set(sig, [])
      groups.get(sig)!.push(row)
    }
    const bdGroups = new Map<string, Record<string, unknown>[]>()
    for (const row of breakdown) {
      const sig = Object.keys(row).sort().join(',')
      if (!bdGroups.has(sig)) bdGroups.set(sig, [])
      bdGroups.get(sig)!.push(row)
    }

    if (!diag) {
      for (const rows of groups.values()) await upsertChunks('site_metrics_daily', rows, 'site,date')
      for (const rows of bdGroups.values()) await upsertChunks('site_metrics_breakdown', rows, 'site,date,kind,key')
    }

    return json({
      ok: errors.length === 0,
      range: { start: s, end: e },
      daily_rows: daily.size,
      breakdown_rows: breakdown.length,
      wrote: !diag,
      errors,
    }, errors.length && daily.size === 0 ? 500 : 200)
  } catch (err) {
    console.error('[sync-site-analytics]', err)
    return json({ ok: false, error: String(err) }, 500)
  }
})
