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
    const { recording_url, item_id, personality, meetingExp, futureConsider, other } = await req.json()

    if (!recording_url) {
      return new Response(
        JSON.stringify({ error: 'recording_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 1. Zoom Bearer token 取得 ──────────────────────────────────────────
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

    // ── 2. 音声バイナリをダウンロード ─────────────────────────────────────
    // Zoom URL の場合のみ Bearer token で認証、それ以外は直接 fetch
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

    // ── 2.5. Supabase Storage へアップロード ─────────────────────────────
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
        // アップロード失敗でも後続処理は継続
      } else {
        const { data: urlData } = supabase.storage
          .from('recordings')
          .getPublicUrl(fileName)
        publicRecordingUrl = urlData.publicUrl
        console.log('[transcribe-recording] Storage upload 成功:', publicRecordingUrl)
      }
    } catch (storageErr) {
      console.error('[transcribe-recording] Storage error:', storageErr)
      // Storage エラーでも後続処理は継続
    }

    // ── 3. Whisper API で文字起こし ────────────────────────────────────────
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

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}` },
      body: formData,
    })

    if (!whisperRes.ok) {
      const whisperErr = await whisperRes.text()
      return new Response(
        JSON.stringify({ error: `Whisper API error: ${whisperErr}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const whisperData = await whisperRes.json()
    const transcript: string = whisperData.text || ''

    // ── 4. Claude で各フィールドを添削 ────────────────────────────────────
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
  "personality": "先方のお人柄について録音から読み取れる特徴を詳述。話し方の特徴（落ち着いている/早口/論理的/感情的）、思考の傾向（慎重/即断/数字重視/感覚重視/全体俯瞰/詳細追求）、コミュニケーションスタイル（聞き上手/話し上手/質問が多い/結論を急ぐ/間を取る）、価値観の片鱗（事業愛/従業員思い/数字至上/品質重視/挑戦志向）、態度（柔和/威圧的/警戒的/オープン）等を 3-5 文で具体的に。アポインターの記入があればそれを足場に肉付けする",
  "meetingExp": "他のM&A仲介会社との面談経験の有無と詳細",
  "futureConsider": "将来的な検討可否（お断りの強度・後継者問題への言及・検討時期等を踏まえて）",
  "other": "上記3項目以外でM&Aに関する重要事項があれば自然な文章で記載。なければ空欄",
  "keyman_ma_intent": "positive | wait | negative | unknown のいずれか1語のみ。録音全体から先方のM&A意向を総合判定"
}

【各フィールドの補完・修正ルール】
- アポインターの記入内容をベースに、録音から読み取れる情報で追記・修正する
- 録音の内容がアポインターの記入と矛盾する場合は録音を優先する
- 録音から判断できない場合は「確認できず」と記載する（keyman_ma_intent は unknown）

【録音分析の観点】
以下の観点で録音を分析し、各フィールドの内容に反映すること：

1. M&Aの趣旨が先方に伝わっているか
   「資本提携」「M&A」「会社の譲渡」「株式の譲渡」等のキーワードが使われているか確認する。
   単なる「提携」「業務提携」のみでは不十分とみなし、futureConsider や keyman_ma_intent に影響する可能性として記録する。

2. お断りの有無とその強度
   「興味ない」「検討していない」「結構です」等のお断りがあれば、
   その回数・強さのニュアンス（強い拒否 / やんわり断り）を futureConsider に詳述し、
   keyman_ma_intent の判定（negative かどうか）に反映する。

3. お人柄の手がかり（personality に反映）
   - 話速・声のトーン・抑揚・間の取り方
   - 質問の質と量（深掘りタイプ / 表面的）
   - 数字や具体例への反応
   - 従業員・取引先・家族に対する言及の温度
   - 当社（アポインター側）への評価・指摘の出方

4. M&Aに関わる重要事項（該当があれば「その他」に自然な文章で記載）
   - 後継者問題・事業承継への言及
   - 他社からのM&A提案・打診の有無
   - 会社の将来・経営方針に関する発言
   - 株主構成・経営体制に関する言及

【keyman_ma_intent 判定ガイド】
- positive: 前向き／積極的／関心が高い／検討の具体性あり／「もう少し話を聞きたい」等
- wait:     様子見／中立／「いずれ考えるかも」／結論を保留／業績次第
- negative: 消極的／拒否／「今は考えていない」／やんわり断り／強い拒絶
- unknown:  判断材料不足／会話が短い／本人不在／代理応答

【文字起こし】
${transcript}

【アポインターの記入内容】
- 先方のお人柄: ${personality || ''}
- 面談経験の有無: ${meetingExp || ''}
- 将来的な検討可否: ${futureConsider || ''}
- その他: ${other || ''}`

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
    } = {}
    try {
      // JSON ブロックが含まれる場合は抽出
      const jsonMatch = claudeText.match(/\{[\s\S]*\}/)
      enhanced = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    } catch (parseErr) {
      console.error('[transcribe-recording] JSON parse error:', parseErr, 'raw:', claudeText)
      // パース失敗時は元の値を返す
    }

    // keyman_ma_intent は 4 値以外を unknown に正規化
    const intentRaw = String(enhanced.keyman_ma_intent || '').toLowerCase().trim()
    const intent: 'positive' | 'wait' | 'negative' | 'unknown' =
      intentRaw === 'positive' || intentRaw === 'wait' || intentRaw === 'negative'
        ? intentRaw
        : 'unknown'

    // ── 5. 構造化 JSON を返却 ──────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        transcript,
        personality:         enhanced.personality    || personality    || '',
        meetingExp:          enhanced.meetingExp     || meetingExp     || '',
        futureConsider:      enhanced.futureConsider || futureConsider || '',
        other:               enhanced.other          || other          || '',
        keyman_ma_intent:    intent,
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
