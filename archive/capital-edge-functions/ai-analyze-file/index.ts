import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
function unauth(msg) { return new Response(JSON.stringify({ error: msg }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }
function forbidden(msg) { return new Response(JSON.stringify({ error: msg }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return unauth('Missing Authorization')
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await anonClient.auth.getUser()
    if (!user) return unauth('Invalid session')
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const { file_id, deal_id } = await req.json()
    const { data: dealOwn } = await supabase.from('cap_deals').select('id').eq('id', deal_id).maybeSingle()
    if (!dealOwn) return forbidden('Deal not found')

    const { data: file } = await supabase.from('cap_deal_files').select('*').eq('id', file_id).eq('deal_id', deal_id).single()
    if (!file) return forbidden('File not found')

    const { data: fileData } = await supabase.storage.from('caesar-files').download(file.storage_path)
    if (!fileData) throw new Error('File download failed')

    const arrayBuffer = await fileData.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
    const mediaType = file.file_name.endsWith('.pdf') ? 'application/pdf' : 'text/plain'

    const prompt = file.file_type === 'financial'
      ? 'このファイルは財務資料です。以下をJSONで: {"fiscal_years":[{"fiscal_year":年度,"revenue":売上,"gross_profit":null,"operating_income":営業利益,"ebitda":null,"net_income":null,"total_assets":null,"net_assets":純資産,"cash":null,"interest_bearing_debt":null}]} JSONのみ。'
      : 'このファイルはM&A案件資料(IM)。JSONで: {"company":{"seller_name":"","founded_year":null,"employees":null,"hq_address":"","business_summary":"","industry_label":""},"deal":{"ev_estimate":null,"industry_label":""},"swot":{"strengths":[],"weaknesses":[],"opportunities":[],"threats":[]},"market_analysis":{"market_size":"","growth_rate":"","competition":"","summary":""}} JSONのみ。'

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-opus-4-7', max_tokens: 2000, messages: [{ role: 'user', content: [ { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } }, { type: 'text', text: prompt } ] }] })
    })
    const aiResult = await response.json()
    const rawText = aiResult.content?.[0]?.text || '{}'
    let parsed = {}
    try { parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim()) } catch { parsed = {} }

    await supabase.from('cap_deal_files').update({ parsed_data: parsed }).eq('id', file_id)

    if (file.file_type === 'financial' && parsed.fiscal_years?.length) {
      for (const fy of parsed.fiscal_years) {
        if (!fy.fiscal_year) continue
        await supabase.from('cap_deal_financials').upsert({ deal_id, fiscal_year: fy.fiscal_year, revenue: fy.revenue, gross_profit: fy.gross_profit, operating_income: fy.operating_income, ebitda: fy.ebitda, net_income: fy.net_income, total_assets: fy.total_assets, net_assets: fy.net_assets, cash: fy.cash, interest_bearing_debt: fy.interest_bearing_debt }, { onConflict: 'deal_id,fiscal_year' })
      }
    }
    if (file.file_type === 'im' && parsed.company) {
      const c = parsed.company
      await supabase.from('cap_deal_companies').upsert({ deal_id, seller_name: c.seller_name, founded_year: c.founded_year, employees: c.employees, hq_address: c.hq_address, business_summary: c.business_summary, swot: parsed.swot || {}, market_analysis: parsed.market_analysis || {}, updated_at: new Date().toISOString() }, { onConflict: 'deal_id' })
      if (parsed.deal?.ev_estimate || parsed.deal?.industry_label) {
        const updates = { updated_at: new Date().toISOString() }
        if (parsed.deal.ev_estimate) updates.ev_estimate = parsed.deal.ev_estimate
        if (parsed.deal.industry_label) updates.industry_label = parsed.deal.industry_label
        await supabase.from('cap_deals').update(updates).eq('id', deal_id)
      }
    }

    const { data: financials } = await supabase.from('cap_deal_financials').select('*').eq('deal_id', deal_id).order('fiscal_year')
    const { data: company } = await supabase.from('cap_deal_companies').select('*').eq('deal_id', deal_id).maybeSingle()
    if (financials && financials.length > 0) {
      const latest = financials[financials.length - 1]
      const prev = financials.length > 1 ? financials[financials.length - 2] : null
      let financial = 50
      if (latest.net_assets > 0) financial += 15
      if (latest.operating_income > 0) financial += 15
      if (latest.cash > 0 && latest.interest_bearing_debt != null && latest.cash > latest.interest_bearing_debt * 0.3) financial += 10
      if (prev && latest.revenue > prev.revenue) financial += 10
      let market = 50
      const swot = company?.swot || {}
      if (swot.opportunities?.length > 0) market += 15
      if (swot.threats?.length <= 2) market += 10
      if (company?.market_analysis?.summary) market += 10
      market = Math.min(market, 90)
      const synergy = 65
      let pmi = 75
      if (latest && company?.employees > 100) pmi -= 10
      if (latest && company?.employees > 500) pmi -= 10
      let valuation = 60
      const { data: deal } = await supabase.from('cap_deals').select('ev_estimate').eq('id', deal_id).single()
      if (deal?.ev_estimate && latest.ebitda) {
        const multiple = deal.ev_estimate / latest.ebitda
        if (multiple <= 5) valuation = 85
        else if (multiple <= 7) valuation = 70
        else if (multiple <= 10) valuation = 55
        else valuation = 40
      }
      const total = Math.round(financial * 0.30 + synergy * 0.20 + pmi * 0.15 + market * 0.20 + valuation * 0.15)
      await supabase.from('cap_deals').update({ score: { total, financial, synergy, pmi, market, valuation, updated_at: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq('id', deal_id)
    }

    await supabase.from('cap_notifications').insert({ deal_id, type: 'file_uploaded', title: file.file_name + ' を解析しました', summary: file.file_type === 'financial' ? '財務データを' + (parsed.fiscal_years?.length || 0) + '期分抽出しました' : '企業情報・SWOT分析を抽出しました', is_read: false })

    return new Response(JSON.stringify({ success: true, parsed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
