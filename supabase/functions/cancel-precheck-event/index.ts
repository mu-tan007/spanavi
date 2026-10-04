// ============================================================
// 事前確認の記録を取り消す
// ------------------------------------------------------------
// 架電ページの「事前確認の履歴」で「取り消す」を押したときに呼ばれる。
// 取り消せるのは、記録した本人か管理者で、篠宮がまだ報告を送っていない記録だけ。
//   - Gmail の返信下書きを消す（Slack・Chatwork 用の送信待ちは一覧から消える）
//   - #事前確認 の返信の先頭に「取り消し済み」と付ける（まだ返信前なら返信しない）
//   - 記録に cancelled_at を付ける。履歴には残る。同じアポの他の記録には触らない
// アポの状態を記録の前に戻すのは画面側（updatePreCheckResult）で行う。給与の集計や
// カレンダーの通知を通常の保存と同じ道で動かすため。戻す値は prev_appo として返す。
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const GOOGLE_CLIENT_ID = '570031099308-ni4qokds1jc1m5s0p080t6g2gb3vu8md.apps.googleusercontent.com'
const STATUS_CHANGING = new Set(['確認完了', 'リスケ', 'キャンセル'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) return json({ error: 'ログインが切れています。開き直してください' }, 401)

    const sb = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: me } = await sb.from('users').select('role, org_id').eq('id', userData.user.id).maybeSingle()
    const { data: member } = await sb.from('members').select('name').eq('user_id', userData.user.id).maybeSingle()
    const myName = (member?.name || '').replace(/[\s　]/g, '')

    const { event_id } = await req.json().catch(() => ({}))
    const { data: ev } = await sb.from('precheck_events').select('*').eq('id', event_id).maybeSingle()
    if (!ev || ev.org_id !== me?.org_id) return json({ error: '記録が見つかりません' }, 404)
    if (ev.cancelled_at) return json({ error: 'すでに取り消されています' }, 409)
    const isOwner = myName && (ev.caller_name || '').replace(/[\s　]/g, '') === myName
    if (!isOwner && me?.role !== 'admin') return json({ error: '取り消せるのは記録した本人か管理者だけです' }, 403)
    if (ev.draft_status === 'sent') return json({ error: 'この記録の報告はすでに送信済みのため、取り消せません。TLか篠宮に相談してください' }, 409)

    // 先に取り消しの印を付ける（毎分の処理がこのあと下書きを作らないように）
    const cancelledBy = member?.name || userData.user.email || ''
    await sb.from('precheck_events').update({
      cancelled_at: new Date().toISOString(), cancelled_by: cancelledBy,
      draft_status: ev.draft_status === 'none' ? 'none' : 'cancelled',
      slack_status: ev.slack_status === 'pending' ? 'cancelled' : ev.slack_status,
      recording_status: ev.recording_status === 'pending' ? 'none' : ev.recording_status,
    }).eq('id', ev.id)

    // Gmail の下書きを消す
    let draftDeleted = false
    if (ev.gmail_draft_id) {
      const { data: tok } = await sb.from('google_oauth_tokens').select('refresh_token').eq('name', 'gmail_precheck').maybeSingle()
      if (tok?.refresh_token) {
        const t = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: GOOGLE_CLIENT_ID, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '' }),
        }).then(r => r.json())
        if (t.access_token) {
          const del = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${ev.gmail_draft_id}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${t.access_token}` },
          })
          // 404 は篠宮がすでに手で消した／送ったもの
          draftDeleted = del.ok || del.status === 404
        }
      }
    }

    // #事前確認 の返信に「取り消し済み」と付ける
    const botToken = Deno.env.get('SLACK_BOT_TOKEN')?.trim()
    if (botToken && ev.slack_ts) {
      const { data: ch } = await sb.from('org_settings').select('setting_value')
        .eq('org_id', ev.org_id).eq('setting_key', 'slack_channel_precheck').maybeSingle()
      const channel = (ev.slack_post_channel as string | null) || (ch?.setting_value as string | undefined)
      if (channel) {
        const hist = await fetch(`https://slack.com/api/chat.update`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({
            channel, ts: ev.slack_ts,
            text: `【取り消し済み】${cancelledBy}さんがこの「${ev.result}」の記録を取り消しました。クライアントへの報告の下書きも消しています。`,
          }),
        }).then(r => r.json()).catch(() => ({}))
        if (!hist.ok) console.error('[cancel-precheck-event] Slack update:', hist.error)
      }
    }

    // アポの状態を戻すのは、この記録がアポの状態を変えていて、かつその後に状態を変える記録が無いときだけ
    let restore = null
    if (STATUS_CHANGING.has(ev.result) && ev.prev_appo) {
      const { data: later } = await sb.from('precheck_events').select('id')
        .eq('appointment_id', ev.appointment_id).is('cancelled_at', null).gt('called_at', ev.called_at)
        .in('result', [...STATUS_CHANGING]).limit(1)
      if (!later || later.length === 0) restore = ev.prev_appo
    }

    return json({ ok: true, draftDeleted, restore })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
