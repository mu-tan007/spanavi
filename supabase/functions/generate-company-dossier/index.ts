// =====================================================================
// generate-company-dossier
//   アポ取得企業のドシエを HP + Claude web_search ツールで構造化生成し、
//   company_dossiers テーブルへ保存する Edge Function。
//
//   生成はバックグラウンドで EdgeRuntime.waitUntil で実行し、即時 202 を
//   返すため、Edge Function のレスポンスタイムアウトに引っかからない。
//   クライアントは Supabase Realtime で company_dossiers を subscribe して
//   生成完了を検知する想定。
//
//   同名異社誤認を防ぐため、社名・代表者名・住所の3点照合を Claude に依頼し、
//   各情報源の identity_match を high/medium/low で記録する。
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fetchCompanyPagesFromDomain } from '../_shared/fetchPageText.ts'
import { getDossierAiSpec, DossierAiSpec } from '../_shared/engagementDossierSpec.ts'

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

// appo_report テキストから「HP：...」行を拾うフォールバック
function extractHpFromAppoReport(text: string | null): string | null {
  if (!text) return null
  const m = text.match(/^HP[\s:：]+([^\s\n]+)/m)
  if (!m) return null
  const url = m[1].trim()
  return /^https?:\/\//i.test(url) ? url : null
}

// appo_report テキストから「担当者：氏名様（代表取締役）」を拾う
function extractRepresentativeFromAppoReport(text: string | null): string | null {
  if (!text) return null
  const m = text.match(/担当者[\s:：]+([^\s様]+)様/)
  return m ? m[1].trim() : null
}

// appo_report テキストから MASP メモ4項目を抽出（先方のお人柄／面談経験／将来検討／その他）。
// 旧フォーマット「先方の温度感→...」にも後方互換でマッチ。
function extractMaspMemoFromAppoReport(text: string | null): {
  personality?: string
  meeting_exp?: string
  future_consider?: string
  other?: string
} {
  if (!text) return {}
  const result: { personality?: string; meeting_exp?: string; future_consider?: string; other?: string } = {}
  // 各行は「　・<項目>→<内容>」形式（先頭は全角スペース）。
  const grab = (re: RegExp): string | undefined => {
    const m = text.match(re)
    if (!m) return undefined
    const v = m[1].trim()
    return v && v !== '確認できず' ? v : undefined
  }
  // engagement 横断で類似ラベルを許容: お人柄/温度感, 面談経験/運用状況/既存ツール/採用課題, 検討可否/検討時期
  result.personality      = grab(/[　\s]*・\s*(?:先方のお人柄|先方の温度感|担当者のお人柄|担当者の温度感)\s*[→:：]\s*([^\n]+)/)
  result.meeting_exp      = grab(/[　\s]*・\s*(?:面談経験の有無|既存ツール|現在の運用状況|過去の買収.{0,10}実績|現在の協業状況|現在の採用課題)\s*[→:：]\s*([^\n]+)/)
  result.future_consider  = grab(/[　\s]*・\s*(?:将来的な検討可否|導入検討時期|今後の運用方針|今後の買収方針|今後の採用計画|今後の提携方針|検討時期)\s*[→:：]\s*([^\n]+)/)
  result.other            = grab(/[　\s]*・\s*その他\s*[→:：]\s*([^\n]+)/)
  return result
}

interface AppointmentRow {
  id: string
  org_id: string
  item_id: string | null
  company_name: string
  appo_report: string | null
  list_id: string | null
  client_id: string | null
  engagement_id: string | null
}

interface CallListItemRow {
  company: string | null
  address: string | null
  phone: string | null
  business: string | null
  representative: string | null
}

interface CallListRow {
  company_url: string | null
}

interface CompanyMasterRow {
  company_name: string
  industry_major: string | null
  industry_sub: string | null
  business_description: string | null
  prefecture: string | null
  city: string | null
  address: string | null
  full_address: string | null
  revenue_k: number | null
  net_income_k: number | null
  ordinary_income_k: number | null
  capital_k: number | null
  representative: string | null
  representative_age: number | null
  shareholders: string | null
  officers: string | null
  employee_count: number | null
  established_year: number | null
  phone: string | null
  clients: string | null
  suppliers: string | null
  remarks: string | null
}

// 「株式会社X」「X株式会社」「（株）X」等のプレフィックス/サフィックスを除去して core 名を返す
function normalizeCompanyName(name: string): string {
  return name
    .replace(/(株式会社|有限会社|合同会社|合資会社|合名会社|相互会社|医療法人|社会福祉法人|学校法人|特定非営利活動法人|一般社団法人|公益社団法人|一般財団法人|公益財団法人|宗教法人)/g, '')
    .replace(/[（(](株|有|合|名|資|相)[)）]/g, '')
    .replace(/[\s　]/g, '')
    .trim()
}

async function loadAppointmentContext(appointmentId: string): Promise<{
  appointment: AppointmentRow
  item: CallListItemRow | null
  list: CallListRow | null
  master: CompanyMasterRow | null
  engagementSlug: string | null
} | null> {
  const { data: appt, error: apptErr } = await supabase
    .from('appointments')
    .select('id, org_id, item_id, company_name, appo_report, list_id, client_id, engagement_id')
    .eq('id', appointmentId)
    .maybeSingle()
  if (apptErr || !appt) return null

  // company_master は全社共通の national DB（org_id カラム無し）。
  // Step 1: 社名完全一致 → Step 2: 株式会社等を除去した normalized_name 一致
  const masterColumns = 'company_name, industry_major, industry_sub, business_description, prefecture, city, address, full_address, revenue_k, net_income_k, ordinary_income_k, capital_k, representative, representative_age, shareholders, officers, employee_count, established_year, phone, clients, suppliers, remarks'

  const [itemRes, listRes, masterExactRes] = await Promise.all([
    appt.item_id
      ? supabase.from('call_list_items')
          .select('company, address, phone, business, representative')
          .eq('id', appt.item_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    appt.list_id
      ? supabase.from('call_lists')
          .select('company_url')
          .eq('id', appt.list_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('company_master')
      .select(masterColumns)
      .eq('company_name', appt.company_name)
      .limit(1)
      .maybeSingle(),
  ])

  let master = (masterExactRes.data || null) as CompanyMasterRow | null

  // fallback: normalized_name で一致検索（株式会社などのプレフィックス揺れ吸収）
  if (!master) {
    const core = normalizeCompanyName(appt.company_name)
    if (core && core.length >= 2) {
      const { data: fuzzyData } = await supabase.from('company_master')
        .select(masterColumns)
        .eq('normalized_name', core)
        .limit(1)
        .maybeSingle()
      if (fuzzyData) master = fuzzyData as CompanyMasterRow
    }
  }

  // engagement.slug を取得
  // 優先順位: appointment.engagement_id > clients.engagement_id (フォールバック)
  // 売り手/買い手両方やっているクライアント (例: LST) では appointment 側が正しい商材
  let engagementSlug: string | null = null
  let resolvedEngagementId: string | null = appt.engagement_id || null
  if (!resolvedEngagementId && appt.client_id) {
    const { data: clientRow } = await supabase
      .from('clients')
      .select('engagement_id')
      .eq('id', appt.client_id)
      .maybeSingle()
    resolvedEngagementId = clientRow?.engagement_id || null
  }
  if (resolvedEngagementId) {
    const { data: engRow } = await supabase
      .from('engagements')
      .select('slug')
      .eq('id', resolvedEngagementId)
      .maybeSingle()
    engagementSlug = engRow?.slug || null
  }

  return {
    appointment: appt as AppointmentRow,
    item: (itemRes.data || null) as CallListItemRow | null,
    list: (listRes.data || null) as CallListRow | null,
    master,
    engagementSlug,
  }
}

function buildIdentityClause(targetCompany: string, targetRep: string | null, targetAddress: string | null): string {
  const parts: string[] = []
  parts.push(`- 社名: ${targetCompany}`)
  if (targetRep) parts.push(`- 代表者名: ${targetRep}`)
  if (targetAddress) parts.push(`- 住所: ${targetAddress}`)
  return parts.join('\n')
}

// 共通ヘルパー: identity + master ブロック + industryHint
function buildContextBlocks(args: {
  targetCompany: string
  targetRep: string | null
  targetAddress: string | null
  master: CompanyMasterRow | null
}): { identityBlock: string; masterBlock: string; industryHint: string } {
  const identityBlock = buildIdentityClause(args.targetCompany, args.targetRep, args.targetAddress)
  const masterBlock = args.master ? `
【社内マスターDB(参考。UIで別途表示するため content には重複させない)】
- 商号: ${args.master.company_name}
- 業界: ${args.master.industry_major || '不明'} / ${args.master.industry_sub || '不明'}
- 事業: ${args.master.business_description || '不明'}
- 住所: ${args.master.full_address || args.master.address || '不明'}
- 代表者: ${args.master.representative || '不明'}
- 設立: ${args.master.established_year ?? '不明'}
` : ''
  const industryHint = args.master?.industry_sub || args.master?.industry_major || '対象企業の属する業界'
  return { identityBlock, masterBlock, industryHint }
}

const JSON_GUARDRAIL = `【出力フォーマット規約(絶対厳守)】
- 出力は純粋な JSON 1 オブジェクトのみ。コードフェンス禁止。前置き・後書き禁止。
- 1 文字目は { で最後の文字は }。`

const IDENTITY_RULE = `【企業同定の絶対ルール】
- 社名・代表者名・住所のうち少なくとも 2 つが一致する情報のみ採用
- 社名のみ一致(同名異社リスク)は web_search で住所/代表者を確認
- 確認できない情報は採用せず identity_match='low'
- 推測・捏造禁止`

// === Call 1: 企業コア (HP本文中心、web_search 1回まで) ===
// executive_summary / business / strengths / history を生成
function buildCompanyCorePrompt(args: {
  targetCompany: string
  targetRep: string | null
  targetAddress: string | null
  master: CompanyMasterRow | null
  hpUrl: string | null
  hpPages: { url: string; text: string }[]
  spec: DossierAiSpec
}): string {
  const { identityBlock, masterBlock } = buildContextBlocks(args)
  const hpBlock = args.hpPages.length > 0 ? `
【対象企業HP本文(${args.hpUrl})】
${args.hpPages.map(p => `=== ${p.url} ===\n${p.text}`).join('\n\n')}
` : args.hpUrl ? `
【対象企業HP】${args.hpUrl} (本文取得失敗。web_search でドメイン限定検索推奨)
` : `
【対象企業HP】未指定 (web_search で企業を特定)
`

  return `あなたは法人営業アナリストです (${args.spec.industryTrendFocus})。対象企業の基本情報を構造化してください。

${JSON_GUARDRAIL}

【対象企業の同定情報】
${identityBlock}

${IDENTITY_RULE}
${masterBlock}
${hpBlock}

【生成セクション(3つのみ)】
1. business  : 事業セグメント別の説明 string[]、各 1-2 文、最大 6 件
2. strengths : 特徴・強み string[]、各 1-2 文、最大 5 件
3. history   : 対象企業の沿革 [{year, event}]、最大 8 件

【絶対に出力しない項目(重複排除)】
- 住所・代表者・売上・利益・資本金・従業員数・電話・株主・役員・取引先 → 社内DBで表示
- 業界全体の市場動向 / 同業界 M&A ニュース → 別 call で取得
- 会社概要・要約は不要（基本情報の表で代替）

【出力JSON】
{
  "content": {
    "business": ["..."],
    "strengths": ["..."],
    "history": [{"year": "1985", "event": "設立"}]
  },
  "sources": [{"type": "hp", "url": "...", "identity_match": "high"}]
}`
}

// === Call 2: 同業界ニュース (web_search 中心) ===
// engagement 別 spec で切替: M&Aニュース / SaaS導入トレンド / 採用市場動向 等
function buildIndustryMaNewsPrompt(args: {
  targetCompany: string
  targetRep: string | null
  targetAddress: string | null
  master: CompanyMasterRow | null
  spec: DossierAiSpec
}): string {
  const { identityBlock, masterBlock, industryHint } = buildContextBlocks(args)
  const sitesDirective = args.spec.newsSearchSites.map(s => `site:${s}`).join(' / ')
  const dealTypeOptions = args.spec.newsDealTypes.map(t => `'${t}'`).join(' | ')

  return `あなたは法人営業アナリストです (${args.spec.industryTrendFocus})。「${industryHint}」の ${args.spec.axisLabel} 関連ニュースを構造化してください。

${JSON_GUARDRAIL}

【対象企業の同定(参考用、本callは同業界ニュース取得が目的)】
${identityBlock}
${masterBlock}

【生成セクション】
industry_ma_news (キー名は固定): 「${industryHint}」の ${args.spec.axisLabel} 関連ニュース最大 5 件
  [{date, title, url, summary, source, deal_type}]
  deal_type は ${dealTypeOptions} 等
  対象企業そのものでなく、同業界の他社事例/動向が主軸

【web_search 使用方針】
- ${sitesDirective} 等を優先
- 直近1-2年の案件中心
- identity_match='medium' でOK

【出力JSON】
{
  "content": {
    "industry_ma_news": [
      {"date": "2026-04-15", "title": "...", "url": "...", "summary": "...", "source": "${args.spec.newsSearchSites[0] || ''}", "deal_type": "${args.spec.newsDealTypes[0]}"}
    ]
  },
  "sources": [{"type": "web_search", "url": "...", "identity_match": "medium"}]
}

【出力の厳守事項】
- 該当ニュースが無ければ industry_ma_news: [] (捏造禁止)
- url 不明は空文字
- JSON 以外のテキスト一切なし`
}

interface DossierResult {
  content: Record<string, unknown>
  sources: Array<{ type: string; url: string; identity_match: string; note?: string }>
}

// company_master 行から internal_db オブジェクトを構築。
// Claude を経由しないため情報欠落・要約による劣化が起きない。
function buildInternalDb(master: CompanyMasterRow | null): Record<string, unknown> | null {
  if (!master) return null
  const obj: Record<string, unknown> = {}
  const keys: (keyof CompanyMasterRow)[] = [
    'industry_major', 'industry_sub', 'business_description',
    'prefecture', 'city', 'address', 'full_address',
    'representative', 'representative_age',
    'established_year', 'employee_count',
    'revenue_k', 'ordinary_income_k', 'net_income_k', 'capital_k',
    'phone',
    'officers', 'shareholders', 'clients', 'suppliers',
    'remarks',
  ]
  for (const k of keys) {
    const v = master[k]
    if (v !== null && v !== undefined && v !== '') obj[k] = v
  }
  return Object.keys(obj).length > 0 ? obj : null
}

// Claude 応答からJSONを堅牢に抽出する。
//   - ```json ... ``` フェンスを最優先で剥がす
//   - 文字列全体が JSON ならそのまま parse
//   - だめなら最初の `{` から「対応する `}`」までを balanced match で抽出
function extractDossierJson(rawText: string): { ok: true; value: { content: unknown; sources?: unknown } } | { ok: false; error: string } {
  if (!rawText) return { ok: false, error: 'empty response' }

  // 1. コードフェンス剥がし
  let s = rawText.trim()
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) s = fenceMatch[1].trim()

  // 2. 直接 parse 試行
  try { return { ok: true, value: JSON.parse(s) as { content: unknown; sources?: unknown } } } catch (_) { /* fallthrough */ }

  // 3. 最初の { から balanced match で抽出（文字列内のブレースは無視）
  const start = s.indexOf('{')
  if (start < 0) return { ok: false, error: 'no opening brace found' }
  let depth = 0
  let inStr = false
  let esc = false
  let end = -1
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (esc) { esc = false; continue }
    if (ch === '\\') { esc = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end < 0) return { ok: false, error: 'no matching closing brace' }
  const candidate = s.slice(start, end + 1)
  try { return { ok: true, value: JSON.parse(candidate) as { content: unknown; sources?: unknown } } }
  catch (e) { return { ok: false, error: `JSON parse failed: ${(e as Error).message}` } }
}

async function callClaude(opts: {
  prompt: string
  maxTokens: number
  maxWebSearches: number
  timeoutMs?: number
  label: string
}): Promise<DossierResult | { error: string }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY not set' }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000)

  let res: Response
  try {
    const body: Record<string, unknown> = {
      model: 'claude-sonnet-4-6',
      max_tokens: opts.maxTokens,
      messages: [{ role: 'user', content: opts.prompt }],
    }
    if (opts.maxWebSearches > 0) {
      body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: opts.maxWebSearches }]
    }
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (e) {
    clearTimeout(timeoutId)
    if ((e as Error).name === 'AbortError') {
      return { error: `[${opts.label}] Claude API timeout (${opts.timeoutMs ?? 120000}ms exceeded)` }
    }
    return { error: `[${opts.label}] Claude API fetch error: ${(e as Error).message}` }
  }
  clearTimeout(timeoutId)

  if (!res.ok) {
    const errText = await res.text()
    return { error: `[${opts.label}] Anthropic API error ${res.status}: ${errText.slice(0, 500)}` }
  }
  const data = await res.json()
  const text = (data.content || [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('')

  const extracted = extractDossierJson(text)
  if (!extracted.ok) return { error: `[${opts.label}] ${extracted.error}. Raw head: ${text.slice(0, 300)}` }

  const parsed = extracted.value as { content?: Record<string, unknown>; sources?: Array<{ type: string; url: string; identity_match: string }> }
  if (!parsed.content) return { error: `[${opts.label}] content key missing in JSON` }
  return {
    content: parsed.content,
    sources: Array.isArray(parsed.sources) ? parsed.sources : [],
  }
}

async function runDossierGeneration(appointmentId: string, providedHpUrl: string | null): Promise<void> {
  const ctx = await loadAppointmentContext(appointmentId)
  if (!ctx) {
    console.error('[generate-company-dossier] appointment not found:', appointmentId)
    return
  }
  const { appointment, item, list, master, engagementSlug } = ctx
  const spec = getDossierAiSpec(engagementSlug)

  const targetCompany = item?.company || master?.company_name || appointment.company_name
  const targetRep = item?.representative || master?.representative || extractRepresentativeFromAppoReport(appointment.appo_report)
  const targetAddress = item?.address || master?.address || null

  const hpUrl = providedHpUrl
    || list?.company_url
    || extractHpFromAppoReport(appointment.appo_report)
    || null

  // dossier 行を running 状態で upsert
  const { error: upsertErr } = await supabase
    .from('company_dossiers')
    .upsert({
      org_id: appointment.org_id,
      appointment_id: appointment.id,
      item_id: appointment.item_id,
      target_company_name: targetCompany,
      target_representative: targetRep,
      target_address: targetAddress,
      generation_status: 'running',
      generation_error: null,
    }, { onConflict: 'appointment_id' })
  if (upsertErr) {
    console.error('[generate-company-dossier] upsert running failed:', upsertErr)
    return
  }

  // HP 本文取得
  const hpPages: { url: string; text: string }[] = hpUrl
    ? await fetchCompanyPagesFromDomain(hpUrl).catch(() => [])
    : []

  // 社内DB情報・MASP メモは Claude を経由せず Edge Function 側で構築
  const internalDb = buildInternalDb(master)
  const maspMemo = extractMaspMemoFromAppoReport(appointment.appo_report)

  // === 2 並列 Claude 呼び出し（時間半減）===
  // Call 1: 企業コア（HP本文ベース、web_search 1回まで）
  // Call 2: 同業界M&Aニュース（web_search 2回まで）
  // 最遅 call の時間で完了する → 直列なら 60-120秒、並列なら 30-70秒程度を目標
  const coreBaseArgs = { targetCompany, targetRep, targetAddress, master, spec }
  const [coreResult, maNewsResult] = await Promise.all([
    callClaude({
      prompt: buildCompanyCorePrompt({ ...coreBaseArgs, hpUrl, hpPages }),
      maxTokens: 3000,
      maxWebSearches: 1,
      timeoutMs: 120_000,
      label: 'core',
    }),
    callClaude({
      prompt: buildIndustryMaNewsPrompt(coreBaseArgs),
      maxTokens: 2500,
      maxWebSearches: 2,
      timeoutMs: 120_000,
      label: `news_${spec.axisLabel}`,
    }),
  ])

  // 6セクション content マージヘルパー（Executive Summary 廃止、history を独立 key 化）
  //   - basic_info = internal_db のみ（沿革は含めない）
  //   - history は独立セクション
  //   - business / strengths は coreResult から
  //   - industry_ma_news は maNewsResult から
  //   - masp_memo は appo_report 抽出
  const mergeContent = (
    coreContent: Record<string, unknown> | null,
    maNewsContent: Record<string, unknown> | null,
  ): Record<string, unknown> => {
    const cc = coreContent || {}
    const mc = maNewsContent || {}

    return {
      basic_info: internalDb || {},
      history: Array.isArray(cc.history) ? cc.history : [],
      business: Array.isArray(cc.business) ? cc.business : [],
      strengths: Array.isArray(cc.strengths) ? cc.strengths : [],
      industry_ma_news: Array.isArray(mc.industry_ma_news) ? mc.industry_ma_news : [],
      masp_memo: maspMemo,
    }
  }

  const coreOk = !('error' in coreResult)
  const maNewsOk = !('error' in maNewsResult)
  const errors: string[] = []
  if (!coreOk) errors.push((coreResult as { error: string }).error)
  if (!maNewsOk) errors.push((maNewsResult as { error: string }).error)

  const mergedContent = mergeContent(
    coreOk ? (coreResult as DossierResult).content : null,
    maNewsOk ? (maNewsResult as DossierResult).content : null,
  )

  // ステータス判定:
  //   - 両方失敗 + internal_db/masp_memo もなし → failed
  //   - 両方失敗だが basic_info/masp_memo あり → partial
  //   - 片方成功 → partial（不完全だが表示可能）
  //   - 両方成功 → succeeded
  let status: 'succeeded' | 'partial' | 'failed'
  if (!coreOk && !maNewsOk) {
    status = (internalDb || Object.keys(maspMemo).length > 0) ? 'partial' : 'failed'
  } else if (!coreOk || !maNewsOk) {
    status = 'partial'
  } else {
    status = 'succeeded'
  }

  // sources を結合（両 call から）
  const sourcesWithMeta: Array<{ type: string; url: string; identity_match: string; fetched_at: string }> = []
  const pushSources = (r: DossierResult | { error: string }) => {
    if ('error' in r) return
    for (const s of r.sources) sourcesWithMeta.push({ ...s, fetched_at: new Date().toISOString() })
  }
  pushSources(coreResult)
  pushSources(maNewsResult)

  if (status === 'failed') {
    await supabase
      .from('company_dossiers')
      .update({
        generation_status: 'failed',
        generation_error: errors.join(' | ').slice(0, 1000),
        generated_at: new Date().toISOString(),
      })
      .eq('appointment_id', appointmentId)
    return
  }

  await supabase
    .from('company_dossiers')
    .update({
      content: mergedContent,
      sources: sourcesWithMeta,
      generation_status: status,
      generation_error: errors.length > 0 ? errors.join(' | ').slice(0, 1000) : null,
      generated_at: new Date().toISOString(),
    })
    .eq('appointment_id', appointmentId)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const body = await req.json()
    const { appointment_id, hp_url } = body
    if (!appointment_id || typeof appointment_id !== 'string') {
      return json({ error: 'appointment_id is required' }, 400)
    }

    // バックグラウンド実行で即時 202 を返す
    // @ts-ignore  EdgeRuntime is Supabase Deno runtime extension
    EdgeRuntime.waitUntil(runDossierGeneration(appointment_id, hp_url || null))

    return json({ accepted: true, appointment_id }, 202)
  } catch (err) {
    console.error('[generate-company-dossier] handler error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
