import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
function err(status, msg) { return new Response(JSON.stringify({ success:false, error: msg }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return err(401, 'Missing Authorization')
    const anonClient = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await anonClient.auth.getUser()
    if (!user) return err(401, 'Invalid session')
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))

    const { template_id, deal_id } = await req.json()
    const { data: dealOwn } = await supabase.from('cap_deals').select('id').eq('id', deal_id).maybeSingle()
    if (!dealOwn) return err(403, 'Deal not found')
    const { data: template } = await supabase.from('cap_templates').select('*').eq('id', template_id).maybeSingle()
    if (!template) return err(403, 'Template not found')

    const { data: deal } = await supabase.from('cap_deals').select('*, cap_intermediaries(name), cap_contacts(name, email, title)').eq('id', deal_id).single()
    const { data: company } = await supabase.from('cap_deal_companies').select('*').eq('deal_id', deal_id).maybeSingle()
    const { data: financials } = await supabase.from('cap_deal_financials').select('*').eq('deal_id', deal_id).order('fiscal_year')
    const { data: valuation } = await supabase.from('cap_deal_valuations').select('*').eq('deal_id', deal_id).maybeSingle()

    const vars = {
      deal_name: deal?.name || '',
      deal_status: deal?.status || '',
      industry: deal?.industry_label || '',
      ev_estimate: deal?.ev_estimate ? ((deal.ev_estimate / 100000000).toFixed(1) + '億円') : '',
      intermediary_name: deal?.cap_intermediaries?.name || '',
      contact_name: deal?.cap_contacts?.name || '',
      contact_email: deal?.cap_contacts?.email || '',
      seller_name: company?.seller_name || '',
      founded_year: company?.founded_year ? (company.founded_year + '年') : '',
      employees: company?.employees ? (company.employees + '名') : '',
      hq_address: company?.hq_address || '',
      business_summary: company?.business_summary || '',
      date_today: new Date().toLocaleDateString('ja-JP'),
    }
    if (financials && financials.length > 0) {
      const latest = financials[financials.length - 1]
      vars.fiscal_year = latest.fiscal_year + '年度'
      vars.revenue = latest.revenue ? ((latest.revenue / 1000).toFixed(0) + '千円') : ''
      vars.operating_income = latest.operating_income ? ((latest.operating_income / 1000).toFixed(0) + '千円') : ''
      vars.ebitda = latest.ebitda ? ((latest.ebitda / 1000).toFixed(0) + '千円') : ''
      vars.net_assets = latest.net_assets ? ((latest.net_assets / 1000).toFixed(0) + '千円') : ''
      vars.net_income = latest.net_income ? ((latest.net_income / 1000).toFixed(0) + '千円') : ''
    }
    if (valuation) {
      vars.valuation_low = valuation.valuation_low ? ((valuation.valuation_low / 100000000).toFixed(1) + '億円') : ''
      vars.valuation_mid = valuation.valuation_mid ? ((valuation.valuation_mid / 100000000).toFixed(1) + '億円') : ''
      vars.valuation_high = valuation.valuation_high ? ((valuation.valuation_high / 100000000).toFixed(1) + '億円') : ''
    }

    const categoryLabels = { nonname: 'ノンネームシート', im: '企業概要書（IM）', loi: '意向表明書（LOI）', valuation_report: 'バリュエーションレポート', dd_checklist: 'DDチェックリスト', investment_memo: '投資委員会資料', other: 'その他資料' }
    const prompt = '以下の案件情報をもとに、' + (categoryLabels[template.category] || '資料') + 'をMarkdownで作成。\n\n案件情報:\n' + JSON.stringify(vars, null, 2) + '\n\nMarkdownのみで回答。'

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
    })
    const aiResult = await response.json()
    const content = aiResult.content?.[0]?.text || ''

    await supabase.from('cap_template_outputs').insert({ template_id, deal_id, variables_used: vars })
    return new Response(JSON.stringify({ success: true, content, variables: vars }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) { return err(400, error?.message || String(error)) }
})
