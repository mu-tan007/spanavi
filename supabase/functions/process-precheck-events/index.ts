// ============================================================
// 事前確認の後処理（pg_cron で毎分）
// ------------------------------------------------------------
// 架電ページの「事前確認」ボタンで precheck_events に1行できる。ここでは順に、
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
const DRAFT_RESULTS = new Set(['確認完了', 'リスケ', 'キャンセル', '未完了'])

// 「ご訪問が難しいようでしたら」の一文を入れる条件（2026-10-04 むー様決定）：
// 対面で、午後（12時以降）に、1都3県の外へ訪問する面談
const KANTO_4 = ['東京都', '神奈川県', '埼玉県', '千葉県']
function needsVisitNote(appo: { is_online: boolean | null; meeting_time: string | null; meeting_location: string | null }): boolean {
  if (appo.is_online) return false
  const hour = Number((appo.meeting_time || '').split(':')[0])
  if (!Number.isFinite(hour) || hour < 12) return false
  const pref = (appo.meeting_location || '').match(/(北海道|東京都|(?:京都|大阪)府|[^\s　〒0-9０-９-]{2,3}県)/)?.[1]
  return !!pref && !KANTO_4.includes(pref)
}
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
  recording_added: string | null; slack_ts: string | null; slack_post_channel: string | null
  auto_registered_channel?: string  // この回に共有チャンネルを自動で登録した（#事前確認 への返信で知らせる）
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
  if (!ev.caller_zoom_user_id) {
    await sb.from('precheck_events').update({ recording_status: 'none' }).eq('id', ev.id)
    ev.recording_status = 'none'
    return
  }

  // ⚠️ アポ取得の通話の録音を事前確認の録音として渡さないための下限。
  //    次のうち一番遅い時刻より「後に始まった」録音だけを拾う：
  //      同じアポの1つ前の事前確認 ／ アポの登録時刻 ／ その企業の最後の架電記録（アポ獲得など）
  //    アポ取得の通話は、登録・架電記録より前に始まっているので必ず外れる。
  const { data: prev } = await sb.from('precheck_events')
    .select('called_at').eq('appointment_id', ev.appointment_id).is('cancelled_at', null).lt('called_at', ev.called_at)
    .order('called_at', { ascending: false }).limit(1).maybeSingle()
  const { data: appo } = await sb.from('appointments').select('created_at, phone, item_id').eq('id', ev.appointment_id).maybeSingle()
  const { data: lastCall } = appo?.item_id
    ? await sb.from('call_records').select('called_at').eq('item_id', appo.item_id).lt('called_at', ev.called_at)
      .order('called_at', { ascending: false }).limit(1).maybeSingle()
    : { data: null }
  const { data: item } = appo?.item_id
    ? await sb.from('call_list_items').select('phone').eq('id', appo.item_id).maybeSingle()
    : { data: null }
  const lowerBound = [prev?.called_at, appo?.created_at, lastCall?.called_at]
    .filter(Boolean).map(t => new Date(t as string).getTime()).reduce((a, b) => Math.max(a, b), 0)
  const prevCalledAt = lowerBound ? new Date(lowerBound).toISOString() : null

  // 掛けた番号が分からない・社長の携帯に掛けた等にそなえ、その企業の番号を順に当たる
  const phones = [...new Set([ev.called_phone, appo?.phone, item?.phone]
    .map(p => String(p || '').replace(/[^\d]/g, '')).filter(p => p.length >= 9))]

  let zoomUrl: string | null = null
  for (const phone of phones) {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/get-zoom-recording`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({
        zoom_user_id: ev.caller_zoom_user_id, callee_phone: phone,
        called_at: ev.called_at, prev_called_at: prevCalledAt,
      }),
    })
    const found = res.ok ? await res.json().catch(() => null) : null
    // 録音検索側でも下限で絞っているが、開始時刻をここでもう一度確かめる（二重の歯止め）
    const startedAt = found?.date_time ? new Date(found.date_time).getTime() : 0
    if (found?.recording_url && startedAt > lowerBound) { zoomUrl = found.recording_url; break }
  }

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
  // 件名はクライアントによって違う（多くは【アポイント取得のご報告】、ブティックス様は「…アポ取得のお知らせ」）
  const q = `in:sent (subject:アポイント取得 OR subject:アポ取得) "${core}" after:${afterStr}`
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
- 未完了（1営業日前の夜になっても確認が取れていない）：「{社名}様の事前確認につきまして、{これまでの電話の経緯（例：昨日・本日とお電話しているものの社長様に繋がらず）}、確認が完了いたしておりません。」→「大変恐れ入りますが、{面談日（曜日）}の当日朝に再度ご連絡を差し上げる運びでございます。確認が完了いたしましたら、速やかにご一報差し上げます。」→「ご訪問の一文」が「入れる」なら「なお、ご訪問が難しいようでしたら、お申し付けくださいませ。」→「直前まで確認が完了せず、誠に申し訳ございません。」。経緯は渡された電話の記録の事実だけで書く（記録が無ければ「お電話しているものの」の部分は「先方様と連絡が取れず」程度にとどめる）。
- 前日に「未完了」の連絡をした後の確認完了・リスケ・キャンセルは、冒頭を「本件、」で始め、確認完了なら「お待たせしてしまい、誠に申し訳ございませんでした。」を1文添える。
- 「Slack形式」が「はい」なら Slack のスレッドへの返信として書く：宛名の行（{姓}様）と署名（Spartia 篠宮）は書かない（宛先へのメンションは送信時に先頭へ付く）。「お世話になっております。」から始め、段落の間に空行を入れず、全体を3〜5行にまとめる。
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

/** 返信の宛先。最後のメールが自分のものなら同じ相手へ、相手からのものならその差出人へ */
// deno-lint-ignore no-explicit-any
function replyTarget(last: any): { to: string; lastFrom: string; fromMe: boolean } {
  const lastFrom = header(last, 'From')
  const fromMe = isMe(lastFrom)
  return { to: fromMe ? header(last, 'To') : lastFrom, lastFrom, fromMe }
}

/** 「"川元 徳馬" <t.kawamoto@...>」から表示名を取り出す */
function displayName(addr: string): string {
  const m = addr.match(/^\s*"?([^"<]+?)"?\s*</)
  return m ? m[1].trim() : ''
}

/**
 * 表示名から日本語の氏名だけを取り出す。人名でない（日本語を含まない）ときは空。
 * 「Shuhei Takano/高野 柊平」→「高野 柊平」（2026-10-05 フラーレン様で「Shuhei様」になった）
 */
function japaneseName(raw: string): string {
  const ja = /[一-龯々ぁ-んァ-ヶ]/
  const seg = raw.split(/[\/／|｜()（）\[\]【】,、]/).find(s => ja.test(s)) || ''
  return seg.split(/[\s　]+/).filter(t => ja.test(t)).join(' ')
}

// deno-lint-ignore no-explicit-any
function htmlBody(part: any): string {
  if (!part) return ''
  if (part.mimeType === 'text/html' && part.body?.data) return b64urlDecode(part.body.data)
  for (const p of part.parts || []) {
    const t = htmlBody(p)
    if (t) return t
  }
  return ''
}

/** Gmail の返信と同じ形（引用つき）で下書きを作る */
async function buildReplyRaw(token: string, threadId: string, body: string): Promise<{ raw: string; to: string }> {
  const th = await gmail(token, `threads/${threadId}?format=full`)
  const msgs = th.messages || []
  const last = msgs[msgs.length - 1]
  if (!last) throw new Error('スレッドが空でした')

  const { to, lastFrom, fromMe } = replyTarget(last)
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
  // 引用は元のメールのHTMLをそのまま入れ子にする（Gmail の返信と同じ見た目。HTMLが無ければ本文の文字を使う）
  const lastHtml = htmlBody(last.payload)
  const quotedHtml = lastHtml
    ? lastHtml.replace(/^[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '')
    : escapeHtml(quoted).replace(/\n/g, '<br>')
  const html = `<div dir="ltr">${escapeHtml(body).replace(/\n/g, '<br>')}</div><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">${escapeHtml(quoteHead)}<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">${quotedHtml}</blockquote></div>`

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
  return { raw: b64urlEncode(lines.join('\r\n')), to }
}

async function createReplyDraft(token: string, threadId: string, body: string): Promise<{ draftId: string; to: string }> {
  const { raw, to } = await buildReplyRaw(token, threadId, body)
  const draft = await gmail(token, 'drafts', { method: 'POST', body: JSON.stringify({ message: { raw, threadId } }) })
  return { draftId: draft.id, to }
}

/** 本文に録音の一文を差し込む（締めの段落の前）。Slack形式は空行なしなので行で数える */
function insertRecording(text: string, url: string, slackFormat: boolean): string {
  if (text.includes(url)) return text
  const add = ['事前確認時の通話録音を共有いたします。', url]
  if (slackFormat) {
    const lines = text.split('\n')
    let i = lines.findIndex(l => /よろしくお願い|ご対応のほど/.test(l))
    if (i < 0) i = lines.length
    lines.splice(i, 0, ...add)
    return lines.join('\n')
  }
  const paras = text.split(/\n{2,}/)
  let i = paras.findIndex(p => /当日はご対応|よろしくお願い|恐れ入りますが、何卒/.test(p))
  if (i < 0) i = Math.max(paras.length - 1, 0)
  paras.splice(i, 0, add.join('\n'))
  return paras.join('\n\n')
}

/**
 * 録音が下書きの後に見つかったとき、下書きがまだ残っていれば録音の一文を書き足す。
 * Gmail はその時点の下書きの本文（篠宮が直していればそれも）に差し込む。送信済み・削除済みなら何もしない。
 */
async function addRecordingToDraft(sb: SupabaseClient, ev: EventRow): Promise<void> {
  if (ev.recording_added !== 'pending') return
  if (ev.recording_status === 'pending') return
  const done = async (v: string) => { await sb.from('precheck_events').update({ recording_added: v }).eq('id', ev.id); ev.recording_added = v }
  if (ev.recording_status !== 'found' || !ev.recording_url) return done('skip')

  if (ev.draft_status === 'ready' && ev.draft_text) {
    const text = insertRecording(ev.draft_text, ev.recording_url, ev.draft_channel === 'slack')
    await sb.from('precheck_events').update({ draft_text: text }).eq('id', ev.id).eq('draft_status', 'ready')
    ev.draft_text = text
    return done('done')
  }
  if (ev.draft_status !== 'created' || !ev.gmail_draft_id || !ev.gmail_thread_id) return done('skip')

  const token = await getGoogleToken()
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${ev.gmail_draft_id}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 404) return done('skip') // 篠宮が送信済み、または削除済み
  const draft = await res.json()
  const current = plainBody(draft.message?.payload).replace(/\r\n/g, '\n')
  // 引用の見出し（2026年9月30日(水) 18:28 名前 <addr>:）より上が本文
  const m = current.match(/\n+\d{4}年\d{1,2}月\d{1,2}日\(.\) \d{1,2}:\d{2} .*:\s*\n/)
  const body = (m ? current.slice(0, m.index) : (ev.draft_text || current)).trimEnd()
  const nextBody = insertRecording(body, ev.recording_url, false)
  const { raw } = await buildReplyRaw(token, ev.gmail_thread_id, nextBody)
  await gmail(token, `drafts/${ev.gmail_draft_id}`, { method: 'PUT', body: JSON.stringify({ id: ev.gmail_draft_id, message: { raw, threadId: ev.gmail_thread_id } }) })
  await sb.from('precheck_events').update({ draft_text: nextBody }).eq('id', ev.id)
  ev.draft_text = nextBody
  return done('done')
}

/**
 * Slack の共有チャンネルから、むー様が出したアポ取得報告の投稿を社名で探す。
 * むー様の Slack の許可（SLACK_USER_TOKEN・search:read）で検索する。ボットには検索の権限が無い。
 * 返すのは返信先（チャンネルと投稿の ts）と、その投稿の先頭にあるメンション（先方の担当者）。
 */
async function findSlackReportThread(channels: string[], companyName: string): Promise<{ channel: string; ts: string; mentions: string } | null> {
  const token = Deno.env.get('SLACK_USER_TOKEN')?.trim()
  if (!token) throw new Error('Slackの許可（篠宮の名前で検索・投稿）がまだです')
  const core = coreCompanyName(companyName)
  if (!core) return null
  const norm = (s: string) => s.replace(/[\s　]/g, '')
  for (const ch of channels) {
    const q = `"${core}" in:<#${ch}>`
    const res = await fetch(`https://slack.com/api/search.messages?${new URLSearchParams({ query: q, sort: 'timestamp', sort_dir: 'asc', count: '20' })}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!data.ok) throw new Error(`Slackの検索に失敗しました（${data.error || res.status}）`)
    // deno-lint-ignore no-explicit-any
    const hit = (data.messages?.matches || []).find((m: any) =>
      /アポ取得報告|アポイントを取得/.test(m.text || '') && norm(m.text || '').includes(norm(core)))
    if (!hit) continue
    // 返信の中に見つかった場合は、その親の投稿に返信する
    const threadTs = (hit.permalink || '').match(/thread_ts=([\d.]+)/)?.[1] || hit.ts
    const mentions = ((hit.text || '').match(/^(\s*<@[A-Z0-9]+(?:\|[^>]*)?>\s*)+/)?.[0] || '')
      .match(/<@[A-Z0-9]+/g)?.map((m: string) => m + '>').join(' ') || ''
    return { channel: hit.channel?.id || ch, ts: threadTs, mentions }
  }
  return null
}

/**
 * 共有チャンネルが登録されていないクライアント用：Slack 全体から、むー様がクライアント向けに出した
 * アポ取得報告（「お世話になっております」で始まる投稿）を社名で探す。見つかったチャンネルは登録しておく。
 * 社内の #アポ取得報告 はボットが出すので、むー様の投稿に限れば当たらない。#事前確認・DM は除く。
 */
async function findSlackReportAnywhere(companyName: string, excludeChannels: string[]): Promise<{ channel: string; ts: string; mentions: string } | null> {
  const token = Deno.env.get('SLACK_USER_TOKEN')?.trim()
  if (!token) return null
  const core = coreCompanyName(companyName)
  if (!core) return null
  const me = await fetch('https://slack.com/api/auth.test', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({}))
  if (!me?.user_id) return null
  const res = await fetch(`https://slack.com/api/search.messages?${new URLSearchParams({ query: `"${core}" from:<@${me.user_id}>`, sort: 'timestamp', sort_dir: 'asc', count: '30' })}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!data.ok) return null
  const norm = (s: string) => s.replace(/[\s　]/g, '')
  // deno-lint-ignore no-explicit-any
  const hit = (data.messages?.matches || []).find((m: any) => {
    const text = m.text || ''
    const body = text.replace(/^(\s*<@[A-Z0-9]+(?:\|[^>]*)?>\s*)+/, '')
    return !m.channel?.is_im && !m.channel?.is_mpim && !excludeChannels.includes(m.channel?.id)
      && /^\s*お世話になっております/.test(body)
      && /アポ取得報告|アポイントを取得/.test(text) && norm(text).includes(norm(core))
  })
  if (!hit) return null
  const threadTs = (hit.permalink || '').match(/thread_ts=([\d.]+)/)?.[1] || hit.ts
  const mentions = ((hit.text || '').match(/^(\s*<@[A-Z0-9]+(?:\|[^>]*)?>\s*)+/)?.[0] || '')
    .match(/<@[A-Z0-9]+/g)?.map((m: string) => m + '>').join(' ') || ''
  return { channel: hit.channel.id, ts: threadTs, mentions }
}

/** 宛名の姓。アポ取得報告の1行目「川元 徳馬 様」から取る。取れなければ顧客の担当者名 */
function surnameFrom(text: string, fallback: string | null): string {
  const m = text.match(/^\s*([^\s　\n]+)[\s　]*[^\n]*?様/)
  if (m) return m[1]
  return (fallback || '').split(/[\s　]/)[0] || ''
}

async function stepDraft(sb: SupabaseClient, ev: EventRow): Promise<void> {
  if (ev.draft_status !== 'pending') return
  // 録音は待たない（2026-10-04 篠宮）。見つかったら addRecordingToDraft が後から書き足す

  const { data: appo } = await sb.from('appointments')
    .select('id, company_name, meeting_date, meeting_time, client_id, created_at, report_gmail_thread_id, is_online, meeting_location')
    .eq('id', ev.appointment_id).maybeSingle()
  if (!appo) throw new Error('アポが見つかりません')
  const { data: client } = await sb.from('clients')
    .select('name, contact_method, contact_person, precheck_share_recording, slack_channel_ids')
    .eq('id', appo.client_id).maybeSingle()
  // 共有チャンネルが登録されているクライアントは、Slack のアポ取得報告のスレッドへ返信する
  const slackChannels: string[] = client?.slack_channel_ids || []
  let channel = slackChannels.length > 0 || client?.contact_method === 'Slack' ? 'slack'
    : client?.contact_method === 'Chatwork' ? 'chatwork' : 'email'
  let autoRegistered = ''
  const shareRec = !!client?.precheck_share_recording && !!ev.recording_url
  // 録音リンクを付ける報告か。付けるのに録音がまだ無ければ、見つかった時点で書き足す（pending）
  const wantsRec = !!client?.precheck_share_recording && ['確認完了', 'リスケ', 'キャンセル'].includes(ev.result)
  const recAdded = !wantsRec ? 'skip' : shareRec ? 'done' : (ev.recording_status === 'pending' ? 'pending' : 'skip')

  let token = ''
  let threadId: string | null = null
  let firstBody = ''
  let slackReply: { channel: string; ts: string; mentions: string } | null = null
  let slackError = ''
  if (channel === 'slack') {
    try {
      slackReply = slackChannels.length > 0 ? await findSlackReportThread(slackChannels, appo.company_name || '') : null
      if (!slackReply) {
        // 登録済みのチャンネルに無い・未登録 → Slack 全体を探し、見つかったチャンネルを登録する
        const precheckChannel = await orgSetting(sb, ev.org_id, 'slack_channel_precheck')
        const found = await findSlackReportAnywhere(appo.company_name || '', [precheckChannel].filter(Boolean))
        if (found) {
          slackReply = found
          if (!slackChannels.includes(found.channel)) {
            await sb.from('clients').update({ slack_channel_ids: [...slackChannels, found.channel] }).eq('id', appo.client_id)
            autoRegistered = found.channel
          }
        }
      }
      if (!slackReply) slackError = 'Slackでアポ取得報告の投稿が見つかりませんでした'
    } catch (e) {
      slackError = (e as Error).message
    }
  }
  if (channel === 'email') {
    token = await getGoogleToken()
    threadId = await findReportThread(token, sb, appo)
    if (threadId) {
      const th = await gmail(token, `threads/${threadId}?format=full`)
      const msgs = th.messages || []
      // 宛名は「この下書きを送る相手」に合わせる（スレッドの途中で担当者が変わることがある）
      // 共用アドレス（info-btix-ma など）は表示名が人名でないので使わない。
      // そのときは相手の本文の名乗り（「ブティックスの佐藤でございます」）→ 最初の報告の宛名、の順で取る
      const last = msgs[msgs.length - 1]
      const target = replyTarget(last)
      const toName = japaneseName(displayName((target.to || '').split(',')[0]))
      const selfIntro = target.fromMe ? '' :
        (plainBody(last?.payload).match(/の([一-龯]{1,4})(?:と申します|でございます|です)/)?.[1] || '')
      firstBody = toName ? `${toName} 様` : selfIntro ? `${selfIntro} 様` : plainBody(msgs[0]?.payload)
    } else {
      // メールが見つからない ＝ 共有チャンネルの登録漏れかもしれない。Slack 全体を探し、見つかれば登録する
      const precheckChannel = await orgSetting(sb, ev.org_id, 'slack_channel_precheck')
      const found = await findSlackReportAnywhere(appo.company_name || '', [precheckChannel].filter(Boolean))
      if (found) {
        channel = 'slack'
        slackReply = found
        const next = [...new Set([...slackChannels, found.channel])]
        await sb.from('clients').update({ slack_channel_ids: next }).eq('id', appo.client_id)
        autoRegistered = found.channel
      }
    }
  }

  // これまでの事前確認の電話（未完了の経緯、前日に未完了を連絡済みかの判断に使う）
  const { data: history } = await sb.from('precheck_events')
    .select('result, memo, called_at').eq('appointment_id', appo.id).neq('id', ev.id).is('cancelled_at', null)
    .lt('called_at', ev.called_at).order('called_at')
  const calls = (history || []).filter(h => h.result !== '未完了')
  const toldUnfinished = (history || []).some(h => h.result === '未完了')

  const text = await generateDraftText({
    '結果': ev.result,
    '宛名の姓': surnameFrom(firstBody, client?.contact_person || null) || '（不明。「ご担当者」とする）',
    'アポ先の社名': appo.company_name || '',
    '面談日時': meetingLabel(appo.meeting_date, appo.meeting_time),
    '事前確認の日時': ev.result === '未完了' ? '' : jpDateTime(ev.called_at),
    'インターンのメモ': ev.result === '未完了' ? '' : (ev.memo || '（なし）'),
    'これまでの電話の記録': calls.map(h => `${jpDateTime(h.called_at)} ${h.result}${h.memo ? '（' + h.memo + '）' : ''}`).join(' ／ ') || (ev.result === '未完了' ? '（記録なし）' : ''),
    '前日に未完了を連絡済み': toldUnfinished ? 'はい' : '',
    'ご訪問の一文': ev.result === '未完了' ? (needsVisitNote(appo) ? '入れる' : '入れない') : '',
    '録音リンク': shareRec && ev.result !== '未完了' ? ev.recording_url! : '',
    'Slack形式': channel === 'slack' ? 'はい' : '',
  })

  if (channel !== 'email') {
    await sb.from('precheck_events').update({
      draft_status: 'ready', draft_channel: channel, draft_text: text, draft_error: slackError || null, recording_added: recAdded,
      slack_reply_channel: slackReply?.channel || null, slack_reply_ts: slackReply?.ts || null,
      slack_reply_mentions: slackReply?.mentions || null,
    }).eq('id', ev.id)
    Object.assign(ev, { draft_status: 'ready', draft_channel: channel, draft_text: text, draft_error: slackError || null, auto_registered_channel: autoRegistered || undefined, recording_added: recAdded })
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
  // 文面を作っている間に取り消されていたら、下書きは作らない
  const { data: still } = await sb.from('precheck_events').select('cancelled_at').eq('id', ev.id).maybeSingle()
  if (still?.cancelled_at) return
  const { draftId } = await createReplyDraft(token, threadId, text)
  await sb.from('precheck_events').update({
    draft_status: 'created', draft_channel: 'email', draft_text: text, draft_error: null, recording_added: recAdded,
    gmail_thread_id: threadId, gmail_draft_id: draftId,
  }).eq('id', ev.id)
  Object.assign(ev, { draft_status: 'created', draft_channel: 'email', draft_text: text, gmail_thread_id: threadId, gmail_draft_id: draftId , recording_added: recAdded })
}

/* ===================== 3. #事前確認 スレッド ===================== */

async function orgSetting(sb: SupabaseClient, orgId: string, key: string): Promise<string> {
  const { data } = await sb.from('org_settings').select('setting_value').eq('org_id', orgId).eq('setting_key', key).maybeSingle()
  return (data?.setting_value as string) || ''
}

/** #事前確認 への返信の本文と返信先（朝の通知のスレッド） */
async function composeSlack(sb: SupabaseClient, ev: EventRow, channel: string): Promise<{ text: string; threadTs: string | null }> {
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
  lines.push(`・録音：${ev.recording_url ? `<${ev.recording_url}|再生>` : ev.recording_status === 'pending' ? '取得中（見つかり次第ここに付きます）' : 'なし'}`)
  lines.push(`・入力：${ev.caller_name || ''}（${jpDateTime(ev.called_at)}）`)
  const recNote = ev.recording_added === 'pending' ? '（録音は見つかり次第、下書きに書き足します）'
    : ev.recording_added === 'done' && ev.recording_url ? '（録音リンク入り）' : ''
  if (ev.draft_status === 'created' && ev.gmail_thread_id) {
    // 下書きを直接開くURL（#all?compose=thread-f:…）は Gmail が新規作成に置き換えてしまうため、スレッドを開く
    lines.push(`・顧客への報告：アポ取得報告のスレッドにGmailの返信下書きを作りました${recNote} → <https://mail.google.com/mail/u/${FROM_EMAIL}/#all/${ev.gmail_thread_id}|スレッドを開く>`)
  } else if (ev.draft_status === 'ready') {
    lines.push(`・顧客への報告：${ev.draft_channel === 'slack' ? 'Slack' : 'Chatwork'}用の文面を用意しました${recNote} → <${SPANAVI_URL}/?tab=precheck|Spanaviの事前確認で送信>`)
    if (ev.auto_registered_channel) lines.push(`・このクライアントの共有チャンネル <#${ev.auto_registered_channel}> を新しく登録しました（メールが見つからず、Slackのアポ取得報告が見つかったため）`)
  } else if (ev.draft_status === 'failed') {
    lines.push(`・顧客への報告：下書きを作れませんでした（${ev.draft_error || '原因不明'}）`)
  }
  return { text: lines.join('\n'), threadTs: post?.ts || null }
}

async function stepSlack(sb: SupabaseClient, ev: EventRow): Promise<void> {
  if (ev.slack_status !== 'pending') return
  // 録音は待たない。下書きの結果だけは載せたいので、下書きの処理が済むまで待つ
  if (ev.draft_status === 'pending') return

  const token = Deno.env.get('SLACK_BOT_TOKEN')?.trim()
  const channel = await orgSetting(sb, ev.org_id, 'slack_channel_precheck')
  if (!token || !channel) {
    await sb.from('precheck_events').update({ slack_status: 'failed' }).eq('id', ev.id)
    return
  }
  const { text, threadTs } = await composeSlack(sb, ev, channel)
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ channel, text, ...(threadTs ? { thread_ts: threadTs } : {}), unfurl_links: false }),
  })
  const data = await res.json().catch(() => ({}))
  await sb.from('precheck_events').update(
    data.ok ? { slack_status: 'posted', slack_ts: data.ts, slack_post_channel: data.channel || null } : { slack_status: 'failed' },
  ).eq('id', ev.id)
  if (data.ok) Object.assign(ev, { slack_status: 'posted', slack_ts: data.ts, slack_post_channel: data.channel || null })
  else console.error('[process-precheck-events] Slack error:', data.error)
}

/** 返信したあとに録音が見つかった（または見つからないと決まった）ら、返信を書き換える */
async function updateSlackAfterRecording(sb: SupabaseClient, ev: EventRow): Promise<void> {
  if (ev.slack_status !== 'posted' || !ev.slack_ts || !ev.slack_post_channel) return
  const token = Deno.env.get('SLACK_BOT_TOKEN')?.trim()
  const channel = await orgSetting(sb, ev.org_id, 'slack_channel_precheck')
  if (!token || !channel) return
  const { text } = await composeSlack(sb, ev, channel)
  const res = await fetch('https://slack.com/api/chat.update', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ channel: ev.slack_post_channel, ts: ev.slack_ts, text }),
  })
  const data = await res.json().catch(() => ({}))
  if (!data.ok) console.error('[process-precheck-events] Slack update error:', data.error)
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
    .is('cancelled_at', null) // 取り消した記録は処理しない
    .or('recording_status.eq.pending,draft_status.eq.pending,slack_status.eq.pending,recording_added.eq.pending')
    .order('created_at')
    .limit(20)
  if (error) return json({ error: error.message }, 500)

  const results: Array<{ id: string; ok: boolean; error?: string }> = []
  for (const ev of (events || []) as EventRow[]) {
    try {
      const recBefore = ev.recording_status
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
      // 録音が決まった（見つかった／見つからないと決まった）ら、下書きに書き足し、#事前確認 の返信も書き換える
      const recordingSettled = ev.recording_status !== 'pending'
      if (recordingSettled && ev.recording_added === 'pending') {
        try { await addRecordingToDraft(sb, ev) } catch (e) { console.error('[process-precheck-events] add recording', ev.id, e) }
      }
      if (recBefore === 'pending' && recordingSettled) await updateSlackAfterRecording(sb, ev)
      results.push({ id: ev.id, ok: true })
    } catch (e) {
      console.error('[process-precheck-events]', ev.id, e)
      results.push({ id: ev.id, ok: false, error: (e as Error).message })
    }
  }
  return json({ ok: true, processed: results })
})
