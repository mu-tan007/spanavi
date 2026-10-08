// ============================================================
// アポ取得報告を、クライアントの Slack 共有チャンネルへ「むー様の名前で・スレッドの形で」送る（2026-10-08）
// ------------------------------------------------------------
// むー様が手で出していた形をそのまま再現する：
//   親投稿：宛先のメンション（To ／ Cc.）＋【…アポ取得報告】＋社名・法人番号
//   スレッド：報告の本文（お世話になっております〜以上でございます）
// mode 'guess'：送り先のチャンネルとメンションの初期値を返す（リストに覚えた値 → 過去のむー様の親投稿 → 担当者のSlack ID）
// mode 'send' ：親投稿とスレッドを送り、アポに ts を、リストに送り先とメンションを覚える
// 呼べるのは管理者だけ。送信にはむー様の Slack の許可（SLACK_USER_TOKEN）を使う。
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const MENTION_LINE = /^(\s*(?:<@[A-Z0-9]+(?:\|[^>]*)?>|Cc\.?|CC:?)\s*)+/

async function slack(token: string, method: string, params: Record<string, string>, post = false) {
  const res = post
    ? await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(params),
    })
    : await fetch(`https://slack.com/api/${method}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` } })
  return await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))
}

const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
/** 社名の芯（株式会社などと空白を除く）。過去の親投稿の社名と照らすのに使う */
const core = (s: string) => String(s || '').replace(/株式会社|有限会社|合同会社|合資会社|合名会社|（株）|\(株\)|（有）|\(有\)|[\s　]/g, '')

type Parent = { ts: string; text: string; ch: string; chName: string; style: 'thread' | 'single' }
/**
 * 過去にむー様が出したアポ取得報告の投稿を、チャンネルごとに新しい順で集める。送り方はクライアントごとに違う（2026-10-08 むー様）
 *   thread：親投稿（メンション＋【…アポ取得報告】＋社名）を出し、本文はそのスレッドへ（レバレジーズ様など）
 *   single：メンションの後にそのまま本文（お世話になっております〜）を1投稿で（HCフィナンシャルアドバイザー様など）
 */
async function parentsIn(token: string, me: string, channel: string): Promise<Parent[]> {
  const d = await slack(token, 'search.messages', { query: `アポ in:<#${channel}> from:<@${me}>`, sort: 'timestamp', sort_dir: 'desc', count: '50' })
  const out: Parent[] = []
  for (const m of d.messages?.matches || []) {
    const t = unescape(m.text || '')
    const th = (m.permalink || '').match(/thread_ts=([\d.]+)/)?.[1]
    if (!MENTION_LINE.test(t) || (th && th !== m.ts)) continue
    const body = t.replace(MENTION_LINE, '')
    const isSingle = /^\s*お世話になっております/.test(body) && /アポイントを取得|アポ取得報告/.test(body)
    const isParent = !isSingle && /【[^】]*アポ取得報告】/.test(t)
    if (isSingle || isParent) out.push({ ts: m.ts, text: t, ch: channel, chName: m.channel?.name || '', style: isSingle ? 'single' : 'thread' })
  }
  return out
}

/** Slack の許可の範囲（x-oauth-scopes）。1枚資料の添付には files:write が要る */
async function scopesOf(token: string): Promise<string[]> {
  const res = await fetch('https://slack.com/api/auth.test', { headers: { Authorization: `Bearer ${token}` } })
  return (res.headers.get('x-oauth-scopes') || '').split(',').map(s => s.trim()).filter(Boolean)
}

/** 1枚資料（PDF）をスレッドに添付する。files.getUploadURLExternal → 本体を送る → completeUploadExternal */
async function uploadToThread(token: string, channel: string, threadTs: string, fileName: string, base64: string): Promise<string | null> {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const u = await fetch(`https://slack.com/api/files.getUploadURLExternal?${new URLSearchParams({ filename: fileName, length: String(bytes.length) })}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
  if (!u.ok) return u.error || 'getUploadURLExternal failed'
  const put = await fetch(u.upload_url, { method: 'POST', body: bytes })
  if (!put.ok) return `upload ${put.status}`
  const done = await fetch('https://slack.com/api/files.completeUploadExternal', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ files: [{ id: u.file_id, title: fileName.replace(/\.pdf$/, '') }], channel_id: channel, thread_ts: threadTs }),
  }).then(r => r.json())
  return done.ok ? null : (done.error || 'completeUploadExternal failed')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) return json({ error: 'ログインが切れています。開き直してください' }, 401)
    const sb = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: me } = await sb.from('users').select('role, org_id').eq('id', userData.user.id).maybeSingle()
    if (me?.role !== 'admin') return json({ error: '管理者だけが送信できます' }, 403)
    const token = Deno.env.get('SLACK_USER_TOKEN')?.trim()
    if (!token) return json({ error: 'Slackの許可（篠宮の名前で送信）がまだです' }, 400)

    const body = await req.json().catch(() => ({}))
    const { data: appo } = await sb.from('appointments')
      .select('id, org_id, company_name, client_id, list_id, item_id, report_slack_ts')
      .eq('id', body.appointment_id || '').maybeSingle()
    if (!appo || appo.org_id !== me.org_id) return json({ error: 'アポが見つかりません' }, 404)
    const { data: client } = await sb.from('clients').select('slack_channel_ids').eq('id', appo.client_id).maybeSingle()
    const { data: list } = appo.list_id
      ? await sb.from('call_lists').select('report_slack_channel, report_slack_mentions, contact_ids, contact_id').eq('id', appo.list_id).maybeSingle()
      : { data: null }
    const channels: string[] = client?.slack_channel_ids || []

    if (body.mode === 'guess') {
      const auth = await slack(token, 'auth.test', {})
      const found = (await Promise.all(channels.map(ch => parentsIn(token, auth.user_id, ch)))).flat()
        .sort((a, b) => Number(b.ts) - Number(a.ts))
      // チャンネル名（選択肢に出す）。検索結果の名前 → 取れなければ conversations.info
      const named = await Promise.all(channels.map(async (id) => {
        const hit = found.find(f => f.ch === id && f.chName)
        if (hit) return { id, name: hit.chName }
        const d = await slack(token, 'conversations.info', { channel: id })
        return { id, name: d.channel?.name || id }
      }))
      let channel = list?.report_slack_channel || ''
      let mentions = list?.report_slack_mentions || ''
      let source = mentions ? 'list' : ''
      // どの親投稿に倣うか：同じリストの過去のアポを出した親投稿 → リストに覚えたチャンネルの最新 → 全体の最新
      // （レバレジーズ様のように、チームごとにチャンネルと宛先が違うクライアントがある）
      const { data: siblings } = appo.list_id
        ? await sb.from('appointments').select('company_name').eq('list_id', appo.list_id).neq('id', appo.id).order('created_at', { ascending: false }).limit(60)
        : { data: [] }
      const names = [...new Set((siblings || []).map(x => core(x.company_name)).filter(n => n.length >= 2))]
      const best = found.find(f => names.some(n => core(f.text).includes(n)))
        || (channel ? found.find(f => f.ch === channel) : undefined)
        || (list?.report_slack_channel ? undefined : found[0])
        || null
      let header = ''
      if (best) {
        header = (best.text.split('\n').find(l => /【[^】]*アポ取得報告】/.test(l)) || '').trim()
        if (!mentions) {
          mentions = (best.text.match(MENTION_LINE)?.[0] || '').replace(/<@([A-Z0-9]+)\|[^>]*>/g, '<@$1>').trim()
          source = 'past'
        }
        if (!channel) channel = best.ch
      }
      if (!mentions) {
        const ids: string[] = list?.contact_ids?.length ? list.contact_ids : (list?.contact_id ? [list.contact_id] : [])
        const q = sb.from('client_contacts').select('slack_member_id, is_primary').eq('client_id', appo.client_id)
        const cs = (ids.length ? (await q.in('id', ids)).data : (await q).data) || []
        mentions = cs.filter(c => (c.slack_member_id || '').trim()).map(c => `<@${c.slack_member_id.trim()}>`).join(' ')
        if (mentions) source = 'contacts'
      }
      if (!channel) channel = channels[0] || ''
      const corp = appo.item_id ? (await sb.from('call_list_items').select('corporate_number').eq('id', appo.item_id).maybeSingle()).data?.corporate_number : null
      return json({
        channels: named, channel, mentions, source,
        header: header || '【M&A売り手ソーシング アポ取得報告】',
        title: `${appo.company_name || ''}${corp ? `　${corp}` : ''}`,
        // 過去の投稿が見つかった＝むー様が自分の名前で送っているクライアント。送り方もその投稿に合わせる
        threadStyle: !!best,
        style: best?.style || null,
        // 1枚資料をスレッドに添付できるか（むー様の Slack の許可に files:write があるか）
        canAttach: (await scopesOf(token)).includes('files:write'),
      })
    }

    if (body.mode === 'send') {
      const channel = String(body.channel || '').trim()
      const parent = String(body.parent || '').trim()
      const text = String(body.text || '').trim()
      if (!channels.includes(channel)) return json({ error: 'このクライアントのチャンネルではありません' }, 400)
      if (appo.report_slack_ts && !body.force) return json({ error: 'このアポの報告はすでにSlackへ送っています' }, 409)
      if (body.style === 'single') {
        // メンションの後にそのまま本文を1投稿で送る（HCフィナンシャルアドバイザー様の形）
        const mentions = String(body.mentions || '').trim()
        if (!channel || !text) return json({ error: '送り先・本文のどちらかが空です' }, 400)
        const p = await slack(token, 'chat.postMessage', { channel, text: [mentions, text].filter(Boolean).join('\n'), unfurl_links: 'false' } as Record<string, string>, true)
        if (!p.ok) return json({ error: `Slackへの送信に失敗しました（${p.error}）` }, 502)
        await sb.from('appointments').update({ report_slack_channel: channel, report_slack_ts: p.ts, report_slack_mentions: mentions || null }).eq('id', appo.id)
        if (appo.list_id) await sb.from('call_lists').update({ report_slack_channel: channel, report_slack_mentions: mentions || null }).eq('id', appo.list_id)
        if (body.file?.base64 && body.file?.name) {
          const upErr = await uploadToThread(token, channel, p.ts, String(body.file.name), String(body.file.base64))
          if (upErr) return json({ ok: true, ts: p.ts, attachError: `本文は送れましたが、1枚資料を添付できませんでした（${upErr}）。Slackのスレッドに手で添付してください` })
        }
        return json({ ok: true, ts: p.ts })
      }
      if (!channel || !parent || !text) return json({ error: '送り先・親投稿・本文のどれかが空です' }, 400)
      const p = await slack(token, 'chat.postMessage', { channel, text: parent, unfurl_links: 'false' } as Record<string, string>, true)
      if (!p.ok) return json({ error: `Slackへの送信に失敗しました（${p.error}）` }, 502)
      const r = await slack(token, 'chat.postMessage', { channel, thread_ts: p.ts, text, unfurl_links: 'false' } as Record<string, string>, true)
      const mentions = (parent.match(MENTION_LINE)?.[0] || '').trim()
      await sb.from('appointments').update({ report_slack_channel: channel, report_slack_ts: p.ts, report_slack_mentions: mentions || null }).eq('id', appo.id)
      if (appo.list_id) await sb.from('call_lists').update({ report_slack_channel: channel, report_slack_mentions: mentions || null }).eq('id', appo.list_id)
      if (!r.ok) return json({ error: `親投稿は送れましたが、スレッドの本文が送れませんでした（${r.error}）。Slackで本文を貼ってください`, partial: true, ts: p.ts }, 502)
      // 面談前の1枚資料をスレッドに添付（本文の下に付く）
      if (body.file?.base64 && body.file?.name) {
        const upErr = await uploadToThread(token, channel, p.ts, String(body.file.name), String(body.file.base64))
        if (upErr) return json({ ok: true, ts: p.ts, attachError: `本文は送れましたが、1枚資料を添付できませんでした（${upErr}）。Slackのスレッドに手で添付してください` })
      }
      return json({ ok: true, ts: p.ts })
    }
    return json({ error: 'mode が不正です' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
