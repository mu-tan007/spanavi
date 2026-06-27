// 採用候補者の「イケてる判定」AIラベリング Edge Function
// 用途: スパキャリ採用管理。面接前に候補者を職種別観点で5段階評価する。
//   営業(sales)     : experience(営業経験) / achievement(実績インパクト) / 総合
//   トレーナー(trainer): ai_knowledge(AI知見) / mentoring(指導育成)        / 総合
// 入力: { applicant_id }
// 出力: recruit_applicants の ai_* 列を更新（総合 / 軸別 / 理由 / 情報不足）
//
// 方針: profile_text に記載がない事項は推測で減点しない。判断材料が乏しければ
//       断定せず info_insufficient=true（=要面接確認）。優秀層を情報量だけで取りこぼさない。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'claude-haiku-4-5-20251001'
// この文字数未満の自己PRは AI に投げず即「情報不足」扱い
const MIN_PROFILE_CHARS = 40

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// 職種別の評価プロンプトを組み立てる
function buildPrompt(jobType: string, jobTitle: string, profileText: string): string {
  const common = `あなたはスパキャリ事業部の採用担当を補佐するアシスタントです。
複業クラウドから応募してきた候補者の自己PR/プロフィールを読み、面接に進めるべき「イケてる候補者」かを評価してください。

【最重要ルール】
- 自己PRに「書かれていない」ことを、勝手に「無い」と決めつけて減点しないこと。
- 判断材料が乏しく評価しきれない場合は、無理にスコアを出さず info_insufficient=true とし、overall_score と各軸スコアは null にしてよい。情報量が少ないだけの優秀な人材を低評価で取りこぼさないため。
- スコアは 1〜5 の5段階（5=非常に有望・すぐ面接したい / 4=有望 / 3=要検討 / 2=やや弱い / 1=見送り寄り）。
- reason は日本語で1〜2文。根拠（読み取れた経歴・実績の要点、または「〜は記載なし」）を簡潔に書く。

【応募求人見出し】
${jobTitle || '(不明)'}

【候補者の自己PR/プロフィール】
${profileText}
`

  if (jobType === 'trainer') {
    return common + `
この候補者は【トレーナー（研修講師）】への応募です。次の観点で評価してください。
- ai_knowledge: AIに対する知見の深さ（生成AIの実務活用・開発・教育/登壇経験など。具体性があるほど高評価）
- mentoring: 指導・育成の経験（研修/講師/メンター/マネジメント等。具体性があるほど高評価）
- overall_score: 上記を踏まえた総合「イケてる度」

次のJSONのみを出力してください（前後の説明文やコードフェンスは不要）:
{"overall_score": 1-5 or null, "axis_scores": {"ai_knowledge": 1-5 or null, "mentoring": 1-5 or null}, "info_insufficient": true/false, "reason": "日本語の短文"}`
  }

  // sales / unknown は営業基準で評価
  return common + `
この候補者は【営業】への応募です。次の観点で評価してください。
- experience: 営業経験の有無と厚み（経験年数・取扱商材・規模感。具体性があるほど高評価）
- achievement: 営業実績のインパクト（売上/達成率/表彰/新規開拓などの数値・具体性。具体性があるほど高評価）
- overall_score: 上記を踏まえた総合「イケてる度」

次のJSONのみを出力してください（前後の説明文やコードフェンスは不要）:
{"overall_score": 1-5 or null, "axis_scores": {"experience": 1-5 or null, "achievement": 1-5 or null}, "info_insufficient": true/false, "reason": "日本語の短文"}`
}

// 1〜5 に収まる整数のみ許可（それ以外は null）
function clampScore(v: unknown): number | null {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const i = Math.round(n)
  return i >= 1 && i <= 5 ? i : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { applicant_id } = await req.json()
    if (!applicant_id) return json({ error: 'applicant_id is required' }, 400)

    // 候補者取得（service role なので RLS bypass）
    const { data: applicant, error: fetchErr } = await supabase
      .from('recruit_applicants')
      .select('id, job_type, job_title, profile_text')
      .eq('id', applicant_id)
      .single()
    if (fetchErr || !applicant) {
      return json({ error: `applicant not found: ${fetchErr?.message || applicant_id}` }, 404)
    }

    const profileText = (applicant.profile_text || '').trim()

    // ── 材料が乏しい → AI に投げず即「情報不足」 ──────────────────
    if (profileText.length < MIN_PROFILE_CHARS) {
      const { error: upErr } = await supabase
        .from('recruit_applicants')
        .update({
          ai_overall_score: null,
          ai_axis_scores: null,
          ai_reason: '自己PRの記載が乏しく、AIでの評価材料が不足しています。面接で直接確認してください。',
          ai_info_insufficient: true,
          ai_labeled_at: new Date().toISOString(),
          ai_model: MODEL,
        })
        .eq('id', applicant_id)
      if (upErr) return json({ error: `update failed: ${upErr.message}` }, 500)
      return json({ ok: true, applicant_id, info_insufficient: true, skipped: 'profile too short' })
    }

    // ── Claude Haiku で構造化評価 ───────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

    const prompt = buildPrompt(applicant.job_type || 'sales', applicant.job_title || '', profileText)

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      const errTxt = await res.text()
      return json({ error: `Claude API error: ${errTxt.slice(0, 300)}` }, 500)
    }
    const data = await res.json()
    const text: string = data.content?.[0]?.text || '{}'

    let parsed: any = {}
    try {
      const m = text.match(/\{[\s\S]*\}/)
      parsed = m ? JSON.parse(m[0]) : {}
    } catch (_e) {
      parsed = {}
    }

    const infoInsufficient = parsed.info_insufficient === true
    const overall = infoInsufficient ? null : clampScore(parsed.overall_score)

    // 軸別スコアを 1〜5 に正規化（null 許容）。職種に応じたキーのみ保持。
    const rawAxis = (parsed.axis_scores && typeof parsed.axis_scores === 'object') ? parsed.axis_scores : {}
    const axisKeys = (applicant.job_type === 'trainer')
      ? ['ai_knowledge', 'mentoring']
      : ['experience', 'achievement']
    const axisScores: Record<string, number | null> = {}
    for (const k of axisKeys) axisScores[k] = infoInsufficient ? null : clampScore(rawAxis[k])

    const { error: upErr } = await supabase
      .from('recruit_applicants')
      .update({
        ai_overall_score: overall,
        ai_axis_scores: axisScores,
        ai_reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 1000) : null,
        ai_info_insufficient: infoInsufficient,
        ai_labeled_at: new Date().toISOString(),
        ai_model: MODEL,
      })
      .eq('id', applicant_id)
    if (upErr) return json({ error: `update failed: ${upErr.message}` }, 500)

    return json({
      ok: true,
      applicant_id,
      overall_score: overall,
      axis_scores: axisScores,
      info_insufficient: infoInsufficient,
    })
  } catch (e) {
    return json({ error: `unexpected: ${(e as Error).message}` }, 500)
  }
})
