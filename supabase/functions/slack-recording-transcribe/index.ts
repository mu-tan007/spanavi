// Slack に上がった架電録音を文字起こしして slack_recording_transcripts に保存する（録音分析用）
// 入力: multipart/form-data { file, file_id, channel, file_name, posted_at, message_text }
//   ボットにチャンネル履歴の権限がないため、録音は手元に落としてからこの関数へ送る。
// service role だけ受ける（署名はゲートウェイの verify_jwt で検証済み）。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

function mmss(sec: number): string {
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

Deno.serve(async (req) => {
  if (jwtRole(req) !== 'service_role') return json({ error: 'forbidden' }, 403)
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    const fileId = String(fd.get('file_id') || '')
    if (!file || !fileId) return json({ error: 'file and file_id are required' }, 400)

    const { data: exists } = await supabase.from('slack_recording_transcripts').select('file_id').eq('file_id', fileId).maybeSingle()
    if (exists) return json({ id: fileId, ok: true, skipped: true })

    const form = new FormData()
    form.append('file', file, file.name)
    form.append('model', 'whisper-1')
    form.append('language', 'ja')
    form.append('response_format', 'verbose_json')
    form.append('timestamp_granularities[]', 'segment')
    const wr = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { 'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}` }, body: form,
    })
    if (!wr.ok) return json({ id: fileId, ok: false, error: `whisper ${wr.status}: ${(await wr.text()).slice(0, 200)}` })
    const w = await wr.json()
    // deno-lint-ignore no-explicit-any
    const transcript = (w.segments || []).map((s: any) => `[${mmss(s.start)}] ${String(s.text || '').trim()}`).join('\n') || w.text || ''
    const seconds = Math.round(w.duration || 0)
    const { error } = await supabase.from('slack_recording_transcripts').insert({
      file_id: fileId,
      channel: String(fd.get('channel') || ''),
      file_name: String(fd.get('file_name') || file.name),
      posted_at: fd.get('posted_at') ? String(fd.get('posted_at')) : null,
      message_text: fd.get('message_text') ? String(fd.get('message_text')) : null,
      transcript,
      seconds,
    })
    return json({ id: fileId, ok: !error, error: error?.message, seconds })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})

function jwtRole(req: Request): string {
  try {
    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer /, '')
    const p = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(p + '='.repeat((4 - p.length % 4) % 4))).role || ''
  } catch { return '' }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
