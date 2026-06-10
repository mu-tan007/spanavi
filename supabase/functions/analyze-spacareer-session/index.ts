// ============================================================
// analyze-spacareer-session
// ----------------------------------------------------------------
// スパキャリ セッション動画 → AI 議事録 パイプライン。
// 既存 analyze-roleplay (Whisper + Claude Haiku 4.5) のパターンを踏襲。
//
// 入力:
//   {
//     session_id: uuid              -- spacareer_sessions.id
//     session_video_id: uuid        -- spacareer_session_videos.id
//     storage_path?: string         -- spacareer-session-videos バケットのパス
//     recording_url?: string        -- 外部URL（fallback）
//     customer_id?: uuid            -- ログ集計用
//   }
//
// 出力（即時）:
//   { status: 'processing', session_video_id }
//
// バックグラウンド完了後の DB 更新先:
//   spacareer_session_videos.{ ai_status, transcript, ai_feedback, ai_error }
//   spacareer_sessions.minutes_draft（議事録ドラフト文字列）
//   spacareer_ai_usage_logs (feature='minutes_generation')
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

const STORAGE_BUCKET = 'spacareer-session-videos'

// Whisper の上限: 25 MB
// セッションは60〜90分が普通なので、ロープレ(15MB)より広めに取り
// 32kbps mono MP3 で約100分まで丸ごと文字起こしできるようにする。
const SAFE_LIMIT = 24 * 1024 * 1024 // 24 MB（Whisper上限ギリギリ手前で truncate）

const EXT_ALIAS: Record<string, string> = {
  mov: 'mp4',
  aac: 'm4a',
  wma: 'mp3',
  aiff: 'wav',
  avi: 'mp4',
  '3gp': 'mp4',
}

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

// プロンプト：スパキャリ向け議事録生成
const SYSTEM_PROMPT = `あなたはキャリアコーチング「スパキャリ」のセッション議事録作成アシスタントです。
受講生（お客様）とトレーナーの会話の文字起こしを読み、構造化された議事録ドラフトを作成します。
出力は必ず以下の JSON フォーマットのみを返してください（前後のテキストは一切不要）：

{
  "summary": "今回のセッションの全体要約（300字程度）",
  "sections": [
    { "heading": "現状確認", "bullets": ["...", "..."] },
    { "heading": "深掘りされた論点", "bullets": ["...", "..."] },
    { "heading": "次回までのアクション", "bullets": ["...", "..."] },
    { "heading": "次回までの宿題", "bullets": ["...", "..."] }
  ],
  "nextActions": ["...", "..."],
  "trainerNotes": "トレーナーが追記する欄に置く所感のヒント（150字以内）"
}

評価・記述の観点:
- 受講生本人の言葉を優先して引用する（要約しすぎず原文ニュアンスを残す）
- 結論・気づき・次のアクションを明確に分離する
- トレーナーが後で編集することを前提に、推測や憶測は避ける
- 日本語、敬体ではなく簡潔な箇条書きスタイル`

function buildMinutesDraftText(ai: {
  summary?: string
  sections?: Array<{ heading?: string; bullets?: string[] }>
  nextActions?: string[]
  trainerNotes?: string
}): string {
  const lines: string[] = []
  lines.push('## セッション議事録（AI 自動生成ドラフト）')
  lines.push('')
  if (ai.summary) {
    lines.push('### 全体サマリー')
    lines.push(ai.summary)
    lines.push('')
  }
  for (const s of ai.sections || []) {
    if (!s.heading) continue
    lines.push(`### ${s.heading}`)
    for (const b of s.bullets || []) lines.push(`- ${b}`)
    lines.push('')
  }
  if (ai.nextActions && ai.nextActions.length) {
    lines.push('### 次回までのアクション')
    for (const a of ai.nextActions) lines.push(`- ${a}`)
    lines.push('')
  }
  if (ai.trainerNotes) {
    lines.push('### トレーナーメモ（編集用）')
    lines.push(ai.trainerNotes)
    lines.push('')
  }
  lines.push('※ AI 生成ドラフトです。トレーナーが必ず確認・修正してください。')
  return lines.join('\n')
}

// ── バックグラウンド処理 ──────────────────────────────────────
async function processInBackground(
  session_id: string,
  session_video_id: string,
  storage_path?: string,
  recording_url?: string,
  customer_id?: string,
) {
  // 動画レコードから org_id（usage_logs の NOT NULL 制約用）と
  // 音声/動画パスを解決する。フロントは session_video_id だけ渡せばよい。
  const { data: videoRow } = await supabase
    .from('spacareer_session_videos')
    .select('org_id, storage_path, audio_storage_path, recording_url')
    .eq('id', session_video_id)
    .maybeSingle()
  const orgId: string | null = videoRow?.org_id ?? null
  // ブラウザ抽出済みの MP3 があれば最優先（動画 truncate より精度・網羅性が高い）
  if (videoRow?.audio_storage_path) storage_path = videoRow.audio_storage_path
  else if (!storage_path && videoRow?.storage_path) storage_path = videoRow.storage_path
  if (!recording_url && videoRow?.recording_url) recording_url = videoRow.recording_url

  const failVideo = async (message: string, detail?: string) => {
    await supabase.from('spacareer_session_videos').update({
      ai_status: 'error',
      ai_error: message,
      ai_feedback: detail ? { error: message, detail } : { error: message },
      processed_at: new Date().toISOString(),
    }).eq('id', session_video_id)
    if (orgId) {
      await supabase.from('spacareer_ai_usage_logs').insert({
        org_id: orgId,
        customer_id: customer_id ?? null,
        feature: 'minutes_generation',
        model: 'claude-haiku-4-5-20251001',
        status: 'error',
        error_message: detail ? `${message}: ${detail}` : message,
      })
    }
  }

  if (!videoRow) {
    await failVideo('対象の動画レコードが見つかりません')
    return
  }

  try {
    // ── 1. 音声ファイルダウンロード ─────────────────────────
    let audioBuffer: ArrayBuffer
    let rawExt = 'mp4'

    if (storage_path) {
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(storage_path, 300)
      if (signedUrlError || !signedUrlData?.signedUrl) {
        await failVideo('動画ファイルの取得に失敗しました', signedUrlError?.message || 'signed url failed')
        return
      }
      const storageRes = await fetch(signedUrlData.signedUrl, {
        signal: AbortSignal.timeout(60_000),
      })
      if (!storageRes.ok) {
        await failVideo('ストレージからのダウンロードに失敗しました', `HTTP ${storageRes.status}`)
        return
      }
      audioBuffer = await storageRes.arrayBuffer()
      rawExt = storage_path.split('.').pop()?.toLowerCase() || 'mp4'
    } else if (recording_url) {
      const res = await fetch(recording_url, {
        headers: { 'User-Agent': 'Spanavi-Spacareer/1.0' },
        signal: AbortSignal.timeout(120_000),
      })
      if (!res.ok) {
        await failVideo('URL からのダウンロードに失敗しました', `HTTP ${res.status} ${res.statusText}`)
        return
      }
      audioBuffer = await res.arrayBuffer()
      const urlPath = new URL(recording_url).pathname
      rawExt = urlPath.split('.').pop()?.toLowerCase() || 'mp4'
    } else {
      await failVideo('動画ソースが指定されていません')
      return
    }

    // ── 2. Whisper 対応形式に正規化 ──────────────────────────
    const whisperExt = EXT_ALIAS[rawExt] ?? rawExt
    const contentType = MIME_MAP[whisperExt] ?? 'audio/mp4'

    // ── 3. サイズ truncate ───────────────────────────────────
    let finalBuffer = audioBuffer
    let sizeNote = ''
    if (audioBuffer.byteLength > SAFE_LIMIT) {
      finalBuffer = audioBuffer.slice(0, SAFE_LIMIT)
      sizeNote = '（ファイル冒頭部分のみ分析）'
      console.log(`[analyze-spacareer-session] Truncated ${rawExt} (${audioBuffer.byteLength}B) → ${finalBuffer.byteLength}B`)
    }
    const audioBlob = new Blob([finalBuffer], { type: contentType })

    // ── 4. Whisper で文字起こし ──────────────────────────────
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      await failVideo('OPENAI_API_KEY が設定されていません')
      return
    }

    const formData = new FormData()
    formData.append('file', audioBlob, `recording.${whisperExt}`)
    formData.append('model', 'whisper-1')
    formData.append('language', 'ja')

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}` },
      body: formData,
      signal: AbortSignal.timeout(180_000),
    })
    if (!whisperRes.ok) {
      const errText = await whisperRes.text()
      console.error('[analyze-spacareer-session] Whisper error:', errText)
      await failVideo('文字起こしに失敗しました（Whisper）', errText.slice(0, 300))
      return
    }
    const whisperData = await whisperRes.json()
    const transcript: string = whisperData.text || ''

    // ── 5. Claude Haiku 4.5 で構造化議事録 ────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      await failVideo('ANTHROPIC_API_KEY が設定されていません')
      return
    }

    const userPrompt = `${SYSTEM_PROMPT}\n\n${sizeNote ? `※ ${sizeNote}\n\n` : ''}【セッション文字起こし】\n${transcript}`

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3072,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text()
      console.error('[analyze-spacareer-session] Claude error:', errText)
      await failVideo('AI 議事録生成に失敗しました（Claude）', errText.slice(0, 300))
      return
    }

    const claudeData = await claudeRes.json()
    const claudeText: string = claudeData.content?.[0]?.text || ''
    const usage = claudeData.usage || {}

    // JSON 抽出
    let aiFeedback: {
      summary?: string
      sections?: Array<{ heading?: string; bullets?: string[] }>
      nextActions?: string[]
      trainerNotes?: string
    } = {}
    let parseError: string | null = null
    try {
      const m = claudeText.match(/\{[\s\S]*\}/)
      if (!m) parseError = 'AI 応答に JSON 構造が含まれていません'
      else aiFeedback = JSON.parse(m[0])
    } catch (e) {
      parseError = `JSON parse error: ${(e as Error).message}`
      console.error('[analyze-spacareer-session] JSON parse error:', e, 'raw:', claudeText)
    }

    const hasContent = !!(aiFeedback.summary
      || (aiFeedback.sections && aiFeedback.sections.length)
      || (aiFeedback.nextActions && aiFeedback.nextActions.length))
    if (!hasContent) {
      await supabase.from('spacareer_session_videos').update({
        ai_status: 'error',
        transcript,
        ai_error: 'AI 議事録の結果が空でした。再分析してください。',
        ai_feedback: {
          error: 'AI 議事録の結果が空でした',
          detail: parseError || 'unknown',
          raw_excerpt: claudeText.slice(0, 500),
        },
        processed_at: new Date().toISOString(),
      }).eq('id', session_video_id)
      if (orgId) {
        await supabase.from('spacareer_ai_usage_logs').insert({
          org_id: orgId,
          customer_id: customer_id ?? null,
          feature: 'minutes_generation',
          model: 'claude-haiku-4-5-20251001',
          input_tokens: usage.input_tokens ?? null,
          output_tokens: usage.output_tokens ?? null,
          status: 'error',
          error_message: parseError || 'empty ai response',
        })
      }
      return
    }

    // ── 6. DB 更新 ──────────────────────────────────────────
    const minutesDraft = buildMinutesDraftText(aiFeedback)
    const now = new Date().toISOString()

    const { error: videoUpdErr } = await supabase
      .from('spacareer_session_videos')
      .update({
        transcript,
        ai_feedback: aiFeedback,
        ai_status: 'done',
        processed_at: now,
      })
      .eq('id', session_video_id)
    if (videoUpdErr) console.error('[analyze-spacareer-session] session_video update error:', videoUpdErr)

    const { error: sessUpdErr } = await supabase
      .from('spacareer_sessions')
      .update({ minutes_draft: minutesDraft })
      .eq('id', session_id)
    if (sessUpdErr) console.error('[analyze-spacareer-session] session update error:', sessUpdErr)

    // 利用ログ
    const inputTokens = usage.input_tokens ?? 0
    const outputTokens = usage.output_tokens ?? 0
    const costUsd = Number(((inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0).toFixed(6))
    if (orgId) {
      await supabase.from('spacareer_ai_usage_logs').insert({
        org_id: orgId,
        customer_id: customer_id ?? null,
        feature: 'minutes_generation',
        model: 'claude-haiku-4-5-20251001',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd,
        status: 'success',
      })
    }

    console.log(`[analyze-spacareer-session] done session_video_id=${session_video_id}`)
  } catch (err) {
    console.error('[analyze-spacareer-session] unhandled:', err)
    await failVideo('AI 議事録生成中に予期しないエラーが発生しました', (err as Error).message)
  }
}

// ── メインハンドラ ─────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const { session_id, session_video_id, storage_path, recording_url, customer_id } = await req.json()

    // storage_path / recording_url は省略可（session_video_id の行から解決する）
    if (!session_id || !session_video_id) {
      return new Response(
        JSON.stringify({ error: 'session_id and session_video_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── 1. ai_status を 'processing' に ───────────────────────
    await supabase.from('spacareer_session_videos')
      .update({ ai_status: 'processing' })
      .eq('id', session_video_id)

    const bgPromise = processInBackground(session_id, session_video_id, storage_path, recording_url, customer_id)

    // deno-lint-ignore no-explicit-any
    if (typeof (globalThis as any).EdgeRuntime !== 'undefined') {
      // deno-lint-ignore no-explicit-any
      ;(globalThis as any).EdgeRuntime.waitUntil(bgPromise)
      return new Response(
        JSON.stringify({ status: 'processing', session_video_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ローカル / EdgeRuntime 無しの場合は同期完了
    await bgPromise
    const { data } = await supabase
      .from('spacareer_session_videos')
      .select('ai_status, transcript, ai_feedback, ai_error')
      .eq('id', session_video_id)
      .single()
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[analyze-spacareer-session] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
