// ============================================================
// generate-spacareer-homework30
// ----------------------------------------------------------------
// 第2〜7回セッション完了時の事後課題のうち「変動課題」を Claude で生成する。
// 入力: { customerName, sessionNo, contextNotes, count, fixedItems }
//   - sessionNo    : 完了した回（この回の事後課題を生成）
//   - contextNotes : 受講生のプロフィール/前回議事録/目標などの要約（任意）
//   - count        : 生成する変動課題の数（既定30。固定課題と結合するため30未満になる）
//   - fixedItems   : 既に確定している固定課題の文字列配列（重複回避のためAIに共有）
// 出力: { items: [{position, question_text, question_hint, is_required, max_length}], usage }
//
// 呼び出し側で「固定課題 + 本関数の変動課題」を結合して30問にし、ドラフト保存する。
// 生成後はトレーナーが管理画面で手動修正し、「公開」ボタンで受講生に配信する。
// 生成失敗時はフロント側がモックテンプレへフォールバックする。
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
  // 生成する「変動課題」の数（固定課題を別途結合するため、30未満になることがある）。
  const count: number = Math.max(1, Math.min(30, Number(payload?.count) || 30))
  // 既に確定している固定課題（重複回避のためAIに共有する）。
  const fixedItems: string[] = Array.isArray(payload?.fixedItems)
    ? payload.fixedItems.map((x: any) => (typeof x === 'string' ? x : x?.question_text || '')).filter(Boolean).slice(0, 30)
    : []

  const fixedBlock = fixedItems.length
    ? `# 既に確定している固定課題（これらは別途出題済み。重複しない補完的な問いを作ること）
${fixedItems.map((q, i) => `${i + 1}. ${q}`).join('\n')}
`
    : ''

  const hasContext = contextNotes.trim().length > 0

  const prompt = `あなたはキャリアコーチング「スパキャリ」のトレーナーです。
受講生「${customerName}」さんの第${sessionNo}回セッションが終わりました。
次回（第${sessionNo + 1}回）に向けた「事後課題（変動課題）」を作成してください。最大${count}問まで。

# 第${sessionNo}回セッションの議事録・受講生の状況（最重要）
${hasContext
  ? contextNotes
  : '（議事録・特記事項が提供されていません。この場合は、議事録依存の問いは作らず、収益化を前進させる実務行動の課題のみを少数作ること）'}

${fixedBlock}# 設計思想（最重要・厳守）
事後課題は「宿題・事務作業」ではなく、受講生が自分の収益化を"実際に前に進める"ための実務行動そのものである。
提出のためのエビデンス作り（スクリーンショット収集、一覧表の作成、スプレッドシートやURLの添付など）は
受講生を疲弊させるだけなので一切作らない。行動したら Slack でトレーナーに報告・壁打ちしてもらい、
スパナビ上ではチェックを入れるだけで完了とする。前に進めながら数をこなすことが最優先。

各課題は次の2種類のいずれか。感想・気持ちの吐き出しや、提出物集めのためだけの課題は作らない。

1. 【行動課題】(item_type="checkbox")  ← 事後課題の大半はこれにする
   - 収益化を前進させる具体的な実務行動を1つ指示し、「実行したら Slack でトレーナーに報告・壁打ちする」形にする。
   - question_text は原則「〜してください。実施したら Slack でトレーナーに報告・壁打ちしてください。」の形にする。
   - 数をこなす行動でも、対象案件は1〜2件に絞る（多くても2件）。大量応募・大量提出は課さない。
   - スクリーンショット添付・一覧表作成・スプレッドシートURL提出などのエビデンス提出は指示しない（Slack報告で十分）。
   - 例:「副業プラットフォームで気になる案件に2件応募し、その案件概要を簡単に Slack でトレーナーに報告してください。」
   - 例:「交渉中の案件について、第${sessionNo}回セッション以降のやり取りの最新の進捗を Slack でトレーナーに壁打ちしてください。」

2. 【内省課題】(item_type="text")  ← 全体で1〜2問まで（ほぼ不要）
   - 第${sessionNo}回の議事録で出た論点に具体的に紐づく、短い言語化課題のみ。
   - 計画・戦略の整理はセッション中に行うため、事後課題での記述は最小限にする。
   - 議事録に登場しない一般論・抽象論にはしない。text課題は必ず2問以内。

# 絶対に作ってはいけない課題（除外）
- スクリーンショット／画面キャプチャ／一覧表／スプレッドシートURL 等、エビデンス提出のためだけの課題（面倒な事務作業になるため厳禁）。
- 「自分が提案できるサービスメニューと想定単価の一覧」など、収益化を前進させない棚卸し・一覧作成課題。
- 受注前の案件について不足スキル・経験・体制を細かく洗い出させる等、過度な準備・分析課題（準備は案件1〜2件で十分）。
- 感情・気分・価値観の吐き出し系（例:「5年後の自分への言葉」など）。
- 議事録・セッション内容を全く踏まえていない一般的な質問。
- セッション感想やキックオフヒアリングで既に聞いた内容、上記「固定課題」との重複。
- text（内省）課題を3問以上入れること（text は全体で最大2問）。

# プラットフォーム名の表記（厳守）
外部サービス名は必ず正確に表記する。特に以下は誤記が多いので注意する：
- 「Yenta」（Yenter・イェンター 等の誤記禁止）
- 「Wantedly」（Wantedy 等の誤記禁止）
- 「Bizon」（Bison 等の誤記禁止）
- 「クラウドワークス」「ランサーズ」「複業クラウド」

# 各課題の属性
- item_type: "checkbox"（行動→Slack報告、大半はこれ）/ "text"（内省課題、全体で最大2問）。
- is_required: 重要な課題は true。必須は半数以上。
- max_length: text のときの記述量目安（通常300〜500）。checkbox のときは null。
- question_hint: 補足（不要なら null）。checkbox では「Slack で何を報告・壁打ちすればよいか」を簡潔に添えてもよい。

# 出力形式（厳守）
- 説明文・前置き・マークダウンは一切付けず、JSON配列のみを出力すること。
- 議事録が薄い場合は無理に${count}問埋めず、質の高い行動課題(checkbox)のみ少数でよい。
- 各要素は次のキーを持つオブジェクト:
  { "position": 整数, "question_text": "設問文(日本語)", "question_hint": "ヒント or null", "is_required": true/false, "max_length": 整数 or null, "item_type": "checkbox" or "text" }
- position は1から連番。絵文字は使わない。text課題は全体で最大2問。

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

  // プラットフォーム名の誤記を後処理でも補正する（Yenta / Wantedly / Bizon）。
  const fixPlatformNames = (s: string | null): string | null => {
    if (!s) return s
    return s
      .replace(/[Yy]ent(?:er|ar)/g, 'Yenta')
      .replace(/イェンター|イェンタ(?!ー)/g, 'Yenta')
      .replace(/[Bb]ison/g, 'Bizon')
      .replace(/[Ww]anted(?:y|ley|lly)/g, 'Wantedly')
  }

  // 正規化（position連番・型の安全化・要求された count 件まで）。
  // 内省(text)課題は全体で最大2問に制限し、超過分は除外する（前進行動を最優先）。
  let textCount = 0
  const normalized = items.slice(0, count)
    .map((it: any) => {
      // "text" 以外はすべて行動チェック課題(checkbox)に寄せる（file等のエビデンス提出は廃止）。
      const itemType = it?.item_type === 'text' ? 'text' : 'checkbox'
      return { it, itemType }
    })
    .filter(({ itemType }) => {
      if (itemType !== 'text') return true
      textCount += 1
      return textCount <= 2
    })
    .map(({ it, itemType }, idx: number) => ({
      position: idx + 1,
      question_text: fixPlatformNames(String(it?.question_text || '').trim()) || `設問${idx + 1}`,
      question_hint: it?.question_hint ? fixPlatformNames(String(it.question_hint).trim()) : null,
      is_required: it?.is_required === undefined ? true : !!it.is_required,
      // checkbox課題は文字数制限不要。text課題のみ目安を設定。
      max_length: itemType === 'checkbox'
        ? null
        : (Number.isFinite(Number(it?.max_length)) ? Number(it.max_length) : 400),
      item_type: itemType,
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
