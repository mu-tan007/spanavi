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
  result.personality      = grab(/[　\s]*・\s*(?:先方のお人柄|先方の温度感)\s*[→:：]\s*([^\n]+)/)
  result.meeting_exp      = grab(/[　\s]*・\s*面談経験の有無\s*[→:：]\s*([^\n]+)/)
  result.future_consider  = grab(/[　\s]*・\s*将来的な検討可否\s*[→:：]\s*([^\n]+)/)
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
} | null> {
  const { data: appt, error: apptErr } = await supabase
    .from('appointments')
    .select('id, org_id, item_id, company_name, appo_report, list_id')
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

  return {
    appointment: appt as AppointmentRow,
    item: (itemRes.data || null) as CallListItemRow | null,
    list: (listRes.data || null) as CallListRow | null,
    master,
  }
}

function buildIdentityClause(targetCompany: string, targetRep: string | null, targetAddress: string | null): string {
  const parts: string[] = []
  parts.push(`- 社名: ${targetCompany}`)
  if (targetRep) parts.push(`- 代表者名: ${targetRep}`)
  if (targetAddress) parts.push(`- 住所: ${targetAddress}`)
  return parts.join('\n')
}

function buildPrompt(args: {
  targetCompany: string
  targetRep: string | null
  targetAddress: string | null
  master: CompanyMasterRow | null
  hpUrl: string | null
  hpPages: { url: string; text: string }[]
}): string {
  const identityBlock = buildIdentityClause(args.targetCompany, args.targetRep, args.targetAddress)
  const masterBlock = args.master ? `
【社内マスターDBの該当企業情報（参考。これも採用前に同定照合すること。なお内容は別途 internal_db セクションで UI に直接表示されるので、重複させず外部情報の補完に専念せよ）】
- 商号: ${args.master.company_name}
- 業界(大分類): ${args.master.industry_major || '不明'}
- 業界(細分類): ${args.master.industry_sub || '不明'}
- 事業内容: ${args.master.business_description || '不明'}
- 都道府県: ${args.master.prefecture || '不明'}
- 市区郡: ${args.master.city || '不明'}
- 住所: ${args.master.full_address || args.master.address || '不明'}
- 売上高(千円): ${args.master.revenue_k ?? '不明'}
- 経常利益(千円): ${args.master.ordinary_income_k ?? '不明'}
- 当期純利益(千円): ${args.master.net_income_k ?? '不明'}
- 資本金(千円): ${args.master.capital_k ?? '不明'}
- 代表者: ${args.master.representative || '不明'}
- 代表者年齢: ${args.master.representative_age ?? '不明'}
- 設立年: ${args.master.established_year ?? '不明'}
- 従業員数: ${args.master.employee_count ?? '不明'}
- 電話: ${args.master.phone || '不明'}
- 役員: ${args.master.officers || '不明'}
- 株主: ${args.master.shareholders || '不明'}
- 主要取引先: ${args.master.clients || '不明'}
- 仕入先: ${args.master.suppliers || '不明'}
- 備考: ${args.master.remarks || '不明'}
` : ''

  const hpBlock = args.hpPages.length > 0 ? `
【対象企業HP本文（${args.hpUrl}）】
${args.hpPages.map(p => `=== ${p.url} ===\n${p.text}`).join('\n\n')}
` : args.hpUrl ? `
【対象企業HP】${args.hpUrl}（本文取得に失敗。web_search ツールでドメイン限定検索することを推奨）
` : `
【対象企業HP】未指定（web_search ツールで企業を特定すること）
`

  const industryHint = args.master?.industry_major || args.master?.industry_sub || '対象企業の属する業界'

  return `あなたは M&A アドバイザリーのアナリストです。
クライアントへ提示する「企業情報レポート」を、以下の対象企業について構造化して作成してください。

【出力フォーマット規約（絶対厳守）】
- 出力は純粋な JSON 1 オブジェクトのみ。
- 「\`\`\`json」「\`\`\`」等のコードフェンスを付けない。
- JSON の前後に説明文・前置き・後書き・補足・脚注を一切付けない。
- 文字列内部の二重引用符は \\" でエスケープ。改行は \\n。
- 1 文字目は必ず { で、最後の文字は必ず } とする。
- 上記が守れない場合、応答はパース失敗で破棄される。

【対象企業の同定情報（厳守）】
${identityBlock}

【企業同定の絶対ルール】
- 上記の社名・代表者名・住所のうち少なくとも 2 つが一致する情報のみ採用する
- 社名のみ一致する情報（同名異社のリスク）は採用前に web_search で住所か代表者を確認する
- 確認できない情報は採用せず、各 source の identity_match を 'low' とマーク
- 推測・他社情報からの捏造は絶対に行わない
${masterBlock}
${hpBlock}

【セクション構成（重複排除のため厳守）】
本レポートは以下 6 セクションのみを生成する（MASPメモと基本情報の社内DB部分は別途UIで生成・表示）：

1. executive_summary  : 「何をやっている会社か」を 1-3 文・80-150 文字で簡潔に。冗長な前置き禁止
2. business           : 事業セグメント別の説明（箇条書き string[]、各 1-2 文、最大 6 件）
3. strengths          : 特徴や強み・差別化要素（箇条書き string[]、各 1-2 文、最大 5 件）
4. market_trend       : ${industryHint}全体の市場動向（200-400 文字）。M&A 文脈で読み解く視点
                        （業界再編トレンド、需要動向、規制環境、後継者問題、買い手心理 等）
5. industry_ma_news   : 同業界（${industryHint}）の M&A 関連ニュース最大 5 件
                        [{date, title, url, summary, source, deal_type}]
                        deal_type は 'M&A' | 'TOB' | '資本業務提携' | '事業譲渡' | '子会社化' 等
6. history            : 対象企業の沿革（[{year, event}] 形式、最大 8 件）。basic_info セクション内に配置

【絶対に出力しない項目（重複排除）】
- 会社の住所・代表者・売上・利益・資本金・従業員数・設立年・電話番号・株主・役員・取引先・仕入先
  → 社内DB（basic_info）で別途表示するため content には含めない
- 個別企業のプレスリリース・ニュース
  → 業界 M&A ニュース (industry_ma_news) に集約。個社レベルのプレス羅列は不要
- 「会社概要」と称する長文段落
  → executive_summary を超えない短文1個のみ

【作成ルール】
1. 公開情報のみを使用（HP本文 + web_search ツール）
2. web_search ツールは以下の目的で使用：
   - 業界の M&A 案件・市場動向の取得（site:prtimes.jp / site:nikkei.com / site:ma-cp.com 等）
   - 業界レポート・統計の取得
   - 対象企業の沿革・事業セグメントの補完
3. 各情報源について identity_match (high/medium/low) を判定
   - industry_ma_news は同業界の他社 M&A 案件なので、identity_match='medium' 想定
     （対象企業そのもののニュースではないため high はつけない）

【出力フォーマット（必ずこのJSONのみ、他テキスト一切なし）】
{
  "content": {
    "executive_summary": "東京都内に本社を構えるパン製造小売企業。スクラッチ製法のベーカリーを多店舗展開し、フランチャイズ・海外進出も推進。",
    "business": [
      "ベーカリー直営事業: 石窯パン工房「○○」を本州中心に12店舗展開",
      "FC事業: 2017年開始、関東圏で5店舗。マスターFC契約も保有",
      "海外事業: 2024年インドネシア・バリ島に進出"
    ],
    "strengths": [
      "スクラッチ製法による120種類以上のパン品揃え",
      "セレクトショップ型コンセプトによる差別化",
      "サンマルクとのマスターFC契約による全国展開基盤"
    ],
    "market_trend": "国内ベーカリー市場は人件費・原材料費高騰で利益率が圧迫されている一方、こだわり系・地域密着型ブランドへの選好は強い…（200-400文字）",
    "industry_ma_news": [
      {"date": "2026-04-15", "title": "○○製パンが△△ベーカリーを買収", "url": "...", "summary": "...", "source": "M&A Capital Partners", "deal_type": "M&A"}
    ],
    "history": [
      {"year": "2013", "event": "株式会社○○設立、代表取締役 ○○"},
      {"year": "2014", "event": "本庄本店オープン"}
    ]
  },
  "sources": [
    {"type": "hp",         "url": "...", "identity_match": "high"},
    {"type": "web_search", "url": "https://prtimes.jp/...", "identity_match": "medium"}
  ]
}

【出力の厳守事項】
- 情報が無いセクションは空配列・空文字として返す（捏造禁止）
- JSON 以外のテキストは一切出力しない
- url 不明の industry_ma_news は url を空文字にする
- 採用しなかった候補に関する注釈は出力に含めない（identity_match で表現する）`
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

async function generateDossierWithClaude(prompt: string): Promise<DossierResult | { error: string }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY not set' }

  // Claude API call に 120 秒タイムアウト（Edge Function Wall clock 400 秒以内に確実に収まるよう）
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 5000,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      }),
      signal: controller.signal,
    })
  } catch (e) {
    clearTimeout(timeoutId)
    if ((e as Error).name === 'AbortError') {
      return { error: 'Claude API timeout (120s exceeded)' }
    }
    return { error: `Claude API fetch error: ${(e as Error).message}` }
  }
  clearTimeout(timeoutId)

  if (!res.ok) {
    const errText = await res.text()
    return { error: `Anthropic API error ${res.status}: ${errText.slice(0, 500)}` }
  }
  const data = await res.json()
  const text = (data.content || [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('')

  const extracted = extractDossierJson(text)
  if (!extracted.ok) return { error: `${extracted.error}. Raw head: ${text.slice(0, 300)}` }

  const parsed = extracted.value as { content?: Record<string, unknown>; sources?: Array<{ type: string; url: string; identity_match: string }> }
  if (!parsed.content) return { error: 'content key missing in JSON' }
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
  const { appointment, item, list, master } = ctx

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

  // Claude へ依頼
  const prompt = buildPrompt({
    targetCompany, targetRep, targetAddress, master, hpUrl, hpPages,
  })

  // 社内DB情報（basic_info の生データ部分）と MASP メモ（アポ報告から自動抽出）を
  // Edge Function 側で構築（Claude を介さず確実に表示）
  const internalDb = buildInternalDb(master)
  const maspMemo = extractMaspMemoFromAppoReport(appointment.appo_report)

  const result = await generateDossierWithClaude(prompt)

  // 新7セクション構成への content マージヘルパー
  //   - Claude の出力 history は basic_info.history にネストする
  //   - basic_info = internal_db（社内DB生データ） + history
  //   - masp_memo は appo_report から抽出した4項目
  const mergeContent = (claudeContent: Record<string, unknown> | null): Record<string, unknown> => {
    const c = claudeContent || {}
    const history = Array.isArray(c.history) ? c.history : []
    const basicInfo: Record<string, unknown> = { ...(internalDb || {}) }
    if (history.length > 0) basicInfo.history = history

    const merged: Record<string, unknown> = {
      executive_summary: c.executive_summary || '',
      basic_info: basicInfo,
      business: Array.isArray(c.business) ? c.business : [],
      strengths: Array.isArray(c.strengths) ? c.strengths : [],
      market_trend: c.market_trend || '',
      industry_ma_news: Array.isArray(c.industry_ma_news) ? c.industry_ma_news : [],
      masp_memo: maspMemo,
    }
    return merged
  }

  if ('error' in result) {
    // Claude が失敗しても basic_info（社内DB）と masp_memo（アポ報告抽出）だけは保存し partial として表示
    const partialContent = mergeContent(null)
    if (internalDb || Object.keys(maspMemo).length > 0) {
      await supabase
        .from('company_dossiers')
        .update({
          content: partialContent,
          generation_status: 'partial',
          generation_error: result.error.slice(0, 1000),
          generated_at: new Date().toISOString(),
        })
        .eq('appointment_id', appointmentId)
    } else {
      await supabase
        .from('company_dossiers')
        .update({
          generation_status: 'failed',
          generation_error: result.error.slice(0, 1000),
          generated_at: new Date().toISOString(),
        })
        .eq('appointment_id', appointmentId)
    }
    return
  }

  const mergedContent = mergeContent(result.content)

  // HP 取得失敗 + sources が空 → partial
  const noHpData = !hpUrl || hpPages.length === 0
  const noSources = !result.sources || result.sources.length === 0
  const status = noHpData && noSources ? 'partial' : 'succeeded'

  // sources に取得時刻を付与
  const sourcesWithMeta = result.sources.map(s => ({
    ...s,
    fetched_at: new Date().toISOString(),
  }))

  await supabase
    .from('company_dossiers')
    .update({
      content: mergedContent,
      sources: sourcesWithMeta,
      generation_status: status,
      generation_error: null,
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
