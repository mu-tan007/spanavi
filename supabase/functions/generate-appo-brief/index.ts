// 面談前の1枚資料とアポ取得報告の新しい形に使う「要点」を作る（2026-10-07 むー様決定）。
// company_dossiers.content.brief に入れる：
//   one_liner      ひとことで（80字まで）
//   temperature    温度感 1〜5 と言葉（クライアントにも見せる）
//   quotes         社長の言葉。**録音の書き起こしに文字どおりある部分だけ**を残す（AIの言い換えは捨てる）
//   questions      面談で聞くとよいこと
//   cautions       気をつけること
//   successor      後継者（あり・なし・未確認）
// アポ登録の直後は録音がまだ無いことが多いので、毎5分の定期実行で「録音が揃ったアポ」から順に作る。
// 録音が2時間たっても見つからないアポは、アポ報告のメモだけで作る（引用は「趣旨」扱い）。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const PER_RUN = 4

type Brief = {
  one_liner: string
  temperature: number
  temperature_label: string
  quotes: Array<{ text: string; context: string; source: 'transcript' | 'report' }>
  questions: string[]
  cautions: string[]
  requests: string[]
  successor: string
  generated_at: string
}

const norm = (s: string) => String(s || '').replace(/[\s　、。,.!！?？「」『』（）()…・ー〜~]/g, '')

async function transcriptFor(itemId: string, appoCreatedAt: string): Promise<{ transcript: string | null; hasRecording: boolean }> {
  // アポを取った通話＝登録の少し前の「アポ獲得」の記録
  const { data: rec } = await sb.from('call_records')
    .select('id, recording_url, transcript, called_at')
    .eq('item_id', itemId).eq('status', 'アポ獲得')
    .lte('called_at', new Date(new Date(appoCreatedAt).getTime() + 30 * 60 * 1000).toISOString())
    .order('called_at', { ascending: false }).limit(1).maybeSingle()
  if (!rec) return { transcript: null, hasRecording: false }
  if (rec.transcript) return { transcript: rec.transcript, hasRecording: true }
  if (!rec.recording_url) return { transcript: null, hasRecording: false }
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/transcribe-call-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify({ record_ids: [rec.id] }),
  })
  if (!res.ok) return { transcript: null, hasRecording: true }
  const { data: again } = await sb.from('call_records').select('transcript').eq('id', rec.id).maybeSingle()
  return { transcript: again?.transcript || null, hasRecording: true }
}

function prompt(input: { company: string; report: string; transcript: string | null; dossier: Record<string, unknown> }): string {
  return `あなたはM&A仲介会社向けの営業代行会社の担当者です。アポを取った電話の内容から、クライアント（M&A仲介会社）に渡す「面談前の要点」を作ります。
会社：${input.company}

# アポ取得報告（インターンが書いたもの）
${input.report.slice(0, 3000)}

# 電話の書き起こし（[分:秒] 発言。話者の区別はない。こちら＝インターン、相手＝社長）
${input.transcript ? input.transcript.slice(0, 8000) : '（なし）'}

# 会社の調べもの（HP等から）
${JSON.stringify({ business: input.dossier.business, strengths: input.dossier.strengths, history: input.dossier.history }).slice(0, 3000)}

# 作るもの（JSONだけを返す）
{"one_liner":"ひとことで。社長の状況とM&Aへの反応を80字以内で。事実だけ",
 "temperature":1〜5の整数（1=ほぼ興味なし 3=条件次第 5=積極的）,
 "temperature_label":"温度感を6字以内の言葉で（例：前向き・条件次第・様子見）",
 "quotes":[{"text":"社長の発言","context":"どんな質問への答えか（15字以内）"}],
 "cautions":["面談で気をつけること（0〜2個・各30字以内）"],
 "requests":["クライアント（M&A仲介会社）へのお願い。0〜3個・各60字以内。無ければ空の配列"],
 "successor":"あり・なし・未確認 のどれか"}

# 決まり
- quotes は${input.transcript ? '書き起こしにある社長の発言を**一字一句そのまま**抜き出す。言い換え・要約・つなぎ合わせは禁止。こちら（インターン）の発言は入れない。2〜3個' : 'アポ取得報告の『』の中の言葉だけを使う。無ければ空の配列'}
- requests は、社長から頼まれたこと（例：面談前に会社概要をメールで送ってほしい、来社時は電話してほしい、同席者がいる、駐車場の案内）と、面談の段取りのイレギュラー（例：日程が仮決め、代表以外が対応、時間が短い）だけ。クライアントへのお願いの文（「〜をお願いいたします」「〜とのことです」）で書く。オンライン面談のURLの送付は別で書くので入れない。無ければ空の配列
- 書き起こしやメモに無いことは書かない。推測で埋めない
- 「弊社」「当社」などの主語は使わない。敬語は不要。体言止めでよい`
}

async function callClaude(text: string): Promise<Record<string, unknown> | null> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', thinking: { type: 'between_tools' }, max_tokens: 1500, messages: [{ role: 'user', content: text }] }),
  })
  if (!res.ok) { console.error('[generate-appo-brief] claude', res.status, (await res.text()).slice(0, 300)); return null }
  const data = await res.json()
  const out = (data.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')
  const m = out.match(/\{[\s\S]*\}/)
  try { return m ? JSON.parse(m[0]) : null } catch { return null }
}

async function buildOne(appointmentId: string, force = false): Promise<{ id: string; status: string }> {
  const { data: appo } = await sb.from('appointments').select('id, item_id, company_name, appo_report, created_at').eq('id', appointmentId).maybeSingle()
  if (!appo) return { id: appointmentId, status: 'no_appointment' }
  const { data: dos } = await sb.from('company_dossiers').select('id, content').eq('appointment_id', appointmentId).maybeSingle()
  if (!dos) return { id: appointmentId, status: 'no_dossier' }
  const content = (dos.content || {}) as Record<string, unknown>
  if (content.brief && !force) return { id: appointmentId, status: 'exists' }

  const { transcript, hasRecording } = appo.item_id ? await transcriptFor(appo.item_id, appo.created_at) : { transcript: null, hasRecording: false }
  const ageMin = (Date.now() - new Date(appo.created_at).getTime()) / 60000
  // 録音がまだ見つからないうちは待つ（2時間たったらメモだけで作る）
  if (!transcript && !force && ageMin < 120) return { id: appointmentId, status: hasRecording ? 'waiting_transcript' : 'waiting_recording' }

  const raw = await callClaude(prompt({ company: appo.company_name, report: appo.appo_report || '', transcript, dossier: content }))
  if (!raw) return { id: appointmentId, status: 'ai_failed' }

  // 引用は書き起こしに文字どおりあるものだけ残す
  const tNorm = norm(transcript || '')
  const reportNorm = norm(appo.appo_report || '')
  const quotes = (Array.isArray(raw.quotes) ? raw.quotes : []).map((q: { text?: string; context?: string }) => ({ text: String(q?.text || '').trim(), context: String(q?.context || '').trim() }))
    .filter((q: { text: string }) => q.text.length >= 3)
    .map((q: { text: string; context: string }) => transcript
      ? (tNorm.includes(norm(q.text)) ? { ...q, source: 'transcript' as const } : null)
      : (reportNorm.includes(norm(q.text)) ? { ...q, source: 'report' as const } : null))
    .filter(Boolean)
    .slice(0, 3)

  const t = Math.max(1, Math.min(5, Math.round(Number(raw.temperature) || 3)))
  const brief: Brief = {
    one_liner: String(raw.one_liner || '').slice(0, 120),
    temperature: t,
    temperature_label: String(raw.temperature_label || '').slice(0, 10),
    quotes: quotes as Brief['quotes'],
    // 「面談で聞くとよいこと」は作らない（2026-10-08 むー様：クライアントに釈迦に説法）
    questions: [],
    cautions: (Array.isArray(raw.cautions) ? raw.cautions : []).map(String).slice(0, 2),
    requests: (Array.isArray(raw.requests) ? raw.requests : []).map(String).filter(s => s.trim()).slice(0, 3),
    successor: ['あり', 'なし', '未確認'].includes(String(raw.successor)) ? String(raw.successor) : '未確認',
    generated_at: new Date().toISOString(),
  }
  // 読み直してから書く（ドシエの作り直しと重ならないように content を丸ごと上書きしない）
  const { data: latest } = await sb.from('company_dossiers').select('content').eq('id', dos.id).maybeSingle()
  const { error } = await sb.from('company_dossiers').update({ content: { ...((latest?.content || {}) as Record<string, unknown>), brief } }).eq('id', dos.id)
  if (error) return { id: appointmentId, status: 'save_failed: ' + error.message }
  return { id: appointmentId, status: transcript ? 'done' : 'done_from_report' }
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}))
    if (body?.appointment_id) return json({ results: [await buildOne(body.appointment_id, !!body.force)] })
    // 定期実行：直近3日に登録され、ドシエはできているが要点がまだのアポ
    const since = new Date(Date.now() - 3 * 86400000).toISOString()
    const { data: rows } = await sb.from('company_dossiers')
      .select('appointment_id, content, created_at')
      .gte('created_at', since).in('generation_status', ['succeeded', 'partial'])
      .is('content->brief', null)
      .order('created_at').limit(20)
    const results = []
    for (const r of (rows || []).slice(0, PER_RUN)) results.push(await buildOne(r.appointment_id))
    return json({ results })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
