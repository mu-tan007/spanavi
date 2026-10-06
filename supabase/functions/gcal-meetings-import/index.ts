// ============================================================
// むー様のGoogleカレンダーから、クライアントとの面談を予定（client_actions・面談）に取り込む（2026-10-06）
// ------------------------------------------------------------
// 対象：今日の前日〜60日先、時刻のある予定。
// 会社の決め方（どちらかで1社に決まったときだけ取り込む）：
//   1. 題名に会社名（株式会社などを外した名前）が入っている
//   2. 題名の「〇〇様／〇〇さん」が、顧客管理の担当者の名字と1社だけ一致する
// 決まらないもの（様・さん・【訪問】【会食】付きで会社らしいもの）は calendar_import_unmatched に入れ、
// むー様が画面で会社を選んで取り込む。ジム・病院など会社と結びつかない予定は何もしない。
// 種類：再キックオフ / キックオフ・KO / 2回目・検討 / 定例・定期 / 提案・紹介・デモ /
//       それ以外（売り手・買い手・会食など）は、その会社の初回面談の記録があれば検討面談、なければ初回面談。
// カレンダーで消えた予定は、まだ済んでいなければ予定からも消す。
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GOOGLE_CLIENT_ID = '570031099308-ni4qokds1jc1m5s0p080t6g2gb3vu8md.apps.googleusercontent.com'
const DEMO_ORG_PREFIX = 'b0000000'
const SELF_NAMES = ['M&Aソーシングパートナーズ株式会社', 'Spartia株式会社']
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

async function accessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: Deno.env.get('GOOGLE_REFRESH_TOKEN') || '', client_id: GOOGLE_CLIENT_ID, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '' }),
  })
  const t = await res.json()
  if (!t.access_token) throw new Error('Googleの認証に失敗しました')
  return t.access_token
}

// 全角・半角、中黒、空白、法人格の違いをならす
const norm = (s: string) => (s || '').normalize('NFKC').toLowerCase()
  .replace(/株式会社|有限会社|合同会社|一般社団法人|医療法人|社会福祉法人|\(株\)|\(有\)/g, '')
  .replace(/[\s・･\-ー－\.,、。()（）「」【】]/g, '')

function kindOf(title: string): string | null {
  const t = title.normalize('NFKC')
  if (/再キックオフ|再KO/i.test(t)) return '再キックオフ'
  if (/キックオフ|\bKO\b/i.test(t)) return 'キックオフ'
  if (/[2２二3３]回目|検討/.test(t)) return '検討面談'
  if (/定例|定期/.test(t)) return '定例'
  // 「紹介」はご紹介（〇〇紹介）の意味が多いので見ない
  if (/提案|デモ|Phalanx/i.test(t)) return '追加提案'
  return null   // 売り手・買い手・会食・訪問など → 初回か検討かを記録から決める
}

const jst = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString()
  return { day: d.slice(0, 10), time: d.slice(11, 16) }
}

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}))
  const dryRun = !!body.dry_run
  const days = Number(body.days) || 60
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // 会社と担当者
  const { data: clients } = await sb.from('clients').select('id,name,org_id,status')
  const targets = (clients || []).filter(c => !String(c.org_id).startsWith(DEMO_ORG_PREFIX) && !SELF_NAMES.includes(c.name))
  const orgId = targets[0]?.org_id
  const names = targets.map(c => ({ c, n: norm(c.name) })).filter(x => x.n)
  const { data: contacts } = await sb.from('client_contacts').select('client_id,name').in('client_id', targets.map(c => c.id))
  const bySurname = new Map<string, Set<string>>()
  for (const ct of contacts || []) {
    const full = (ct.name || '').normalize('NFKC').replace(/[\s様]/g, '')
    for (let k = 1; k <= Math.min(3, full.length - 1); k++) {   // 名字の候補（先頭1〜3文字）
      const s = full.slice(0, k)
      if (!bySurname.has(s)) bySurname.set(s, new Set())
      bySurname.get(s)!.add(ct.client_id)
    }
  }
  const { data: firstMeet } = await sb.from('client_meetings').select('client_id').eq('title', '初回面談')
    .or('summary.neq.,transcript.neq.')
  const hadFirst = new Set((firstMeet || []).map(m => m.client_id))

  // カレンダー
  const token = await accessToken()
  const cal = Deno.env.get('GOOGLE_CALENDAR_ID') || 'primary'
  const now = Date.now()
  const timeMin = new Date(now - 86400000).toISOString()
  const timeMax = new Date(now + days * 86400000).toISOString()
  const q = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '500' })
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events?${q}`, { headers: { Authorization: `Bearer ${token}` } })
  const ev = await r.json()
  if (!r.ok) return json({ error: ev.error?.message || r.status }, 500)

  // すでに取り込んだ予定（画面で会社を選んで取り込んだものも含む）は、その会社のまま扱う
  const { data: existing } = await sb.from('client_actions').select('id,gcal_event_id,client_id').not('gcal_event_id', 'is', null)
  const exMap = new Map((existing || []).map(x => [x.gcal_event_id, x]))

  const matched: { event_id: string; client_id: string; name: string; kind: string; day: string; time: string; title: string }[] = []
  const unmatched: { event_id: string; title: string; starts_at: string; reason: string }[] = []
  // deno-lint-ignore no-explicit-any
  for (const e of (ev.items || []) as any[]) {
    if (e.status === 'cancelled' || !e.start?.dateTime) continue          // 終日の予定（メモ代わり）は見ない
    const title = String(e.summary || '')
    if (/^【[^】]*[都道府県]】/.test(title) || /timerex/i.test(e.organizer?.email || '')) continue   // クライアント様のアポ
    const nt = norm(title)
    const tokens = title.normalize('NFKC').split(/[\s　]+/).map(norm).filter(Boolean)
    // 1. 会社名
    let hits = names.filter(x => (x.n.length >= 3 && nt.includes(x.n)) || tokens.includes(x.n))
    // 同じ会社名の中で一番長く一致したものだけ残す（「ユニヴ」と「ユニヴィス」など）
    if (hits.length > 1) {
      const longest = Math.max(...hits.map(h => h.n.length))
      hits = hits.filter(h => h.n.length === longest)
    }
    let clientId = hits.length === 1 ? hits[0].c.id : ''
    let reason = hits.length > 1 ? `会社が${hits.length}社当てはまる` : ''
    // 0. 取り込み済み（手で会社を選んだものを含む）
    if (exMap.has(e.id)) { clientId = exMap.get(e.id)!.client_id; reason = '' }
    // 2. 担当者の名字
    if (!clientId && !reason) {
      // 名字で結びつけるのは「〇〇様」だけ（「〇〇さん」は社内の人が多い）
      const sm = title.normalize('NFKC').match(/([^\s　【】()（）_]{1,4}?)様/)
      if (sm) {
        const set = bySurname.get(sm[1])
        if (set?.size === 1) clientId = [...set][0]
        else if (set && set.size > 1) reason = `「${sm[1]}」様が${set.size}社にいる`
        else reason = `「${sm[1]}」様が顧客管理の担当者にいない`
      }
    }
    const looksBusiness = /様|【訪問】|【会食】|売り|買い|キックオフ|面談/.test(title)
    if (!clientId) {
      if (looksBusiness && !/週次MTG|チームリーダー|就活|面接/.test(title)) unmatched.push({ event_id: e.id, title, starts_at: e.start.dateTime, reason: reason || '会社が見つからない' })
      continue
    }
    const c = targets.find(x => x.id === clientId)
    if (!c) continue
    const { day, time } = jst(e.start.dateTime)
    // 種類の言葉が無いとき：契約済み（支援中・準備中）なら定例、初回面談の記録があれば検討面談、なければ初回面談
    const kind = kindOf(title) || (['支援中', '準備中'].includes(c.status) ? '定例' : hadFirst.has(clientId) ? '検討面談' : '初回面談')
    matched.push({ event_id: e.id, client_id: clientId, name: c.name, kind, day, time, title })
  }

  if (!dryRun) {
    // 取り込み（同じ予定は日時だけ新しくする。種類は最初に決めたものを残す＝画面で直した種類を消さない）
    for (const m of matched) {
      const ex = exMap.get(m.event_id)
      if (ex) {
        await sb.from('client_actions').update({ due: m.day, at_time: m.time, client_id: m.client_id }).eq('id', ex.id)
      } else {
        await sb.from('client_actions').insert({
          org_id: orgId, client_id: m.client_id, category: '面談', kind: m.kind, note: m.title,
          owner: '当方', due: m.day, at_time: m.time, gcal_event_id: m.event_id,
        })
      }
    }
    // 日付が過ぎた面談は「済み」にする（議事録は議事録タブで残す）
    const todayJst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
    await sb.from('client_actions').update({ done_at: new Date().toISOString() })
      .eq('category', '面談').is('done_at', null).lt('due', todayJst)
    // カレンダーから消えた予定（取り込み範囲の中で、まだ済んでいないもの）は消す
    const seen = new Set(matched.map(m => m.event_id))
    const { data: inRange } = await sb.from('client_actions').select('id,gcal_event_id,due')
      .not('gcal_event_id', 'is', null).is('done_at', null)
      .gte('due', timeMin.slice(0, 10)).lte('due', timeMax.slice(0, 10))
    for (const a of inRange || []) if (!seen.has(a.gcal_event_id)) await sb.from('client_actions').delete().eq('id', a.id)
    // 取り込めなかった予定（むー様が「無視」にしたものは残す）
    for (const u of unmatched) {
      await sb.from('calendar_import_unmatched').upsert({ ...u, org_id: orgId }, { onConflict: 'event_id', ignoreDuplicates: false })
    }
    const ids = new Set(unmatched.map(u => u.event_id))
    const { data: oldUn } = await sb.from('calendar_import_unmatched').select('event_id,starts_at').gte('starts_at', timeMin)
    for (const o of oldUn || []) if (!ids.has(o.event_id)) await sb.from('calendar_import_unmatched').delete().eq('event_id', o.event_id)
  }
  return json({ dry_run: dryRun, matched, unmatched })
})
