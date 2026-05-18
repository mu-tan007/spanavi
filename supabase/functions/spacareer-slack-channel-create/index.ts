// ============================================================
// spacareer-slack-channel-create
// ----------------------------------------------------------------
// スパキャリ ゲストチャンネルを Slack 上に作成し、初期メンバーを
// 招待する Edge Function。
//
// 認証: SLACK_BOT_TOKEN（環境変数）。UIからは触らない。
// 必要 OAuth scopes: channels:manage, groups:write, im:write,
//                    users:read.email, conversations.invite
//
// 入力:
//   { org_id, customer_id, channel_name, invite_emails: string[] }
//
// 出力:
//   { ok: true, channel_id, channel_name }
//   または { ok: false, error: string }
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const SLACK_BASE = 'https://slack.com/api'

async function slackApi(token: string, method: string, body: Record<string, unknown>) {
  const res = await fetch(`${SLACK_BASE}/${method}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  return await res.json()
}

async function lookupSlackUserByEmail(token: string, email: string): Promise<string | null> {
  const url = `${SLACK_BASE}/users.lookupByEmail?email=${encodeURIComponent(email)}`
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  const data = await res.json()
  if (data?.ok && data.user?.id) return data.user.id
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const token = Deno.env.get('SLACK_BOT_TOKEN')?.trim()
  if (!token) {
    return new Response(
      JSON.stringify({ ok: false, error: 'SLACK_BOT_TOKEN is not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  try {
    const { org_id, customer_id, channel_name, invite_emails } = await req.json()
    if (!org_id || !customer_id || !channel_name) {
      return new Response(
        JSON.stringify({ ok: false, error: 'org_id, customer_id, channel_name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Slack の channel name は小文字英数 + ハイフン + アンダースコアのみ
    // フルネーム漢字はそのまま使えないので、conversation create 時に name に
    // ローマ字／slug を渡し、display 用に topic / purpose に漢字を保持する戦略を取る。
    // 安全のため customer_id 先頭8桁を suffix に付与し、衝突を避ける。
    const safeSlug = `spacareer-${String(customer_id).slice(0, 8)}`

    const createRes = await slackApi(token, 'conversations.create', {
      name: safeSlug,
      is_private: true,
    })

    if (!createRes?.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: createRes?.error || 'channel create failed' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const channelId: string = createRes.channel.id

    // topic / purpose に漢字名を入れる
    await slackApi(token, 'conversations.setTopic', {
      channel: channelId,
      topic: `スパキャリ：${channel_name}様 担当チャンネル`,
    })
    await slackApi(token, 'conversations.setPurpose', {
      channel: channelId,
      purpose: `${channel_name}様とのスパキャリやりとり用ゲストチャンネル`,
    })

    // メンバー招待
    const userIds: string[] = []
    for (const email of (invite_emails || []) as string[]) {
      const uid = await lookupSlackUserByEmail(token, email)
      if (uid) userIds.push(uid)
    }
    if (userIds.length > 0) {
      await slackApi(token, 'conversations.invite', {
        channel: channelId,
        users: userIds.join(','),
      })
    }

    // spacareer_slack_channels に upsert（クライアント側でも書くが、failsafe）
    await supabase.from('spacareer_slack_channels').upsert(
      {
        org_id,
        customer_id,
        channel_id: channelId,
        channel_name,
      },
      { onConflict: 'customer_id' },
    )

    return new Response(
      JSON.stringify({ ok: true, channel_id: channelId, channel_name }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[spacareer-slack-channel-create] error:', e)
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
