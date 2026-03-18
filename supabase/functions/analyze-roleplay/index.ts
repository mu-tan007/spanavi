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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { storage_path, session_id } = await req.json()

    if (!storage_path || !session_id) {
      return new Response(
        JSON.stringify({ error: 'storage_path and session_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 1. ai_status を 'processing' に更新 ──────────────────────────────
    await supabase
      .from('roleplay_sessions')
      .update({ ai_status: 'processing' })
      .eq('id', session_id)

    // ── 2. Supabase Storage から音声ファイルをダウンロード ───────────────
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('roleplay-recordings')
      .download(storage_path)

    if (downloadError || !fileData) {
      await supabase.from('roleplay_sessions').update({ ai_status: 'error' }).eq('id', session_id)
      return new Response(
        JSON.stringify({ error: `Storage download failed: ${downloadError?.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const audioBuffer = await fileData.arrayBuffer()
    // ファイル拡張子から Content-Type を推定
    const ext = storage_path.split('.').pop()?.toLowerCase() || 'mp4'
    const mimeMap: Record<string, string> = {
      mp3: 'audio/mpeg', mp4: 'audio/mp4', m4a: 'audio/mp4',
      wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg',
    }
    const contentType = mimeMap[ext] || 'audio/mp4'
    const audioBlob = new Blob([audioBuffer], { type: contentType })

    // ── 3. OpenAI Whisper で文字起こし ─────────────────────────────────
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      await supabase.from('roleplay_sessions').update({ ai_status: 'error' }).eq('id', session_id)
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const formData = new FormData()
    formData.append('file', audioBlob, `recording.${ext}`)
    formData.append('model', 'whisper-1')
    formData.append('language', 'ja')

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}` },
      body: formData,
    })

    if (!whisperRes.ok) {
      const whisperErr = await whisperRes.text()
      await supabase.from('roleplay_sessions').update({ ai_status: 'error' }).eq('id', session_id)
      return new Response(
        JSON.stringify({ error: `Whisper API error: ${whisperErr}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const whisperData = await whisperRes.json()
    const transcript: string = whisperData.text || ''

    // ── 4. Claude でロープレ分析 ────────────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      await supabase.from('roleplay_sessions').update({ ai_status: 'error' }).eq('id', session_id)
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const prompt = `あなたはM&Aアドバイザリー企業のテレアポロープレコーチです。
以下はインターン生・メンバーのロープレ録音の文字起こしです。
内容を分析し、必ず以下のJSONフォーマットのみで回答してください（他のテキストなし）：

{
  "overall": "全体的な総評（200字程度）",
  "issues": ["課題点1", "課題点2", "課題点3"],
  "solutions": ["課題点1への解決策", "課題点2への解決策", "課題点3への解決策"],
  "practice": ["具体的な練習方法1", "具体的な練習方法2", "具体的な練習方法3"]
}

【評価の観点】
- 受付突破トークの自然さ・説得力
- 社長へのアプローチとM&Aの趣旨伝達
- 切り返しの対応（断られた時の処理）
- 声のトーン・テンポ・言葉の選び方
- 全体的なスクリプト遵守度と応用力

【ロープレ文字起こし】
${transcript}`

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!claudeRes.ok) {
      const claudeErr = await claudeRes.text()
      await supabase.from('roleplay_sessions').update({ ai_status: 'error' }).eq('id', session_id)
      return new Response(
        JSON.stringify({ error: `Claude API error: ${claudeErr}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const claudeData = await claudeRes.json()
    const claudeText: string = claudeData.content?.[0]?.text || '{}'

    let aiFeedback: { overall?: string; issues?: string[]; solutions?: string[]; practice?: string[] } = {}
    try {
      const jsonMatch = claudeText.match(/\{[\s\S]*\}/)
      aiFeedback = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    } catch (parseErr) {
      console.error('[analyze-roleplay] JSON parse error:', parseErr, 'raw:', claudeText)
    }

    // ── 5. roleplay_sessions を更新 ────────────────────────────────────
    const { error: updateError } = await supabase
      .from('roleplay_sessions')
      .update({
        transcript,
        ai_feedback: aiFeedback,
        ai_status: 'done',
      })
      .eq('id', session_id)

    if (updateError) {
      console.error('[analyze-roleplay] DB update error:', updateError)
    }

    return new Response(
      JSON.stringify({ transcript, ai_feedback: aiFeedback }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('[analyze-roleplay] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
