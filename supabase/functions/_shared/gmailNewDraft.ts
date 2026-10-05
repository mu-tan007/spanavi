// ============================================================
// Gmail に「新しいメール」の下書きを作る（周回報告用・2026-10-05）
// ------------------------------------------------------------
// 許可は事前確認と同じ google_oauth_tokens（name='gmail_precheck'・gmail.modify）を使う。
// 宛先は、そのクライアント様へむー様が直近に出したアポ取得報告メールの To・Cc をそのまま使う。
// 送信はしない（むー様が Gmail で確かめて送る）。
// ============================================================

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GOOGLE_CLIENT_ID = '570031099308-ni4qokds1jc1m5s0p080t6g2gb3vu8md.apps.googleusercontent.com'
const FROM_EMAIL = 'shinomiya@ma-sp.co'
const FROM_NAME = '篠宮拓武'

export async function getGmailToken(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.from('google_oauth_tokens').select('refresh_token').eq('name', 'gmail_precheck').maybeSingle()
  if (!data?.refresh_token) throw new Error('Gmailの下書き作成の許可がまだです')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
      grant_type: 'refresh_token', refresh_token: data.refresh_token,
    }),
  })
  const t = await res.json()
  if (!t.access_token) throw new Error('Googleの認証に失敗しました（許可のやり直しが必要かもしれません）')
  return t.access_token
}

async function gmail(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Gmail ${path.split('?')[0]}: ${data?.error?.message || res.status}`)
  return data
}

function b64urlDecode(s: string): string {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return decodeURIComponent(Array.from(b, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''))
}
function b64urlEncode(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const mimeWord = (s: string) => `=?UTF-8?B?${btoa(unescape(encodeURIComponent(s)))}?=`
const wrap76 = (b64: string) => (b64.match(/.{1,76}/g) || []).join('\r\n')
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// deno-lint-ignore no-explicit-any
function header(msg: any, name: string): string {
  const h = (msg.payload?.headers || []).find((x: { name: string }) => x.name.toLowerCase() === name.toLowerCase())
  return h?.value || ''
}
// deno-lint-ignore no-explicit-any
function plainBody(part: any): string {
  if (!part) return ''
  if (part.mimeType === 'text/plain' && part.body?.data) return b64urlDecode(part.body.data)
  for (const p of part.parts || []) { const t = plainBody(p); if (t) return t }
  if (part.mimeType === 'text/html' && part.body?.data) {
    return b64urlDecode(part.body.data).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
  }
  return ''
}
const isMe = (addr: string) => addr.toLowerCase().includes(FROM_EMAIL)
const addresses = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean)

/** 社名から（株）などを外して検索語にする */
function coreCompanyName(name: string): string {
  return (name || '').replace(/株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|医療法人|社会福祉法人|（株）|\(株\)|（有）|\(有\)/g, '').replace(/[\s　]/g, '').trim()
}

export interface MailTarget { to: string; cc: string[]; greeting: string; threadSubject: string }

/**
 * 宛先を探す：アポ先の社名（新しい順に最大5社）で、むー様が送ったアポ取得報告メールを探し、
 * 見つかった最初のメール（むー様の送信分）の To・Cc と、1行目の宛名（「高野様」）を返す。
 */
export async function findMailTarget(token: string, companyNames: string[]): Promise<MailTarget | null> {
  for (const name of companyNames.slice(0, 5)) {
    const core = coreCompanyName(name)
    if (!core) continue
    const q = `in:sent (subject:アポイント取得 OR subject:アポ取得) "${core}"`
    const list = await gmail(token, `threads?maxResults=3&q=${encodeURIComponent(q)}`)
    for (const t of list.threads || []) {
      const th = await gmail(token, `threads/${t.id}?format=full`)
      // deno-lint-ignore no-explicit-any
      const mine = (th.messages || []).filter((m: any) => isMe(header(m, 'From')))
      const first = mine[0]
      if (!first || !header(first, 'To')) continue
      const firstLine = plainBody(first.payload).split('\n').map((l: string) => l.trim()).find(Boolean) || ''
      const greeting = firstLine.match(/^(.+?)[\s　]*様$/)?.[1] || ''
      return {
        to: header(first, 'To'),
        cc: addresses(header(first, 'Cc')).filter(a => !isMe(a)),
        greeting: /[一-龯々ぁ-んァ-ヶ]/.test(greeting) && greeting.length <= 12 ? greeting : '',
        threadSubject: header(first, 'Subject'),
      }
    }
  }
  return null
}

/** 新しいメールの下書きを作る。戻り値は Gmail の下書きID */
export async function createNewDraft(token: string, t: { to: string; cc: string[]; subject: string; body: string }): Promise<string> {
  const html = `<div dir="ltr">${escapeHtml(t.body).replace(/\n/g, '<br>')}</div>`
  const boundary = `b_${crypto.randomUUID()}`
  const lines = [
    `From: ${mimeWord(FROM_NAME)} <${FROM_EMAIL}>`,
    `To: ${t.to}`,
    ...(t.cc.length ? [`Cc: ${t.cc.join(', ')}`] : []),
    `Subject: ${mimeWord(t.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(btoa(unescape(encodeURIComponent(t.body)))),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(btoa(unescape(encodeURIComponent(html)))),
    `--${boundary}--`,
  ]
  const draft = await gmail(token, 'drafts', { method: 'POST', body: JSON.stringify({ message: { raw: b64urlEncode(lines.join('\r\n')) } }) })
  return draft.id
}

