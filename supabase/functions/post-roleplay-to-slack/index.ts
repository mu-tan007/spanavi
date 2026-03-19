const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// チーム名 → Slack Incoming Webhook URL（Supabase Edge Function secrets から取得）
// DB の team 列は "成尾" / "高橋" のどちらの形式でも対応
function getTeamWebhooks(): Record<string, string> {
  const result: Record<string, string> = {}
  const nario = Deno.env.get('SLACK_WEBHOOK_NARIO')
  const takahashi = Deno.env.get('SLACK_WEBHOOK_TAKAHASHI')
  if (nario) { result['成尾チーム'] = nario; result['成尾'] = nario }
  if (takahashi) { result['高橋チーム'] = takahashi; result['高橋'] = takahashi }
  return result
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

    const webhookUrl = getTeamWebhooks()[memberTeam]
    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: `Unknown team: ${memberTeam}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // フォーマット: 日付・参加者
    const dateStr = sessionDate || '日付不明'
    const partner = partnerName || '不明'

    // AIフィードバック整形
    const fb = aiFeedback || {}
    const overall = fb.overall || ''
    const issues: string[] = fb.issues || []
    const solutions: string[] = fb.solutions || []
    const practice: string[] = fb.practice || []

    const issuesText = issues.map((v: string, i: number) => `${i + 1}. ${v}`).join('\n')
    const solutionsText = solutions.map((v: string, i: number) => `${i + 1}. ${v}`).join('\n')
    const practiceText = practice.map((v: string, i: number) => `${i + 1}. ${v}`).join('\n')

    const videoSection = videoUrl
      ? `\n\n*動画*\n${videoUrl}`
      : ''

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
