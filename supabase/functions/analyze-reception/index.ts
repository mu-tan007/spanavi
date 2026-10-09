// 会社単位の受付対応の記録を作る（2026-10-07 むー様決定）。声紋は使わず、書き起こしの中身だけで判断する。
// 受付が出た架電（受付ブロック・受付再コール・キーマン不在）を、10分ごとに新しいものから処理する：
//   1) 書き起こしが無ければ transcribe-call-batch で作る
//   2) Claude Haiku で受付の対応を短く分類して call_records.reception に入れる
//      { outcome: blocked|return_time|connected|absent|unknown, return_hint, receptionist_name, tone: soft|neutral|curt, note,
//        callback: asked|promised|none }  … callback は 2026-10-10 追加（着信対応の「折り返しの約束」に使う）
// 書き起こしが作れない・短すぎる記録は { outcome: 'skip' } にして、二度と拾わない。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const STATUSES = ['受付ブロック', '受付再コール', 'キーマン不在']
const PER_RUN = 20

async function transcribe(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 10) {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/transcribe-call-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({ record_ids: ids.slice(i, i + 10) }),
    }).catch(() => null)
  }
}

async function classify(transcript: string, status: string): Promise<Record<string, unknown> | null> {
  const prompt = `営業電話の書き起こしです（[分:秒] 発言。話者の区別はない。こちら＝営業、相手＝電話に出た受付の人）。この電話で受付の人がどう対応したかを、JSONだけで返してください。
架電の記録上の結果：${status}

書き起こし：
${transcript.slice(0, 4000)}

返すJSON：
{"outcome":"blocked（取り次がずに断った）| return_time（社長の戻り時間や在席の目安を教えてくれた）| connected（社長に取り次いだ）| absent（不在とだけ言われた）| unknown",
 "return_hint":"戻り時間・在席の目安の言葉（無ければ空）",
 "receptionist_name":"受付の人が名乗った名字（無ければ空。会社名は入れない）",
 "tone":"soft（丁寧・協力的）| neutral | curt（ぶっきらぼう・警戒）",
 "note":"次にかける人へのひとこと（30字以内。事実だけ）",
 "callback":"asked（こちらが折り返しの電話を頼んだ・こちらの番号を伝えた）| promised（相手が「折り返させます」「折り返します」と言った）| none（折り返しの話は出ていない・こちらから改めると伝えただけ）"}
取り次ぎを断られた・用件を聞かれて断られた場合は blocked。unknown は書き起こしから判断できないときだけ使う。`
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 300, thinking: { type: 'disabled' }, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) { console.error('[analyze-reception] claude', res.status, (await res.text()).slice(0, 200)); return null }
  const data = await res.json()
  const text = (data.content || []).map((b: { text?: string }) => b.text || '').join('')
  const m = text.match(/\{[\s\S]*\}/)
  try { return m ? JSON.parse(m[0]) : null } catch { return null }
}

const OUTCOMES = new Set(['blocked', 'return_time', 'connected', 'absent', 'unknown'])
const TONES = new Set(['soft', 'neutral', 'curt'])
const CALLBACKS = new Set(['asked', 'promised', 'none'])

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}))
    const since = new Date(Date.now() - (Number(body?.days) || 3) * 86400000).toISOString()
    // record_ids を渡すと、読み取り済みでもその記録だけ読み直す（折り返しの項目を後から足すとき）
    const ids: string[] = Array.isArray(body?.record_ids) ? body.record_ids.slice(0, 50) : []
    const { data: rows, error } = ids.length
      ? await sb.from('call_records').select('id, status, transcript').in('id', ids)
      : await sb.from('call_records')
      .select('id, status, transcript')
      .is('reception', null).not('recording_url', 'is', null)
      .in('status', STATUSES).gte('called_at', since)
      // 録音が揃うまで少し待つ（架電から10分以上たったもの）
      .lte('called_at', new Date(Date.now() - 10 * 60000).toISOString())
      .order('called_at', { ascending: false }).limit(Number(body?.limit) || PER_RUN)
    if (error) return json({ error: error.message }, 500)
    const list = rows || []
    const need = list.filter(r => !r.transcript).map(r => r.id)
    if (need.length) await transcribe(need)
    const { data: fresh } = need.length
      ? await sb.from('call_records').select('id, transcript').in('id', need)
      : { data: [] }
    const tr = new Map<string, string | null>([...list.map(r => [r.id, r.transcript] as [string, string | null]), ...(fresh || []).map(r => [r.id, r.transcript] as [string, string | null])])

    let done = 0, skipped = 0
    for (const r of list) {
      const t = tr.get(r.id)
      if (!t || t === '（無音）' || t.length < 20) {
        await sb.from('call_records').update({ reception: { outcome: 'skip' } }).eq('id', r.id); skipped++; continue
      }
      const c = await classify(t, r.status)
      if (!c) continue // 次の回にもう一度
      const reception = {
        outcome: OUTCOMES.has(String(c.outcome)) ? String(c.outcome) : 'unknown',
        return_hint: String(c.return_hint || '').slice(0, 40),
        receptionist_name: String(c.receptionist_name || '').slice(0, 10),
        tone: TONES.has(String(c.tone)) ? String(c.tone) : 'neutral',
        note: String(c.note || '').slice(0, 40),
        callback: CALLBACKS.has(String(c.callback)) ? String(c.callback) : 'none',
      }
      await sb.from('call_records').update({ reception }).eq('id', r.id); done++
    }
    return json({ picked: list.length, done, skipped })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
