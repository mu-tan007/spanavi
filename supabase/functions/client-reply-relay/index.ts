// ============================================================
// クライアントからの返信 → 「このアポの経緯」と「クライアントからの依頼（確認待ち）」（2026-10-08 むー様）
// ------------------------------------------------------------
// アポ取得報告を送ったアポについて、クライアントのメール・Slack のスレッドへの返信を10分おきに読む。
//   ・返信は、インターンも見られる要約にして appo_timeline に入れる（条件・お金・他社の話は落とす）。面談後の返信は「面談後の結果」
//   ・事前確認で先方に伝えてほしい依頼があれば、client_reply_relays に確認待ちとして入れ、むー様に Spanavi で通知する
//   ・むー様がアポ一覧で「流す」と、そのアポの「クライアントからの依頼」（precheck_tell）に入り、
//     朝の #事前確認 の通知・架電ページの事前確認・このアポの経緯に出る
// mode 'scan'（cron）／'apply'（流す・管理者）／'dismiss'（流さない・管理者）／'scopes'（Slack の許可の確認）
// ============================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GOOGLE_CLIENT_ID = '570031099308-ni4qokds1jc1m5s0p080t6g2gb3vu8md.apps.googleusercontent.com'
const CRON_NAME = 'client-reply-relay'
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

/* ---------- AI：要約と依頼 ---------- */
type Read = { summary: string; tell: string }
async function readReply(company: string, client: string, text: string, afterMeeting: boolean, allowTell = true, addressee = ''): Promise<Read> {
  const prompt = `M&A仲介会社（クライアント：${client}）から、弊社（営業代行）が送ったアポ取得報告（アポ先：${company}）について連絡が来ました。${afterMeeting ? 'この連絡は面談の日より後に届いたものです。' : ''}
次の2つを JSON だけで返してください。

1. summary：弊社のインターン（アポを取った学生）も読む「このアポの経緯」に載せる要約。1文・60字以内。
   - ${afterMeeting ? '面談の結果（次の段階に進んだ・見送り・キャンセルとその理由など）が分かるように書く' : 'クライアントが何を伝えてきたかが分かるように書く（お礼だけなら「アポ取得のお礼のご返信」）'}
   - 報酬・請求・金額・契約の条件、他のクライアントや他社の話、インターンの評価、社内の事情は書かない
   - 篠宮は弊社の担当者（クライアント側の人ではない）
   - クライアントの担当者は「${client}の〇〇様」と書く。自社を指す言い方（「弊社」など）は使わない
2. tell：事前確認の電話で、アポ先の社長に伝える・確かめる必要がある「いつもと違うこと」だけ。1〜2文・60字以内。アポ先の社長に話す内容として書く。
   - 入れるもの：報告を送った担当者とは別の人が伺う・同席者が増える、時間や場所の変更、事前に資料を送る旨、社長に用意してほしいもの、その他のイレギュラー
   - 入れないもの：弊社（営業代行）へのお願い（日程が確定したら連絡してほしい、確定連絡の期限など）。これはアポ先に伝えることではない
   - 入れないもの（当たり前のこと）：報告を送った担当者本人が伺う旨、報告どおりの日時・場所で問題ない旨、了解・お礼・よろしくお願いします
   - 報告の宛先の担当者：${addressee || '不明'}（この人が伺うのは当たり前なので入れない）${afterMeeting || !allowTell ? '今回は空にする。' : '無ければ空。'}

{"summary":"…","tell":"…"}

# 連絡
${text}`
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', thinking: { type: 'between_tools' }, max_tokens: 700, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`AI ${res.status}`)
  const data = await res.json()
  const out = (data.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')
  const m = out.match(/\{[\s\S]*\}/)
  try {
    const j = JSON.parse(m ? m[0] : '{}')
    return { summary: String(j.summary || '').trim().slice(0, 120), tell: afterMeeting || !allowTell ? '' : String(j.tell || '').trim().slice(0, 160) }
  } catch { return { summary: '', tell: '' } }
}

/** 報告の宛先の担当者（リストの担当者 → クライアントの主担当）。この人が伺うのは当たり前なので依頼に入れない */
// deno-lint-ignore no-explicit-any
async function addresseeOf(a: any): Promise<string> {
  const { data: ap } = await sb.from('appointments').select('list_id').eq('id', a.id).maybeSingle()
  const { data: l } = ap?.list_id ? await sb.from('call_lists').select('contact_ids, contact_id').eq('id', ap.list_id).maybeSingle() : { data: null }
  const ids: string[] = l?.contact_ids?.length ? l.contact_ids : (l?.contact_id ? [l.contact_id] : [])
  const q = sb.from('client_contacts').select('name, is_primary').eq('client_id', a.client_id)
  const cs = (ids.length ? (await q.in('id', ids)).data : (await q).data) || []
  const pick = ids.length ? cs : cs.filter(c => c.is_primary)
  return pick.map(c => c.name).filter(Boolean).join('・')
}

/** 確認待ちが入ったら、むー様（管理者）に Spanavi で知らせる */
async function notifyAdmins(orgId: string, company: string, tell: string) {
  const { data: admins } = await sb.from('users').select('id').eq('org_id', orgId).eq('role', 'admin')
  const ids = (admins || []).map(a => a.id)
  if (!ids.length) return
  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify({ type: 'client_request', title: `クライアントからの依頼（確認待ち）：${company}`, body: tell, user_ids: ids, org_id: orgId, link: '/appo' }),
  }).catch(() => {})
}

async function scan() {
  const userToken = Deno.env.get('SLACK_USER_TOKEN')?.trim() || ''
  const me = userToken ? (await fetch('https://slack.com/api/auth.test', { headers: { Authorization: `Bearer ${userToken}` } }).then(r => r.json())).user_id : ''
  const gtoken = await gmailToken()
  const now = Date.now()
  const since = new Date(now - 60 * 86400000).toISOString()
  // 面談の後30日までは読む（面談後の結果も経緯に載せる）
  const meetFloor = new Date(now - 30 * 86400000 + 9 * 3600000).toISOString().slice(0, 10)
  const { data: appos } = await sb.from('appointments')
    .select('id, org_id, company_name, status, client_id, meeting_date, email_sent_at, report_gmail_thread_id, report_slack_channel, report_slack_ts')
    .eq('email_status', 'sent').gte('email_sent_at', since).gte('meeting_date', meetFloor)
    .limit(200)
  let requests = 0, checked = 0
  for (const a of appos || []) {
    const msgs: Msg[] = []
    try {
      if (gtoken && a.report_gmail_thread_id) msgs.push(...await gmailReplies(gtoken, a.report_gmail_thread_id, a.email_sent_at))
      if (userToken && a.report_slack_channel && a.report_slack_ts) msgs.push(...await slackReplies(userToken, me, a.report_slack_channel, a.report_slack_ts))
    } catch (e) { console.warn('[client-reply-relay] read', a.id, (e as Error).message); continue }
    if (!msgs.length) continue
    const { data: seen } = await sb.from('client_reply_relays').select('source_ref').eq('appointment_id', a.id)
    const seenSet = new Set((seen || []).map(x => x.source_ref))
    const fresh = msgs.filter(x => !seenSet.has(x.ref) && x.text.trim())
    if (!fresh.length) continue
    const { data: cl } = await sb.from('clients').select('name').eq('id', a.client_id).maybeSingle()
    const meetDay = a.meeting_date ? new Date(new Date(a.meeting_date).getTime() + 9 * 3600000).toISOString().slice(0, 10) : ''
    for (const m of fresh) {
      checked++
      // 面談の当日以降の連絡は「面談後の結果」として読む
      const afterMeeting = !!meetDay && m.at.slice(0, 10) >= meetDay
      // 依頼（確認待ち）にするのは、事前確認がまだ意味を持つアポだけ（面談前・キャンセルでない）
      const todayJst = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
      const canRequest = ['アポ取得', '事前確認済', 'リスケ中'].includes(a.status) && (!meetDay || meetDay >= todayJst)
      const r = await readReply(a.company_name, cl?.name || '', m.text, afterMeeting, canRequest, await addresseeOf(a))
      await sb.from('client_reply_relays').insert({
        org_id: a.org_id, appointment_id: a.id, source: m.source, source_ref: m.ref, client_text: m.text,
        summary: r.summary || null, tell_text: r.tell || null, status: r.tell ? 'ready' : 'none',
      })
      if (r.summary) {
        await sb.from('appo_timeline').upsert({
          org_id: a.org_id, appointment_id: a.id, at: m.at, kind: afterMeeting ? 'meeting_result' : 'client_reply',
          text: r.summary, source_ref: m.ref,
        }, { onConflict: 'appointment_id,source_ref', ignoreDuplicates: true })
      }
      if (r.tell) { requests++; await notifyAdmins(a.org_id, a.company_name, r.tell) }
    }
  }
  return { appointments: (appos || []).length, checked, requests }
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
    if (body.mode === 'apply') {
      if (row.status === 'applied') return json({ error: 'すでに流しています' }, 409)
      const tell = String(body.tell || row.tell_text || '').trim()
      if (!tell) return json({ error: '依頼の文が空です' }, 400)
      // そのアポの「クライアントからの依頼」に足す（朝の #事前確認・架電ページの事前確認に出る）
      const { data: a } = await sb.from('appointments').select('precheck_tell').eq('id', row.appointment_id).maybeSingle()
      const merged = [a?.precheck_tell, tell].filter(Boolean).join('\n')
      await sb.from('appointments').update({ precheck_tell: merged, precheck_tell_done_at: null }).eq('id', row.appointment_id)
      await sb.from('client_reply_relays').update({ status: 'applied', tell_text: tell, applied_at: new Date().toISOString() }).eq('id', row.id)
      await sb.from('appo_timeline').upsert({
        org_id: row.org_id, appointment_id: row.appointment_id, at: new Date().toISOString(), kind: 'client_request',
        text: tell, source_ref: `request:${row.id}`,
      }, { onConflict: 'appointment_id,source_ref', ignoreDuplicates: true })
      return json({ ok: true })
    }
    return json({ error: 'mode が不正です' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
