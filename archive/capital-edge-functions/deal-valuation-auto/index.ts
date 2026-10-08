import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
function err(status, msg) { return new Response(JSON.stringify({ success:false, error: msg }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return err(401, 'Missing Authorization')
    const anon = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await anon.auth.getUser()
    if (!user) return err(401, 'Invalid session')
    const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))

    const { deal_id } = await req.json()
    const { data: dealOwn } = await sb.from('cap_deals').select('id').eq('id', deal_id).maybeSingle()
    if (!dealOwn) return err(403, 'Deal not found')

    const [ { data: deal }, { data: company }, { data: financials }, { data: existingVal }, { data: files } ] = await Promise.all([
      sb.from('cap_deals').select('*').eq('id', deal_id).single(),
      sb.from('cap_deal_companies').select('*').eq('deal_id', deal_id).maybeSingle(),
      sb.from('cap_deal_financials').select('*').eq('deal_id', deal_id).order('fiscal_year'),
      sb.from('cap_deal_valuations').select('*').eq('deal_id', deal_id).maybeSingle(),
      sb.from('cap_deal_files').select('file_type, parsed_data').eq('deal_id', deal_id),
    ])
    if (!financials || financials.length === 0) return err(400, '財務データがありません')
    const latest = financials[financials.length - 1]

    const nen_kai_net_assets = latest.net_assets || 0
    const nen_kai_annual_profit = latest.operating_income || 0
    const nen_kai_years = 3
    const nen_kai_result = nen_kai_net_assets + nen_kai_annual_profit * nen_kai_years

    const ctx = { 業種: deal?.industry_label, 企業: { seller_name: company?.seller_name, employees: company?.employees, business_summary: company?.business_summary }, 財務履歴: financials, 既存希望株価: existingVal?.hope_price, IM解析: (files||[]).filter(f => f.file_type === 'im').map(f => f.parsed_data) }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-opus-4-7', max_tokens: 2000, system: 'あなたはM&Aバリュエーションの専門家。業種と規模からEBITDA倍率と希望株価を決めてください。JSONのみ出力: {"ev_ebitda_multiple":6.0,"hope_price":200000000,"hope_price_note":"...","analyst_comment":"..."}', messages: [{ role: 'user', content: JSON.stringify(ctx, null, 2) }] }),
    })
    const aiResult = await response.json()
    const rawText = aiResult.content?.[0]?.text || '{}'
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    let suggest = {}
    try { suggest = jsonMatch ? JSON.parse(jsonMatch[0]) : {} } catch { suggest = {} }

    const ev_ebitda_multiple = Number(suggest.ev_ebitda_multiple) || 6
    const ev = (latest.ebitda || 0) * ev_ebitda_multiple
    const netDebt = (latest.interest_bearing_debt || 0) - (latest.cash || 0)
    const ev_ebitda_result = ev - netDebt
    const hope_price = suggest.hope_price ? Number(suggest.hope_price) : (existingVal?.hope_price || null)
    const low = Math.min(nen_kai_result, ev_ebitda_result)
    const high = Math.max(nen_kai_result, ev_ebitda_result)
    const mid = Math.round((nen_kai_result + ev_ebitda_result) / 2)

    const payload = { deal_id, nen_kai_net_assets, nen_kai_annual_profit, nen_kai_years, nen_kai_result, ev_ebitda_multiple, ev_ebitda_result, hope_price, hope_price_note: suggest.hope_price_note || existingVal?.hope_price_note || null, analyst_comment: suggest.analyst_comment || null, valuation_low: low, valuation_high: high, valuation_mid: mid, updated_at: new Date().toISOString() }

    if (existingVal?.id) { await sb.from('cap_deal_valuations').update(payload).eq('id', existingVal.id) }
    else { await sb.from('cap_deal_valuations').insert(payload) }

    return new Response(JSON.stringify({ success: true, valuation: payload }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) { return err(400, e?.message || String(e)) }
})
