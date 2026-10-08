// ============================================================
// クライアントからの返信 → インターンへの伝言の下書き（2026-10-08 むー様）
// ------------------------------------------------------------
// アポ取得報告を送ったあと、クライアントがメールや Slack のスレッドで「事前確認のときに先方へ伝えてほしいこと」
// （例：当日は李様のみ伺う、会社概要を事前に送る旨を伝えて）を返してくることがある。
// それを拾い、社内の #アポ取得報告 のスレッドでアポ取得者（インターン）にメンションを付けた伝言の下書きを作る。
// 送るのはむー様（Spanavi のアポ一覧で確かめて「送信」）。送ると、そのアポの「事前確認で先方に伝えること」にも入る。
//
// mode 'scan'（cron・10分おき）：報告を送ったアポの返信を読み、伝えることがあれば下書きを作る
// mode 'send'（管理者）：下書きをむー様の名前で社内のスレッドへ送る
// mode 'dismiss'（管理者）：送らない
// ============================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GOOGLE_CLIENT_ID = '570031099308-ni4qokds1jc1m5s0p080t6g2gb3vu8md.apps.googleusercontent.com'
const CRON_NAME = 'client-reply-relay'
// 社内の #アポ取得報告（post-appo-to-slack が Webhook で出す）
const APPO_REPORT_CHANNEL = 'C094ST41KK5'
const ME_EMAIL = 'shinomiya@ma-sp.co'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-token',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const sb: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

/* ---------- Gmail（事前確認の下書きと同じ許可：gmail_precheck） ---------- */
async function gmailToken(): Promise<string | null> {
  const { data } = await sb.from('google_oauth_tokens').select('refresh_token').eq('name', 'gmail_precheck').maybeSingle()
  if (!data?.refresh_token) return null
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '', grant_type: 'refresh_token', refresh_token: data.refresh_token }),
  }).then(r => r.json())
  return res.access_token || null
}
function b64urlDecode(s: string): string {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return decodeURIComponent(Array.from(b, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''))
}
// deno-lint-ignore no-explicit-any
function header(msg: any, name: string): string {
  return (msg.payload?.headers || []).find((x: { name: string }) => x.name.toLowerCase() === name.toLowerCase())?.value || ''
}
// deno-lint-ignore no-explicit-any
function plainBody(part: any): string {
  if (!part) return ''
  if (part.mimeType === 'text/plain' && part.body?.data) return b64urlDecode(part.body.data)
  for (const p of part.parts || []) { const t = plainBody(p); if (t) return t }
  if (part.mimeType === 'text/html' && part.body?.data) return b64urlDecode(part.body.data).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  return ''
}
/** 引用（> の行・「〜wrote:」以降）を落として、返信の本文だけにする */
function stripQuote(t: string): string {
  const lines = t.split(/\r?\n/)
  const out: string[] = []
  for (const l of lines) {
    if (/^\s*>/.test(l)) break
    if (/(wrote|のメッセージ|より):?\s*$/.test(l) && /\d{4}|20\d\d|月|日/.test(l)) break
    if (/^-{2,}\s*Original Message/i.test(l)) break
    if (/^(From|差出人|送信者)\s*[:：]/.test(l.trim())) break
    out.push(l)
  }
  return out.join('\n').trim()
}

type Msg = { ref: string; source: 'email' | 'slack'; from: string; text: string; at: string }

async function gmailReplies(token: string, threadId: string, since: string): Promise<Msg[]> {
  const th = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
  // deno-lint-ignore no-explicit-any
  return (th.messages || []).filter((m: any) => !header(m, 'From').includes(ME_EMAIL) && Number(m.internalDate) > new Date(since).getTime())
    // deno-lint-ignore no-explicit-any
    .map((m: any) => ({ ref: `email:${m.id}`, source: 'email' as const, from: header(m, 'From'), text: stripQuote(plainBody(m.payload)).slice(0, 3000), at: new Date(Number(m.internalDate)).toISOString() }))
}

async function slackReplies(userToken: string, me: string, channel: string, ts: string): Promise<Msg[]> {
  const d = await fetch(`https://slack.com/api/conversations.replies?${new URLSearchParams({ channel, ts, limit: '50' })}`, { headers: { Authorization: `Bearer ${userToken}` } }).then(r => r.json())
  // deno-lint-ignore no-explicit-any
  return (d.messages || []).filter((m: any) => m.ts !== ts && m.user && m.user !== me && !m.bot_id)
    // deno-lint-ignore no-explicit-any
    .map((m: any) => ({ ref: `slack:${channel}:${m.ts}`, source: 'slack' as const, from: m.user, text: String(m.text || '').slice(0, 3000), at: new Date(Number(m.ts) * 1000).toISOString() }))
}

/* ---------- AI：伝えることを抜き出す ---------- */
async function extractTell(company: string, client: string, text: string): Promise<string> {
  const prompt = `M&A仲介会社（クライアント：${client}）が、弊社（営業代行）から送ったアポ取得報告（アポ先：${company}）に返信してきました。
この返信の中から、「事前確認の電話で、アポ先の社長に伝える・確かめること」だけを抜き出してください。
例：当日伺う人（李様のみ・2名で伺う）、時間の変更、会社概要などを事前に送る旨、場所（本社ではなく工場で）、オンラインのURLを送った旨、用意してほしい資料。
お礼・了解・社内向けの連絡・報酬や請求の話は入れない。無ければ空にする。
書き方：アポ先の社長に話す内容として書く。クライアント側の人は「${client}の〇〇様」と書き（「弊社」「当社」は使わない）、敬称を付ける。
返事は JSON だけ：{"tell":"アポ先に伝えること（1〜2文・60字以内。無ければ空文字）"}

# 返信
${text}`
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', thinking: { type: 'between_tools' }, max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`AI ${res.status}`)
  const data = await res.json()
  const out = (data.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')
  const m = out.match(/\{[\s\S]*\}/)
  try { return String(JSON.parse(m ? m[0] : '{}').tell || '').trim() } catch { return '' }
}

/** 社名の芯（検索に使う） */
const core = (s: string) => String(s || '').replace(/株式会社|有限会社|合同会社|（株）|\(株\)|（有）|\(有\)|[\s　]/g, '')

/** 社内の #アポ取得報告 で、このアポの報告（ボットの投稿）を探す */
async function internalThread(userToken: string, company: string): Promise<string | null> {
  const c = core(company)
  if (!c) return null
  const d = await fetch(`https://slack.com/api/search.messages?${new URLSearchParams({ query: `"${c}" in:<#${APPO_REPORT_CHANNEL}>`, sort: 'timestamp', sort_dir: 'asc', count: '20' })}`, { headers: { Authorization: `Bearer ${userToken}` } }).then(r => r.json())
  // deno-lint-ignore no-explicit-any
  const hit = (d.messages?.matches || []).find((m: any) => !/thread_ts=/.test(m.permalink || '') || (m.permalink || '').includes(`thread_ts=${m.ts}`))
  return hit?.ts || null
}

async function scan() {
  const userToken = Deno.env.get('SLACK_USER_TOKEN')?.trim() || ''
  const me = userToken ? (await fetch('https://slack.com/api/auth.test', { headers: { Authorization: `Bearer ${userToken}` } }).then(r => r.json())).user_id : ''
  const gtoken = await gmailToken()
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data: appos } = await sb.from('appointments')
    .select('id, org_id, company_name, client_id, getter_name, email_sent_at, report_gmail_thread_id, report_slack_channel, report_slack_ts')
    .eq('email_status', 'sent').in('status', ['アポ取得', 'リスケ中']).gte('meeting_date', today).gte('email_sent_at', since)
    .limit(100)
  let drafts = 0, checked = 0
  for (const a of appos || []) {
    const msgs: Msg[] = []
    try {
      if (gtoken && a.report_gmail_thread_id) msgs.push(...await gmailReplies(gtoken, a.report_gmail_thread_id, a.email_sent_at))
      if (userToken && a.report_slack_channel && a.report_slack_ts) msgs.push(...await slackReplies(userToken, me, a.report_slack_channel, a.report_slack_ts))
    } catch (e) { console.warn('[client-reply-relay] read', a.id, (e as Error).message); continue }
    if (!msgs.length) continue
    const { data: seen } = await sb.from('client_reply_relays').select('source_ref').eq('appointment_id', a.id)
    const seenSet = new Set((seen || []).map(s => s.source_ref))
    for (const m of msgs.filter(x => !seenSet.has(x.ref) && x.text.trim())) {
      checked++
      const { data: cl } = await sb.from('clients').select('name').eq('id', a.client_id).maybeSingle()
      const tell = await extractTell(a.company_name, cl?.name || '', m.text)
      if (!tell) {
        await sb.from('client_reply_relays').insert({ org_id: a.org_id, appointment_id: a.id, source: m.source, source_ref: m.ref, client_text: m.text, status: 'none' })
        continue
      }
      const { data: mem } = await sb.from('members').select('slack_user_id').eq('org_id', a.org_id).eq('name', a.getter_name).maybeSingle()
      const mention = mem?.slack_user_id ? `<@${mem.slack_user_id}>` : `${a.getter_name || ''}さん`
      const draft = `${mention}\n${a.company_name}の件、クライアントの${cl?.name || ''}様から、事前確認でお伝えいただきたい内容が届きました。\n・${tell}\n事前確認の際に、先方へお伝えください。`
      const threadTs = userToken ? await internalThread(userToken, a.company_name) : null
      await sb.from('client_reply_relays').insert({
        org_id: a.org_id, appointment_id: a.id, source: m.source, source_ref: m.ref, client_text: m.text,
        tell_text: tell, draft_text: draft, slack_channel: APPO_REPORT_CHANNEL, slack_thread_ts: threadTs, status: 'ready',
      })
      drafts++
    }
  }
  return { appointments: (appos || []).length, checked, drafts }
}

async function adminOrg(req: Request): Promise<string | null> {
  const u = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
  const { data } = await u.auth.getUser()
  if (!data?.user) return null
  const { data: me } = await sb.from('users').select('role, org_id').eq('id', data.user.id).maybeSingle()
  return me?.role === 'admin' ? me.org_id : null
}

async function cronTokenOk(req: Request): Promise<boolean> {
  const t = req.headers.get('x-cron-token') || ''
  if (t.length < 32) return false
  const { data } = await sb.from('internal_cron_tokens').select('token').eq('name', CRON_NAME).maybeSingle()
  return !!data?.token && data.token === t
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json().catch(() => ({}))
    if (body.mode === 'scopes') {
      // 確認用：むー様の Slack の許可の範囲（中身の文字列は返さない）
      if (!(await cronTokenOk(req)) && !(await adminOrg(req))) return json({ error: 'forbidden' }, 403)
      const tk = Deno.env.get('SLACK_USER_TOKEN')?.trim() || ''
      const r = await fetch('https://slack.com/api/auth.test', { headers: { Authorization: `Bearer ${tk}` } })
      const j = await r.json()
      return json({ ok: j.ok, user: j.user, scopes: (r.headers.get('x-oauth-scopes') || '').split(',').map(x => x.trim()).filter(Boolean) })
    }
    if (body.mode === 'scan') {
      if (!(await cronTokenOk(req)) && !(await adminOrg(req))) return json({ error: 'forbidden' }, 403)
      return json(await scan())
    }
    const org = await adminOrg(req)
    if (!org) return json({ error: '管理者だけが使えます' }, 403)
    const { data: row } = await sb.from('client_reply_relays').select('*').eq('id', body.id || '').maybeSingle()
    if (!row || row.org_id !== org) return json({ error: '下書きが見つかりません' }, 404)
    if (body.mode === 'dismiss') {
      await sb.from('client_reply_relays').update({ status: 'dismissed' }).eq('id', row.id)
      return json({ ok: true })
    }
    if (body.mode === 'send') {
      if (row.status === 'sent') return json({ error: 'すでに送っています' }, 409)
      const text = String(body.text || row.draft_text || '').trim()
      const token = Deno.env.get('SLACK_USER_TOKEN')?.trim()
      if (!token) return json({ error: 'Slackの許可（篠宮の名前で送信）がまだです' }, 400)
      const payload: Record<string, unknown> = { channel: row.slack_channel, text, unfurl_links: false }
      if (row.slack_thread_ts) payload.thread_ts = row.slack_thread_ts
      const r = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(payload),
      }).then(x => x.json())
      if (!r.ok) return json({ error: `Slackへの送信に失敗しました（${r.error}）` }, 502)
      // 架電ページの事前確認・朝の通知にも出るよう「事前確認で先方に伝えること」に足す
      const { data: a } = await sb.from('appointments').select('precheck_tell').eq('id', row.appointment_id).maybeSingle()
      const tell = String(body.tell || row.tell_text || '').trim()
      const merged = [a?.precheck_tell, tell].filter(Boolean).join('\n')
      await sb.from('appointments').update({ precheck_tell: merged, precheck_tell_done_at: null }).eq('id', row.appointment_id)
      await sb.from('client_reply_relays').update({ status: 'sent', draft_text: text, sent_at: new Date().toISOString() }).eq('id', row.id)
      return json({ ok: true })
    }
    return json({ error: 'mode が不正です' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
