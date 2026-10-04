// ============================================================
// 事前確認の後処理（pg_cron で毎分）
// ------------------------------------------------------------
// 集中モードの「事前確認」ボタンで precheck_events に1行できる。ここでは順に、
//   1. 録音をZoomから探してR2に置き、先方に渡せるリンクにする（最大12分待つ）
//   2. 確認完了・リスケ・キャンセルなら、顧客への報告の下書きを作る
//        メールの顧客 … アポ取得報告のスレッドにGmailの返信下書き（むー様が見て送る）
//        Slack・Chatworkの顧客 … 文面だけ用意（Spanaviの事前確認画面から送る）
//   3. 毎朝の #事前確認 投稿のスレッドに結果を返信する
// 顧客へは何も送らない。送るのは必ずむー様。
// ============================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { r2PutFromBuffer, recShareUrl } from '../_shared/recordingSource.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const GOOGLE_CLIENT_ID = '570031099308-ni4qokds1jc1m5s0p080t6g2gb3vu8md.apps.googleusercontent.com'
const FROM_EMAIL = 'shinomiya@ma-sp.co'
const FROM_NAME = '篠宮拓武'
const SPANAVI_URL = 'https://spanavi.jp'
const DRAFT_RESULTS = new Set(['確認完了', 'リスケ', 'キャンセル'])
const RECORDING_WAIT_MS = 12 * 60 * 1000
const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

interface EventRow {
  id: string; org_id: string; appointment_id: string; item_id: string | null
  result: string; memo: string | null; recall_at: string | null
  called_phone: string | null; caller_name: string | null; caller_zoom_user_id: string | null
  called_at: string; created_at: string
  recording_status: string; recording_attempts: number; recording_url: string | null
  slack_status: string; draft_status: string; draft_channel: string | null; draft_text: string | null
  draft_error: string | null; gmail_thread_id: string | null; gmail_draft_id: string | null
}

/* ===================== 日付 ===================== */

function jst(iso: string): Date { return new Date(new Date(iso).getTime() + 9 * 3600 * 1000) }
function jpDateTime(iso: string): string {
  const d = jst(iso)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${DAY_NAMES[d.getUTCDay()]}）${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}
function meetingLabel(meetingDate: string | null, meetingTime: string | null): string {
  if (!meetingDate) return ''
  const d = new Date(meetingDate.slice(0, 10) + 'T00:00:00Z')
  const t = (meetingTime || '').trim()
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${DAY_NAMES[d.getUTCDay()]}）${t ? ' ' + t + '〜' : ''}`
}

/* ===================== 1. 録音 ===================== */

async function getZoomToken(): Promise<string> {
  const accountId = Deno.env.get('ZOOM_ACCOUNT_ID')
  const clientId = Deno.env.get('ZOOM_CLIENT_ID')
  const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')
  if (!accountId || !clientId || !clientSecret) throw new Error('Zoom credentials not configured')
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`), 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Zoom token failed')
  return data.access_token
}

async function stepRecording(sb: SupabaseClient, ev: EventRow): Promise<void> {
  if (ev.recording_status !== 'pending') return
  const age = Date.now() - new Date(ev.called_at).getTime()
  if (!ev.caller_zoom_user_id || !ev.called_phone) {
    await sb.from('precheck_events').update({ recording_status: 'none' }).eq('id', ev.id)
    ev.recording_status = 'none'
    return
  }

  // 前の電話（同じアポの1つ前の事前確認、なければアポ登録時刻）より後の録音だけを拾う。
  // アポ取得の通話の録音を掴まないため。
  const { data: prev } = await sb.from('precheck_events')
    .select('called_at').eq('appointment_id', ev.appointment_id).lt('called_at', ev.called_at)
    .order('called_at', { ascending: false }).limit(1).maybeSingle()
  const { data: appo } = await sb.from('appointments').select('created_at').eq('id', ev.appointment_id).maybeSingle()
  const prevCalledAt = prev?.called_at || appo?.created_at || null

  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/get-zoom-recording`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify({
      zoom_user_id: ev.caller_zoom_user_id, callee_phone: ev.called_phone,
      called_at: ev.called_at, prev_called_at: prevCalledAt,
    }),
  })
  const found = res.ok ? await res.json().catch(() => null) : null
  const zoomUrl: string | null = found?.recording_url || null

  if (!zoomUrl) {
    const giveUp = age > RECORDING_WAIT_MS
    await sb.from('precheck_events').update({
      recording_attempts: ev.recording_attempts + 1,
      ...(giveUp ? { recording_status: 'none' } : {}),
    }).eq('id', ev.id)
    if (giveUp) ev.recording_status = 'none'
    return
  }

  const token = await getZoomToken()
  const audio = await fetch(zoomUrl, { headers: { Authorization: `Bearer ${token}` } })
  if (!audio.ok) throw new Error(`Zoom audio fetch failed: ${audio.status}`)
  const key = `precheck_${ev.id}_${Date.now()}.m4a`
  const put = await r2PutFromBuffer(key, await audio.arrayBuffer(), 'audio/mp4')
  if (!put.ok) throw new Error(`R2 upload failed: ${put.status}`)
  const url = await recShareUrl(key)
  if (!url) throw new Error('録音の共有リンクを作れませんでした')
  await sb.from('precheck_events').update({ recording_status: 'found', recording_url: url }).eq('id', ev.id)
  ev.recording_status = 'found'
  ev.recording_url = url
}

/* ===================== 2. 下書き ===================== */

// 下書き作成とスレッドの読み取りには gmail.modify が要る。送信用の GOOGLE_REFRESH_TOKEN（gmail.send のみ）とは別に、
// むー様が許可した更新トークンを google_oauth_tokens（name='gmail_precheck'）に持つ。
// 許可のやり直し: pending_state に値を入れ、許可画面に state として渡し、戻ってきた code を
// { mode: 'oauth', code, state, redirect_uri } で渡すと保存する。
const TOKEN_NAME = 'gmail_precheck'
let sbForToken: SupabaseClient | null = null

async function googleTokenRequest(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '', ...params }),
  })
  return await res.json()
}

async function getGoogleToken(): Promise<string> {
  const { data } = await sbForToken!.from('google_oauth_tokens').select('refresh_token').eq('name', TOKEN_NAME).maybeSingle()
  if (!data?.refresh_token) throw new Error('Gmailの下書き作成の許可がまだです')
  const t = await googleTokenRequest({ grant_type: 'refresh_token', refresh_token: data.refresh_token })
  if (!t.access_token) throw new Error('Googleの認証に失敗しました（許可のやり直しが必要かもしれません）')
  return t.access_token
}

async function saveOAuthCode(code: string, state: string, redirectUri: string): Promise<string> {
  const { data } = await sbForToken!.from('google_oauth_tokens').select('pending_state').eq('name', TOKEN_NAME).maybeSingle()
  if (!data?.pending_state || data.pending_state !== state) throw new Error('state が一致しません')
  const t = await googleTokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
  if (!t.refresh_token) throw new Error('更新トークンが返りませんでした: ' + (t.error_description || t.error || ''))
  const { error } = await sbForToken!.from('google_oauth_tokens').update({
    refresh_token: t.refresh_token, scopes: t.scope ?? null, pending_state: null, updated_at: new Date().toISOString(),
  }).eq('name', TOKEN_NAME)
  if (error) throw new Error(error.message)
  return t.scope
}

async function gmail(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`
    if (res.status === 403 && /insufficient|scope/i.test(msg)) throw new Error('Gmailの権限が足りません（下書き作成・読み取りの許可が必要）')
    throw new Error(`Gmail ${path.split('?')[0]}: ${msg}`)
  }
  return data
}

function b64urlDecode(s: string): string {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return decodeURIComponent(Array.from(b, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''))
}
function b64urlEncode(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function mimeWord(s: string): string { return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(s)))}?=` }
function wrap76(b64: string): string { return (b64.match(/.{1,76}/g) || []).join('\r\n') }
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// deno-lint-ignore no-explicit-any
function header(msg: any, name: string): string {
  const h = (msg.payload?.headers || []).find((x: { name: string }) => x.name.toLowerCase() === name.toLowerCase())
  return h?.value || ''
}
// deno-lint-ignore no-explicit-any
function plainBody(part: any): string {
  if (!part) return ''
  if (part.mimeType === 'text/plain' && part.body?.data) return b64urlDecode(part.body.data)
  for (const p of part.parts || []) {
    const t = plainBody(p)
    if (t) return t
  }
  if (part.mimeType === 'text/html' && part.body?.data) {
    return b64urlDecode(part.body.data).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
  }
  return ''
}
function addresses(v: string): string[] {
  return v.split(',').map(s => s.trim()).filter(Boolean)
}
function isMe(addr: string): boolean { return addr.toLowerCase().includes(FROM_EMAIL) }

/** 社名から（株）などを外して検索語にする */
function coreCompanyName(name: string): string {
  return name.replace(/（株）|\(株\)|株式会社|（有）|\(有\)|有限会社|合同会社|一般社団法人|社会保険労務士法人|税理士法人/g, '')
    .replace(/[\s　]+/g, ' ').trim()
}

/** アポ取得報告メールのスレッドを探す。見つけたらアポに控える */
async function findReportThread(token: string, sb: SupabaseClient, appo: { id: string; company_name: string; created_at: string; report_gmail_thread_id: string | null }): Promise<string | null> {
  if (appo.report_gmail_thread_id) return appo.report_gmail_thread_id
  const core = coreCompanyName(appo.company_name || '')
  if (!core) return null
  const after = new Date(new Date(appo.created_at).getTime() - 2 * 86400 * 1000)
  const afterStr = `${after.getUTCFullYear()}/${after.getUTCMonth() + 1}/${after.getUTCDate()}`
  const q = `in:sent subject:アポイント取得のご報告 "${core}" after:${afterStr}`
  const list = await gmail(token, `threads?maxResults=5&q=${encodeURIComponent(q)}`)
  const norm = (s: string) => s.replace(/[\s　]/g, '')
  for (const t of list.threads || []) {
    const th = await gmail(token, `threads/${t.id}?format=full`)
    const first = th.messages?.[0]
    if (first && norm(plainBody(first.payload)).includes(norm(core))) {
      await sb.from('appointments').update({ report_gmail_thread_id: t.id }).eq('id', appo.id)
      return t.id
    }
  }
  return null
}

const STYLE_PROMPT = `あなたはSpartia株式会社 篠宮の代筆です。M&A仲介会社などのクライアントへ、アポ先企業の事前確認の結果を報告する文面を作ります。文面の本文だけを出力してください（件名・引用・前置き・説明は不要）。
- 形：「{姓}様」→空行→「お世話になっております。」→空行→本文1〜3段落→空行→締め1行→空行→「Spartia 篠宮」。名乗り（Spartiaの篠宮でございます）は書かない。
- 確認完了：「{社名}様への事前確認が無事に完了いたしました。」。メモに伝えるべき事柄があるときだけ「なお、」で1〜2文足す。締めは「当日はご対応のほどよろしくお願い申し上げます。」
- リスケ：「先方様より、〜とのことで、{新日時（曜日）}にて再調整していただきたいとのご要望を賜っております。」＋「{姓}様のご都合のほどはいかがでしょうか。」。新しい日時がメモに無ければ「現在リスケジュール先の調整中でございます。調整が完了しましたら速やかにご報告申し上げます。」。インターンが日時を決めてきても「確定しました」とは書かない。
- キャンセル：「先方様より〜とのことで、{日時}のご面談はキャンセルにてお願いできればと存じます。」＋お詫び1文。
- 面談が近い（直前の）変更なら、締めは「直前のご変更となり誠に恐れ入りますが、何卒よろしくお願い申し上げます。」
- 録音リンクが渡されたら、本文の最後の段落の前に「事前確認時の通話録音を共有いたします。」と書き、次の行にURLをそのまま置く。
- インターンのメモにある事実だけを使い、無いことは書かない。細かすぎる事情（オンラインも不可、など）は省いてよい。インターンの名前・「当社」・絵文字は使わない。自社は「弊社」、こちらに不手際があってお詫びする文脈だけ「弊方」。日時は「10月12日（月）11時」の形。
- 文は短く、です・ます調の丁寧語で。`

async function generateDraftText(input: Record<string, string>): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY がありません')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-5-5',
      max_tokens: 1200,
      system: STYLE_PROMPT,
      messages: [{ role: 'user', content: Object.entries(input).filter(([, v]) => v).map(([k, v]) => `${k}：${v}`).join('\n') }],
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`文面の生成に失敗しました（${data?.error?.message || res.status}）`)
  const text = (data.content || []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('').trim()
  if (!text) throw new Error('文面が空でした')
  return text
}

/** Gmail の返信と同じ形（引用つき）で下書きを作る */
async function createReplyDraft(token: string, threadId: string, body: string): Promise<{ draftId: string; to: string }> {
  const th = await gmail(token, `threads/${threadId}?format=full`)
  const msgs = th.messages || []
  const last = msgs[msgs.length - 1]
  if (!last) throw new Error('スレッドが空でした')

  const lastFrom = header(last, 'From')
  const fromMe = isMe(lastFrom)
  const to = fromMe ? header(last, 'To') : lastFrom
  const cc = [...addresses(header(last, fromMe ? 'Cc' : 'To')), ...(fromMe ? [] : addresses(header(last, 'Cc')))]
    .filter(a => !isMe(a) && !to.includes(a))
  const subjectRaw = header(msgs[0], 'Subject') || header(last, 'Subject')
  const subject = /^re:/i.test(subjectRaw) ? subjectRaw : `Re: ${subjectRaw}`
  const msgId = header(last, 'Message-ID') || header(last, 'Message-Id')
  const refs = [header(last, 'References'), msgId].filter(Boolean).join(' ')

  // 引用の見出しは Gmail 日本語版と同じ「2026年9月30日(水) 18:28 名前 <addr>:」
  const d = jst(new Date(Number(last.internalDate)).toISOString())
  const quoteHead = `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${DAY_NAMES[d.getUTCDay()]}) ${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')} ${lastFrom}:`
  const quoted = plainBody(last.payload).replace(/\r\n/g, '\n').trimEnd()
  const plain = `${body}\n\n${quoteHead}\n\n${quoted.split('\n').map(l => '> ' + l).join('\n')}\n`
  const html = `<div dir="ltr">${escapeHtml(body).replace(/\n/g, '<br>')}</div><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">${escapeHtml(quoteHead)}<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">${escapeHtml(quoted).replace(/\n/g, '<br>')}</blockquote></div>`

  const boundary = `b_${crypto.randomUUID()}`
  const lines = [
    `From: ${mimeWord(FROM_NAME)} <${FROM_EMAIL}>`,
    `To: ${to}`,
    ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: ${mimeWord(subject)}`,
    ...(msgId ? [`In-Reply-To: ${msgId}`, `References: ${refs}`] : []),
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(btoa(unescape(encodeURIComponent(plain)))),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(btoa(unescape(encodeURIComponent(html)))),
    `--${boundary}--`,
  ]
  const raw = b64urlEncode(lines.join('\r\n'))
  const draft = await gmail(token, 'drafts', { method: 'POST', body: JSON.stringify({ message: { raw, threadId } }) })
  return { draftId: draft.id, to }
}

/** 宛名の姓。アポ取得報告の1行目「川元 徳馬 様」から取る。取れなければ顧客の担当者名 */
function surnameFrom(text: string, fallback: string | null): string {
  const m = text.match(/^\s*([^\s　\n]+)[\s　]*[^\n]*?様/)
  if (m) return m[1]
  return (fallback || '').split(/[\s　]/)[0] || ''
}

async function stepDraft(sb: SupabaseClient, ev: EventRow): Promise<void> {
  if (ev.draft_status !== 'pending') return
  if (ev.recording_status === 'pending') return // 録音リンクを入れるため待つ

  const { data: appo } = await sb.from('appointments')
    .select('id, company_name, meeting_date, meeting_time, client_id, created_at, report_gmail_thread_id')
    .eq('id', ev.appointment_id).maybeSingle()
  if (!appo) throw new Error('アポが見つかりません')
  const { data: client } = await sb.from('clients')
    .select('name, contact_method, contact_person, precheck_share_recording')
    .eq('id', appo.client_id).maybeSingle()
  const channel = client?.contact_method === 'Slack' ? 'slack' : client?.contact_method === 'Chatwork' ? 'chatwork' : 'email'
  const shareRec = !!client?.precheck_share_recording && !!ev.recording_url

  let token = ''
  let threadId: string | null = null
  let firstBody = ''
  if (channel === 'email') {
    token = await getGoogleToken()
    threadId = await findReportThread(token, sb, appo)
    if (threadId) {
      const th = await gmail(token, `threads/${threadId}?format=full`)
      firstBody = plainBody(th.messages?.[0]?.payload)
    }
  }

  const text = await generateDraftText({
    '結果': ev.result,
    '宛名の姓': surnameFrom(firstBody, client?.contact_person || null) || '（不明。「ご担当者」とする）',
    'アポ先の社名': appo.company_name || '',
    '面談日時': meetingLabel(appo.meeting_date, appo.meeting_time),
    '事前確認の日時': jpDateTime(ev.called_at),
    'インターンのメモ': ev.memo || '（なし）',
    '録音リンク': shareRec ? ev.recording_url! : '',
  })

  if (channel !== 'email') {
    await sb.from('precheck_events').update({ draft_status: 'ready', draft_channel: channel, draft_text: text, draft_error: null }).eq('id', ev.id)
    Object.assign(ev, { draft_status: 'ready', draft_channel: channel, draft_text: text })
    return
  }
  if (!threadId) {
    await sb.from('precheck_events').update({
      draft_status: 'failed', draft_channel: 'email', draft_text: text,
      draft_error: 'アポ取得報告のメールが見つかりませんでした。文面はSpanaviの事前確認画面にあります',
    }).eq('id', ev.id)
    Object.assign(ev, { draft_status: 'failed', draft_channel: 'email', draft_text: text, draft_error: 'アポ取得報告のメールが見つかりませんでした' })
    return
  }
  const { draftId } = await createReplyDraft(token, threadId, text)
  await sb.from('precheck_events').update({
    draft_status: 'created', draft_channel: 'email', draft_text: text, draft_error: null,
    gmail_thread_id: threadId, gmail_draft_id: draftId,
  }).eq('id', ev.id)
  Object.assign(ev, { draft_status: 'created', draft_channel: 'email', draft_text: text, gmail_thread_id: threadId, gmail_draft_id: draftId })
}

/* ===================== 3. #事前確認 スレッド ===================== */

async function orgSetting(sb: SupabaseClient, orgId: string, key: string): Promise<string> {
  const { data } = await sb.from('org_settings').select('setting_value').eq('org_id', orgId).eq('setting_key', key).maybeSingle()
  return (data?.setting_value as string) || ''
}

async function stepSlack(sb: SupabaseClient, ev: EventRow): Promise<void> {
  if (ev.slack_status !== 'pending') return
  if (ev.recording_status === 'pending') return
  if (ev.draft_status === 'pending') return

  const token = Deno.env.get('SLACK_BOT_TOKEN')?.trim()
  const channel = await orgSetting(sb, ev.org_id, 'slack_channel_precheck')
  if (!token || !channel) {
    await sb.from('precheck_events').update({ slack_status: 'failed' }).eq('id', ev.id)
    return
  }
  const mention = await orgSetting(sb, ev.org_id, 'slack_precheck_mention_user')

  const { data: appo } = await sb.from('appointments').select('company_name, client_id').eq('id', ev.appointment_id).maybeSingle()
  const { data: client } = appo?.client_id
    ? await sb.from('clients').select('name').eq('id', appo.client_id).maybeSingle()
    : { data: null }
  const { data: post } = await sb.from('precheck_slack_posts').select('ts')
    .eq('org_id', ev.org_id).eq('channel_id', channel).contains('appointment_ids', [ev.appointment_id])
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  const lines: string[] = []
  const important = DRAFT_RESULTS.has(ev.result)
  lines.push(`${important && mention ? `<@${mention}> ` : ''}*${appo?.company_name || ''}* ／ ${client?.name || ''}`)
  lines.push(`・事前確認：${ev.result}`)
  if (ev.memo) lines.push(`・メモ：${ev.memo}`)
  if (ev.recall_at) lines.push(`・かけ直し：${jpDateTime(ev.recall_at)}`)
  lines.push(`・録音：${ev.recording_url ? `<${ev.recording_url}|再生>` : 'なし'}`)
  lines.push(`・入力：${ev.caller_name || ''}（${jpDateTime(ev.called_at)}）`)
  if (ev.draft_status === 'created' && ev.gmail_thread_id) {
    lines.push(`・顧客への報告：Gmailに返信の下書きを作りました → <https://mail.google.com/mail/u/${FROM_EMAIL}/#all/${ev.gmail_thread_id}|開く>`)
  } else if (ev.draft_status === 'ready') {
    lines.push(`・顧客への報告：${ev.draft_channel === 'slack' ? 'Slack' : 'Chatwork'}用の文面を用意しました → <${SPANAVI_URL}/?tab=precheck|Spanaviの事前確認で送信>`)
  } else if (ev.draft_status === 'failed') {
    lines.push(`・顧客への報告：下書きを作れませんでした（${ev.draft_error || '原因不明'}）`)
  }

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ channel, text: lines.join('\n'), ...(post?.ts ? { thread_ts: post.ts } : {}), unfurl_links: false }),
  })
  const data = await res.json().catch(() => ({}))
  await sb.from('precheck_events').update(
    data.ok ? { slack_status: 'posted', slack_ts: data.ts } : { slack_status: 'failed' },
  ).eq('id', ev.id)
  if (!data.ok) console.error('[process-precheck-events] Slack error:', data.error)
}

/* ===================== 本体 ===================== */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  sbForToken = sb
  let body: { mode?: string; code?: string; state?: string; redirect_uri?: string } = {}
  try { body = await req.json() } catch { /* cron は空 */ }

  if (body.mode === 'oauth') {
    try {
      const scope = await saveOAuthCode(body.code || '', body.state || '', body.redirect_uri || '')
      return json({ ok: true, saved: true, scope })
    } catch (e) {
      return json({ ok: false, error: (e as Error).message }, 400)
    }
  }

  // Gmail連携の権限を確かめる（鍵の中身は返さない）
  if (body.mode === 'diag') {
    try {
      const token = await getGoogleToken()
      const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${token}`).then(r => r.json())
      return json({ ok: true, scope: info.scope || null })
    } catch (e) {
      return json({ ok: false, error: (e as Error).message })
    }
  }

  const since = new Date(Date.now() - 2 * 86400 * 1000).toISOString()
  const { data: events, error } = await sb.from('precheck_events')
    .select('*')
    .gte('created_at', since)
    .or('recording_status.eq.pending,draft_status.eq.pending,slack_status.eq.pending')
    .order('created_at')
    .limit(20)
  if (error) return json({ error: error.message }, 500)

  const results: Array<{ id: string; ok: boolean; error?: string }> = []
  for (const ev of (events || []) as EventRow[]) {
    try {
      try {
        await stepRecording(sb, ev)
      } catch (e) {
        // 録音で詰まっても、待ち時間を過ぎたら録音なしで先へ進める（報告を止めない）
        console.error('[process-precheck-events] recording', ev.id, e)
        if (Date.now() - new Date(ev.called_at).getTime() > RECORDING_WAIT_MS) {
          await sb.from('precheck_events').update({ recording_status: 'none' }).eq('id', ev.id)
          ev.recording_status = 'none'
        }
      }
      try {
        await stepDraft(sb, ev)
      } catch (e) {
        const msg = (e as Error).message
        await sb.from('precheck_events').update({ draft_status: 'failed', draft_error: msg }).eq('id', ev.id)
        Object.assign(ev, { draft_status: 'failed', draft_error: msg })
      }
      await stepSlack(sb, ev)
      results.push({ id: ev.id, ok: true })
    } catch (e) {
      console.error('[process-precheck-events]', ev.id, e)
      results.push({ id: ev.id, ok: false, error: (e as Error).message })
    }
  }
  return json({ ok: true, processed: results })
})
