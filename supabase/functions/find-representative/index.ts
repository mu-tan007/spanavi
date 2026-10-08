// ============================================================
// 「社長名を調べる」：受付で社長が退任済みと言われた時だけ、インターンが押す（2026-10-08 むー様）
// ------------------------------------------------------------
// 会社HP（リストのHP → 無ければ lookup-company-homepage で探す）から、extract-company-from-url で代表者名を抜く。
// リストの名前と違えば representative_current に入れ、架電ページの社長名の上に「現在の代表」を出す。ふりがなも付け直す。
// 押した時だけ AI を使うので、費用は小さい（直近120日の「退任」は約200件）。
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const norm = (s: string) => String(s || '').replace(/(代表取締役|取締役|代表社員|代表理事|理事長|社長|代表者?)/g, '').replace(/[\s　]/g, '')

async function call(name: string, body: unknown) {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify(body),
  })
  return await res.json().catch(() => ({}))
}

async function kanaOf(name: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 100, messages: [{ role: 'user', content: `次の日本人の氏名の読みを、ひらがなだけで答えてください（姓と名の間は半角スペース）。他の言葉は書かない。\n${name}` }] }),
  })
  if (!res.ok) return ''
  const d = await res.json()
  return String((d.content || []).map((b: { text?: string }) => b.text || '').join('')).trim().split('\n')[0].replace(/[^ぁ-んー\s]/g, '').trim()
}

/** HPが確かめられない時の予備：AIにウェブ検索で今の代表者名を調べさせる（出どころのURLも返す） */
async function searchRep(company: string, address: string): Promise<{ name: string; source: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1500,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [{ role: 'user', content: `「${company}」（所在地：${address || '不明'}）の、現在の代表者（代表取締役など）の氏名を、ウェブで調べてください。
同じ名前の別の会社と取り違えないよう、所在地が合うものだけを使う。会社HP・官公庁・信頼できる企業データベースを優先し、いちばん新しい情報を使う。
分からなければ name を空にする。最後に JSON だけを返す：{"name":"氏名（役職は付けない）","source":"出どころのURL"}` }],
    }),
  })
  if (!res.ok) return { name: '', source: '' }
  const d = await res.json()
  const text = (d.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')
  const m = text.match(/\{[^{}]*"name"[^{}]*\}/)
  try { const j = JSON.parse(m ? m[0] : '{}'); return { name: String(j.name || '').trim(), source: String(j.source || '') } } catch { return { name: '', source: '' } }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const u = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: who } = await u.auth.getUser()
    if (!who?.user) return json({ error: 'ログインが切れています' }, 401)
    const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { item_id, background } = await req.json().catch(() => ({}))
    const { data: item } = await sb.from('call_list_items')
      .select('id, company, address, phone, url, representative, corporate_number').eq('id', item_id || '').maybeSingle()
    if (!item) return json({ error: '会社が見つかりません' }, 404)

    // 押した直後に次の会社へ移っても、画面を閉じても、裏で最後まで調べて保存する（2026-10-08 むー様：スピード重視）
    const work = async () => {
      let hp = String(item.url || '').trim()
      if (!/^https?:\/\//.test(hp)) {
        const found = await call('lookup-company-homepage', { company_name: item.company, address: item.address, phone: item.phone, representative: item.representative })
        hp = found?.url && (found.verified || found.confidence === 'high') ? found.url : ''
      }
      let rep = ''
      let source = 'hp'
      if (hp) {
        const ex = await call('extract-company-from-url', { url: hp })
        rep = String(ex?.raw?.representative || '').trim()
      }
      if (!rep) {
        // HPが見つからない・HPに名前が無い時は、ウェブ検索で調べる
        // ウェブ検索は結果が振れるので、見つからなければもう1回だけ聞く
        let s2 = await searchRep(item.company, item.address)
        if (!s2.name) s2 = await searchRep(item.company, item.address)
        rep = s2.name; source = 'web'; if (s2.source) hp = s2.source
      }
      if (!rep) {
        await sb.from('call_list_items').update({ representative_checked_at: new Date().toISOString(), representative_source: 'hp_no_name' }).eq('id', item.id)
        return { current: null, reason: '会社HPとウェブ検索で、社長名が見つかりませんでした', hp }
      }
      const changed = norm(rep) !== norm(item.representative)
      const patch: Record<string, unknown> = {
        representative_checked_at: new Date().toISOString(), representative_source: source, representative_current: changed ? rep : null,
      }
      if (changed) {
        // 新しい社長名のふりがなに付け直す（架電ページは「現在の代表」の読みとして出す）
        const k = await kanaOf(rep)
        if (k) { patch.representative_kana = k; patch.representative_kana_source = 'ai' }
      }
      await sb.from('call_list_items').update(patch).eq('id', item.id)
      // 同じ法人番号の会社（別のリスト）にも入れる
      const corp = String(item.corporate_number || '').replace(/\D/g, '')
      if (changed && corp.length === 13) await sb.from('call_list_items').update(patch).eq('corporate_number', item.corporate_number)
      return { current: changed ? rep : null, same: !changed, rep, kana: patch.representative_kana || null, hp }
    }
    if (background) {
      // deno-lint-ignore no-explicit-any
      ;(globalThis as any).EdgeRuntime?.waitUntil(work().catch((e: Error) => console.error('[find-representative]', e.message)))
      return json({ accepted: true })
    }
    return json(await work())
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
