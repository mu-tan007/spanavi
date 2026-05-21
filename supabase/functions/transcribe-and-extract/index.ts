// 録音を文字起こしし、テンプレのai_prompt+schemaに従って構造化フィールドを抽出する Edge Function
//
// Input (POST JSON):
//   recording_url: string (必須)
//   item_id?: string (Storage保存時のファイル名識別子)
//   ai_prompt: string (テンプレに紐付くAI指示)
//   extract_fields: [{ key, label, options? }]  ai_extract=true のフィールド情報
// Output:
//   { transcript, extracted: { [key]: string }, publicRecordingUrl }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const { recording_url, item_id, ai_prompt = '', extract_fields = [] } = await req.json()

    if (!recording_url) return json({ error: 'recording_url is required' }, 400)
    if (!Array.isArray(extract_fields) || extract_fields.length === 0) {
      return json({ error: 'extract_fields is required (non-empty array)' }, 400)
    }

    // Zoom Bearer token (Zoom URL のみ必要)
    const zoomToken: string | null = await (async () => {
      const isZoomUrl = /zoom\.us/i.test(recording_url)
      if (!isZoomUrl) return null
      const zoomAccountId    = Deno.env.get('ZOOM_ACCOUNT_ID')
      const zoomClientId     = Deno.env.get('ZOOM_CLIENT_ID')
      const zoomClientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')
      if (!zoomAccountId || !zoomClientId || !zoomClientSecret) return null
      const r = await fetch(
        `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${zoomAccountId}`,
        { method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${zoomClientId}:${zoomClientSecret}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      const d = await r.json()
      return d.access_token || null
    })()

    // 音声ダウンロード
    const audioRes = zoomToken
      ? await fetch(recording_url, { headers: { 'Authorization': `Bearer ${zoomToken}` } })
      : await fetch(recording_url)
    if (!audioRes.ok) return json({ error: `Failed to download recording: ${audioRes.status}` }, 500)
    const audioBuffer = await audioRes.arrayBuffer()
    const audioBlob   = new Blob([audioBuffer], { type: 'audio/mp4' })

    // Storage 保存（ベストエフォート）
    let publicRecordingUrl = ''
    try {
      const now = new Date()
      const dateStr = now.getFullYear().toString()
        + String(now.getMonth() + 1).padStart(2, '0')
        + String(now.getDate()).padStart(2, '0')
        + '_' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0')
      const safeItemId = (item_id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '')
      const fileName = `${safeItemId}_${dateStr}.mp4`
      const { error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(fileName, audioBuffer, { contentType: 'audio/mp4', upsert: true })
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('recordings').getPublicUrl(fileName)
        publicRecordingUrl = urlData.publicUrl
      }
    } catch (e) {
      console.warn('[transcribe-and-extract] Storage upload error:', e)
    }

    // Whisper
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) return json({ error: 'OPENAI_API_KEY not configured' }, 500)
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
      const errText = await whisperRes.text()
      return json({ error: `Whisper API error: ${errText}` }, 500)
    }
    const whisperData = await whisperRes.json()
    const transcript: string = whisperData.text || ''

    // Claude でテンプレ駆動抽出
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

    const fieldSpec = extract_fields.map((f: any) => {
      const opts = (f.options && f.options.length > 0) ? ` [選択肢: ${f.options.join(' / ')}]` : ''
      return `- "${f.key}" (${f.label}${opts})`
    }).join('\n')

    const prompt = `以下はテレアポの通話録音を文字起こししたものです。
録音の内容を分析し、指定のキーで JSON 形式のみで回答してください（他のテキスト・前置き不要）:

【抽出キー】
${fieldSpec}

${ai_prompt ? `【テンプレ固有の抽出指示】\n${ai_prompt}\n` : ''}
【出力形式】
{ "key1": "値1", "key2": "値2", ... }
- 各値は文字列で、不明な場合は空文字を返す
- options が指定されているフィールドは、その選択肢のいずれかから選ぶ
- 録音から明確に読み取れる範囲で記入し、推測で埋めすぎない

【文字起こし】
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
      const errText = await claudeRes.text()
      return json({ error: `Claude API error: ${errText}` }, 500)
    }
    const claudeData = await claudeRes.json()
    const claudeText: string = claudeData.content?.[0]?.text || '{}'

    let extracted: Record<string, string> = {}
    try {
      const m = claudeText.match(/\{[\s\S]*\}/)
      extracted = m ? JSON.parse(m[0]) : {}
    } catch (e) {
      console.error('[transcribe-and-extract] JSON parse error:', e, 'raw:', claudeText)
    }
    // 各値を文字列に正規化
    const normalized: Record<string, string> = {}
    for (const k of Object.keys(extracted)) {
      const v = extracted[k]
      normalized[k] = v == null ? '' : String(v)
    }

    return json({ transcript, extracted: normalized, publicRecordingUrl })
  } catch (err) {
    console.error('[transcribe-and-extract] unhandled error:', err)
    return json({ error: (err as Error).message || 'unknown error' }, 500)
  }
})
