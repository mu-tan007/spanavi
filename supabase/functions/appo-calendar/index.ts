// ============================================================
// アポを apochousei@ma-sp.co の Google カレンダーへ自動で登録する（2026-10-08 むー様）
// ------------------------------------------------------------
// 対象：アポ取得報告を送ったアポ（email_status='sent'、送信が導入日以降）。
//   タイトル【県】企業名／ゲスト＝クライアント担当者のカレンダー／場所＝訪問先の住所／説明＝報告の全文。
//   面談の日時・場所・報告・担当者が変わったら予定を直し、キャンセル・リスケ中になったら予定を消す。
// 動き方：pg_cron が数分おきに { mode: 'sync' } で呼ぶ。中身の指紋（apo_cal_hash）が変わったアポだけ書き換える。
// 許可：apochousei が許可した更新トークンを google_oauth_tokens（name='apochousei_calendar'）に持つ。
//   許可のやり直しは pending_state に値を入れ、redirect_uri http://localhost:3456 で許可画面を開き、
//   戻ってきた code を { mode: 'oauth', code, state, redirect_uri } で渡す。
// ============================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GOOGLE_CLIENT_ID = '570031099308-ni4qokds1jc1m5s0p080t6g2gb3vu8md.apps.googleusercontent.com'
const TOKEN_NAME = 'apochousei_calendar'
const CRON_NAME = 'appo-calendar'
const DURATION_MIN = 60
const DROP_STATUSES = ['キャンセル', 'リスケ中']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-token',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const sb: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

async function googleToken(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '', ...params }),
  })
  return await res.json()
}

async function accessToken(): Promise<string> {
  const { data } = await sb.from('google_oauth_tokens').select('refresh_token').eq('name', TOKEN_NAME).maybeSingle()
  if (!data?.refresh_token) throw new Error('apochousei のカレンダーの許可がまだです')
  const t = await googleToken({ grant_type: 'refresh_token', refresh_token: data.refresh_token })
  if (!t.access_token) throw new Error('Googleの認証に失敗しました（許可のやり直しが必要かもしれません）')
  return t.access_token
}

async function saveOAuthCode(code: string, state: string, redirectUri: string) {
  const { data } = await sb.from('google_oauth_tokens').select('pending_state').eq('name', TOKEN_NAME).maybeSingle()
  if (!data?.pending_state || data.pending_state !== state) throw new Error('state が一致しません')
  const t = await googleToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
  if (!t.refresh_token) throw new Error('更新トークンが返りませんでした: ' + (t.error_description || t.error || ''))
  // 許可したのが apochousei 本人かを確かめる（別のアカウントで押されたら保存しない）
  // 許可画面で openid email も求めているので、id_token の email で本人を確かめる
  let email = ''
  try {
    const part = String(t.id_token || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    email = JSON.parse(atob(part + '='.repeat((4 - part.length % 4) % 4))).email || ''
  } catch { /* 下で弾く */ }
  if (email !== 'apochousei@ma-sp.co') throw new Error(`許可したアカウントが apochousei ではありません（${email || '不明'}）`)
  const cal = { id: email }
  const { error } = await sb.from('google_oauth_tokens').update({
    refresh_token: t.refresh_token, scopes: t.scope ?? null, pending_state: null, updated_at: new Date().toISOString(),
  }).eq('name', TOKEN_NAME)
  if (error) throw new Error(error.message)
  return { scope: t.scope, calendar: cal.id }
}

async function gcal(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  if (res.status === 204) return {}
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data?.error?.message || `HTTP ${res.status}`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return data
}

const PREFS = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県']
export function prefOf(...texts: (string | null | undefined)[]): string {
  for (const t of texts) {
    const s = String(t || '')
    const hit = PREFS.find(p => s.includes(p))
    if (hit) return hit
  }
  return ''
}

const isEmail = (s: string | null | undefined) => !!s && /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(s.trim())

function hhmm(t: string | null): string | null {
  const m = String(t || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).match(/(\d{1,2})[:：時](\d{0,2})/)
  if (!m) return null
  return `${m[1].padStart(2, '0')}:${(m[2] || '00').padStart(2, '0')}`
}

async function sha(s: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

// deno-lint-ignore no-explicit-any
type Appo = Record<string, any>

/** アポ1件から予定の中身を組み立てる。登録しないアポは null */
async function buildEvent(a: Appo) {
  const time = hhmm(a.meeting_time)
  if (!a.meeting_date || !time) return { skip: '面談の日時がありません' }
  // meeting_date は日時型（JST の 0 時が UTC で入っている）なので、JST の日付に直してから時刻を付ける
  const day = new Date(new Date(a.meeting_date).getTime() + 9 * 3600000).toISOString().slice(0, 10)
  const startISO = `${day}T${time}:00+09:00`
  const end = new Date(new Date(startISO).getTime() + DURATION_MIN * 60000)
  const item = a.item_id
    ? (await sb.from('call_list_items').select('address').eq('id', a.item_id).maybeSingle()).data
    : null
  const location = a.is_online ? (a.meeting_location || 'オンライン') : (a.meeting_location || item?.address || '')
  const pref = a.is_online ? 'オンライン' : (prefOf(a.meeting_location, item?.address) || '')
  const summary = `${pref ? `【${pref}】` : ''}${a.company_name || ''}`

  // ゲスト：リストの担当者 → いなければクライアントの全担当者（calendar_all_contacts）か主担当
  let contacts: { google_calendar_id: string | null; email: string | null }[] = []
  const list = a.list_id ? (await sb.from('call_lists').select('contact_ids, contact_id, is_prospecting').eq('id', a.list_id).maybeSingle()).data : null
  // 弊社自身の営業（クライアント開拓）のアポは、篠宮のカレンダーに別で入るので対象外
  if (list?.is_prospecting) return { skip: '' }
  const ids: string[] = (list?.contact_ids?.length ? list.contact_ids : (list?.contact_id ? [list.contact_id] : []))
  if (ids.length) {
    contacts = (await sb.from('client_contacts').select('google_calendar_id, email').in('id', ids)).data || []
  } else if (a.client_id) {
    const { data: cl } = await sb.from('clients').select('calendar_all_contacts').eq('id', a.client_id).maybeSingle()
    const q = sb.from('client_contacts').select('google_calendar_id, email, is_primary').eq('client_id', a.client_id)
    const all = (await q).data || []
    contacts = cl?.calendar_all_contacts ? all : all.filter(c => c.is_primary)
  }
  const guests = Array.from(new Set(contacts.map(c => (isEmail(c.google_calendar_id) ? c.google_calendar_id! : '').trim().toLowerCase()).filter(Boolean))).sort()
  // ゲストを招けるクライアントだけ登録する（Outlook の公開URLしか無いクライアントは、むー様も登録していない）
  if (guests.length === 0) return { skip: '' }

  const body = {
    summary,
    location,
    description: String(a.appo_report || '').trim(),
    start: { dateTime: startISO, timeZone: 'Asia/Tokyo' },
    end: { dateTime: end.toISOString(), timeZone: 'Asia/Tokyo' },
    attendees: guests.map(email => ({ email })),
    guestsCanModify: false,
    reminders: { useDefault: true },
  }
  return { body, hash: await sha(JSON.stringify(body)) }
}

async function syncOne(token: string, a: Appo): Promise<string> {
  const drop = DROP_STATUSES.includes(a.status)
  if (drop) {
    if (!a.apo_cal_event_id) return 'skip'
    try { await gcal(token, `events/${encodeURIComponent(a.apo_cal_event_id)}?sendUpdates=all`, { method: 'DELETE' }) }
    catch (e) { if (![404, 410].includes((e as { status?: number }).status || 0)) throw e }
    await sb.from('appointments').update({ apo_cal_event_id: null, apo_cal_hash: null, apo_cal_error: null, apo_cal_synced_at: new Date().toISOString() }).eq('id', a.id)
    return 'deleted'
  }
  const ev = await buildEvent(a)
  if ('skip' in ev) {
    if ((a.apo_cal_error || '') !== ev.skip) await sb.from('appointments').update({ apo_cal_error: ev.skip || null }).eq('id', a.id)
    return ev.skip ? 'no-time' : 'not-target'
  }
  if (a.apo_cal_event_id && a.apo_cal_hash === ev.hash) return 'same'
  let id = a.apo_cal_event_id
  if (id) {
    try {
      await gcal(token, `events/${encodeURIComponent(id)}?sendUpdates=all`, { method: 'PATCH', body: JSON.stringify(ev.body) })
    } catch (e) {
      // 予定が手で消されていたら作り直す
      if (![404, 410].includes((e as { status?: number }).status || 0)) throw e
      id = null
    }
  }
  if (!id) {
    const created = await gcal(token, 'events?sendUpdates=all', { method: 'POST', body: JSON.stringify(ev.body) })
    id = created.id
  }
  await sb.from('appointments').update({ apo_cal_event_id: id, apo_cal_hash: ev.hash, apo_cal_error: null, apo_cal_synced_at: new Date().toISOString() }).eq('id', a.id)
  return a.apo_cal_event_id ? 'updated' : 'created'
}

async function sync(onlyId?: string) {
  const { data: setting } = await sb.from('appo_calendar_settings').select('enabled, since').eq('id', 1).maybeSingle()
  if (!setting?.enabled) return { skipped: '止めています' }
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
  let q = sb.from('appointments')
    .select('id, company_name, client_id, list_id, item_id, status, email_status, email_sent_at, meeting_date, meeting_time, meeting_location, is_online, appo_report, apo_cal_event_id, apo_cal_hash, apo_cal_error')
    .eq('email_status', 'sent')
    .gte('email_sent_at', setting.since)
    .gte('meeting_date', today)
  if (onlyId) q = q.eq('id', onlyId)
  const { data: rows, error } = await q.limit(200)
  if (error) throw new Error(error.message)
  if (!rows?.length) return { checked: 0 }
  const token = await accessToken()
  const out: Record<string, number> = {}
  for (const a of rows) {
    try {
      const r = await syncOne(token, a)
      out[r] = (out[r] || 0) + 1
    } catch (e) {
      out.error = (out.error || 0) + 1
      await sb.from('appointments').update({ apo_cal_error: (e as Error).message.slice(0, 300) }).eq('id', a.id)
    }
  }
  return { checked: rows.length, ...out }
}

async function cronTokenOk(req: Request): Promise<boolean> {
  const t = req.headers.get('x-cron-token') || ''
  if (t.length < 32) return false
  const { data } = await sb.from('internal_cron_tokens').select('token').eq('name', CRON_NAME).maybeSingle()
  return !!data?.token && data.token === t
}

async function isAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') || ''
  if (!auth) return false
  const u = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const { data } = await u.auth.getUser()
  if (!data?.user) return false
  const { data: me } = await sb.from('users').select('role').eq('id', data.user.id).maybeSingle()
  return me?.role === 'admin'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json().catch(() => ({}))
    if (body.mode === 'oauth') {
      // state を知っている人（＝許可画面を開いた本人）だけが保存できる。さらに apochousei 本人かを確かめる
      return json(await saveOAuthCode(body.code || '', body.state || '', body.redirect_uri || ''))
    }
    if (!(await cronTokenOk(req)) && !(await isAdmin(req))) return json({ error: 'forbidden' }, 403)
    if (body.mode === 'peek') {
      // 今の登録の仕方を確かめる用：apochousei のカレンダーの予定を読む（管理者・合言葉だけ）
      const token = await accessToken()
      const p = new URLSearchParams({ timeMin: body.timeMin, timeMax: body.timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '100' })
      const d = await gcal(token, `events?${p}`)
      // deno-lint-ignore no-explicit-any
      return json({ items: (d.items || []).map((e: any) => ({ summary: e.summary, start: e.start, end: e.end, location: e.location, attendees: (e.attendees || []).map((x: any) => x.email), description: (e.description || '').slice(0, 400), creator: e.creator?.email })) })
    }
    if (body.mode === 'preview') {
      // 登録する中身だけ組み立てて返す（カレンダーには書かない・確認用）
      const { data: a } = await sb.from('appointments').select('*').eq('id', body.appointment_id || '').maybeSingle()
      return json(a ? await buildEvent(a) : { error: 'アポが見つかりません' })
    }
    return json(await sync(body.appointment_id))
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
