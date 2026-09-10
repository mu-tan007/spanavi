import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveRecordingSource: vi.fn(), r2PutFromBuffer: vi.fn(), recShareUrl: vi.fn(),
  createClient: vi.fn(() => ({})),
}))
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: mocks.createClient }))
vi.mock('../_shared/recordingSource.ts', () => mocks)

const audio = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253])
const zoomUrl = 'https://api.zoom.us/v2/phone/recording-fixture.mp4'
const r2Url = 'https://recordings.example.jp/rec/fixture'
const sourceUrl = 'https://private-source.example.jp/signed-fixture'
const transcript = '担当者：来週またご連絡ください。'
let env: Record<string, string>
let handler: (req: Request) => Promise<Response>
let requests: { url: string; init?: RequestInit }[]
let tokenResult: unknown
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const payload = { item_id: 'fixture-item', personality: '穏やか', meetingExp: '未経験', futureConsider: '検討中', other: '折り返し希望' }
const invoke = (recording_url: string) => handler(new Request('https://edge.example.jp/transcribe-recording', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, recording_url }) }))

beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (key: string) => env?.[key] }, serve: (fn: typeof handler) => { handler = fn } })
  await import('./index.ts')
})
beforeEach(() => {
  vi.clearAllMocks()
  env = { SUPABASE_URL: 'https://db.example.jp', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', OPENAI_API_KEY: 'fixture-openai', ANTHROPIC_API_KEY: 'fixture-anthropic', ZOOM_ACCOUNT_ID: 'fixture-account', ZOOM_CLIENT_ID: 'fixture-client', ZOOM_CLIENT_SECRET: 'fixture-secret' }
  requests = []
  tokenResult = { access_token: 'fixture-zoom-token' }
  mocks.resolveRecordingSource.mockResolvedValue(sourceUrl)
  mocks.r2PutFromBuffer.mockResolvedValue({ ok: true })
  mocks.recShareUrl.mockResolvedValue('https://recordings.example.jp/rec/saved-fixture')
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    requests.push({ url, init })
    if (url.startsWith('https://zoom.us/oauth/token?')) return response(tokenResult)
    if (url === zoomUrl || url === sourceUrl) return new Response(audio.slice(), { status: 200 })
    if (url === 'https://api.openai.com/v1/audio/transcriptions') return response({ text: transcript })
    if (url === 'https://api.anthropic.com/v1/messages') return response({ content: [{ type: 'text', text: JSON.stringify({ personality: '丁寧', meetingExp: '未経験', futureConsider: '来週相談', other: '折り返し', keyman_ma_intent: 'wait', appo_pattern: 'standard', talk_style_tags: ['確認'], talk_strength: '丁寧な確認' }) }] })
    throw new Error(`Unexpected external request: ${url}`)
  }))
})
afterAll(() => vi.unstubAllGlobals())

async function aiRequests() {
  const whisper = requests.find(r => r.url.includes('/audio/transcriptions'))!
  const form = whisper.init!.body as FormData
  const file = form.get('file') as File
  const claude = requests.find(r => r.url === 'https://api.anthropic.com/v1/messages')!
  return { audio: [...new Uint8Array(await file.arrayBuffer())], filename: file.name, filetype: file.type, whisperModel: form.get('model'), language: form.get('language'), whisperMethod: whisper.init!.method, whisperHeaders: whisper.init!.headers, claude: { ...claude.init, body: JSON.parse(String(claude.init!.body)) } }
}

describe('real transcribe-recording handler with fixture transports', () => {
  it('processes non-Zoom audio without Zoom credentials or OAuth and keeps recording/AI content', async () => {
    delete env.ZOOM_ACCOUNT_ID; delete env.ZOOM_CLIENT_ID; delete env.ZOOM_CLIENT_SECRET
    const result = await invoke(r2Url)
    expect(result.status).toBe(200)
    expect(requests.some(r => r.url.startsWith('https://zoom.us/oauth/'))).toBe(false)
    expect(mocks.resolveRecordingSource).toHaveBeenCalledWith(expect.anything(), r2Url)
    expect(requests.find(r => r.url === sourceUrl)?.init).toBeUndefined()
    expect([...new Uint8Array(mocks.r2PutFromBuffer.mock.calls[0][1])]).toEqual([...audio])
    expect(mocks.r2PutFromBuffer.mock.calls[0][2]).toBe('audio/mp4')
    const sent = await aiRequests()
    expect(sent).toMatchObject({ audio: [...audio], filename: 'recording.mp4', filetype: 'audio/mp4', whisperModel: 'whisper-1', language: 'ja', claude: { body: { model: 'claude-haiku-4-5-20251001', max_tokens: 2560 } } })
    expect(sent.claude.body.messages[0].content).toContain(transcript)
    expect(await result.json()).toMatchObject({ transcript, personality: '丁寧', keyman_ma_intent: 'wait', publicRecordingUrl: 'https://recordings.example.jp/rec/saved-fixture' })
  })
  it('keeps the same AI requests and result for identical Zoom audio, with unchanged OAuth and bearer download', async () => {
    const r2Response = await invoke(r2Url)
    const r2Ai = await aiRequests()
    requests = []
    const result = await invoke(zoomUrl)
    expect(result.status).toBe(200)
    const oauth = requests.filter(r => r.url.startsWith('https://zoom.us/oauth/'))
    expect(oauth).toEqual([{ url: 'https://zoom.us/oauth/token?grant_type=account_credentials&account_id=fixture-account', init: { method: 'POST', headers: { Authorization: 'Basic ' + btoa('fixture-client:fixture-secret'), 'Content-Type': 'application/x-www-form-urlencoded' } } }])
    expect(requests.find(r => r.url === zoomUrl)?.init).toEqual({ headers: { Authorization: 'Bearer fixture-zoom-token' } })
    expect(await aiRequests()).toEqual(r2Ai)
    expect(await result.json()).toEqual(await r2Response.json())
    expect(mocks.resolveRecordingSource).toHaveBeenCalledTimes(1)
  })
  it('preserves Zoom missing-credential errors before network work', async () => {
    delete env.ZOOM_CLIENT_SECRET
    const result = await invoke(zoomUrl)
    expect(result.status).toBe(500)
    expect(await result.json()).toEqual({ error: 'Zoom credentials not configured' })
    expect(requests).toEqual([])
  })
  it('preserves Zoom token-response errors and stops before audio or AI', async () => {
    tokenResult = { error: 'fixture failure' }
    const result = await invoke(zoomUrl)
    expect(result.status).toBe(500)
    expect(await result.json()).toEqual({ error: 'Failed to obtain Zoom access token' })
    expect(requests).toHaveLength(1)
    expect(mocks.r2PutFromBuffer).not.toHaveBeenCalled()
  })
})
