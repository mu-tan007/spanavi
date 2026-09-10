import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recShareUrl, resolveRecordingSource } from './recordingSource.ts'

let env: Record<string, string>
const request = vi.fn()
beforeEach(() => {
  env = { SUPABASE_URL: 'https://fixture.supabase.co', R2_ACCOUNT_ID: 'fixture',
    R2_ACCESS_KEY_ID: 'fixture-access', R2_SECRET_ACCESS_KEY: 'fixture-r2-secret',
    R2_BUCKET_RECORDINGS: 'fixture-recordings' }
  vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] } })
  vi.stubGlobal('fetch', request)
  request.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('deployed v49 storage compatibility', () => {
  it.each([true, false])('preserves dedicated-secret and existing fallback signatures (dedicated=%s)', async dedicated => {
    if (dedicated) env.REC_SHARE_SECRET = 'fixture-share-secret'
    const secret = dedicated ? env.REC_SHARE_SECRET : env.R2_SECRET_ACCESS_KEY
    const signature = createHmac('sha256', secret).update('rec-share:folder/call.mp4').digest('hex').slice(0, 32)
    expect(await recShareUrl('folder/call.mp4')).toBe(`https://fixture.supabase.co/functions/v1/rec/folder/call.mp4?s=${signature}`)
  })
  it('preserves R2 HEAD validation and a separately GET-signed download URL', async () => {
    request.mockResolvedValue(new Response(null, { status: 200 }))
    const storage = { from: vi.fn() }
    const resolved = await resolveRecordingSource({ storage }, 'https://fixture.supabase.co/storage/v1/object/public/recordings/call.mp4')
    expect(storage.from).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][1]).toEqual({ method: 'HEAD' })
    const head = new URL(request.mock.calls[0][0]), get = new URL(resolved)
    expect(get.pathname).toBe('/fixture-recordings/call.mp4')
    expect(get.searchParams.get('X-Amz-Expires')).toBe('600')
    expect(get.searchParams.get('X-Amz-Signature')).not.toBe(head.searchParams.get('X-Amz-Signature'))
  })
  it('preserves the existing Supabase fallback when R2 cannot resolve the recording', async () => {
    request.mockResolvedValue(new Response(null, { status: 404 }))
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://fallback.example/signed' } }))
    const from = vi.fn(() => ({ createSignedUrl }))
    const result = await resolveRecordingSource({ storage: { from } }, 'https://fixture.supabase.co/storage/v1/object/public/recordings/call.mp4')
    expect(from).toHaveBeenCalledWith('recordings')
    expect(createSignedUrl).toHaveBeenCalledWith('call.mp4', 600)
    expect(result).toBe('https://fallback.example/signed')
  })
})
