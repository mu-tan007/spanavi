// ============================================================
// 社長の名前のふりがなを AI で推定する（2026-10-08 むー様）
// ------------------------------------------------------------
// インターンが社長の苗字を読み間違えたり、「社長お願いします」だけで受付に怪しまれたりするのを防ぐため、
// 架電ページの社長名の上に小さくふりがなを出す。読みは推定なので「推定」と出し、電話で確かめたら直せる。
// mode 'batch'（cron・合言葉）：アーカイブしていないリストの、ふりがなの無い会社をまとめて推定する（1回に最大3,000社）
// 同じ名前は1回だけ推定して使い回す。インターンが直した読み（confirmed）は上書きしない。
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

/** 「代表取締役 山田 太郎」などから氏名だけを取り出す */
export function cleanName(raw: string): string {
  return String(raw || '')
    .replace(/(代表取締役|取締役|代表社員|代表理事|理事長|会長|社長|代表者?|CEO|院長|所長|組合長|学長|校長)/g, ' ')
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .replace(/[・,，、\/／]/g, ' ')
    .replace(/[\s　]+/g, ' ').trim()
}

async function readings(names: string[]): Promise<Record<string, string>> {
  const prompt = `次の日本人の氏名の読みを、ひらがなで答えてください。姓と名の間は半角スペース1つ。
いちばん一般的な読みを1つだけ。読めないもの・氏名でないものは空文字。
JSON だけを返す：{"氏名": "よみ", ...}

${names.map(n => `- ${n}`).join('\n')}`
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const out = (data.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')
  const m = out.match(/\{[\s\S]*\}/)
  try { return m ? JSON.parse(m[0]) : {} } catch { return {} }
}

async function batch(limit: number) {
  // ふりがなの無い会社（アーカイブしていないリストだけ）
  // 弊社の組織のリストだけ（デモ用の組織は除く）
  const { data: lists } = await sb.from('call_lists').select('id').eq('org_id', 'a0000000-0000-0000-0000-000000000001').or('is_archived.is.null,is_archived.eq.false')
  const listIds = (lists || []).map(l => l.id)
  const rows: { id: string; representative: string }[] = []
  for (let i = 0; i < listIds.length && rows.length < limit; i += 50) {
    const { data } = await sb.from('call_list_items').select('id, representative')
      .in('list_id', listIds.slice(i, i + 50)).is('representative_kana', null).not('representative', 'is', null)
      .limit(limit - rows.length)
    rows.push(...(data || []).filter(r => cleanName(r.representative)))
  }
  if (!rows.length) return { done: 0, remaining: 0 }
  const byName = new Map<string, string[]>()
  for (const r of rows) {
    const n = cleanName(r.representative)
    byName.set(n, [...(byName.get(n) || []), r.id])
  }
  // すでに別の会社で付いている同じ名前の読みを先に使う（確かめた読みを優先）
  const names = [...byName.keys()]
  const known: Record<string, string> = {}
  for (let i = 0; i < names.length; i += 200) {
    const { data } = await sb.from('call_list_items').select('representative, representative_kana, representative_kana_source')
      .in('representative', names.slice(i, i + 200)).not('representative_kana', 'is', null).limit(1000)
    for (const d of data || []) {
      const n = cleanName(d.representative)
      if (!known[n] || d.representative_kana_source === 'confirmed') known[n] = d.representative_kana
    }
  }
  const todo = names.filter(n => !known[n])
  // 100件ずつを5本同時に聞く（1回の実行が時間切れにならないように）
  const chunks: string[][] = []
  for (let i = 0; i < todo.length; i += 100) chunks.push(todo.slice(i, i + 100))
  for (let i = 0; i < chunks.length; i += 5) {
    const outs = await Promise.all(chunks.slice(i, i + 5).map(c => readings(c).catch(() => ({}))))
    for (const o of outs) Object.assign(known, o)
  }
  let done = 0
  for (const [n, ids] of byName) {
    const kana = String(known[n] || '').trim()
    // 読めなかった名前は「-」を入れて、二度と推定しない（空のままだと毎回 AI に聞いてしまう）
    const { error } = await sb.from('call_list_items').update({ representative_kana: kana || '-', representative_kana_source: kana ? 'ai' : 'none' }).in('id', ids)
    if (!error) done += ids.length
  }
  return { done, names: names.length, asked_ai: todo.length }
}

Deno.serve(async (req) => {
  try {
    const t = req.headers.get('x-cron-token') || ''
    const { data: tok } = await sb.from('internal_cron_tokens').select('token').eq('name', 'name-kana').maybeSingle()
    if (!tok?.token || t !== tok.token) return json({ error: 'forbidden' }, 403)
    const body = await req.json().catch(() => ({}))
    return json(await batch(Math.min(Number(body.limit) || 3000, 5000)))
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
