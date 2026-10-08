// ============================================================
// 社長の温度感を付ける（2026-10-09 むー様が断り方ごとに 高・中・低・除外 を決めた）
// ------------------------------------------------------------
// キーマン断り1件ごとに、AIは「断り方」（ceo_temp_reasons の一覧から複数）と根拠の発言だけを選ぶ。
// 温度感はこの一覧から機械的に決める：除外が1つでもあれば除外／それ以外は一番高いもの。
// （「結構です。ただ後継者は悩みどころ」→ 結構です＝低・後継者の悩み＝高 → 高）
// 材料は通話の書き起こし（あれば）か、これまでのAIの断りの要約。
// まだ付けていないキーマン断りを新しい順に limit 件ずつ（cron・合言葉、または手で回す）
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
const ORDER: Record<string, number> = { '低': 1, '中': 2, '高': 3 }

/** 断り方の一覧から温度感を決める（除外が最優先・それ以外は一番高いもの） */
export function levelOf(reasons: string[], master: Record<string, string>): string | null {
  const lv = reasons.map(r => master[r]).filter(v => v && v !== 'なし')
  if (lv.includes('除外')) return '除外'
  if (!lv.length) return null
  return lv.sort((a, b) => ORDER[b] - ORDER[a])[0]
}

/** 時期の言葉で「今のところ考えていない」を決め直す（AIが取り違えやすいため）
 *  ・時期を限る言葉（今のところ・今んとこ・今は・現時点・当面・しばらく）が無いのに選ばれていたら「全く・一切考えていない」に替える
 *  ・時期を限る言葉があるのに「興味ない」「全く・一切考えていない」だけなら「今のところ考えていない」を足す */
export function fixReasons(reasons: string[], quote: string): string[] {
  const NOW = /今のところ|今んとこ|今の所|今は|現時点|現状|当面|しばらく|今すぐ/
  const r = new Set(reasons)
  if (r.has('今のところ考えていない') && quote && !NOW.test(quote)) { r.delete('今のところ考えていない'); r.add('全く・一切考えていない') }
  if (!r.has('今のところ考えていない') && NOW.test(quote) && (r.has('興味ない') || r.has('全く・一切考えていない') || r.has('いらない・必要ない・間に合ってる'))) {
    r.add('今のところ考えていない'); r.delete('全く・一切考えていない')
  }
  return [...r]
}

type Rec = { id: string; text: string }
async function judge(recs: Rec[], labels: string[]) {
  const prompt = `M&Aの売り手探しの電話で、社長（キーマン）に断られた通話です。各通話について、社長の断り方を下の一覧から当てはまるものをすべて選び、根拠になった社長の発言を1つ抜き出してください。

断り方の一覧（この文言のまま選ぶ）：
${labels.map(l => `- ${l}`).join('\n')}

注意：
- 社長の発言だけで判断する。電話をかけた側（インターン）の言葉（「1分だけよろしいでしょうか」など）は使わない。
- 否定と肯定を取り違えない（「将来的にもない」は「将来的にもない」、「5年後なら考える」は「5年後・10年後なら考える」）。
- 「会議中・出張中など今は話せない状況」は、状況を伝えられた場合。「忙しいから」を断りの口実にした場合は「忙しいから結構（口実）」。
- 「今のところ考えていない」は「今は」「今のところ」「現時点では」など時期を限った言い方のときだけ。時期を言わずに「考えていない」「やらない」は「全く・一切考えていない」。
- 「どこの会社？・相手の名前は？」は、社長が相手に関心を持って聞いた場合だけ。聞いたうえで「会う必要はない」「これからもない」と断ったなら選ばず、「将来的にもない」などを選ぶ。
- 「社長ではない・相手違い」は、電話に出たのが社長でないとはっきり分かる場合だけ。分からなければ、相手の発言を社長の発言として扱う。
- 社長が話す前に切れたなど、社長の発言が何も無い場合は reasons を空にする。
- quote は社長の発言をそのまま短く（40字以内）。要約しか無い場合は要約の中の「」の発言を使い、無ければ空。
JSON だけを返す：[{"id":"...","reasons":["..."],"quote":"..."}]

${recs.map(r => `### id=${r.id}\n${r.text}`).join('\n\n')}`
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const out = (data.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')
  const m = out.match(/\[[\s\S]*\]/)
  try { return m ? JSON.parse(m[0]) as { id: string; reasons: string[]; quote: string }[] : [] } catch { return [] }
}

Deno.serve(async (req) => {
  // cron は合言葉（x-cron-token）で呼ぶ
  const t = req.headers.get('x-cron-token') || ''
  const { data: tok } = await sb.from('internal_cron_tokens').select('token').eq('name', 'judge-ceo-temp').maybeSingle()
  if (!tok?.token || t !== tok.token) return json({ error: 'forbidden' }, 403)
  const body = await req.json().catch(() => ({}))
  const limit = Math.min(Math.max(Number(body.limit) || 120, 1), 300)

  const { data: master } = await sb.from('ceo_temp_reasons').select('label, level')
  const M: Record<string, string> = Object.fromEntries((master || []).map(r => [r.label, r.level]))
  const labels = Object.keys(M)

  const { data: rows, error } = await sb.from('call_records')
    .select('id, transcript, rejection_reason')
    .eq('org_id', 'a0000000-0000-0000-0000-000000000001').eq('status', 'キーマン断り').is('ceo_temp_judged_at', null)
    .order('called_at', { ascending: false }).limit(limit)
  if (error) return json({ error: error.message }, 500)
  const recs: Rec[] = (rows || []).map(r => ({
    id: r.id,
    text: (r.transcript ? `書き起こし：${String(r.transcript).slice(0, 2500)}` : '') +
          (r.rejection_reason ? `\n断りの要約：${String(r.rejection_reason).replace(/^(HIGH|MEDIUM|LOW|SKIP)\s*/, '')}` : ''),
  }))
  // 材料が無い断り（書き起こしも要約も無い）は、付けずに印だけ付ける
  const empty = recs.filter(r => !r.text.trim())
  const todo = recs.filter(r => r.text.trim())
  const chunks: Rec[][] = []
  for (let i = 0; i < todo.length; i += 10) chunks.push(todo.slice(i, i + 10))
  let done = 0, failed = 0
  for (let i = 0; i < chunks.length; i += 6) {
    const outs = await Promise.all(chunks.slice(i, i + 6).map(c => judge(c, labels).catch(() => null)))
    for (let j = 0; j < outs.length; j++) {
      const out = outs[j]
      if (!out) { failed += chunks[i + j].length; continue }
      for (const o of out) {
        if (!o || !chunks[i + j].some(r => r.id === o.id)) continue
        const reasons = fixReasons((o.reasons || []).filter(r => M[r]), o.quote || '')
        const { error: e } = await sb.from('call_records').update({
          ceo_temp: levelOf(reasons, M), ceo_temp_reasons: reasons, ceo_temp_quote: (o.quote || '').slice(0, 80) || null,
          ceo_temp_judged_at: new Date().toISOString(),
        }).eq('id', o.id)
        if (e) failed++; else done++
      }
    }
  }
  for (const r of empty) await sb.from('call_records').update({ ceo_temp_judged_at: new Date().toISOString() }).eq('id', r.id)
  const { count } = await sb.from('call_records').select('id', { count: 'exact', head: true })
    .eq('org_id', 'a0000000-0000-0000-0000-000000000001').eq('status', 'キーマン断り').is('ceo_temp_judged_at', null)
  return json({ done, failed, empty: empty.length, remaining: count })
})
