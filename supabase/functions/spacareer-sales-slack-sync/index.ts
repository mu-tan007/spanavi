// ============================================================
// spacareer-sales-slack-sync
// ----------------------------------------------------------------
// スパキャリ営業の Slack 報告を取り込み、spacareer_sales_events に積む。
// pg_cron 'spacareer-sales-slack-sync' から15分ごとに叩かれる前提。
// 設計: tasks/sekkei_spacareer_sales_funnel.md
//
//   #スパキャリ          初回面談獲得ワークフロー   → booked
//   #スパキャリ商談登録   アポ商談登録               → first_meeting
//                        再アポ商談登録             → re_meeting
//                        クロ商談登録               → closing
//
//   原文は spacareer_sales_slack_raw に (channel_id, ts) で保存（冪等）。
//   出来事は source_ref='slack:<channel>:<ts>' で一意。何度流しても増えない。
//   最後に spacareer_sales_link_events() でリードに結びつける。
//
//   ?diag=1 で Slack の接続確認だけ返す（書き込みなし）。
//   ?full=1 で全履歴を取り直す（通常は保存済みの最新 ts 以降だけ）。
//
// 必要環境変数:
//   SLACK_SALES_BOT_TOKEN（無ければ SLACK_BOT_TOKEN）— ma-sp ワークスペースで
//   groups:history を持ち、2チャンネルに参加しているボット
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseSalesMessage, type SlackMessage } from './parse.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const CHANNELS = [
  { id: 'C0AHS13BSQ6', name: 'スパキャリ' },
  { id: 'C0B5U41D0G1', name: 'スパキャリ商談登録' },
]

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function slackToken(): string | undefined {
  return (Deno.env.get('SLACK_SALES_BOT_TOKEN') || Deno.env.get('SLACK_BOT_TOKEN'))?.trim()
}

async function slackGet(method: string, params: Record<string, string>, token: string) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`https://slack.com/api/${method}?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  })
  return await res.json()
}

async function fetchHistory(channel: string, oldest: string | null, token: string): Promise<SlackMessage[]> {
  const out: SlackMessage[] = []
  let cursor = ''
  for (let page = 0; page < 50; page++) {
    const params: Record<string, string> = { channel, limit: '200' }
    if (oldest) params.oldest = oldest
    if (cursor) params.cursor = cursor
    const data = await slackGet('conversations.history', params, token)
    if (!data.ok) throw new Error(`conversations.history ${channel}: ${data.error}`)
    out.push(...(data.messages ?? []))
    cursor = data.response_metadata?.next_cursor ?? ''
    if (!data.has_more || !cursor) break
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const token = slackToken()
  if (!token) return json({ ok: false, error: 'SLACK token is not configured' }, 500)

  if (url.searchParams.get('diag') === '1') {
    const auth = await slackGet('auth.test', {}, token)
    const channels = []
    for (const c of CHANNELS) {
      const info = await slackGet('conversations.info', { channel: c.id }, token)
      const hist = await slackGet('conversations.history', { channel: c.id, limit: '1' }, token)
      channels.push({ ...c, info_ok: info.ok, info_error: info.error, history_ok: hist.ok, history_error: hist.error })
    }
    return json({ ok: true, team: auth.team, team_id: auth.team_id, bot_user: auth.user, auth_ok: auth.ok, auth_error: auth.error, channels })
  }

  const full = url.searchParams.get('full') === '1'
  const summary: Record<string, unknown> = {}

  try {
    for (const c of CHANNELS) {
      let oldest: string | null = null
      if (!full) {
        const { data } = await supabase
          .from('spacareer_sales_slack_raw')
          .select('ts')
          .eq('channel_id', c.id)
          .order('ts', { ascending: false })
          .limit(1)
        // 1時間ぶん重ねて取り直す（取りこぼし防止。重複は主キーで弾く）
        if (data?.[0]?.ts) oldest = String(Number(data[0].ts) - 3600)
      }

      const messages = await fetchHistory(c.id, oldest, token)
      const raws = []
      const events = []
      for (const m of messages) {
        const ev = parseSalesMessage(c.id, m)
        if (!ev) continue
        raws.push({
          channel_id: c.id,
          ts: m.ts,
          user_id: m.user ?? m.bot_id ?? null,
          text: m.text ?? '',
          posted_at: new Date(Number(m.ts) * 1000).toISOString(),
        })
        events.push(ev)
      }

      if (raws.length) {
        const { error } = await supabase
          .from('spacareer_sales_slack_raw')
          .upsert(raws, { onConflict: 'channel_id,ts', ignoreDuplicates: true })
        if (error) throw new Error(`raw upsert: ${error.message}`)
      }
      if (events.length) {
        const { error } = await supabase
          .from('spacareer_sales_events')
          .upsert(events, { onConflict: 'source_ref', ignoreDuplicates: true })
        if (error) throw new Error(`events upsert: ${error.message}`)
      }
      summary[c.name] = { fetched: messages.length, parsed: events.length }
    }

    const { data: link, error: linkErr } = await supabase.rpc('spacareer_sales_link_events')
    if (linkErr) throw new Error(`link: ${linkErr.message}`)

    return json({ ok: true, summary, link })
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e), summary }, 500)
  }
})
