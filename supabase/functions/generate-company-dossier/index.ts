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
  revenue_k: number | null
  net_income_k: number | null
  representative: string | null
  representative_age: string | null
  shareholders: string | null
  officers: string | null
  employee_count: string | null
  established_year: string | null
  phone: string | null
  clients: string | null
  remarks: string | null
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

  const [itemRes, listRes, masterRes] = await Promise.all([
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
      .select('company_name, industry_major, industry_sub, business_description, prefecture, city, address, revenue_k, net_income_k, representative, representative_age, shareholders, officers, employee_count, established_year, phone, clients, remarks')
      .eq('org_id', appt.org_id)
      .eq('company_name', appt.company_name)
      .limit(1)
      .maybeSingle(),
  ])

  return {
    appointment: appt as AppointmentRow,
    item: (itemRes.data || null) as CallListItemRow | null,
    list: (listRes.data || null) as CallListRow | null,
    master: (masterRes.data || null) as CompanyMasterRow | null,
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
- 住所: ${args.master.address || '不明'}
- 売上高(千円): ${args.master.revenue_k ?? '不明'}
- 当期純利益(千円): ${args.master.net_income_k ?? '不明'}
- 代表者: ${args.master.representative || '不明'}
- 代表者年齢: ${args.master.representative_age || '不明'}
- 設立年: ${args.master.established_year || '不明'}
- 従業員数: ${args.master.employee_count || '不明'}
- 電話: ${args.master.phone || '不明'}
- 役員: ${args.master.officers || '不明'}
- 株主: ${args.master.shareholders || '不明'}
- 取引先: ${args.master.clients || '不明'}
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

  return `あなたは M&A アドバイザリーのアナリストです。
クライアントへ提示する「企業情報」を、以下の対象企業について構造化して作成してください。

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

【作成ルール】
1. 公開情報のみを使用（HP本文 + web_search ツール）
2. web_search ツールは以下の目的で使用：
   - HP本文に無い経営陣・沿革情報の補完
   - 直近1年のプレスリリース取得（site:prtimes.jp や @Press 系）
   - 直近のニュース・受賞・新製品リリース（業界メディア）
3. 各情報源について identity_match (high/medium/low) を判定
   - high:   社名・代表者・住所いずれも一致確認できた
   - medium: 社名 + 1点が一致、もう1点は記載なし
   - low:    社名のみ一致、または同定不能（採用しない方が安全だが参考として記載可）
4. 社内DB情報（業界分類・株主・役員・取引先・備考等）は別途 UI に直接表示されるので、
   content には含めず外部情報の補完に専念せよ（business_segments / history / leadership /
   financials / press_releases / news / key_topics / mna_relevance / overview）

【出力フォーマット（必ずこのJSONのみ、他テキスト一切なし）】
{
  "content": {
    "overview": "会社概要を 200-400 文字で。創業の経緯、現在の規模感、主要事業、業界内のポジション、特徴を含める",
    "business_segments": ["セグメント1: 内容簡潔に", "セグメント2: ..."],
    "history": [
      {"year": "1985", "event": "設立"},
      {"year": "2010", "event": "..."}
    ],
    "leadership": [
      {"role": "代表取締役社長", "name": "..."},
      {"role": "取締役CFO", "name": "..."}
    ],
    "financials": {
      "revenue": "5.0億円(2025年3月期) など",
      "employees": "120名 など",
      "established": "1985年4月 など",
      "capital": "5,000万円 など"
    },
    "press_releases": [
      {"date": "2026-04-15", "title": "...", "url": "...", "summary": "1-2文"}
    ],
    "news": [
      {"date": "2026-03-10", "title": "...", "url": "...", "summary": "1-2文", "source": "日経新聞 等"}
    ],
    "key_topics": ["後継者問題への言及", "DX推進", "海外展開"],
    "mna_relevance": "M&Aアドバイザーとして本企業を見たときの所感を 150-300 文字で。事業承継ニーズ、財務状況、業界再編トレンド等"
  },
  "sources": [
    {"type": "hp",         "url": "...", "identity_match": "high"},
    {"type": "web_search", "url": "https://prtimes.jp/...", "identity_match": "high"}
  ]
}

【出力の厳守事項】
- 情報が無い項目は空配列・空文字・null として返す（捏造禁止）
- JSON 以外のテキスト（説明文・前置き・末尾コメント・コードフェンス）は一切出力しないこと
- url 不明の press_releases/news は url を空文字にする
- press_releases / news は最大 5 件ずつ
- 採用しなかった候補に関する注釈も出力に含めない（identity_match で表現する）`
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
    'prefecture', 'city', 'address',
    'representative', 'representative_age',
    'established_year', 'employee_count',
    'revenue_k', 'net_income_k',
    'phone',
    'officers', 'shareholders', 'clients',
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

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
    }),
  })

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

  // 社内DB情報を Edge Function 側で構築（Claude を介さず確実に表示）
  const internalDb = buildInternalDb(master)

  const result = await generateDossierWithClaude(prompt)

  if ('error' in result) {
    // Claude が失敗しても internal_db だけは保存し、partial として表示できるようにする
    if (internalDb) {
      await supabase
        .from('company_dossiers')
        .update({
          content: { internal_db: internalDb },
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

  // Claude content に internal_db をマージ（Edge Function 側で構築した生データ）
  const mergedContent: Record<string, unknown> = { ...result.content }
  if (internalDb) mergedContent.internal_db = internalDb

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
