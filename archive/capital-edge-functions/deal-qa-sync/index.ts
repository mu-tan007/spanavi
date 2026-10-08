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

    const { deal_id, mode } = await req.json()
    const { data: dealOwn } = await sb.from('cap_deals').select('id').eq('id', deal_id).maybeSingle()
    if (!dealOwn) return err(403, 'Deal not found')

    const [ { data: company }, { data: financials }, { data: existingQA }, { data: chatMessages }, { data: files } ] = await Promise.all([
      sb.from('cap_deal_companies').select('*').eq('deal_id', deal_id).maybeSingle(),
      sb.from('cap_deal_financials').select('*').eq('deal_id', deal_id).order('fiscal_year'),
      sb.from('cap_deal_qa').select('question').eq('deal_id', deal_id),
      sb.from('cap_deal_chat_messages').select('role, content').eq('deal_id', deal_id).order('created_at', { ascending: true }).limit(60),
      sb.from('cap_deal_files').select('file_name, file_type, parsed_data').eq('deal_id', deal_id),
    ])

    const existingQuestions = (existingQA || []).map(q => q.question)
    let systemPrompt = ''
    let userContent = ''
    if (mode === 'extract') {
      systemPrompt = 'あなたはM&Aアドバイザーです。チャット履歴から、介/売り手に確認すべき Q&A を抽出してください。チャットで既に回答があるものは answer にまとめ、未回答なら answer は null。既存の質問と重複は除外。JSON 配列のみで出力: [{"question":"...","answer":"..." or null}]'
      userContent = 'チャット履歴:\n' + (chatMessages || []).map(m => '[' + m.role + '] ' + m.content).join('\n\n') + '\n\n既存QA:\n' + existingQuestions.map(q => '- ' + q).join('\n')
    } else {
      systemPrompt = 'あなたはM&A買い手のアドバイザーです。DD/交渉/PMI計画に向けて 5〜10 個の質問を提案。財務・事業・法務・人的・PMIカテゴリが寄らず。JSON 配列: [{"question":"..."}]'
      userContent = '案件情報:\n' + JSON.stringify({ company, financials, files }, null, 2) + '\n\n既存QA:\n' + existingQuestions.map(q => '- ' + q).join('\n')
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-opus-4-7', max_tokens: 3000, system: systemPrompt, messages: [{ role: 'user', content: userContent }] }),
    })
    const aiResult = await response.json()
    const rawText = aiResult.content?.[0]?.text || '[]'
    const jsonMatch = rawText.match(/\[[\s\S]*\]/)
    let items = []
    try { items = jsonMatch ? JSON.parse(jsonMatch[0]) : [] } catch { items = [] }

    const nowIso = new Date().toISOString()
    let added = 0
    for (const it of items) {
      if (!it.question || typeof it.question !== 'string') continue
      const normalized = it.question.trim()
      if (existingQuestions.some(q => q.trim() === normalized)) continue
      const row = { deal_id, question: normalized, status: it.answer ? 'answered' : 'open', source: mode === 'extract' ? 'chat_extracted' : 'ai_suggested', asked_at: nowIso }
      if (it.answer) { row.answer = it.answer; row.answered_at = nowIso }
      await sb.from('cap_deal_qa').insert(row)
      existingQuestions.push(normalized)
      added++
    }
    return new Response(JSON.stringify({ success: true, added }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) { return err(400, e?.message || String(e)) }
})
