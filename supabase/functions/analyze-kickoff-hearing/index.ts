// ============================================================
// analyze-kickoff-hearing
// ----------------------------------------------------------------
// 第1回前70問キックオフヒアリングのAI抽出パイプライン (§8.7)。
// Claude Haiku 4.5 で2種類のプロンプトを並列実行し、結果を
// spacareer_kickoff_hearing_ai_extractions に保存する。
//
// 入力:
//   {
//     customer_id: uuid    -- spacareer_customers.id
//     force_rerun?: bool   -- 既存抽出を非アクティブ化して再実行 (admin用)
//   }
//
// 出力:
//   即時: { status: 'processing', customer_id }
//   バックグラウンド完了後:
//     - spacareer_kickoff_hearing_ai_extractions に2行 (highlight_top5, deep_dive_3)
//     - spacareer_kickoff_hearing_sessions.{ status='ai_extracted', ai_extracted_at }
//     - spacareer_ai_usage_logs に2行 (kickoff_highlight, kickoff_deep_dive)
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

const MODEL = 'claude-haiku-4-5-20251001'
const PROMPT_VERSION = 'v1'

// Haiku 4.5 価格: $1/M input, $5/M output
const PRICE_IN = 1.0
const PRICE_OUT = 5.0

// ============================================================
// プロンプト構築
// ============================================================
function buildAnswersContext(
  questions: Array<{
    id: string
    section_code: string
    section_name: string
    question_number: number
    question_text: string
    is_required: boolean
  }>,
  responses: Map<string, string>,
): string {
  const lines: string[] = []
  let currentSection = ''
  for (const q of questions) {
    const ans = responses.get(q.id) || ''
    if (!ans.trim()) continue
    if (q.section_code !== currentSection) {
      currentSection = q.section_code
      lines.push('')
      lines.push(`## ${q.section_name}`)
    }
    const reqMark = q.is_required ? '【必須】' : '【任意】'
    lines.push(`Q${q.question_number}${reqMark} ${q.question_text}`)
    lines.push(`A: ${ans}`)
    lines.push('')
  }
  return lines.join('\n')
}

const HIGHLIGHT_PROMPT = `あなたはキャリアコーチング「スパキャリ」のトレーナーをサポートするAIアシスタントです。
以下は受講生（お客様）が第1回セッション前に回答した「70問キックオフヒアリング」の全回答です。
このうち、トレーナーが第1回当日に「太線でマーキングして引用したい」と感じるであろう
**最も重要な発言を5つ**抽出してください。

抽出の観点:
- 価値観・人生の優先順位を端的に表す発言
- 痛み・葛藤・恐れの核となる発言
- 動機の本質を露呈している発言
- 未来像の固有名詞や具体性のある描写
- 「今、この瞬間」のリアルさが強い発言

出力は必ず以下の JSON フォーマットのみを返してください（前後のテキストは一切不要）：

[
  {
    "question_number": 30,
    "excerpt": "受講生の発言を原文ニュアンスのまま引用（要約しすぎず100〜200字程度）",
    "why_important": "なぜこれが第1回で引用すべき重要発言なのか（80字以内）"
  }
]

注意:
- 必ず配列で5件返す（少なくても多くてもダメ）
- excerpt は原文の言葉を尊重する（言い換えすぎない）
- 任意項目セクション(G/I/BONUS)からの抽出も可
- 該当回答が薄い場合は無理に5件揃えず4件まで`

const DEEP_DIVE_PROMPT = `あなたはキャリアコーチング「スパキャリ」のトレーナーをサポートするAIアシスタントです。
以下は受講生（お客様）が第1回セッション前に回答した「70問キックオフヒアリング」の全回答です。
第1回セッション（90分）で**当日に対話で深掘りすべきポイント**を**3つ**提案してください。

選定基準:
- 回答が抽象的で、本人がまだ言語化しきれていないテーマ
- 矛盾や葛藤が垣間見えるテーマ
- 第1回で扱わないと、第2回以降の進行に支障が出るテーマ
- 受講生の言葉の温度が高いテーマ

出力は必ず以下の JSON フォーマットのみを返してください（前後のテキストは一切不要）：

[
  {
    "topic": "深掘りすべきトピック名（30字以内）",
    "rationale": "なぜここを掘るべきか、回答のどこから読み取れるか（150字程度）",
    "suggested_question": "第1回当日にトレーナーが投げかける問いのドラフト（80字以内）"
  }
]

注意:
- 必ず配列で3件返す（少なくても多くてもダメ）
- topic は重複しないように
- suggested_question は受講生に直接投げかける文体で書く`

// ============================================================
// Claude API 呼び出し（1回分）
// ============================================================
async function callClaude(
  systemPlusUserPrompt: string,
  anthropicKey: string,
): Promise<{ text: string; usage: { input_tokens?: number; output_tokens?: number } }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3072,
      messages: [{ role: 'user', content: systemPlusUserPrompt }],
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Claude API error: HTTP ${res.status}: ${errText.slice(0, 300)}`)
  }
  const data = await res.json()
  return {
    text: data.content?.[0]?.text || '',
    usage: data.usage || {},
  }
}

function extractJsonArray(text: string): unknown[] {
  // 最初に出てくる [ ... ] を取る（厳密性より頑健性優先）
  const m = text.match(/\[[\s\S]*\]/)
  if (!m) throw new Error('AI 応答に JSON 配列が含まれていません')
  return JSON.parse(m[0])
}

// ============================================================
// バックグラウンド処理
// ============================================================
// 注: AI抽出結果のSlack自動送信は意図的に「実装しない」。
// 抽出結果には「深掘り候補」「重要発言ハイライト」など、受講生本人に見せると
// 「分析されてる感」が出るトレーナー視点の情報が含まれるため、
// 運営画面 (TabKickoffHearing) で運営・トレーナーだけが確認する設計とする。
// ────────────────────────────────────────────────
async function processInBackground(customer_id: string, force_rerun: boolean) {
  const fail = async (msg: string, detail?: string) => {
    console.error(`[analyze-kickoff-hearing] FAIL: ${msg}`, detail || '')
    // セッション側にエラー印を残す（ステータスは戻さない）
    await supabase.from('spacareer_kickoff_hearing_sessions')
      .update({ /* 何もしない: 状態は変えず、ログだけ */ })
      .eq('customer_id', customer_id)
  }

  try {
    // ── 1. 顧客 → org_id を確定 ─────────────────────────────
    const { data: customer, error: cErr } = await supabase
      .from('spacareer_customers')
      .select('id, org_id')
      .eq('id', customer_id)
      .maybeSingle()
    if (cErr) throw cErr
    if (!customer) { await fail('customer not found'); return }
    const orgId = customer.org_id

    // ── 2. 質問マスタ + 回答取得 ─────────────────────────────
    const [qRes, rRes, sessRes] = await Promise.all([
      supabase
        .from('spacareer_kickoff_hearing_questions')
        .select('id, section_code, section_name, question_number, question_text, is_required')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
      supabase
        .from('spacareer_kickoff_hearing_responses')
        .select('id, question_id, answer_text')
        .eq('customer_id', customer_id),
      supabase
        .from('spacareer_kickoff_hearing_sessions')
        .select('id, status')
        .eq('customer_id', customer_id)
        .maybeSingle(),
    ])
    if (qRes.error) throw qRes.error
    if (rRes.error) throw rRes.error
    if (sessRes.error) throw sessRes.error
    const questions = qRes.data || []
    const responses = rRes.data || []
    const session = sessRes.data

    if (!session) { await fail('session not found'); return }
    if (!questions.length) { await fail('no questions'); return }

    // 回答マップ + ソースIDリスト
    const responseMap = new Map<string, string>()
    const sourceIds: string[] = []
    for (const r of responses) {
      if ((r.answer_text || '').trim()) {
        responseMap.set(r.question_id, r.answer_text)
        sourceIds.push(r.id)
      }
    }
    if (responseMap.size === 0) { await fail('no non-empty responses'); return }

    // ── 3. コンテキスト構築 ─────────────────────────────────
    const context = buildAnswersContext(questions, responseMap)

    // ── 4. Claude API key 確認 ──────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) { await fail('ANTHROPIC_API_KEY not configured'); return }

    // ── 5. 並列で2回呼び出し ─────────────────────────────────
    const [highlightResult, deepDiveResult] = await Promise.allSettled([
      callClaude(`${HIGHLIGHT_PROMPT}\n\n【回答全文】\n${context}`, anthropicKey),
      callClaude(`${DEEP_DIVE_PROMPT}\n\n【回答全文】\n${context}`, anthropicKey),
    ])

    // ── 6. 既存抽出を非アクティブ化 (再実行時 or 初回) ───────
    if (force_rerun || true) {
      await supabase
        .from('spacareer_kickoff_hearing_ai_extractions')
        .update({ is_active: false })
        .eq('customer_id', customer_id)
        .eq('is_active', true)
    }

    // ── 7. 結果保存 + ログ ──────────────────────────────────
    const now = new Date().toISOString()
    let anySuccess = false

    // highlight_top5
    if (highlightResult.status === 'fulfilled') {
      try {
        const items = extractJsonArray(highlightResult.value.text)
        const { error: insErr } = await supabase
          .from('spacareer_kickoff_hearing_ai_extractions')
          .insert({
            org_id: orgId,
            customer_id,
            extraction_type: 'highlight_top5',
            content_json: items,
            source_response_ids: sourceIds,
            model: MODEL,
            prompt_version: PROMPT_VERSION,
            is_active: true,
          })
        if (insErr) throw insErr
        anySuccess = true
        const u = highlightResult.value.usage
        const cost = Number(
          (((u.input_tokens || 0) / 1_000_000) * PRICE_IN
           + ((u.output_tokens || 0) / 1_000_000) * PRICE_OUT).toFixed(6)
        )
        await supabase.from('spacareer_ai_usage_logs').insert({
          org_id: orgId,
          customer_id,
          feature: 'kickoff_highlight',
          model: MODEL,
          input_tokens: u.input_tokens ?? null,
          output_tokens: u.output_tokens ?? null,
          cost_usd: cost,
          status: 'success',
        })
      } catch (e) {
        console.error('[analyze-kickoff-hearing] highlight parse/save error:', e, 'raw:', highlightResult.value.text.slice(0, 300))
        await supabase.from('spacareer_ai_usage_logs').insert({
          org_id: orgId,
          customer_id,
          feature: 'kickoff_highlight',
          model: MODEL,
          status: 'error',
          error_message: (e as Error).message,
        })
      }
    } else {
      console.error('[analyze-kickoff-hearing] highlight API error:', highlightResult.reason)
      await supabase.from('spacareer_ai_usage_logs').insert({
        org_id: orgId,
        customer_id,
        feature: 'kickoff_highlight',
        model: MODEL,
        status: 'error',
        error_message: String(highlightResult.reason).slice(0, 500),
      })
    }

    // deep_dive_3
    if (deepDiveResult.status === 'fulfilled') {
      try {
        const items = extractJsonArray(deepDiveResult.value.text)
        const { error: insErr } = await supabase
          .from('spacareer_kickoff_hearing_ai_extractions')
          .insert({
            org_id: orgId,
            customer_id,
            extraction_type: 'deep_dive_3',
            content_json: items,
            source_response_ids: sourceIds,
            model: MODEL,
            prompt_version: PROMPT_VERSION,
            is_active: true,
          })
        if (insErr) throw insErr
        anySuccess = true
        const u = deepDiveResult.value.usage
        const cost = Number(
          (((u.input_tokens || 0) / 1_000_000) * PRICE_IN
           + ((u.output_tokens || 0) / 1_000_000) * PRICE_OUT).toFixed(6)
        )
        await supabase.from('spacareer_ai_usage_logs').insert({
          org_id: orgId,
          customer_id,
          feature: 'kickoff_deep_dive',
          model: MODEL,
          input_tokens: u.input_tokens ?? null,
          output_tokens: u.output_tokens ?? null,
          cost_usd: cost,
          status: 'success',
        })
      } catch (e) {
        console.error('[analyze-kickoff-hearing] deep_dive parse/save error:', e, 'raw:', deepDiveResult.value.text.slice(0, 300))
        await supabase.from('spacareer_ai_usage_logs').insert({
          org_id: orgId,
          customer_id,
          feature: 'kickoff_deep_dive',
          model: MODEL,
          status: 'error',
          error_message: (e as Error).message,
        })
      }
    } else {
      console.error('[analyze-kickoff-hearing] deep_dive API error:', deepDiveResult.reason)
      await supabase.from('spacareer_ai_usage_logs').insert({
        org_id: orgId,
        customer_id,
        feature: 'kickoff_deep_dive',
        model: MODEL,
        status: 'error',
        error_message: String(deepDiveResult.reason).slice(0, 500),
      })
    }

    // ── 8. セッション状態を ai_extracted に進める ─────────────
    // 片方でも成功していれば進める。両方失敗時はステータスを動かさない。
    if (anySuccess) {
      await supabase
        .from('spacareer_kickoff_hearing_sessions')
        .update({ status: 'ai_extracted', ai_extracted_at: now })
        .eq('customer_id', customer_id)
    }

    console.log(`[analyze-kickoff-hearing] done customer_id=${customer_id} anySuccess=${anySuccess}`)
  } catch (err) {
    console.error('[analyze-kickoff-hearing] unhandled error:', err)
    await fail('unhandled error', (err as Error).message)
  }
}

// ============================================================
// メインハンドラ
// ============================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const { customer_id, force_rerun } = body || {}

    if (!customer_id) {
      return new Response(
        JSON.stringify({ error: 'customer_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const bgPromise = processInBackground(customer_id, !!force_rerun)

    // deno-lint-ignore no-explicit-any
    if (typeof (globalThis as any).EdgeRuntime !== 'undefined') {
      // deno-lint-ignore no-explicit-any
      ;(globalThis as any).EdgeRuntime.waitUntil(bgPromise)
      return new Response(
        JSON.stringify({ status: 'processing', customer_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    await bgPromise
    return new Response(
      JSON.stringify({ status: 'completed', customer_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[analyze-kickoff-hearing] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
