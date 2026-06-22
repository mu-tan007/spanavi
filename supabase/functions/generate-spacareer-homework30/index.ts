// ============================================================
// generate-spacareer-homework30
// ----------------------------------------------------------------
// 第2〜7回セッション完了時の「事後課題30項目」ドラフトを Claude で生成する。
// 入力: { customerName, sessionNo, contextNotes }
//   - sessionNo    : 完了した回（この回の事後課題を生成）
//   - contextNotes : 受講生のプロフィール/前回議事録/目標などの要約（任意）
// 出力: { items: [{position, question_text, question_hint, is_required, max_length}], usage }
//
// 生成後はトレーナーが管理画面で手動修正し、「公開」ボタンで受講生に配信する。
// 生成失敗時はフロント側がモックテンプレ30問へフォールバックする。
// ============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// 30問の設計は指示追従と品質が重要なため sonnet を使用（他のスパキャリAIと統一）。
const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 8192

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim()
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500)

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  const customerName: string = (payload?.customerName || '受講生').toString().slice(0, 80)
  const sessionNo: number = Number(payload?.sessionNo) || 2
  const contextNotes: string = (payload?.contextNotes || '').toString().slice(0, 6000)

  const prompt = `あなたはキャリアコーチング「スパキャリ」のトレーナーです。
受講生「${customerName}」さんの第${sessionNo}回セッションが終わりました。
次回（第${sessionNo + 1}回）セッションをより有意義にするための「事後課題」を、ちょうど30問作成してください。

# 受講生の状況（参考情報。空の場合は一般的な内容で構成すること）
${contextNotes || '（特記事項なし。第' + sessionNo + '回までの一般的な振り返りと次回への準備を中心に構成すること）'}

# 設計方針
- 構成の目安: 前半=前回セッションの振り返りと実行アクションの評価、中盤=自己理解（強み・価値観・感情）、後半=次回に向けた目標設定と具体的な行動計画。
- 受講生が内省を深め、次回セッションで議論が弾むような、具体的で答えやすい問いにすること。
- 上記「受講生の状況」に固有の論点があれば、それを踏まえた問いを必ず数問含めること。
- 重要な問い（振り返り・目標・行動計画など）は is_required=true、補足的な問いは false にする。必須は15〜22問程度。
- max_length は記述量の目安（文字数）。短い決意表明は300、通常の内省は500〜600、詳述が必要なものは800程度。

# 出力形式（厳守）
- 説明文・前置き・マークダウンは一切付けず、JSON配列のみを出力すること。
- 配列はちょうど30要素。各要素は次のキーを持つオブジェクト:
  { "position": 1〜30の整数, "question_text": "設問文(日本語)", "question_hint": "回答のヒント or null", "is_required": true/false, "max_length": 整数 }
- position は1から30まで連番。絵文字は使わない。

JSON配列だけを出力してください。`

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(90_000),
    })
  } catch (e) {
    return json({ error: `Claude request failed: ${(e as Error).message}` }, 502)
  }

  if (!res.ok) {
    const errText = await res.text()
    console.error('[homework30] Claude error:', errText.slice(0, 500))
    return json({ error: 'Claude API error' }, 502)
  }

  const data = await res.json()
  const text: string = data?.content?.[0]?.text || ''

  // JSON配列を抽出（前後に余計な文字が混じっても拾えるよう最初の'['〜最後の']'を切り出す）
  let items: any[]
  try {
    const start = text.indexOf('[')
    const end = text.lastIndexOf(']')
    if (start < 0 || end < 0 || end <= start) throw new Error('no JSON array found')
    items = JSON.parse(text.slice(start, end + 1))
    if (!Array.isArray(items) || items.length === 0) throw new Error('parsed result is not a non-empty array')
  } catch (e) {
    console.error('[homework30] parse error:', (e as Error).message, text.slice(0, 300))
    return json({ error: 'failed to parse Claude output' }, 502)
  }

  // 正規化（position連番・型の安全化・最大30件）
  const normalized = items.slice(0, 30).map((it: any, idx: number) => ({
    position: idx + 1,
    question_text: String(it?.question_text || '').trim() || `設問${idx + 1}`,
    question_hint: it?.question_hint ? String(it.question_hint).trim() : null,
    is_required: it?.is_required === undefined ? idx < 18 : !!it.is_required,
    max_length: Number.isFinite(Number(it?.max_length)) ? Number(it.max_length) : 500,
  }))

  return json({
    items: normalized,
    generatedAt: new Date().toISOString(),
    usage: {
      input_tokens: data?.usage?.input_tokens,
      output_tokens: data?.usage?.output_tokens,
    },
  })
})
