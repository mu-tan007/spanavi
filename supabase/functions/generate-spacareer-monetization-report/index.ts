// ============================================================
// generate-spacareer-monetization-report
// ----------------------------------------------------------------
// マネタイズ領域診断の「最終言語化レポート」を Claude で生成する。
// 入力: スコアリングエンジン(monetizationEngine)の result ＋ 受講生名。
// 出力: { report: string(markdown), usage }。
//
// スコア計算はフロント側の決定論エンジンが担当し、本関数は
// 「推奨領域×業界 / なぜ勝てるか / 痛みとAI活用余地 / 参入の仕方 / 最初の一歩」
// を高品質な日本語レポートに言語化するのみ。失敗時はフロントがテンプレへフォールバック。
// ============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// 診断完了は稀少・高価値イベントのため、指示追従と品質を優先して sonnet を使用。
const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 2048

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Vercel等から貼り付けた際の改行混入を防ぐため必ず .trim()
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim()
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500)

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  const result = payload?.result
  const customerName: string = payload?.customerName || '受講生'
  if (!result || !result.primary) {
    return json({ error: 'result.primary is required' }, 400)
  }

  const primary = result.primary
  const alternates = (result.topCombos || []).slice(1, 4)
  const summary = result.parsedSummary || {}

  const prompt = `あなたは個人の副業・フリーランス立ち上げを支援するキャリアコーチです。
以下は受講生「${customerName}」さんのマネタイズ領域診断の結果データ（決定論スコアリング済み）です。
このデータだけを根拠に、本人が次の一歩を踏み出せる実践的なレポートを書いてください。

【絶対厳守】レポートで推奨する主戦場は必ず「領域＝${primary.domainLabel}／業界＝${primary.industryLabel}」のこの組み合わせに固定すること。これ以外の領域名・業界名（例: 製造業など）を主役にしたり、領域・業界の名称を言い換えたりしてはならない。固有名詞は下記データの表記をそのまま使うこと。

# 診断データ
## 第1推奨（最有力）
- 領域: ${primary.domainLabel}
- 業界: ${primary.industryLabel}
- スコア: ${primary.score}
- 業界の痛み: ${(primary.rationale?.pains || []).join(' / ')}
- AI活用余地(1-5): ${primary.rationale?.aiOpportunity}
- 見せ方: ${primary.rationale?.presentation}
- 単価目安: ${primary.rationale?.unitPriceRange?.min}〜${primary.rationale?.unitPriceRange?.max}円/${primary.rationale?.unitPriceRange?.unit}

## 次点候補
${alternates.map((c: any) => `- ${c.domainLabel} × ${c.industryLabel}（スコア${c.score}）`).join('\n')}

## 本人の強み軸(1-5)
- 実行=${summary.strengthAxis?.execution?.toFixed?.(1)} 影響=${summary.strengthAxis?.influencing?.toFixed?.(1)} 関係=${summary.strengthAxis?.relationship?.toFixed?.(1)} 戦略=${summary.strengthAxis?.strategic?.toFixed?.(1)}

# 営業の前提
- 基本はフォーム営業（テレアポはしない）。フォーム営業の反応率は一律0.05%として説明すること。
- 商談化率・受注率などの細かい仮定値は今は置かない（言及しなくてよい）。

# 出力ルール
- 主戦場として推奨する領域は必ず「${primary.domainLabel}」、業界は必ず「${primary.industryLabel}」とすること。データにない別の領域名・業界名を主役にしてはならない。
- 数値（スコア・単価・AI活用余地）は上記データの値だけを使い、創作しないこと。
- 日本語のマークダウン。見出しは ## を使う（# の単独大見出しやレポートタイトルは付けない）。絵文字は使わない。
- 本人の「やってみたい」という感情を尊重し、前向きで具体的に。
- 次の見出し構成で、各200〜300字程度:
  ## あなたにおすすめの主戦場
  ## なぜあなたが勝てるのか
  ## この業界の痛みとAIで切り込める余地
  ## フォーム営業での入り方
  ## 最初の一歩（今週やること3つ）
- 「最初の一歩」は箇条書きで、具体的な行動を3つ。

繰り返します。推奨する主戦場は「${primary.domainLabel} × ${primary.industryLabel}」だけです。「${primary.industryLabel}」という業界名を必ず本文に明記し、それ以外の業界（製造業・士業など）を推奨先にしないでください。`

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
      signal: AbortSignal.timeout(60_000),
    })
  } catch (e) {
    return json({ error: `Claude request failed: ${(e as Error).message}` }, 502)
  }

  if (!res.ok) {
    const errText = await res.text()
    console.error('[monetization-report] Claude error:', errText.slice(0, 500))
    return json({ error: 'Claude API error' }, 502)
  }

  const data = await res.json()
  const report: string = data?.content?.[0]?.text || ''
  if (!report.trim()) {
    return json({ error: 'empty report' }, 502)
  }

  // ドリフト検知: 推奨の領域・業界の「主要トークン」が本文に含まれない＝AIが勝手な
  // 業界に逸れた場合はエラーを返し、フロント側で決定論テンプレ（正しい結果）へフォールバック。
  // ラベルはスラッシュ等の複合名（例:「EC/小売」「AI導入支援/業務自動化」）なので、
  // 先頭トークンで緩く判定し、正常な言い換えを誤検知しないようにする。
  const coreToken = (label: string) => String(label).split(/[\/／・(（]/)[0].trim()
  const domainCore = coreToken(primary.domainLabel)
  const industryCore = coreToken(primary.industryLabel)
  if (!report.includes(domainCore) || !report.includes(industryCore)) {
    console.error('[monetization-report] drifted from data. expected core:', domainCore, industryCore)
    return json({ error: 'report drifted from result' }, 502)
  }

  return json({
    report,
    generatedAt: new Date().toISOString(),
    usage: {
      input_tokens: data?.usage?.input_tokens,
      output_tokens: data?.usage?.output_tokens,
    },
  })
})
