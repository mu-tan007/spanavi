// ============================================================
// 社長名を国の法人情報（gBizINFO）で確かめる（2026-10-08 むー様）
// ------------------------------------------------------------
// 架電ページで会社を開いた時、180日以内に確かめていなければ、法人番号で gBizINFO を引く（無料）。
// 代表者名がリストと違えば representative_current に入れ、架電ページに「現在の代表：〇〇様」と出す。
// 社長が退任していたのに古い名前で呼ぶと、新規の営業だと悟られるため。
// gBizINFO の利用の鍵（GBIZINFO_TOKEN）が無いあいだは何もしない。
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const norm = (s: string) => String(s || '').replace(/(代表取締役|取締役|代表社員|代表理事|理事長|社長|代表者?)/g, '').replace(/[\s　]/g, '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const u = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: who } = await u.auth.getUser()
    if (!who?.user) return json({ error: 'ログインが切れています' }, 401)
    const token = Deno.env.get('GBIZINFO_TOKEN')?.trim()
    if (!token) return json({ skipped: 'gBizINFOの利用の鍵がまだです' })

    const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { item_id } = await req.json().catch(() => ({}))
    const { data: item } = await sb.from('call_list_items')
      .select('id, corporate_number, representative, representative_checked_at, representative_current').eq('id', item_id || '').maybeSingle()
    if (!item) return json({ error: '会社が見つかりません' }, 404)
    const fresh = item.representative_checked_at && Date.now() - new Date(item.representative_checked_at).getTime() < 180 * 86400000
    if (fresh) return json({ current: item.representative_current || null, cached: true })
    const corp = String(item.corporate_number || '').replace(/\D/g, '')
    if (corp.length !== 13) return json({ skipped: '法人番号がありません' })

    const res = await fetch(`https://api.info.gbiz.go.jp/hojin/v2/hojin/${corp}`, { headers: { 'X-hojinInfo-api-token': token, Accept: 'application/json' } })
    if (!res.ok) return json({ error: `gBizINFO ${res.status}` }, 502)
    const data = await res.json()
    const info = (data['hojin-infos'] || [])[0] || {}
    const rep = String(info.representative_name || '').trim()
    // リストの名前と違うときだけ「現在の代表」として持つ（同じなら空）
    const current = rep && norm(rep) !== norm(item.representative) ? rep : null
    await sb.from('call_list_items').update({
      representative_checked_at: new Date().toISOString(), representative_source: rep ? 'gbizinfo' : 'gbizinfo_none', representative_current: current,
    }).eq('id', item.id)
    return json({ current, found: !!rep })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
