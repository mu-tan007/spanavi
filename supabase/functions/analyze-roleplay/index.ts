import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// Whisper の上限: 25 MB
const WHISPER_MAX_BYTES = 25 * 1024 * 1024

// 拡張子 → Whisper 送信時の拡張子（非対応形式を最も近い対応形式にマッピング）
// Whisper 対応: mp3, mp4, mpeg, mpga, m4a, wav, webm, flac, ogg
const EXT_ALIAS: Record<string, string> = {
  mov: 'mp4',   // QuickTime ≒ MP4 コンテナ
  aac: 'm4a',   // AAC 生ストリーム → M4A として送信
  wma: 'mp3',
  aiff: 'wav',
  avi: 'mp4',
  '3gp': 'mp4',
}

// MIME タイプマップ
const MIME_MAP: Record<string, string> = {
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  mpeg: 'audio/mpeg',
  mpga: 'audio/mpeg',
}

// ストリーム形式（バイト切り詰めが安全な形式）
const STREAM_FORMATS = new Set(['mp3', 'mpeg', 'mpga', 'wav', 'flac'])

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
    let rawExt = 'mp4'

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
      rawExt = storage_path.split('.').pop()?.toLowerCase() || 'mp4'
    } else {
      // Google Drive 共有URLを直接ダウンロードURLに変換
      let fetchUrl = recording_url
      const driveMatch = recording_url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
      if (driveMatch) {
        fetchUrl = `https://drive.google.com/uc?id=${driveMatch[1]}&export=download`
      }
      const res = await fetch(fetchUrl, { headers: { 'User-Agent': 'Spanavi/1.0' } })
      if (!res.ok) {
        await supabase.from('roleplay_sessions').update({ ai_status: 'error' }).eq('id', session_id)
        return new Response(
          JSON.stringify({ error: `URL download failed: ${res.status} ${res.statusText}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      audioBuffer = await res.arrayBuffer()
      const contentDisposition = res.headers.get('content-disposition') || ''
      const cdMatch = contentDisposition.match(/filename="?([^";\s]+)"?/)
      const urlPath = cdMatch ? cdMatch[1] : new URL(fetchUrl).pathname
      rawExt = urlPath.split('.').pop()?.toLowerCase() || 'mp4'
    }

    // ── 3. 形式を Whisper 対応形式に正規化 ───────────────────────────────
    const whisperExt = EXT_ALIAS[rawExt] ?? rawExt
    const contentType = MIME_MAP[whisperExt] ?? 'audio/mp4'

    // ── 4. サイズ処理 ─────────────────────────────────────────────────────
    // MP3 / WAV / FLAC はストリーム形式なのでバイト切り詰めが安全
    // MP4 / M4A / MOV などコンテナ形式はヘッダー破損を防ぐため切り詰めない
    let finalBuffer = audioBuffer
    let sizeNote = ''

    if (audioBuffer.byteLength > WHISPER_MAX_BYTES) {
      if (STREAM_FORMATS.has(whisperExt)) {
        finalBuffer = audioBuffer.slice(0, WHISPER_MAX_BYTES - 512 * 1024) // 24.5 MB
        sizeNote = '（ファイルが大きいため冒頭部分のみ分析）'
        console.log(`[analyze-roleplay] Truncated stream file (${rawExt}) to ${finalBuffer.byteLength} bytes`)
      } else {
        // コンテナ形式: そのまま送って Whisper に判断させる
        // 25 MB 超でも Whisper が受け入れる場合があるため試みる
        console.log(`[analyze-roleplay] Container format (${rawExt}) is ${audioBuffer.byteLength} bytes, sending as-is`)
      }
    }

    const audioBlob = new Blob([finalBuffer], { type: contentType })

    // ── 5. OpenAI Whisper で文字起こし ─────────────────────────────────
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

    console.log(`[analyze-roleplay] Sending to Whisper: ext=${whisperExt}, size=${finalBuffer.byteLength} bytes`)

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

    // ── 6. Claude でロープレ分析 ────────────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      await supabase.from('roleplay_sessions').update({ ai_status: 'error' }).eq('id', session_id)
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const prompt = `あなたはM&Aアドバイザリー企業のテレアポロープレコーチです。
以下はインターン生・メンバーのロープレ録音の文字起こしです。${sizeNote}
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

    // ── 7. roleplay_sessions を更新 ────────────────────────────────────
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
