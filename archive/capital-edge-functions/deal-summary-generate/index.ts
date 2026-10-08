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

    const [
      { data: deal },
      { data: company },
      { data: financials },
      { data: qa },
      { data: chatMessages },
      { data: files },
      { data: valuation },
    ] = await Promise.all([
      sb.from('cap_deals').select('*, cap_intermediaries(name, type), cap_contacts(name, email, title)').eq('id', deal_id).single(),
      sb.from('cap_deal_companies').select('*').eq('deal_id', deal_id).maybeSingle(),
      sb.from('cap_deal_financials').select('*').eq('deal_id', deal_id).order('fiscal_year'),
      sb.from('cap_deal_qa').select('question, answer, asked_at, answered_at').eq('deal_id', deal_id),
      sb.from('cap_deal_chat_messages').select('role, content').eq('deal_id', deal_id).order('created_at', { ascending: true }).limit(60),
      sb.from('cap_deal_files').select('file_name, file_type, parsed_data').eq('deal_id', deal_id),
      sb.from('cap_deal_valuations').select('*').eq('deal_id', deal_id).maybeSingle(),
    ])

    const context = {
      deal: { name: deal?.name, status: deal?.status, industry: deal?.industry_label, ev_estimate: deal?.ev_estimate },
      company,
      financials,
      qa,
      files: (files||[]).map(f => ({ name: f.file_name, type: f.file_type, parsed: f.parsed_data })),
      valuation,
      chat: (chatMessages||[]).map(m => '[' + m.role + '] ' + m.content).join('\n'),
    }

    const systemPrompt = 'あなたはプロのM&Aアドバイザーです。以下の案件情報から、買い手が知りたいことを網羅した 売り手企業の詳細サマリー を Markdown で作成してください。\n\n構成:\n# 売り手企業サマリー\n## 会社概要\n## 事業内容\n## 市場・競合\n## 財務ハイライト\n## 強み (3〜5個)\n## 弱み・リスク (3〜5個)\n## シナジー仮説\n## 売却理由\n## 次に確認すべき項目 (3〜5個)\n\n実用的な内容にしてください。情報が不足な項目は 情報未取得 と明記し、推測を避けてください。'

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-opus-4-7', max_tokens: 4000, system: systemPrompt, messages: [{ role: 'user', content: '以下の案件情報からサマリーを作成:\n\n' + JSON.stringify(context, null, 2) }] }),
    })
    const aiResult = await response.json()
    const summary = aiResult.content?.[0]?.text || ''

    if (company?.id) {
      await sb.from('cap_deal_companies').update({ detailed_summary: summary, detailed_summary_updated_at: new Date().toISOString() }).eq('id', company.id)
    } else {
      await sb.from('cap_deal_companies').insert({ deal_id, detailed_summary: summary, detailed_summary_updated_at: new Date().toISOString() })
    }
    return new Response(JSON.stringify({ success: true, summary }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return err(400, e?.message || String(e))
  }
})
