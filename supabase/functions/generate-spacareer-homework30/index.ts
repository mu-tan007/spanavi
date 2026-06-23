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
  : '（議事録・特記事項が提供されていません。この場合は、議事録依存の問いは作らず、営業・案件獲得など実務行動のエビデンス課題のみを少数作ること）'}

${fixedBlock}# 設計思想（最重要・厳守）
受講生を「課題をこなす生徒」ではなく「自分の事業を前進させる実行者」と位置づける。
各課題は次の2種類のいずれかにすること。感想・気持ちの吐き出しのような課題は作らない。

1. 【行動エビデンス課題】(item_type="file")
   - 「実際に行動したか」を提出物（スクリーンショット/登録完了画面/成果物URL/ログ）で検証できる課題。
   - question_text に「何を」「何件/どの画面を」添付するかを具体的に書く。
   - 例:「2万円以上の高単価案件に応募したことが分かるスクリーンショットを10件添付してください」
   - 例:「作成したツールをデプロイしたURLが分かる画面を添付してください」

2. 【議事録ベースの内省課題】(item_type="text")
   - 第${sessionNo}回の議事録・トレーナーとの対話で出た論点に**具体的に紐づく**テキスト課題。
   - 議事録で語られた目標・課題・気づきと、現状の行動との「乖離」を言語化させ、思考を整理させる。
   - 議事録に登場しない一般論・抽象論にしない。

# 絶対に作ってはいけない課題（除外）
- 議事録・セッション内容を全く踏まえていない一般的な質問（これは厳禁。1問たりとも入れない）。
- 感情・気分・価値観の吐き出し系（例:「5年後の自分への言葉」「不機嫌スイッチ」「感情の起伏メモ」など）。
- セッション感想やキックオフヒアリングで既に聞いている内容（目標宣言・価値観・自己紹介系）との重複。
- 上記「固定課題」との重複。

# 各課題の属性
- item_type: "file"（提出物で行動を検証する課題）/ "text"（議事録ベースの内省課題）。行動課題は file を優先。
- is_required: 重要な課題は true。必須は半数以上。
- max_length: text のときの記述量目安。通常500〜600、詳述が必要なら800。file のときは null でよい。
- question_hint: 何を提出/記述すべきかを補足（不要なら null）。

# 出力形式（厳守）
- 説明文・前置き・マークダウンは一切付けず、JSON配列のみを出力すること。
- 議事録が薄い場合は無理に${count}問埋めず、質の高い行動エビデンス課題のみ少数でよい。
- 各要素は次のキーを持つオブジェクト:
  { "position": 整数, "question_text": "設問文(日本語)", "question_hint": "ヒント or null", "is_required": true/false, "max_length": 整数 or null, "item_type": "file" or "text" }
- position は1から連番。絵文字は使わない。

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

  // 正規化（position連番・型の安全化・要求された count 件まで）
  const normalized = items.slice(0, count).map((it: any, idx: number) => {
    const itemType = it?.item_type === 'file' ? 'file' : 'text'
    return {
      position: idx + 1,
      question_text: String(it?.question_text || '').trim() || `設問${idx + 1}`,
      question_hint: it?.question_hint ? String(it.question_hint).trim() : null,
      is_required: it?.is_required === undefined ? true : !!it.is_required,
      // file課題は文字数制限不要。text課題は目安を設定。
      max_length: itemType === 'file'
        ? null
        : (Number.isFinite(Number(it?.max_length)) ? Number(it.max_length) : 500),
      item_type: itemType,
    }
  })

  return json({
    items: normalized,
    generatedAt: new Date().toISOString(),
    usage: {
      input_tokens: data?.usage?.input_tokens,
      output_tokens: data?.usage?.output_tokens,
    },
  })
})
