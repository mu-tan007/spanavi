import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// Whisper API の上限 25 MB（余裕を持って 24 MB に設定）
const WHISPER_MAX_BYTES = 24 * 1024 * 1024

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { storage_path, recording_url, session_id } = await req.json()

    if (!session_id || (!storage_path && !recording_url)) {
      return new Response(
        JSON.stringify({ error: 'session_id and either storage_path or recording_url are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 1. ai_status を 'processing' に更新 ──────────────────────────────
    await supabase
      .from('roleplay_sessions')
      .update({ ai_status: 'processing' })
      .eq('id', session_id)

    // ── 2. 音声ファイルをダウンロード ─────────────────────────────────────
    let audioBuffer: ArrayBuffer
    let ext = 'mp4'

    if (storage_path) {
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
      audioBuffer = await fileData.arrayBuffer()
      ext = storage_path.split('.').pop()?.toLowerCase() || 'mp4'
    } else {
      const res = await fetch(recording_url, { headers: { 'User-Agent': 'Spanavi/1.0' } })
      if (!res.ok) {
        await supabase.from('roleplay_sessions').update({ ai_status: 'error' }).eq('id', session_id)
        return new Response(
          JSON.stringify({ error: `URL download failed: ${res.status} ${res.statusText}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      audioBuffer = await res.arrayBuffer()
      const urlPath = new URL(recording_url).pathname
      ext = urlPath.split('.').pop()?.toLowerCase() || 'mp4'
    }

    // ── 3. Whisper API 上限（25 MB）を超える場合は先頭 24 MB に切り詰め ──
    let truncated = false
    if (audioBuffer.byteLength > WHISPER_MAX_BYTES) {
      console.log(`[analyze-roleplay] File too large (${audioBuffer.byteLength} bytes), truncating to ${WHISPER_MAX_BYTES} bytes`)
      audioBuffer = audioBuffer.slice(0, WHISPER_MAX_BYTES)
      truncated = true
    }

    const mimeMap: Record<string, string> = {
      mp3: 'audio/mpeg', mp4: 'audio/mp4', m4a: 'audio/mp4',
      mov: 'video/quicktime', wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg',
    }
    const contentType = mimeMap[ext] || 'audio/mp4'
    // MP3 は切り詰めても正常にデコードできる。MP4/MOV は切り詰め後に
    // Whisper が失敗することがあるため、その場合は拡張子を mp3 に偽装して再試行する
    const whisperExt = truncated && (ext === 'mp4' || ext === 'm4a' || ext === 'mov') ? 'mp3' : ext
    const audioBlob = new Blob([audioBuffer], { type: truncated ? 'audio/mpeg' : contentType })

    // ── 4. OpenAI Whisper で文字起こし ─────────────────────────────────
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      await supabase.from('roleplay_sessions').update({ ai_status: 'error' }).eq('id', session_id)
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const formData = new FormData()
    formData.append('file', audioBlob, `recording.${whisperExt}`)
    formData.append('model', 'whisper-1')
    formData.append('language', 'ja')

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}` },
      body: formData,
    })

    if (!whisperRes.ok) {
      const whisperErr = await whisperRes.text()
      console.error('[analyze-roleplay] Whisper error:', whisperErr)
      await supabase.from('roleplay_sessions').update({ ai_status: 'error' }).eq('id', session_id)
      return new Response(
        JSON.stringify({ error: `Whisper API error: ${whisperErr}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const whisperData = await whisperRes.json()
    const transcript: string = whisperData.text || ''

    // ── 5. Claude でロープレ分析 ────────────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      await supabase.from('roleplay_sessions').update({ ai_status: 'error' }).eq('id', session_id)
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const truncatedNote = truncated ? '\n※ファイルが大きいため、冒頭部分のみを分析対象としています。' : ''
    const prompt = `あなたはM&Aアドバイザリー企業のテレアポロープレコーチです。
以下はインターン生・メンバーのロープレ録音の文字起こしです。${truncatedNote}
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
      console.error('[analyze-roleplay] Claude error:', claudeErr)
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

    // ── 6. roleplay_sessions を更新 ────────────────────────────────────
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
