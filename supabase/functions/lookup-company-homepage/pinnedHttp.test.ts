import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseHttpPage, pinnedHttp } from './pinnedHttp.ts'
const bytes = (text: string) => new TextEncoder().encode(text)
const read = (wire: string) => parseHttpPage(bytes(wire))
afterEach(() => vi.unstubAllGlobals())
describe('bounded HTTP/1.1 parser', () => {
  it('reads a complete Content-Length response', () => {
    const result = read('HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 5\r\n\r\nhello')
    expect(result.status).toBe(200); expect(new TextDecoder().decode(result.body)).toBe('hello')
  })
  it('decodes chunked bodies including extensions and terminated trailers', () => {
    const result = read('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2;foo=bar\r\nhe\r\n3\r\nllo\r\n0\r\nX-Trace: yes\r\n\r\n')
    expect(new TextDecoder().decode(result.body)).toBe('hello')
  })
  it.each([
    'HTTP/1.1 200 OK\r\nContent-Length: 8\r\n\r\nshort',
    'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\nx',
    'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n',
    'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n0\r\nX-Trailer: unfinished\r\n',
    'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\nextra',
    'HTTP/1.1 200 OK\r\nContent-Length: 1\r\nContent-Length: 2\r\n\r\nx',
    'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Length: 0\r\n\r\n0\r\n\r\n',
    'HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\n\r\ncompressed',
  ])('rejects incomplete or ambiguous framing', wire => expect(() => read(wire)).toThrow())
  it('rejects large headers and bodies before trusting text', () => {
    expect(() => read('HTTP/1.1 200 OK\r\nX: ' + 'a'.repeat(16384) + '\r\n\r\n')).toThrow()
    expect(() => read('HTTP/1.1 200 OK\r\nContent-Length: 262145\r\n\r\n')).toThrow()
    expect(() => read('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n40001\r\n')).toThrow()
  })
})
describe('Deno pinned TCP/TLS transport', () => {
  it('connects only to the checked IP and verifies TLS against the original hostname', async () => {
    const response = bytes('HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok')
    let offset = 0
    const close = vi.fn(), sent: string[] = []
    const conn = { close, write: vi.fn(async (chunk: Uint8Array) => { sent.push(new TextDecoder().decode(chunk)); return chunk.length }), read: vi.fn(async (buffer: Uint8Array) => { if (offset === response.length) return null; const count = Math.min(7, response.length - offset); buffer.set(response.subarray(offset, offset + count)); offset += count; return count }) }
    const connect = vi.fn(async () => conn), startTls = vi.fn(async () => conn)
    vi.stubGlobal('Deno', { connect, startTls })
    const result = await pinnedHttp(new URL('https://company.co.jp/profile/?a=1'), '93.184.216.34', new AbortController().signal)
    expect(result.status).toBe(200)
    expect(connect).toHaveBeenCalledWith({ hostname: '93.184.216.34', port: 443 })
    expect(startTls).toHaveBeenCalledWith(conn, { hostname: 'company.co.jp', alpnProtocols: ['http/1.1'] })
    expect(sent.join('')).toContain('Host: company.co.jp\r\n')
    expect(close).toHaveBeenCalled()
  })
  it('closes a connection that finishes opening after the deadline', async () => {
    const controller = new AbortController(), close = vi.fn()
    let open!: (value: unknown) => void
    vi.stubGlobal('Deno', { connect: vi.fn(() => new Promise(resolve => { open = resolve })), startTls: vi.fn() })
    const pending = pinnedHttp(new URL('https://company.co.jp/'), '93.184.216.34', controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow('timeout')
    open({ close })
    await Promise.resolve(); await Promise.resolve()
    expect(close).toHaveBeenCalled()
  })
})
