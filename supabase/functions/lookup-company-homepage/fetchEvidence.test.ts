import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }))
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }))
vi.mock('./pinnedHttp.ts', () => ({ pinnedHttp: mocks.request }))
import { fetchEvidence, fetchEvidenceResult } from './fetchEvidence.ts'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
})
function response(status: number, chunks: string[], contentType = 'text/html', location?: string) {
  mocks.request.mockResolvedValue({ status, headers: { 'content-type': contentType, location }, body: new TextEncoder().encode(chunks.join('')) })
}
describe('bounded DNS-pinned evidence fetch', () => {
  it('passes only the validated IP to the socket transport', async () => {
    response(200, ['<h1>株式会社白石工務店</h1><p>愛媛県新居浜市</p>'])
    expect(await fetchEvidence('https://siraisi-koumuten.jp/company/')).toContain('愛媛県')
    expect(mocks.request.mock.calls[0][1]).toBe('93.184.216.34')
    expect(mocks.request.mock.calls[0][0].hostname).toBe('siraisi-koumuten.jp')
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
  it('retains root text and title from one HTTP request for evidence fallback', async () => {
    response(200, ['<title>株式会社白石工務店</title><p>愛媛県新居浜市</p>'])
    const result = await fetchEvidenceResult('https://company.co.jp/')
    expect(result.title).toBe('株式会社白石工務店')
    expect(result.text).toContain('愛媛県新居浜市')
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })
  it('does not follow redirects without a location', async () => { response(302, []); expect(await fetchEvidence('https://company.co.jp/')).toBe(''); expect(mocks.request).toHaveBeenCalledTimes(1) })
  it('follows HTTP to HTTPS canonical redirects with a newly pinned DNS lookup', async () => {
    response(301, [], 'text/html', 'https://company.co.jp/')
    mocks.request.mockImplementationOnce(mocks.request.getMockImplementation()!)
    response(200, ['<title>株式会社白石工務店</title>'])
    expect(await fetchEvidence('http://company.co.jp/', 'title')).toBe('株式会社白石工務店')
    expect(mocks.lookup).toHaveBeenCalledTimes(2)
    expect(mocks.request.mock.calls[0][2]).toBe(mocks.request.mock.calls[1][2])
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
  it('rejects transport body-limit errors', async () => { mocks.request.mockRejectedValue(Object.assign(new Error('body too big'), { code: 'HTTP_BODY_LIMIT' })); expect(await fetchEvidence('https://company.co.jp/')).toBe('') })
  it('rejects non-HTML', async () => { response(200, [], 'application/json'); expect(await fetchEvidence('https://company.co.jp/')).toBe('') })
  it('fails closed on DNS failure', async () => { mocks.lookup.mockRejectedValue(new Error('no DNS')); expect(await fetchEvidence('https://company.co.jp/')).toBe('') })
  it('fails closed on transport failure', async () => {
    mocks.request.mockRejectedValue(new Error('timeout'))
    expect(await fetchEvidence('https://company.co.jp/')).toBe('')
  })
})
