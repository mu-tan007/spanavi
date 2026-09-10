import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }))
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }))
vi.mock('node:http', () => ({ request: mocks.request }))
vi.mock('node:https', () => ({ request: mocks.request }))
import { fetchEvidence, fetchEvidenceResult } from './fetchEvidence.ts'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
})
function response(status: number, chunks: string[], contentType = 'text/html', location?: string) {
  mocks.request.mockImplementation((_url, _options, callback) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void }
    req.end = () => {
      const res = Object.assign(new EventEmitter(), { statusCode: status, headers: { 'content-type': contentType, location }, destroy: vi.fn() })
      callback(res)
      if (status === 200 && contentType === 'text/html') { for (const chunk of chunks) res.emit('data', new TextEncoder().encode(chunk)); res.emit('end') }
    }
    return req
  })
}
describe('bounded DNS-pinned evidence fetch', () => {
  it('pins the checked IP for both Node DNS callback conventions', async () => {
    response(200, ['<h1>株式会社白石工務店</h1><p>愛媛県新居浜市</p>'])
    expect(await fetchEvidence('https://siraisi-koumuten.jp/company/')).toContain('愛媛県')
    const options = mocks.request.mock.calls[0][1]
    const callback = vi.fn()
    options.lookup('siraisi-koumuten.jp', {}, callback)
    expect(callback).toHaveBeenLastCalledWith(null, '93.184.216.34', 4)
    options.lookup('siraisi-koumuten.jp', { all: true }, callback)
    expect(callback).toHaveBeenLastCalledWith(null, [{ address: '93.184.216.34', family: 4 }])
    expect(options.agent).toBe(false)
  })
  it('never connects to a private DNS address', async () => {
    mocks.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    expect(await fetchEvidence('https://company.co.jp/')).toBe('')
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('extracts the actual homepage title separately from listings in its body', async () => {
    response(200, ['<html><head><title>企業検索一覧</title></head><body>株式会社白石工務店</body></html>'])
    expect(await fetchEvidence('https://directory.co.jp/', 'title')).toBe('企業検索一覧')
  })
  it('does not follow redirects without a location', async () => { response(302, []); expect(await fetchEvidence('https://company.co.jp/')).toBe(''); expect(mocks.request).toHaveBeenCalledTimes(1) })
  it('follows HTTP to HTTPS canonical redirects with a newly pinned DNS lookup', async () => {
    response(301, [], 'text/html', 'https://company.co.jp/')
    mocks.request.mockImplementationOnce(mocks.request.getMockImplementation()!)
    response(200, ['<title>株式会社白石工務店</title>'])
    expect(await fetchEvidence('http://company.co.jp/', 'title')).toBe('株式会社白石工務店')
    expect(mocks.lookup).toHaveBeenCalledTimes(2)
    expect(mocks.request.mock.calls[0][1].signal).toBe(mocks.request.mock.calls[1][1].signal)
  })
  it.each(['https://other-company.co.jp/', 'http://company.co.jp/', 'http://127.0.0.1/'])('rejects unsafe redirect %s', async target => {
    response(302, [], 'text/html', target)
    expect(await fetchEvidenceResult('https://company.co.jp/')).toEqual({ text: '', status: 'unsafe_redirect' })
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })
  it('bounds canonical redirect chains', async () => {
    response(302, [], 'text/html', '/again/')
    expect(await fetchEvidenceResult('https://company.co.jp/')).toEqual({ text: '', status: 'redirect_limit' })
    expect(mocks.request).toHaveBeenCalledTimes(3)
  })
  it('returns a useful non-sensitive DNS failure category', async () => {
    mocks.lookup.mockRejectedValue(Object.assign(new Error('internal DNS details'), { code: 'ENOTFOUND' }))
    expect(await fetchEvidenceResult('https://company.co.jp/')).toEqual({ text: '', status: 'dns_ENOTFOUND' })
  })
  it('rejects oversized bodies', async () => { response(200, ['x'.repeat(262145)]); expect(await fetchEvidence('https://company.co.jp/')).toBe('') })
  it('rejects non-HTML', async () => { response(200, [], 'application/json'); expect(await fetchEvidence('https://company.co.jp/')).toBe('') })
  it('fails closed on DNS failure', async () => { mocks.lookup.mockRejectedValue(new Error('no DNS')); expect(await fetchEvidence('https://company.co.jp/')).toBe('') })
  it('fails closed on transport failure', async () => {
    mocks.request.mockImplementation(() => { const req = Object.assign(new EventEmitter(), { end() { this.emit('error', new Error('timeout')) } }); return req })
    expect(await fetchEvidence('https://company.co.jp/')).toBe('')
  })
})
