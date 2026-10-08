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

/** 過去にむー様が出した親投稿（メンションで始まり【…アポ取得報告】を含む）を、チャンネルごとに新しい順で探す */
async function lastParent(token: string, me: string, channel: string) {
  const d = await slack(token, 'search.messages', { query: `アポ取得報告 in:<#${channel}> from:<@${me}>`, sort: 'timestamp', sort_dir: 'desc', count: '20' })
  // deno-lint-ignore no-explicit-any
  return (d.messages?.matches || []).find((m: any) => {
    const t = m.text || ''
    const th = (m.permalink || '').match(/thread_ts=([\d.]+)/)?.[1]
    return MENTION_LINE.test(t) && /【[^】]*アポ取得報告】/.test(t) && (!th || th === m.ts)
  }) || null
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
      // チャンネル名（選択肢に出す）
      const named = await Promise.all(channels.map(async (id) => {
        const d = await slack(token, 'conversations.info', { channel: id })
        return { id, name: d.channel?.name || id }
      }))
      let channel = list?.report_slack_channel || ''
      let mentions = list?.report_slack_mentions || ''
      let header = ''
      let source = mentions ? 'list' : ''
      // 過去の親投稿から：リストに覚えたチャンネル → 登録済みの全チャンネルの順で、いちばん新しいもの
      const order = [...new Set([channel, ...channels].filter(Boolean))]
      // deno-lint-ignore no-explicit-any
      let best: any = null
      for (const ch of order) {
        const hit = await lastParent(token, auth.user_id, ch)
        if (hit && (!best || Number(hit.ts) > Number(best.ts))) best = { ...hit, ch }
        if (hit && ch === channel) break
      }
      if (best) {
        const lines = String(best.text || '').split('\n')
        header = (lines.find((l: string) => /【[^】]*アポ取得報告】/.test(l)) || '').trim()
        if (!mentions) {
          mentions = (String(best.text).match(MENTION_LINE)?.[0] || '').replace(/<@([A-Z0-9]+)\|[^>]*>/g, '<@$1>').trim()
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
        // 過去の親投稿が見つかった＝むー様がスレッドの形で送っているクライアント
        threadStyle: !!best,
      })
    }

    if (body.mode === 'send') {
      const channel = String(body.channel || '').trim()
      const parent = String(body.parent || '').trim()
      const text = String(body.text || '').trim()
      if (!channel || !parent || !text) return json({ error: '送り先・親投稿・本文のどれかが空です' }, 400)
      if (!channels.includes(channel)) return json({ error: 'このクライアントのチャンネルではありません' }, 400)
      if (appo.report_slack_ts && !body.force) return json({ error: 'このアポの報告はすでにSlackへ送っています' }, 409)
      const p = await slack(token, 'chat.postMessage', { channel, text: parent, unfurl_links: 'false' } as Record<string, string>, true)
      if (!p.ok) return json({ error: `Slackへの送信に失敗しました（${p.error}）` }, 502)
      const r = await slack(token, 'chat.postMessage', { channel, thread_ts: p.ts, text, unfurl_links: 'false' } as Record<string, string>, true)
      const mentions = (parent.match(MENTION_LINE)?.[0] || '').trim()
      await sb.from('appointments').update({ report_slack_channel: channel, report_slack_ts: p.ts, report_slack_mentions: mentions || null }).eq('id', appo.id)
      if (appo.list_id) await sb.from('call_lists').update({ report_slack_channel: channel, report_slack_mentions: mentions || null }).eq('id', appo.list_id)
      if (!r.ok) return json({ error: `親投稿は送れましたが、スレッドの本文が送れませんでした（${r.error}）。Slackで本文を貼ってください`, partial: true, ts: p.ts }, 502)
      return json({ ok: true, ts: p.ts })
    }
    return json({ error: 'mode が不正です' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
