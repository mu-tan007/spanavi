import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// 外部AI API（Whisper / Claude）の一時的な失敗に対して指数バックオフでリトライする fetch。
// 対象: ネットワーク断・タイムアウト等の例外、および 429(レート制限) / 529(overloaded) / 5xx。
// これがないと朝の架電ピーク時に上流が 529/429 を返した瞬間、添削が丸ごと 500 で落ちる。
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { retries?: number; baseDelayMs?: number; label?: string } = {},
): Promise<Response> {
  const { retries = 3, baseDelayMs = 1000, label = 'fetch' } = opts
  let lastErr: unknown = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init)
      if (res.status === 429 || res.status === 529 || res.status >= 500) {
        if (attempt < retries) {
          const wait = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 300)
          console.warn(`[transcribe-recording] ${label} ${res.status} 一時エラー。${wait}ms後にリトライ (${attempt + 1}/${retries})`)
          await new Promise((r) => setTimeout(r, wait))
          continue
        }
      }
      return res
    } catch (err) {
      lastErr = err
      if (attempt < retries) {
        const wait = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 300)
        console.warn(`[transcribe-recording] ${label} 例外。${wait}ms後にリトライ (${attempt + 1}/${retries}):`, (err as Error).message)
        await new Promise((r) => setTimeout(r, wait))
        continue
      }
    }
  }
  throw lastErr ?? new Error(`${label}: all retries failed`)
}

const VALID_PATTERNS = new Set([
  'smooth', 'negative_to_positive', 'keyman_difficulty',
  'after_concern', 'standard', 'unknown',
])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { recording_url, item_id, personality, meetingExp, futureConsider, other, appointment_id } = await req.json()

    if (!recording_url) {
      return new Response(
        JSON.stringify({ error: 'recording_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const zoomAccountId    = Deno.env.get('ZOOM_ACCOUNT_ID')
    const zoomClientId     = Deno.env.get('ZOOM_CLIENT_ID')
    const zoomClientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')

    if (!zoomAccountId || !zoomClientId || !zoomClientSecret) {
      return new Response(
        JSON.stringify({ error: 'Zoom credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const tokenRes = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${zoomAccountId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${zoomClientId}:${zoomClientSecret}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    )
    const tokenData = await tokenRes.json()
    const zoomToken: string = tokenData.access_token

    if (!zoomToken) {
      return new Response(
        JSON.stringify({ error: 'Failed to obtain Zoom access token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const isZoomUrl = /zoom\.us/i.test(recording_url)
    const audioRes = isZoomUrl
      ? await fetch(recording_url, { headers: { 'Authorization': `Bearer ${zoomToken}` } })
      : await fetch(recording_url)

    if (!audioRes.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to download recording: ${audioRes.status} ${audioRes.statusText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const audioBuffer = await audioRes.arrayBuffer()
    const audioBlob   = new Blob([audioBuffer], { type: 'audio/mp4' })

    let publicRecordingUrl = ''
    try {
      const now     = new Date()
      const dateStr = now.getFullYear().toString()
        + String(now.getMonth() + 1).padStart(2, '0')
        + String(now.getDate()).padStart(2, '0')
        + '_'
        + String(now.getHours()).padStart(2, '0')
        + String(now.getMinutes()).padStart(2, '0')
      const safeItemId = (item_id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '')
      const fileName   = `${safeItemId}_${dateStr}.mp4`

      const { error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(fileName, audioBuffer, { contentType: 'audio/mp4', upsert: true })

      if (uploadError) {
        console.error('[transcribe-recording] Storage upload 失敗:', uploadError.message)
      } else {
        const { data: urlData } = supabase.storage
          .from('recordings')
          .getPublicUrl(fileName)
        publicRecordingUrl = urlData.publicUrl
      }
    } catch (storageErr) {
      console.error('[transcribe-recording] Storage error:', storageErr)
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const formData = new FormData()
    formData.append('file', audioBlob, 'recording.mp4')
    formData.append('model', 'whisper-1')
    formData.append('language', 'ja')

    const whisperRes = await fetchWithRetry('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}` },
      body: formData,
    }, { label: 'Whisper' })

    if (!whisperRes.ok) {
      const whisperErr = await whisperRes.text()
      return new Response(
        JSON.stringify({ error: `Whisper API error: ${whisperErr}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const whisperData = await whisperRes.json()
    const transcript: string = whisperData.text || ''

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const prompt = `以下はM&Aアドバイザリーのテレアポで取得したアポイントの録音文字起こしと、
アポインターが記入した報告内容です。
録音を分析し、アポインターの記入内容を補完・修正して、
必ず以下のJSONフォーマットのみで回答してください（他のテキストなし）：

{
  "personality": "先方のお人柄を詳述。3-5文で具体的に。",
  "meetingExp": "他のM&A仲介会社との面談経験の有無と詳細",
  "futureConsider": "将来的な検討可否（お断りの強度・後継者問題への言及・検討時期等を踏まえて）",
  "other": "上記3項目以外でM&Aに関する重要事項があれば自然な文章で記載。なければ空欄",
  "keyman_ma_intent": "positive | wait | negative | unknown のいずれか1語のみ",
  "appo_pattern": "smooth | negative_to_positive | keyman_difficulty | after_concern | standard | unknown のいずれか1語",
  "talk_style_tags": ["話し方タグ最大5個。日本語短語"],
  "talk_strength": "このアポ取得で特に効いた話し方を1-2文の日本語で簡潔に"
}

【keyman_ma_intent 判定ガイド】
- positive: 前向き／積極的／関心が高い
- wait:     様子見／中立
- negative: 消極的／拒否
- unknown:  判断材料不足

【appo_pattern 判定ガイド】
- smooth:                先方が最初から好意的で、ほぼ抵抗なくアポ取得に至った
- negative_to_positive:  最初は興味なし／断りモードだったが、アポインターの切り返しで好転しアポ取得
- keyman_difficulty:     キーマン（決裁者）に繋がりにくく、複数の関門突破や別事業所経由などを経てアポ取得
- after_concern:         先方が懸念（時間・費用・社内反応・既存付き合い等）を表明したが、解消説明を経てアポ取得
- standard:              特筆すべき山なく、業務的に淡々と進んでアポ取得
- unknown:               録音が短すぎる／音質悪い／本人不在のため判定不能

【talk_style_tags 抽出ガイド】
アポインターの「話し方の特徴」を端的に表す日本語短語タグを最大5個。
例: 共感的傾聴 / 質問深掘り / ベネフィット訴求 / 即決クロージング / 業界知識アピール /
    お悩み代弁 / 数字根拠提示 / リフレーミング / 雑談アイスブレイク / 後継者課題喚起 /
    二者択一クローズ / 社長称賛 / 競合言及 / 第三者話法

【talk_strength 抽出ガイド】
このアポでアポインターの "決め手" になったと推定される話し方を1-2文で。

【文字起こし】
${transcript}

【アポインターの記入内容】
- 先方のお人柄: ${personality || ''}
- 面談経験の有無: ${meetingExp || ''}
- 将来的な検討可否: ${futureConsider || ''}
- その他: ${other || ''}`

    const claudeRes = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2560,
        messages: [{ role: 'user', content: prompt }],
      }),
    }, { label: 'Claude' })

    if (!claudeRes.ok) {
      const claudeErr = await claudeRes.text()
      return new Response(
        JSON.stringify({ error: `Claude API error: ${claudeErr}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const claudeData = await claudeRes.json()
    const claudeText: string = claudeData.content?.[0]?.text || '{}'

    let enhanced: {
      personality?: string
      meetingExp?: string
      futureConsider?: string
      other?: string
      keyman_ma_intent?: string
      appo_pattern?: string
      talk_style_tags?: unknown
      talk_strength?: string
    } = {}
    try {
      const jsonMatch = claudeText.match(/\{[\s\S]*\}/)
      enhanced = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    } catch (parseErr) {
      console.error('[transcribe-recording] JSON parse error:', parseErr, 'raw:', claudeText)
    }

    const intentRaw = String(enhanced.keyman_ma_intent || '').toLowerCase().trim()
    const intent: 'positive' | 'wait' | 'negative' | 'unknown' =
      intentRaw === 'positive' || intentRaw === 'wait' || intentRaw === 'negative'
        ? intentRaw
        : 'unknown'

    const patternRaw = String(enhanced.appo_pattern || '').toLowerCase().trim()
    const appoPattern: string = VALID_PATTERNS.has(patternRaw) ? patternRaw : 'unknown'

    let talkStyleTags: string[] = []
    if (Array.isArray(enhanced.talk_style_tags)) {
      talkStyleTags = (enhanced.talk_style_tags as unknown[])
        .filter((t): t is string => typeof t === 'string')
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 0 && t.length <= 40)
        .slice(0, 5)
    }

    const talkStrength = typeof enhanced.talk_strength === 'string'
      ? enhanced.talk_strength.trim().slice(0, 500)
      : ''

    if (appointment_id) {
      try {
        const { error: updErr } = await supabase
          .from('appointments')
          .update({
            appo_pattern:    appoPattern,
            talk_style_tags: talkStyleTags,
            talk_strength:   talkStrength,
            keyman_ma_intent: intent,
          })
          .eq('id', appointment_id)
        if (updErr) console.error('[transcribe-recording] appointments update error:', updErr.message)
      } catch (updateErr) {
        console.error('[transcribe-recording] appointments update unhandled:', updateErr)
      }
    }

    return new Response(
      JSON.stringify({
        transcript,
        personality:         enhanced.personality    || personality    || '',
        meetingExp:          enhanced.meetingExp     || meetingExp     || '',
        futureConsider:      enhanced.futureConsider || futureConsider || '',
        other:               enhanced.other          || other          || '',
        keyman_ma_intent:    intent,
        appo_pattern:        appoPattern,
        talk_style_tags:     talkStyleTags,
        talk_strength:       talkStrength,
        publicRecordingUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[transcribe-recording] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
