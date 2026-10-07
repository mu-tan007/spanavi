// 架電録音の文字起こしを call_records.transcript に保存する（分析用の一括処理）
// 入力: { record_ids: string[] }（1回につき最大10件・service role で呼ぶ）
// 既に transcript がある記録は飛ばす。発話ごとに「[分:秒] 本文」の行で保存し、通話秒数も残す。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveRecordingSource } from '../_shared/recordingSource.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const MAX_IDS = 10

let zoomToken = ''
async function getZoomToken(): Promise<string> {
  if (zoomToken) return zoomToken
  const accountId = Deno.env.get('ZOOM_ACCOUNT_ID')
  const clientId = Deno.env.get('ZOOM_CLIENT_ID')
  const secret = Deno.env.get('ZOOM_CLIENT_SECRET')
  if (!accountId || !clientId || !secret) throw new Error('Zoom credentials not configured')
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`, {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + btoa(`${clientId}:${secret}`), 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  const td = await res.json()
  if (!td.access_token) throw new Error('Failed to obtain Zoom token')
  zoomToken = td.access_token
  return zoomToken
}

function mmss(sec: number): string {
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

async function transcribeOne(id: string): Promise<{ id: string; ok: boolean; seconds?: number; error?: string }> {
  const { data, error } = await supabase.from('call_records').select('recording_url, transcript').eq('id', id).single()
  if (error || !data) return { id, ok: false, error: error?.message || 'not found' }
  if (data.transcript) return { id, ok: true, seconds: 0 }
  if (!data.recording_url) return { id, ok: false, error: 'no recording_url' }

  const isZoom = /zoom\.us/i.test(data.recording_url)
  const audioRes = isZoom
    ? await fetch(data.recording_url, { headers: { 'Authorization': `Bearer ${await getZoomToken()}` } })
    : await fetch(await resolveRecordingSource(supabase, data.recording_url))
  if (!audioRes.ok) return { id, ok: false, error: `download ${audioRes.status}` }
  const audio = new Blob([await audioRes.arrayBuffer()], { type: 'audio/mp4' })

  const form = new FormData()
  form.append('file', audio, 'recording.mp4')
  form.append('model', 'whisper-1')
  form.append('language', 'ja')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'segment')
  const wr = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
    body: form,
  })
  if (!wr.ok) return { id, ok: false, error: `whisper ${wr.status}: ${(await wr.text()).slice(0, 200)}` }
  const w = await wr.json()
  // deno-lint-ignore no-explicit-any
  const lines = (w.segments || []).map((s: any) => `[${mmss(s.start)}] ${String(s.text || '').trim()}`).filter((l: string) => !/\]\s*$/.test(l))
  const transcript = lines.length ? lines.join('\n') : (w.text || '')
  const seconds = Math.round(w.duration || 0)
  const { error: upErr } = await supabase.from('call_records')
    .update({ transcript: transcript || '（無音）', transcript_seconds: seconds }).eq('id', id)
  if (upErr) return { id, ok: false, error: upErr.message }
  return { id, ok: true, seconds }
}

Deno.serve(async (req) => {
  // 費用のかかる処理なので service role だけ受ける（署名はゲートウェイの verify_jwt で検証済み）
  // 他の関数から呼ぶときは SUPABASE_SERVICE_ROLE_KEY をそのまま付けてくる。新しい形式の鍵は JWT ではないので、
  // 中身の role ではなく鍵そのものの一致でも通す（generate-appo-brief がアポの通話を書き起こすため・2026-10-07）
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer /, '')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (jwtRole(req) !== 'service_role' && !(serviceKey && bearer === serviceKey)) return json({ error: 'forbidden' }, 403)
  try {
    const { record_ids } = await req.json()
    if (!Array.isArray(record_ids) || record_ids.length === 0) return json({ error: 'record_ids is required' }, 400)
    const ids = record_ids.slice(0, MAX_IDS)
    const results = await Promise.all(ids.map((id: string) => transcribeOne(id).catch((e) => ({ id, ok: false, error: String(e) }))))
    return json({ results })
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
