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

    // 標準キーには旧 transcribe-recording 相当の詳細ガイドラインを差し込む
    const STD_GUIDE: Record<string, string> = {
      personality: '話し方の特徴（落ち着いている/早口/論理的/感情的）、思考の傾向（慎重/即断/数字重視/感覚重視/全体俯瞰/詳細追求）、コミュニケーションスタイル（聞き上手/話し上手/質問が多い/結論を急ぐ/間を取る）、価値観の片鱗（事業愛/従業員思い/数字至上/品質重視/挑戦志向）、態度（柔和/威圧的/警戒的/オープン）等を 3-5 文で具体的に',
      meetingExp:   '他のM&A仲介会社との面談経験の有無と詳細（時期・相手先・印象等）',
      futureConsider: '将来的な検討可否（お断りの強度・後継者問題への言及・検討時期・条件等を踏まえて）',
      other:        '上記3項目以外でM&Aに関する重要事項（後継者問題・他社からの打診・株主構成・経営方針等）。なければ空欄',
    }

    const fieldSpec = extract_fields.map((f: any) => {
      const opts = (f.options && f.options.length > 0) ? ` [選択肢: ${f.options.join(' / ')}]` : ''
      const guide = STD_GUIDE[f.key] ? ` ※${STD_GUIDE[f.key]}` : ''
      return `- "${f.key}" (${f.label}${opts})${guide}`
    }).join('\n')

    const prompt = `以下はM&Aアドバイザリーのテレアポ通話録音を文字起こししたものです。
録音を分析し、アポインターの記入内容を補完・修正して、指定のキーで JSON 形式のみで回答してください（他のテキスト・前置き不要）。

【抽出キー】
${fieldSpec}
- "keyman_ma_intent" (キーマンのM&A意向: positive / wait / negative / unknown のいずれか1語のみ)

${ai_prompt ? `【テンプレ固有の抽出指示】\n${ai_prompt}\n` : ''}
【話者の取り扱い（厳守）】
- 抽出対象は「先方（受電側＝被アポ企業の担当者）」の発話と、そこから読み取れる情報のみ。
- アポインター（架電側＝当社／代行社）の自己紹介・自社社員名・自社電話番号・自社メールアドレス・自社サービス説明は、絶対に先方情報として抽出しない。
- 録音中に登場する「フラーレン」「○○と申します」「私の電話番号」「弊社」等の発話はすべてアポインター側のものとして除外する。

【録音分析の観点】
1. M&Aの趣旨が先方に伝わっているか（「資本提携」「M&A」「会社の譲渡」等のキーワード）
2. お断りの有無とその強度（強い拒否 / やんわり / 「興味ない」「結構です」等）
3. お人柄の手がかり（話速・トーン・質問の質・従業員/取引先/家族への言及温度・当社評価）
4. M&Aに関わる重要事項（後継者問題・他社からの打診・将来経営方針・株主構成）

【keyman_ma_intent 判定ガイド】
- positive: 前向き／積極的／関心が高い／検討の具体性あり
- wait:     様子見／中立／「いずれ考えるかも」／結論を保留／業績次第
- negative: 消極的／拒否／「今は考えていない」／やんわり断り／強い拒絶
- unknown:  判断材料不足／会話が短い／本人不在／代理応答

【出力形式・ルール】
{ "key1": "値1", "key2": "値2", "keyman_ma_intent": "wait" }
- 各値は **値そのものだけ** を文字列で返す。フィールド名・ラベル名を値の先頭に含めてはいけない。
  - ✅ 正: "businessDetail": "デザインの企画・制作"
  - ❌ 誤: "businessDetail": "事業内容：デザインの企画・制作"
  - ✅ 正: "personality": "落ち着いた話し方で..."
  - ❌ 誤: "personality": "先方のお人柄：落ち着いた話し方で..."
- 録音から読み取れない場合は「確認できず」（keyman_ma_intent は "unknown"）。
- options 指定フィールドはその選択肢から選ぶ。
- 録音からの示唆は明示し、推測ベースで埋めすぎない。ただし標準キー（人柄/面談経験/検討可否/その他）は録音から読み取れる範囲で具体的に書く（簡潔すぎる回答は不可）。

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
    // 各値を文字列に正規化 + 先頭ラベル汚染を除去（AIが「事業内容：◯◯」のように
    // ラベル名込みで返してきた場合の保険サニタイズ）
    const fieldLabelMap: Record<string, string[]> = {}
    for (const f of extract_fields) {
      if (f.key && f.label) fieldLabelMap[f.key] = [String(f.label)]
    }
    // 標準キーのラベル候補（schemaから来る label と重複してもOK）
    const STD_LABELS: Record<string, string[]> = {
      personality: ['先方のお人柄', 'お人柄'],
      meetingExp: ['面談経験の有無', '面談経験'],
      futureConsider: ['将来的な検討可否', '検討可否'],
      other: ['その他'],
      businessDetail: ['事業内容', '業務内容'],
      contactName: ['担当者名', '担当者氏名'],
    }
    const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const stripLeadingLabel = (val: string, labels: string[]): string => {
      if (!val) return val
      for (const lbl of labels) {
        const re = new RegExp('^\\s*' + escapeRe(lbl) + '\\s*[:：]\\s*')
        if (re.test(val)) return val.replace(re, '')
      }
      return val
    }
    const normalized: Record<string, string> = {}
    for (const k of Object.keys(extracted)) {
      const v = extracted[k]
      const s = v == null ? '' : String(v)
      const labels = [...(fieldLabelMap[k] || []), ...(STD_LABELS[k] || [])]
      normalized[k] = stripLeadingLabel(s, labels)
    }
    // keyman_ma_intent は positive / wait / negative / unknown のいずれかに正規化
    const VALID_INTENT = new Set(['positive', 'wait', 'negative', 'unknown'])
    const rawIntent = (normalized['keyman_ma_intent'] || '').toLowerCase().trim()
    const keyman_ma_intent = VALID_INTENT.has(rawIntent) ? rawIntent : 'unknown'

    return json({ transcript, extracted: normalized, keyman_ma_intent, publicRecordingUrl })
  } catch (err) {
    console.error('[transcribe-and-extract] unhandled error:', err)
    return json({ error: (err as Error).message || 'unknown error' }, 500)
  }
})
