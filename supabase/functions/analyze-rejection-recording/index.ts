// キーマン断り録音の「再アプローチ温度感」構造化分析 Edge Function
// 用途: スマートキュー（リスト跨ぎ再アプローチ）の候補選別
// 入力: { recording_url }
// 出力: 構造化 JSON (reapproach_action / contact_path / boss_engagement_seconds / 等)
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
    const body = await req.json()
    let { recording_url } = body
    const { record_id, save_to_db } = body

    // record_id 指定時は DB から recording_url を取得（service role 経由なので RLS bypass）
    if (record_id && !recording_url) {
      const { data, error } = await supabase
        .from('call_records')
        .select('recording_url')
        .eq('id', record_id)
        .single()
      if (error || !data?.recording_url) {
        return json({ error: `failed to fetch recording_url for ${record_id}: ${error?.message || 'no url'}` }, 400)
      }
      recording_url = data.recording_url
    }

    if (!recording_url) {
      return json({ error: 'recording_url or record_id is required' }, 400)
    }

    // ── 1. Zoom token (zoom URL のみ) ──────────────────────────────────
    const isZoomUrl = /zoom\.us/i.test(recording_url)
    let zoomToken = ''
    if (isZoomUrl) {
      const accountId = Deno.env.get('ZOOM_ACCOUNT_ID')
      const clientId  = Deno.env.get('ZOOM_CLIENT_ID')
      const secret    = Deno.env.get('ZOOM_CLIENT_SECRET')
      if (!accountId || !clientId || !secret) return json({ error: 'Zoom credentials not configured' }, 500)
      const tokenRes = await fetch(
        `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
        { method: 'POST', headers: {
            'Authorization': 'Basic ' + btoa(`${clientId}:${secret}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          } })
      const td = await tokenRes.json()
      zoomToken = td.access_token
      if (!zoomToken) return json({ error: 'Failed to obtain Zoom token' }, 500)
    }

    // ── 2. 音声ダウンロード ──────────────────────────────────────────
    const audioRes = isZoomUrl
      ? await fetch(recording_url, { headers: { 'Authorization': `Bearer ${zoomToken}` } })
      : await fetch(recording_url)
    if (!audioRes.ok) return json({ error: `Failed to download recording: ${audioRes.status}` }, 500)
    const audioBuffer = await audioRes.arrayBuffer()
    const audioBlob   = new Blob([audioBuffer], { type: 'audio/mp4' })

    // ── 3. Whisper 文字起こし ───────────────────────────────────────
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) return json({ error: 'OPENAI_API_KEY not configured' }, 500)
    const formData = new FormData()
    formData.append('file', audioBlob, 'recording.mp4')
    formData.append('model', 'whisper-1')
    formData.append('language', 'ja')
    // 後で「実会話時間」を推定したいので segments も取得
    formData.append('response_format', 'verbose_json')
    formData.append('timestamp_granularities[]', 'segment')

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}` },
      body: formData,
    })
    if (!whisperRes.ok) {
      const errTxt = await whisperRes.text()
      return json({ error: `Whisper API error: ${errTxt}` }, 500)
    }
    const whisperData = await whisperRes.json()
    const transcript: string = whisperData.text || ''
    const totalDuration: number = whisperData.duration || 0  // seconds

    // ── 4. Claude haiku で構造化判定 ──────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

    const prompt = `あなたはM&Aアドバイザリーのテレアポ録音を分析する専門アシスタントです。以下はキーマン（社長/代表者）への架電のうち「キーマン断り」となった通話の文字起こしです。これを構造化分析し、再アプローチ候補として残すべきか判定してください。

重要な判定軸:

【1. contact_path: 接続経路】
- "DIRECT_BOSS"     = 最初から社長と話している（受付なし、または受付ですぐ取次）
- "VIA_RECEPTION"   = 受付スタッフを介して社長へ取次された
- "RECEPTION_ONLY"  = 結局社長と話せず受付/取次者で終わった
- "UNKNOWN"         = 判定不能

【2. boss_engagement_seconds: 社長との実会話秒数（推定）】
- 受付対応時間や保留時間を除き、実際に社長と話していた秒数を推定
- 文字起こし全体の長さと社長の発言比率から推定
- 社長と話していない場合は 0

【3. reapproach_action: 再アプローチ判定】
- "EXCLUDE": 以下のいずれかに該当
  - 社長が「M&Aには一切興味ない」と強い口調で瞬殺
  - 怒り / クレーム / 強い拒絶口調
  - 社長との実会話が極端に短く（10秒未満）対話が成立していない
  - 受付ですらブロックされた（社長判断ですらない）
  - 既に他社M&A検討中 / 既に売却済 / 後継者完全決定済 等で物理的に不可能
- "KEEP": 以下のいずれかに該当
  - 社長との会話が成立しており、対話的な断り方（質問を返した、理由を説明した等）
  - 「今は」「現時点では」「タイミングが」など余地を残す言い回し
  - 後継者問題や事業承継への言及あり（検討可能性の手がかり）
  - 礼儀正しい断り方（強い拒絶ではない）
- "UNCERTAIN": 判定材料が不足、文字起こし不鮮明

【4. exclude_reasons: 除外理由タグ（reapproach_action='EXCLUDE'の時）】
- 配列で複数選択可: "SHORT_DISMISSAL", "ANGER_OR_COMPLAINT", "BLOCKED_BY_RECEPTION", "NO_BOSS_CONTACT", "ALREADY_DECIDED", "STRONG_REFUSAL"

【5. その他】
- rejection_reason: 失注理由を2-4文で要約
- recall_potential: HIGH / MEDIUM / LOW のいずれか（reapproach_action と整合）
- recall_approach: 次回再コール時の話しぶり指針を2-4文で
- key_quote: 判断根拠となった社長/受付の発言を1つ抜粋（10-40字程度）

【参考情報】
- 通話全体の長さ: ${totalDuration.toFixed(1)}秒

【必ず以下のJSONフォーマットのみで回答（前後に余計なテキストを付けない）】
{
  "contact_path": "DIRECT_BOSS" | "VIA_RECEPTION" | "RECEPTION_ONLY" | "UNKNOWN",
  "boss_engagement_seconds": number,
  "reapproach_action": "EXCLUDE" | "KEEP" | "UNCERTAIN",
  "exclude_reasons": string[],
  "rejection_reason": string,
  "recall_potential": "HIGH" | "MEDIUM" | "LOW",
  "recall_approach": string,
  "key_quote": string
}

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
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!claudeRes.ok) {
      const errTxt = await claudeRes.text()
      return json({ error: `Claude API error: ${errTxt}` }, 500)
    }
    const claudeData = await claudeRes.json()
    const claudeText: string = claudeData.content?.[0]?.text || '{}'

    let result: any = {}
    try {
      const m = claudeText.match(/\{[\s\S]*\}/)
      result = m ? JSON.parse(m[0]) : {}
    } catch (e) {
      console.error('[analyze-rejection-recording] JSON parse error:', e, 'raw:', claudeText)
    }

    // record_id + save_to_db フラグなら call_records.rejection_reason に保存
    //   フォーマット: `${recall_potential}\n${rejection_reason}`
    //   KeymanRejectionsPanel の extractTemp が冒頭の HIGH/MEDIUM/LOW を抽出
    if (record_id && save_to_db) {
      const temp = result.recall_potential || ''
      const body = result.rejection_reason || ''
      const reason = temp ? `${temp}\n${body}` : body
      if (reason) {
        const { error: updErr } = await supabase
          .from('call_records')
          .update({ rejection_reason: reason })
          .eq('id', record_id)
        if (updErr) console.error('[analyze-rejection-recording] update failed:', updErr)
      }
    }

    return json({
      transcript,
      total_duration_seconds: totalDuration,
      analysis: result,
    })
  } catch (err) {
    console.error('[analyze-rejection-recording] Unhandled error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
