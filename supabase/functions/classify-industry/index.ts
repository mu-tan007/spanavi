// ============================================================
// 業種が決まらなかった会社を AI で判定する（2026-10-09 むー様）
// ------------------------------------------------------------
// 企業DB（東京商工リサーチ）と照らせず、事業内容の文の規則でも決まらなかった会社（約5%）に、
// 上の段の業種（実務の業種）を付ける。迷ったものは「迷う」とその理由を残し、むー様に相談する。
// まだ決まっていない会社を limit 件ずつ（合言葉で呼ぶ）
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

type Row = { id: string; company: string | null; business: string | null; list_ind: string | null }
async function ask(rows: Row[], groups: string[]) {
  const prompt = `会社の業種を、下の一覧から1つ選んでください。社名・事業内容・リストの業種名から判断します。

業種の一覧（この文言のまま選ぶ）：
${groups.join('／')}

注意：
- 事業内容がいちばん確か。社名だけで推すときは、社名に業種がはっきり出ている場合だけ（例：「〇〇建設」「〇〇運輸」）。
- 当てはまるものが無い、または2つ以上で決めきれない場合は group を "迷う" にし、note に「AとBで迷う」「情報が足りない」など短い理由を書く。
JSON だけを返す：[{"id":"...","group":"...","note":""}]

${rows.map(r => `- id=${r.id}｜社名：${r.company || ''}｜事業内容：${(r.business || '').slice(0, 120)}｜リストの業種：${r.list_ind || ''}`).join('\n')}`
  let res: Response | null = null
  for (let t = 0; t < 3; t++) {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 6000, messages: [{ role: 'user', content: prompt }] }),
    })
    if (res.ok || ![429, 500, 502, 503, 529].includes(res.status)) break
    await new Promise(r => setTimeout(r, 2000 * (t + 1) + Math.random() * 1000))
  }
  if (!res || !res.ok) throw new Error(`AI ${res?.status}`)
  const data = await res.json()
  const out = (data.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')
  const m = out.match(/\[[\s\S]*\]/)
  try { return m ? JSON.parse(m[0]) as { id: string; group: string; note: string }[] : [] } catch { return [] }
}

Deno.serve(async (req) => {
  const t = req.headers.get('x-cron-token') || ''
  const { data: tok } = await sb.from('internal_cron_tokens').select('token').eq('name', 'classify-industry').maybeSingle()
  if (!tok?.token || t !== tok.token) return json({ error: 'forbidden' }, 403)
  const body = await req.json().catch(() => ({}))
  const limit = Math.min(Math.max(Number(body.limit) || 400, 1), 800)

  const { data: gm } = await sb.from('industry_group_map').select('grp')
  const groups = [...new Set((gm || []).map(g => g.grp))].sort()
  const { data: rows0, error } = await sb.rpc('industry_ai_todo', { p_limit: limit })
  if (error) return json({ error: error.message }, 500)
  const rows = (rows0 || []) as Row[]
  const chunks: Row[][] = []
  for (let i = 0; i < rows.length; i += 25) chunks.push(rows.slice(i, i + 25))
  let done = 0, unsure = 0, failed = 0
  for (let i = 0; i < chunks.length; i += 4) {
    const outs = await Promise.all(chunks.slice(i, i + 4).map(c => ask(c, groups).catch(() => null)))
    for (let j = 0; j < outs.length; j++) {
      const out = outs[j]
      if (!out) { failed += chunks[i + j].length; continue }
      for (const o of out) {
        if (!o || !chunks[i + j].some(r => r.id === o.id)) continue
        const ok = groups.includes(o.group)
        const { error: e } = await sb.from('call_list_items').update({
          industry_group: ok ? o.group : null, industry_source: ok ? 'ai' : 'ai_unsure',
          industry_ai_note: ok ? null : (o.note || '迷う').slice(0, 120),
        }).eq('id', o.id)
        if (e) failed++; else if (ok) done++; else unsure++
      }
    }
  }
  const { data: left } = await sb.rpc('industry_ai_todo_count')
  return json({ done, unsure, failed, remaining: left })
})
