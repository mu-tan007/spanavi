// ============================================================
// process-contact-voice
// ------------------------------------------------------------
// 1) contact_voice_inputs.id を受け取り、Storage から音声をダウンロード
// 2) Whisper で文字起こし
// 3) target_kind に応じて Claude で整形:
//    - 'contact_memo'  : 担当者メモ用に Markdown 構造化 + 構造化タグ抽出
//    - 'client_update' : 既存クライアントへの更新差分を抽出
//    - 'client_create' : 新規クライアントの全フィールドを抽出
// 4) contact_voice_inputs に transcript / ai_summary / ai_extracted を保存し
//    status=processed にする
// 5) 結果をフロントに返す（ここでは DB への適用はしない。確認画面で適用）
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { voice_input_id } = await req.json()
    if (!voice_input_id) return json({ error: 'voice_input_id is required' }, 400)

    // ── 1) voice_input ロード ──────────────────────────────────────
    const { data: viRow, error: viErr } = await supabase
      .from('contact_voice_inputs')
      .select('*')
      .eq('id', voice_input_id)
      .single()
    if (viErr || !viRow) return json({ error: 'voice_input not found', detail: viErr?.message }, 404)
    if (!viRow.audio_url) return json({ error: 'audio_url not set on voice_input' }, 400)

    // ── 2) Storage から音声ダウンロード ────────────────────────────
    const { data: audioBlob, error: dlErr } = await supabase.storage
      .from('contact-audio')
      .download(viRow.audio_url)
    if (dlErr || !audioBlob) {
      await markFailed(voice_input_id, `download failed: ${dlErr?.message || 'unknown'}`)
      return json({ error: 'audio download failed', detail: dlErr?.message }, 500)
    }

    // ── 3) Whisper ───────────────────────────────────────────────
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      await markFailed(voice_input_id, 'OPENAI_API_KEY not configured')
      return json({ error: 'OPENAI_API_KEY not configured' }, 500)
    }

    const ext = (viRow.audio_url.split('.').pop() || 'webm').toLowerCase()
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
      const errText = await whisperRes.text()
      await markFailed(voice_input_id, `whisper error: ${errText}`)
      return json({ error: 'Whisper API error', detail: errText }, 500)
    }
    const whisperData = await whisperRes.json()
    const transcript: string = whisperData.text || ''

    // ── 4) Claude で整形 ─────────────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      await markFailed(voice_input_id, 'ANTHROPIC_API_KEY not configured')
      return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)
    }

    const prompt = buildPrompt(viRow.target_kind, transcript)
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!claudeRes.ok) {
      const errText = await claudeRes.text()
      await markFailed(voice_input_id, `claude error: ${errText}`)
      return json({ error: 'Anthropic API error', detail: errText }, 500)
    }
    const claudeData = await claudeRes.json()
    const claudeText: string = (claudeData.content || [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')

    // ── 5) JSON 抽出 ─────────────────────────────────────────────
    let parsed: { summary?: string; extracted?: Record<string, unknown> } = {}
    try {
      const m = claudeText.match(/\{[\s\S]*\}/)
      if (m) parsed = JSON.parse(m[0])
    } catch (e) {
      console.error('[process-contact-voice] parse failed:', e, 'raw:', claudeText)
      parsed = { summary: claudeText, extracted: {} }
    }

    const ai_summary = parsed.summary || ''
    const ai_extracted = parsed.extracted || {}

    // ── 6) DB 更新 ───────────────────────────────────────────────
    const { error: upErr } = await supabase
      .from('contact_voice_inputs')
      .update({
        transcript,
        ai_summary,
        ai_extracted,
        status: 'processed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', voice_input_id)
    if (upErr) {
      console.error('[process-contact-voice] update error:', upErr)
      return json({ error: 'failed to save processing result', detail: upErr.message }, 500)
    }

    return json({
      voice_input_id,
      transcript,
      ai_summary,
      ai_extracted,
      target_kind: viRow.target_kind,
    })
  } catch (e) {
    console.error('[process-contact-voice] uncaught:', e)
    return json({ error: 'internal error', detail: (e as Error).message }, 500)
  }
})

async function markFailed(id: string, message: string) {
  await supabase
    .from('contact_voice_inputs')
    .update({ status: 'failed', error: message, updated_at: new Date().toISOString() })
    .eq('id', id)
}

function buildPrompt(targetKind: string, transcript: string): string {
  if (targetKind === 'contact_memo') {
    return `あなたは M&A 仲介向けセールス支援 SaaS の担当者性格管理 AI です。
以下は、自社営業担当者が、あるクライアント担当者（取引相手の人物）について話した音声の文字起こしです。
これを基に、引き継ぎや次回コンタクト時に役立つ Markdown メモを作成してください。

文字起こし:
"""
${transcript}
"""

出力ルール:
- summary は Markdown。以下 4 セクションのうち言及があったものだけを出す。無いセクションは省略。
  - **人物像**: 経歴・性格・役職・出身など
  - **コミュニケーション**: 連絡傾向 / 好む手段 / レス速度 / 好む時間帯
  - **接し方**: 刺さる点 / 避けるべき点 / トーンの取り方
  - **注意**: 特殊な癖や行動パターン、業務上の禁忌
- 推測で水増ししない。文字起こしから読み取れない情報は書かない。
- 文体は簡潔・断定。"〜らしい" "〜のようだ" は避け、確度の低いものは "〜と見られる" 程度。
- extracted は構造化タグ。文字起こしから明示的に読み取れる項目のみ埋める。読み取れないものは null/[]。

返答は以下の JSON のみ。前置き・説明・コードブロックフェンスは一切不要：
{
  "summary": "Markdown 文字列。改行は \\n",
  "extracted": {
    "disc": "D" | "I" | "S" | "C" | null,
    "decision_level": "最終決裁" | "部分決裁" | "影響" | "情報のみ" | null,
    "prefers_channel": "Slack" | "メール" | "電話" | "LINE" | "Chatwork" | "対面" | null,
    "prefers_time": "午前" | "午後" | "夕方" | "深夜" | null,
    "response_speed": "30分以内" | "1時間以内" | "半日" | "1日" | "それ以上" | null,
    "hot_keywords": ["..."],
    "ng_keywords": ["..."],
    "traits": ["数字重視" | "即断即決" | "関係重視" | "慎重派" | "革新志向" | "安定志向" | "..."],
    "hometown": null,
    "hobby": null,
    "birthday_md": null
  }
}`
  }

  if (targetKind === 'client_update') {
    return `あなたは M&A 仲介向けセールス支援 SaaS のクライアント情報更新 AI です。
以下の音声文字起こしから、既存クライアントに対して更新したい項目を抽出してください。
触れられていない項目は出力しないでください（差分のみ）。

文字起こし:
"""
${transcript}
"""

抽出対象フィールド (clients テーブル):
- status: '支援中' | '準備中' | '停止中' | '保留' | '中期フォロー' | '面談予定'
- contract_status: '済' | '未'
- industry (string)
- supply_target (number, 月間供給目標件数)
- reward_type (string, 例: '1', '2', '3', アルファベット可)
- payment_site (string)
- payment_note (string)
- list_source: '当社持ち' | '先方持ち' | '両方'
- calendar_type: 'Google' | 'Spir' | 'Outlook' | 'なし' | '調整アポ' | 'Google(入力)'
- contact_method: 'LINE' | 'Slack' | 'Chatwork' | 'メール'
- client_email (string)
- google_calendar_id (string)
- scheduling_url (string)
- notes (初回面談メモ)
- note_kickoff (キックオフメモ)
- note_regular (定期MTGメモ)

担当者の追加 (contacts_to_add): 名前+役職+メール+電話+slack_id 等。1人ずつ。

返答は以下の JSON のみ：
{
  "summary": "簡潔な人間向けサマリ (Markdown 可)",
  "extracted": {
    "client_fields": { "status": "...", "supply_target": 10, ...省略可 },
    "contacts_to_add": [
      { "name": "...", "role": "...", "email": "...", "phone": "...", "slack_member_id": "..." }
    ]
  }
}`
  }

  if (targetKind === 'client_create') {
    return `あなたは M&A 仲介向けセールス支援 SaaS の新規クライアント登録 AI です。
以下の音声文字起こしから、新しいクライアント（M&A仲介会社・ファンド・買い手企業）の登録情報を抽出してください。

文字起こし:
"""
${transcript}
"""

返答は以下の JSON のみ：
{
  "summary": "簡潔な人間向けサマリ",
  "extracted": {
    "client_fields": {
      "name": "企業名 (必須)",
      "status": "支援中" | "準備中" | "停止中" | "保留" | "中期フォロー" | "面談予定",
      "contract_status": "済" | "未",
      "industry": null,
      "supply_target": null,
      "reward_type": null,
      "payment_site": null,
      "payment_note": null,
      "list_source": null,
      "calendar_type": null,
      "contact_method": null,
      "client_email": null,
      "google_calendar_id": null,
      "scheduling_url": null,
      "notes": null
    },
    "contacts_to_add": [
      { "name": "...", "role": "...", "email": "...", "phone": "...", "slack_member_id": "..." }
    ]
  }
}

注意:
- 言及がないフィールドは null
- name (企業名) は最低限聞き取れること。聞き取れない場合は extracted.client_fields.name = null とする`
  }

  return `target_kind=${targetKind} は未対応です。文字起こしのみ返します:
"""
${transcript}
"""
返答: {"summary": "${transcript.slice(0, 500)}", "extracted": {}}`
}
