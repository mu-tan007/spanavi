// ============================================================
// 事前確認の報告を、Slack のアポ取得報告のスレッドへ「むー様の名前で」送る
// ------------------------------------------------------------
// 事前確認タブの「送信待ち」で、むー様が文面を確かめて「送信」を押したときだけ呼ばれる。
// 呼べるのは管理者（public.users.role='admin'）だけ。送信にはむー様の Slack の許可（SLACK_USER_TOKEN）を使う。
// 宛先・スレッドは process-precheck-events が探して precheck_events に入れたもの。
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) return json({ error: 'ログインが切れています。開き直してください' }, 401)

    const sb = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: me } = await sb.from('users').select('role, org_id').eq('id', userData.user.id).maybeSingle()
    if (me?.role !== 'admin') return json({ error: '管理者だけが送信できます' }, 403)

    const { event_id, text } = await req.json().catch(() => ({}))
    if (!event_id || !String(text || '').trim()) return json({ error: '送る文面がありません' }, 400)

    const { data: ev } = await sb.from('precheck_events')
      .select('id, org_id, draft_status, slack_reply_channel, slack_reply_ts, slack_reply_mentions')
      .eq('id', event_id).maybeSingle()
    if (!ev || ev.org_id !== me.org_id) return json({ error: '記録が見つかりません' }, 404)
    if (ev.draft_status === 'sent') return json({ error: 'すでに送信済みです' }, 409)
    if (!ev.slack_reply_channel || !ev.slack_reply_ts) return json({ error: '返信先のスレッドが見つかっていません' }, 400)

    const token = Deno.env.get('SLACK_USER_TOKEN')?.trim()
    if (!token) return json({ error: 'Slackの許可（むー様の名前で送信）がまだです' }, 400)

    const body = [ev.slack_reply_mentions, String(text).trim()].filter(Boolean).join('\n')
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel: ev.slack_reply_channel, thread_ts: ev.slack_reply_ts, text: body, unfurl_links: false }),
    })
    const data = await res.json().catch(() => ({}))
    if (!data.ok) return json({ error: `Slackへの送信に失敗しました（${data.error || res.status}）` }, 502)

    await sb.from('precheck_events').update({ draft_status: 'sent', draft_sent_at: new Date().toISOString(), draft_text: String(text).trim() }).eq('id', ev.id)
    return json({ ok: true, ts: data.ts })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
