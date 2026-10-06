// ============================================================
// 顧客管理の「最後のやり取り」を自動で新しくする（2026-10-06）
// ------------------------------------------------------------
// 1時間ごとに、各クライアントの
//   ・Gmail（担当者のアドレス・会社のドメインとのやり取り）
//   ・Slack（clients.slack_channel_ids のチャンネル）
// の最新の1件を見て、顧客管理に入っている日付より新しければ書き換える。
// 中身の一言は Haiku で作る（新しいやり取りがあった会社だけ）。
// LINE・Chatwork・XのDM・Facebook は読めないので、手で入れた値はそのまま残る
// （自動で見つけたものが、手で入れた日付より新しいときだけ上書きする）。
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getGmailToken } from '../_shared/gmailNewDraft.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DEMO_ORG_PREFIX = 'b0000000'
const SELF_NAMES = ['M&Aソーシングパートナーズ株式会社', 'Spartia株式会社']
const OUR_DOMAINS = ['ma-sp.co', 'spartia']
const FREE_MAIL = ['gmail.com', 'yahoo.co.jp', 'icloud.com', 'me.com', 'outlook.jp', 'outlook.com', 'hotmail.com', 'hotmail.co.jp', 'live.jp', 'docomo.ne.jp', 'ezweb.ne.jp', 'softbank.ne.jp', 'i.softbank.jp', 'nifty.com', 'ybb.ne.jp']
const LOOKBACK_DAYS = 30
const HAIKU = 'claude-haiku-4-5-20251001'

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

interface Found { at: string; day: string; channel: string; from: '先方' | '弊社'; ref: string; text: string }

const jstDay = (ms: number) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10)
const isOurs = (s: string) => OUR_DOMAINS.some(d => s.toLowerCase().includes(d))

// ── Gmail ─────────────────────────────────────────────────
async function gmailGet(token: string, path: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Gmail ${path.split('?')[0]}: ${data?.error?.message || res.status}`)
  return data
}

/** 担当者のアドレスから検索語を作る。フリーメールはアドレスそのもの、会社のドメインはドメインで */
function mailTerms(addrs: string[]): string[] {
  const out = new Set<string>()
  for (const raw of addrs) {
    const a = (raw || '').trim().toLowerCase()
    const m = a.match(/^[^@\s]+@([^@\s]+\.[a-z.]+)$/)
    if (!m) continue
    const domain = m[1]
    if (isOurs(domain)) continue
    out.add(FREE_MAIL.includes(domain) ? a : domain)
  }
  return [...out]
}

async function latestMail(token: string, terms: string[]): Promise<Found | null> {
  if (terms.length === 0) return null
  const or = terms.flatMap(t => [`from:${t}`, `to:${t}`, `cc:${t}`]).join(' OR ')
  const q = `{${or}} newer_than:${LOOKBACK_DAYS}d -in:draft -in:chats`
  const list = await gmailGet(token, `messages?maxResults=1&q=${encodeURIComponent(q)}`)
  const id = list.messages?.[0]?.id
  if (!id) return null
  const msg = await gmailGet(token, `messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`)
  // deno-lint-ignore no-explicit-any
  const hd = (m: any, n: string) => (m.payload?.headers || []).find((x: { name: string }) => x.name.toLowerCase() === n.toLowerCase())?.value || ''
  const at = Number(msg.internalDate)
  // 先方の返事にこちらがすぐ返信していると、最新の1通は弊社の返信になる。
  // 中身は「同じやり取りの直近3通」から作り、先方が何と答えたかを落とさない
  let text = `件名：${hd(msg, 'Subject')}\n[${isOurs(hd(msg, 'From')) ? '弊社' : '先方'}] ${msg.snippet || ''}`
  try {
    const th = await gmailGet(token, `threads/${msg.threadId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`)
    // deno-lint-ignore no-explicit-any
    const last = (th.messages || []).filter((m: any) => !(m.labelIds || []).includes('DRAFT')).slice(-3)
    if (last.length) {
      // deno-lint-ignore no-explicit-any
      text = `件名：${hd(msg, 'Subject')}\n` + last.map((m: any) =>
        `[${isOurs(hd(m, 'From')) ? '弊社' : '先方'} ${jstDay(Number(m.internalDate))}] ${m.snippet || ''}`).join('\n')
    }
  } catch { /* スレッドが読めなければ最新の1通だけで作る */ }
  return {
    at: new Date(at).toISOString(), day: jstDay(at), channel: 'メール',
    from: isOurs(hd(msg, 'From')) ? '弊社' : '先方', ref: `gmail:${id}`, text,
  }
}

// ── Slack ─────────────────────────────────────────────────
async function slackGet(method: string, params: Record<string, string>, token: string) {
  const res = await fetch(`https://slack.com/api/${method}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` } })
  return await res.json()
}

// むー様の Slack の許可（SLACK_USER_TOKEN）には履歴を読む権限が無く、検索（search:read）だけある。
// そのため各チャンネルの最新の投稿は検索で取る（新しい順に1件）
async function latestSlack(token: string, channels: string[], ourTeam: string): Promise<Found | null> {
  let best: Found | null = null
  for (const ch of channels) {
    const h = await slackGet('search.messages', { query: `in:<#${ch}>`, sort: 'timestamp', sort_dir: 'desc', count: '1' }, token)
    if (!h.ok) throw new Error(`Slack ${ch}: ${h.error}`)
    const m = h.messages?.matches?.[0]
    if (!m) continue
    const at = Math.round(Number(m.ts) * 1000)
    if (Date.now() - at > LOOKBACK_DAYS * 86400000) continue
    // 共有チャンネルでは、相手の会社の人の投稿は team が弊社と違う。ボット（アポ報告など）は弊社
    const theirs = !m.bot_id && m.team && ourTeam && m.team !== ourTeam
    const f: Found = {
      at: new Date(at).toISOString(), day: jstDay(at), channel: 'Slack',
      from: theirs ? '先方' : '弊社', ref: `slack:${ch}:${m.ts}`,
      text: `本文：${String(m.text || '').slice(0, 600)}`,
    }
    if (!best || f.at > best.at) best = f
  }
  return best
}

// ── 中身の一言（Haiku） ───────────────────────────────────
async function summarize(company: string, f: Found): Promise<string> {
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return ''
  const prompt = `M&Aの営業代行会社（弊社）と、クライアント「${company}」の最新のやり取りです。
顧客管理の一覧に出す「中身」を、40字以内の日本語で1つだけ書いてください。
・誰が何をしたかが分かるように（例：「新しいリスト（建設300社）を受領」「9月分の請求書を送付」「アポ1件のキャンセル依頼」）
・複数のメールがあるときは、先方が何と答えたか（了承・見送り・検討中・日程など）を優先して書く（例：「再開の打診に先方は社内検討と回答」）
・名詞で終える。「です・ます」や挨拶、前置きは書かない
・個人のメールアドレス、電話番号、パスワード、URLは書かない

手段：${f.channel}（${f.from}から）
${f.text}`
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: HAIKU, max_tokens: 120, messages: [{ role: 'user', content: prompt }] }),
  })
  const data = await res.json().catch(() => ({}))
  const t = String(data?.content?.[0]?.text || '').trim().split('\n')[0]
  return t.replace(/^[「『"]|[」』"]$/g, '').slice(0, 60)
}

// ── 本体 ──────────────────────────────────────────────────
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]) }))
}

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}))
  const dryRun = !!body.dry_run
  const only: string | undefined = body.client_id
  // resummarize：取り込み済みのものも中身を作り直す（作り方を変えたとき用）
  const resummarize = !!body.resummarize
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  let q = sb.from('clients').select('id,name,org_id,status,contact_email,client_email,slack_channel_ids,last_contact_at,last_contact_ref')
  if (only) q = q.eq('id', only)
  const { data: clients, error } = await q
  if (error) return json({ error: error.message }, 500)
  const targets = (clients || []).filter(c => !String(c.org_id).startsWith(DEMO_ORG_PREFIX) && !SELF_NAMES.includes(c.name))

  const { data: contacts } = await sb.from('client_contacts').select('client_id,email').in('client_id', targets.map(c => c.id))
  const mailsBy = new Map<string, string[]>()
  for (const ct of contacts || []) if (ct.email) mailsBy.set(ct.client_id, [...(mailsBy.get(ct.client_id) || []), ct.email])

  const gToken = await getGmailToken(sb).catch(() => '')
  const sToken = Deno.env.get('SLACK_USER_TOKEN')?.trim() || ''
  const ourTeam = sToken ? (await slackGet('auth.test', {}, sToken)).team_id || '' : ''

  const updated: unknown[] = []
  const errors: string[] = []
  await pool(targets, 6, async (c) => {
    try {
      const terms = mailTerms([...(mailsBy.get(c.id) || []), c.contact_email, c.client_email].filter(Boolean))
      const [m, s] = await Promise.all([
        gToken ? latestMail(gToken, terms) : null,
        sToken && c.slack_channel_ids?.length ? latestSlack(sToken, c.slack_channel_ids, ourTeam) : null,
      ])
      const f = [m, s].filter(Boolean).sort((a, b) => (a!.at < b!.at ? 1 : -1))[0] as Found | undefined
      if (!f) return
      if (f.ref === c.last_contact_ref && !resummarize) return   // もう取り込み済み
      if (c.last_contact_at && f.day < c.last_contact_at) return  // 手で入れた（LINEなど）方が新しい
      const summary = dryRun ? '' : await summarize(c.name, f)
      const patch = {
        last_contact_at: f.day, last_contact_channel: f.channel, last_contact_from: f.from,
        last_contact_summary: summary || null, last_contact_ref: f.ref,
      }
      updated.push({ name: c.name, ...patch })
      if (!dryRun) {
        const { error: e } = await sb.from('clients').update(patch).eq('id', c.id)
        if (e) errors.push(`${c.name}: ${e.message}`)
      }
    } catch (e) {
      errors.push(`${c.name}: ${(e as Error).message}`)
    }
  })
  return json({ checked: targets.length, updated: updated.length, dry_run: dryRun, items: updated, errors })
})
