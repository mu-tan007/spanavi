// ============================================================
// spacareer-slack-notify
// ----------------------------------------------------------------
// スパキャリ通知テンプレを使って、顧客の Slack ゲストチャンネルに
// 自動通知を送る Edge Function。
//
// 認証: SLACK_BOT_TOKEN（環境変数）
// 必要 scope: chat:write
//
// 入力:
//   {
//     org_id, customer_id,
//     notify_key: 'permission_granted' | 'homework_reminder' | 'due_reminder'
//               | 'portal_published' | 'feedback_request',
//     vars: { 顧客名?: string, セッション番号?: string, セッション日時?: string, ... },
//     custom_message?: string   // 指定があればテンプレを使わず直接送る
//   }
//
// テンプレ取得元:
//   spacareer_templates.template_type に 'notify_unstarted' / 'notify_due'
//   / 'notify_published' を保持しているので、notify_key で適切に解決。
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

// notify_key → spacareer_templates.template_type のマッピング
// permission_granted / feedback_request はテンプレ未確定のため fallback 本文を使う
const NOTIFY_TPL_TYPE: Record<string, string | null> = {
  permission_granted: null,
  homework_reminder: 'notify_unstarted',
  due_reminder: 'notify_due',
  portal_published: 'notify_published',
  feedback_request: null,
  // §6.2A / Phase F: 第1回前70問キックオフヒアリング
  kickoff_hearing_published: 'notify_kickoff_hearing_published',
  kickoff_hearing_reminder: 'notify_kickoff_hearing_reminder',
}

// テンプレ取得失敗時の fallback 本文
const FALLBACK_BODY: Record<string, string> = {
  permission_granted:
    '{顧客名}様\n\nスパキャリへのお申し込みありがとうございます。\nスパナビへのログイン権限を付与いたしました。初期パスワードは別途お送りしておりますのでご確認ください。',
  homework_reminder:
    '{顧客名}様\n\n第{セッション番号}回前の事前課題がまだ未着手です。\n締切：{締切日}\nポータル：{ポータルURL}\nご不明点は本チャンネルでお気軽にお声がけください。',
  due_reminder:
    '{顧客名}様\n\n本日が第{セッション番号}回前の事前課題の締切です。\nまだの方はご対応をお願いいたします。\nポータル：{ポータルURL}',
  portal_published:
    '{顧客名}様\n\n第{セッション番号}回の事前課題をクライアントポータルに公開しました。\n締切：{締切日}\nポータル：{ポータルURL}',
  feedback_request:
    '{顧客名}様\n\nお疲れさまでした。第{セッション番号}回セッションの満足度アンケートをお送りします。\nアンケート未回答の場合、全額返金保証の対象外となりますのでご注意ください。\nポータル：{ポータルURL}',
  kickoff_hearing_published:
    '{顧客名}様\n\nスパキャリへのお申し込みありがとうございます。\n第1回セッションを最大限有意義な時間にするため、事前ヒアリング（70問・所要60〜90分）をお送りします。\n回答ページ: {ヒアリングURL}\n提出期限: 初回アクセスから72時間以内\nお時間のあるときにご回答ください。途中保存も可能です。',
  kickoff_hearing_reminder:
    '{顧客名}様\n\nキックオフヒアリングの提出期限まで残り24時間となりました。\n回答ページ: {ヒアリングURL}\n途中保存しているものがあれば、引き続きご記入をお願いします。',
}

function renderTemplate(body: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.split(`{${k}}`).join(v ?? ''),
    body,
  )
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
    const { org_id, customer_id, notify_key, vars, custom_message } = await req.json()
    if (!org_id || !customer_id || !notify_key) {
      return new Response(
        JSON.stringify({ ok: false, error: 'org_id, customer_id, notify_key are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. チャンネル ID 取得
    const { data: chRow, error: chErr } = await supabase
      .from('spacareer_slack_channels')
      .select('channel_id')
      .eq('customer_id', customer_id)
      .maybeSingle()
    if (chErr || !chRow?.channel_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Slack channel not found for customer' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. 通知本文の決定
    let body = custom_message?.trim() || ''
    if (!body) {
      const tplType = NOTIFY_TPL_TYPE[notify_key]
      if (tplType) {
        const { data: tplRow } = await supabase
          .from('spacareer_templates')
          .select('content')
          .eq('org_id', org_id)
          .eq('template_type', tplType)
          .eq('is_active', true)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle()
        body = (tplRow?.content as { body?: string })?.body || FALLBACK_BODY[notify_key] || ''
      } else {
        body = FALLBACK_BODY[notify_key] || ''
      }
    }
    if (!body) {
      return new Response(
        JSON.stringify({ ok: false, error: `no template body for notify_key=${notify_key}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    const text = renderTemplate(body, vars || {})

    // 3. Slack chat.postMessage
    const slackRes = await fetch(`${SLACK_BASE}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel: chRow.channel_id,
        text,
        unfurl_links: false,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const slackData = await slackRes.json()
    if (!slackData?.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: slackData?.error || 'slack postMessage failed' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ ok: true, ts: slackData.ts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[spacareer-slack-notify] error:', e)
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
