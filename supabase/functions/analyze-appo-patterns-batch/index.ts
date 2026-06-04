// 未分析のアポを Claude Haiku で「アポ取得パターン」「話し方タグ」「効いた話し方」分析する
// pg_cron から夜間 1 回呼ばれる。文字起こしは行わず、appo_report テキスト + keyman_ma_intent から分析する。
//
// 動作:
//   1. RPC ai_appo_pattern_pending_targets(p_limit) で未分析 N 件の id を取得
//   2. 各アポに対し Claude Haiku 4.5 で分析
//   3. appointments テーブルに UPDATE
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

const CONCURRENCY   = 3
const DEFAULT_LIMIT = 30
const MAX_LIMIT     = 50

const VALID_PATTERNS = new Set([
  'smooth', 'negative_to_positive', 'keyman_difficulty',
  'after_concern', 'standard', 'unknown',
])

interface AppoRow {
  id: string
  appo_report: string | null
  keyman_ma_intent: string | null
  getter_name: string | null
  company_name: string | null
  status: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (!ANTHROPIC_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

    const body  = await req.json().catch(() => ({}))
    const limit = Math.min(Math.max(1, Number(body.limit) || DEFAULT_LIMIT), MAX_LIMIT)

    const { data: idRows, error: idErr } = await supabase.rpc('ai_appo_pattern_pending_targets', { p_limit: limit })
    if (idErr) return json({ error: `RPC failed: ${idErr.message}` }, 500)

    const ids: string[] = (idRows as Array<{ id: string }> || []).map(r => r.id)

    if (ids.length === 0) {
      return json({ processed: 0, success: 0, failed: 0, message: 'no pending targets' })
    }

    const { data: rows, error: rowsErr } = await supabase
      .from('appointments')
      .select('id, appo_report, keyman_ma_intent, getter_name, company_name, status')
      .in('id', ids)

    if (rowsErr) return json({ error: `fetch appointments failed: ${rowsErr.message}` }, 500)

    const appoRows: AppoRow[] = (rows || []) as AppoRow[]

    let success = 0, failed = 0
    const errors: Array<{ id: string; error: string }> = []
    let idx = 0

    async function worker() {
      while (idx < appoRows.length) {
        const i = idx++
        const row = appoRows[i]
        try {
          await processOne(row)
          success++
        } catch (e) {
          failed++
          errors.push({ id: row.id, error: (e as Error).message })
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

    return json({
      processed: appoRows.length,
      success,
      failed,
      errors: errors.slice(0, 5),
    })
  } catch (err) {
    console.error('[analyze-appo-patterns-batch] Unhandled:', err)
    return json({ error: (err as Error).message }, 500)
  }
})

async function processOne(row: AppoRow) {
  const report = (row.appo_report || '').slice(0, 6000)
  if (report.length < 50) {
    await supabase
      .from('appointments')
      .update({ appo_pattern: 'unknown', talk_style_tags: [], talk_strength: '' })
      .eq('id', row.id)
    return
  }

  const prompt = `以下はM&Aアドバイザリーのテレアポで取得したアポイントの「アポ取得報告」です。
この報告内容を分析し、アポ取得パターン分類とアポインターの話し方の特徴を抽出してください。
必ず以下のJSONフォーマットのみで回答してください（他のテキストなし）：

{
  "appo_pattern": "smooth | negative_to_positive | keyman_difficulty | after_concern | standard | unknown のいずれか1語",
  "talk_style_tags": ["話し方タグ最大5個。日本語短語"],
  "talk_strength": "このアポ取得で特に効いた話し方を1-2文の日本語で簡潔に"
}

【appo_pattern 判定ガイド】
- smooth:                先方が最初から好意的で、ほぼ抵抗なくアポ取得に至った
- negative_to_positive:  最初は興味なし／断りモードだったが、アポインターの切り返しで好転しアポ取得
- keyman_difficulty:     キーマン（決裁者）に繋がりにくく、複数の関門突破や別事業所経由などを経てアポ取得
- after_concern:         先方が懸念（時間・費用・社内反応・既存付き合い等）を表明したが、解消説明を経てアポ取得
- standard:              特筆すべき山なく、業務的に淡々と進んでアポ取得
- unknown:               報告内容が薄く判定不能

【talk_style_tags 抽出ガイド】
アポインターの「話し方の特徴」を端的に表す日本語短語タグを最大5個。
例: 共感的傾聴 / 質問深掘り / ベネフィット訴求 / 即決クロージング / 業界知識アピール /
    お悩み代弁 / 数字根拠提示 / 比較事例提示 / リフレーミング / 雑談アイスブレイク /
    ペーシング / 業界理解の確認 / クロージング前置き / 後継者課題喚起 / 二者択一クローズ /
    社長称賛 / 競合言及 / 第三者話法

【talk_strength 抽出ガイド】
このアポでアポインターの "決め手" になったと推定される話し方を1-2文で。

【参考情報】
- 企業名: ${row.company_name || '不明'}
- アポインター: ${row.getter_name || '不明'}
- ステータス: ${row.status || '不明'}
- キーマンM&A意向: ${row.keyman_ma_intent || 'unknown'}

【アポ取得報告】
${report}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 768,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Claude HTTP ${res.status}: ${txt.slice(0, 200)}`)
  }

  const data = await res.json()
  const text: string = data.content?.[0]?.text || '{}'

  let parsed: { appo_pattern?: string; talk_style_tags?: unknown; talk_strength?: string } = {}
  try {
    const m = text.match(/\{[\s\S]*\}/)
    parsed = m ? JSON.parse(m[0]) : {}
  } catch (e) {
    throw new Error(`JSON parse: ${(e as Error).message}`)
  }

  const patternRaw = String(parsed.appo_pattern || '').toLowerCase().trim()
  const appoPattern = VALID_PATTERNS.has(patternRaw) ? patternRaw : 'unknown'

  let tags: string[] = []
  if (Array.isArray(parsed.talk_style_tags)) {
    tags = parsed.talk_style_tags
      .filter((t): t is string => typeof t === 'string')
      .map(t => t.trim())
      .filter(t => t.length > 0 && t.length <= 40)
      .slice(0, 5)
  }

  const strength = typeof parsed.talk_strength === 'string'
    ? parsed.talk_strength.trim().slice(0, 500)
    : ''

  const { error: updErr } = await supabase
    .from('appointments')
    .update({
      appo_pattern:    appoPattern,
      talk_style_tags: tags,
      talk_strength:   strength,
    })
    .eq('id', row.id)

  if (updErr) throw new Error(`UPDATE: ${updErr.message}`)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
