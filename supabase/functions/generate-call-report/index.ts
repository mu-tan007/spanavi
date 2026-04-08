// 録音から通話レポートを自動生成する汎用 Edge Function
// 入力: { recording_url, call_status, item_id?, manual_supplement? }
// 出力: { transcript, report_style ("スムーズ"|"説得"|null), report_text, public_recording_url }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { recording_url, call_status = '', item_id = '', manual_supplement = '' } = await req.json()
    if (!recording_url) {
      return new Response(JSON.stringify({ error: 'recording_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── 1. Zoom token (zoom URL のみ必要) ──────────────────────────────
    const isZoomUrl = /zoom\.us/i.test(recording_url)
    let zoomToken = ''
    if (isZoomUrl) {
      const zoomAccountId    = Deno.env.get('ZOOM_ACCOUNT_ID')
      const zoomClientId     = Deno.env.get('ZOOM_CLIENT_ID')
      const zoomClientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')
      if (!zoomAccountId || !zoomClientId || !zoomClientSecret) {
        return new Response(JSON.stringify({ error: 'Zoom credentials not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const tokenRes = await fetch(
        `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${zoomAccountId}`,
        { method: 'POST', headers: {
            'Authorization': 'Basic ' + btoa(`${zoomClientId}:${zoomClientSecret}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          } })
      const tokenData = await tokenRes.json()
      zoomToken = tokenData.access_token
      if (!zoomToken) {
        return new Response(JSON.stringify({ error: 'Failed to obtain Zoom access token' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // ── 2. 音声ダウンロード ───────────────────────────────────────────
    const audioRes = isZoomUrl
      ? await fetch(recording_url, { headers: { 'Authorization': `Bearer ${zoomToken}` } })
      : await fetch(recording_url)
    if (!audioRes.ok) {
      return new Response(JSON.stringify({ error: `Failed to download recording: ${audioRes.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const audioBuffer = await audioRes.arrayBuffer()
    const audioBlob   = new Blob([audioBuffer], { type: 'audio/mp4' })

    // ── 2.5 Storage アップロード（ベストエフォート） ─────────────────
    let publicRecordingUrl = ''
    try {
      const now = new Date()
      const dateStr = now.getFullYear().toString()
        + String(now.getMonth() + 1).padStart(2, '0')
        + String(now.getDate()).padStart(2, '0')
        + '_' + String(now.getHours()).padStart(2, '0')
        + String(now.getMinutes()).padStart(2, '0')
      const safeItemId = (item_id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '')
      const fileName = `${safeItemId}_${dateStr}.mp4`
      const { error: upErr } = await supabase.storage
        .from('recordings')
        .upload(fileName, audioBuffer, { contentType: 'audio/mp4', upsert: true })
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('recordings').getPublicUrl(fileName)
        publicRecordingUrl = urlData.publicUrl
      }
    } catch (e) { console.error('[generate-call-report] storage error:', e) }

    // ── 3. Whisper 文字起こし ─────────────────────────────────────────
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const formData = new FormData()
    formData.append('file', audioBlob, 'recording.mp4')
    formData.append('model', 'whisper-1')
    formData.append('language', 'ja')
    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}` },
      body: formData,
    })
    if (!whisperRes.ok) {
      const errTxt = await whisperRes.text()
      return new Response(JSON.stringify({ error: `Whisper API error: ${errTxt}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const whisperData = await whisperRes.json()
    const transcript: string = whisperData.text || ''

    // ── 4. Claude でレポート生成 ──────────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    let prompt = ''
    const isAppo = call_status === 'アポ獲得'
    const isReject = /お断り/.test(call_status)

    if (isAppo) {
      prompt = `以下はM&Aアドバイザリーのテレアポ録音です。アポ獲得に至った通話の文字起こしを分析し、必ず以下のJSONフォーマットのみで回答してください（前後に余計なテキストを付けない）:

{
  "report_style": "スムーズ" または "説得" のいずれか,
  "report_text": "アポ獲得までの経緯を3〜6文の自然な日本語で要約。先方の反応の変遷、決定打となった切り返し、温度感を含める"
}

判定基準:
- "スムーズ" = 大きな抵抗なくアポにつながった通話
- "説得" = 当初否定的・消極的だったが、切り返し・追加提案などで前向きに変化した通話

【アポインター補足】
${manual_supplement || '（補足なし）'}

【文字起こし】
${transcript}`
    } else if (isReject) {
      prompt = `以下はM&Aアドバイザリーのテレアポ録音(社長お断り)の文字起こしです。先方が断った理由を分析し、必ず以下のJSONフォーマットのみで回答してください（前後に余計なテキストを付けない）:

{
  "report_style": null,
  "report_text": "お断り理由を3〜5文で要約。具体的な発言根拠（誰がどう言ったか）、断りの強度（強い拒否 / やんわり）、再アプローチの可能性を含める"
}

【アポインター補足】
${manual_supplement || '（補足なし）'}

【文字起こし】
${transcript}`
    } else {
      prompt = `以下はテレアポ録音の文字起こしです。通話内容の要点を分析し、必ず以下のJSONフォーマットのみで回答してください（前後に余計なテキストを付けない）:

{
  "report_style": null,
  "report_text": "通話の要点と先方の反応を3〜5文で要約"
}

【ステータス】${call_status}
【アポインター補足】
${manual_supplement || '（補足なし）'}

【文字起こし】
${transcript}`
    }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!claudeRes.ok) {
      const errTxt = await claudeRes.text()
      return new Response(JSON.stringify({ error: `Claude API error: ${errTxt}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const claudeData = await claudeRes.json()
    const claudeText: string = claudeData.content?.[0]?.text || '{}'

    let result: { report_style?: string | null; report_text?: string } = {}
    try {
      const m = claudeText.match(/\{[\s\S]*\}/)
      result = m ? JSON.parse(m[0]) : {}
    } catch (e) {
      console.error('[generate-call-report] JSON parse error:', e, 'raw:', claudeText)
    }

    return new Response(JSON.stringify({
      transcript,
      report_style: result.report_style ?? null,
      report_text: result.report_text || '',
      public_recording_url: publicRecordingUrl,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[generate-call-report] Unhandled error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
