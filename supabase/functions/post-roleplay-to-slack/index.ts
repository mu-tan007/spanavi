import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// org_settings から webhook URL を取得（env var にフォールバック）
async function getWebhookUrl(team: string): Promise<string | null> {
  const keyMap: Record<string, string> = {
    '高橋':   'slack_webhook_takahashi',
    '高橋チーム': 'slack_webhook_takahashi',
    '成尾':   'slack_webhook_nario',
    '成尾チーム': 'slack_webhook_nario',
  }
  const envMap: Record<string, string> = {
    '高橋':   'SLACK_WEBHOOK_TAKAHASHI',
    '高橋チーム': 'SLACK_WEBHOOK_TAKAHASHI',
    '成尾':   'SLACK_WEBHOOK_NARIO',
    '成尾チーム': 'SLACK_WEBHOOK_NARIO',
  }

  const settingKey = keyMap[team]
  if (settingKey) {
    const { data } = await supabase
      .from('org_settings')
      .select('setting_value')
      .eq('org_id', 'a0000000-0000-0000-0000-000000000001')
      .eq('setting_key', settingKey)
      .single()
    if (data?.setting_value?.startsWith('http')) return data.setting_value
  }

  // DB になければ env var にフォールバック
  const envKey = envMap[team]
  return envKey ? (Deno.env.get(envKey) || null) : null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      memberName,
      memberTeam,
      partnerName,
      sessionDate,
      aiFeedback,
      videoUrl,
    } = await req.json()

    const webhookUrl = await getWebhookUrl(memberTeam)
    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: `Slack webhook not configured for team: ${memberTeam}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const dateStr = sessionDate || '日付不明'
    const partner = partnerName || '不明'

    const fb = aiFeedback || {}
    const overall = fb.overall || ''
    const issues: string[] = fb.issues || []
    const solutions: string[] = fb.solutions || []
    const practice: string[] = fb.practice || []

    const issuesText = issues.map((v: string, i: number) => `${i + 1}. ${v}`).join('\n')
    const solutionsText = solutions.map((v: string, i: number) => `${i + 1}. ${v}`).join('\n')
    const practiceText = practice.map((v: string, i: number) => `${i + 1}. ${v}`).join('\n')

    const videoSection = videoUrl ? `\n\n*動画*\n${videoUrl}` : ''

    const text = `
:microphone: *ロープレレポート*
*日付:* ${dateStr}
*メンバー:* ${memberName}　×　*相手:* ${partner}

*【総評】*
${overall}

*【課題点】*
${issuesText || 'なし'}

*【解決策】*
${solutionsText || 'なし'}

*【練習方法】*
${practiceText || 'なし'}${videoSection}
`.trim()

    const slackRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    if (!slackRes.ok) {
      const body = await slackRes.text()
      return new Response(
        JSON.stringify({ error: 'Slack API error', detail: body }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
