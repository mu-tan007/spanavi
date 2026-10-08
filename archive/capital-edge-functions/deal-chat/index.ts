import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function unauth(msg) { return new Response(JSON.stringify({ success:false, error: msg }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }
function forbidden(msg) { return new Response(JSON.stringify({ success:false, error: msg }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }
function errRes(msg, debug) { return new Response(JSON.stringify({ success:false, error: msg, debug }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return unauth('Missing Authorization header')
    const anonClient = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await anonClient.auth.getUser()
    if (!user) return unauth('Invalid session')

    const service = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))

    const body = await req.json()
    const { deal_id, message, attachments, model = 'claude-opus-4-7' } = body

    const { data: dealOwn } = await service.from('cap_deals').select('id').eq('id', deal_id).maybeSingle()
    if (!dealOwn) return forbidden('Deal not found')

    const { data: deal } = await service.from('cap_deals').select('*, cap_intermediaries(name), cap_contacts(name, email)').eq('id', deal_id).single()
    const { data: company } = await service.from('cap_deal_companies').select('*').eq('deal_id', deal_id).maybeSingle()
    const { data: financials } = await service.from('cap_deal_financials').select('*').eq('deal_id', deal_id).order('fiscal_year')
    const { data: valuation } = await service.from('cap_deal_valuations').select('*').eq('deal_id', deal_id).maybeSingle()

    const { data: history } = await service.from('cap_deal_chat_messages').select('role, content, attachments').eq('deal_id', deal_id).order('created_at', { ascending: true }).limit(20)

    const systemPrompt = 'あなたはM&Aアドバイザーとして、以下の案件についてユーザーをサポートします。\n\n案件情報:\n' + JSON.stringify({ 案件名: deal?.name, 業種: deal?.industry_label, ステータス: deal?.status, 仲介: deal?.cap_intermediaries?.name, 担当: deal?.cap_contacts?.name, EV見積: deal?.ev_estimate, 企業情報: company, 財務履歴: financials?.slice(-3), バリュエーション: valuation }, null, 2) + '\n\n財務分析、バリュエーション、DD項目、シナジー、リスク、LBOストラクチャー、PMI計画などについて、専門的な視点でサポートしてください。回答は Markdown 形式で。'

    const messages = []
    for (const h of (history || [])) messages.push({ role: h.role, content: [{ type: 'text', text: h.content }] })

    const userContent = []
    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        if (att.mimeType === 'application/pdf') userContent.push({ type: 'document', source: { type: 'base64', media_type: att.mimeType, data: att.base64 } })
        else if (att.mimeType && att.mimeType.startsWith('image/')) userContent.push({ type: 'image', source: { type: 'base64', media_type: att.mimeType, data: att.base64 } })
      }
    }
    userContent.push({ type: 'text', text: message })
    messages.push({ role: 'user', content: userContent })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 4000, system: systemPrompt, messages }),
    })
    if (!response.ok) {
      const errText = await response.text()
      let errJson = null; try { errJson = JSON.parse(errText) } catch (_) {}
      return errRes('Claude API エラー (' + response.status + '): ' + (errJson?.error?.message || errText.slice(0, 200)), { status: response.status })
    }
    const aiResult = await response.json()
    let assistantText = ''
    if (Array.isArray(aiResult?.content)) { for (const block of aiResult.content) { if (block?.type === 'text' && block?.text) assistantText += block.text } }
    if (!assistantText) return errRes('Claude 応答が空 (stop_reason: ' + (aiResult?.stop_reason || 'unknown') + ')', { stop_reason: aiResult?.stop_reason })

    await service.from('cap_deal_chat_messages').insert([
      { deal_id, role: 'user', content: message, attachments: (attachments || []).map(a => ({ name: a.name, mimeType: a.mimeType })) },
      { deal_id, role: 'assistant', content: assistantText, model },
    ])

    return new Response(JSON.stringify({ success: true, content: assistantText }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('[deal-chat] error:', error)
    return new Response(JSON.stringify({ success: false, error: error?.message || String(error) }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
