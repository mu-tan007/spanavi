const HEADER_LIMIT = 16384
const BODY_LIMIT = 262144
const WIRE_LIMIT = HEADER_LIMIT + BODY_LIMIT + 32768
export type HttpPage = { status: number; headers: Record<string, string>; body: Uint8Array }
function fault(code: string): never { throw Object.assign(new Error(code), { code }) }
const ascii = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes)
function crlf(bytes: Uint8Array, start: number): number {
  for (let i = start; i + 1 < bytes.length; i++) if (bytes[i] === 13 && bytes[i + 1] === 10) return i
  return -1
}

// Strict, bounded HTTP/1.1 framing. We request identity encoding and Connection: close.
export function parseHttpPage(wire: Uint8Array): HttpPage {
  let boundary = -1
  for (let i = 0; i + 3 < Math.min(wire.length, HEADER_LIMIT + 4); i++) {
    if (wire[i] === 13 && wire[i + 1] === 10 && wire[i + 2] === 13 && wire[i + 3] === 10) { boundary = i; break }
  }
  if (boundary < 0 || boundary > HEADER_LIMIT) fault('HTTP_HEADERS')
  const lines = ascii(wire.subarray(0, boundary)).split('\r\n')
  const status = /^HTTP\/1\.[01] ([1-5]\d\d)(?: |$)/.exec(lines.shift() || '')
  if (!status) fault('HTTP_STATUS')
  const headers: Record<string, string> = {}
  for (const line of lines) {
    const match = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[ \t]*(.*)$/.exec(line)
    if (!match) fault('HTTP_HEADERS')
    const key = match[1].toLowerCase()
    if (headers[key] && ['content-length', 'transfer-encoding', 'content-encoding', 'content-type', 'location'].includes(key)) fault('HTTP_AMBIGUOUS')
    headers[key] = match[2].trim()
  }
  if (headers['content-encoding'] && headers['content-encoding'].toLowerCase() !== 'identity') fault('HTTP_ENCODING')
  let body = wire.subarray(boundary + 4)
  const transfer = headers['transfer-encoding']?.toLowerCase()
  if (transfer) {
    if (transfer !== 'chunked' || headers['content-length']) fault('HTTP_AMBIGUOUS')
    let offset = 0, length = 0
    const chunks: Uint8Array[] = []
    while (true) {
      const end = crlf(body, offset)
      if (end < 0 || end - offset > 1024) fault('HTTP_CHUNK')
      const sizeText = ascii(body.subarray(offset, end)).split(';')[0]
      if (!/^[0-9a-f]{1,8}$/i.test(sizeText)) fault('HTTP_CHUNK')
      const size = parseInt(sizeText, 16)
      offset = end + 2
      if (size === 0) {
        const trailerStart = offset
        while (true) {
          const trailerEnd = crlf(body, offset)
          if (trailerEnd < 0 || trailerEnd - trailerStart > HEADER_LIMIT) fault('HTTP_TRUNCATED')
          const trailer = ascii(body.subarray(offset, trailerEnd))
          offset = trailerEnd + 2
          if (!trailer) break
          if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+:[ \t]*[^\r\n]*$/.test(trailer)) fault('HTTP_HEADERS')
        }
        if (offset !== body.length) fault('HTTP_AMBIGUOUS')
        break
      }
      length += size
      if (length > BODY_LIMIT) fault('HTTP_BODY_LIMIT')
      if (offset + size + 2 > body.length || body[offset + size] !== 13 || body[offset + size + 1] !== 10) fault('HTTP_TRUNCATED')
      chunks.push(body.subarray(offset, offset + size)); offset += size + 2
    }
    body = new Uint8Array(length)
    let cursor = 0
    for (const chunk of chunks) { body.set(chunk, cursor); cursor += chunk.length }
  } else if (headers['content-length']) {
    if (!/^\d+$/.test(headers['content-length'])) fault('HTTP_LENGTH')
    const length = Number(headers['content-length'])
    if (length > BODY_LIMIT) fault('HTTP_BODY_LIMIT')
    if (length !== body.length) fault('HTTP_TRUNCATED')
  }
  if (body.length > BODY_LIMIT) fault('HTTP_BODY_LIMIT')
  return { status: Number(status[1]), headers, body }
}

export async function pinnedHttp(url: URL, ip: string, signal: AbortSignal): Promise<HttpPage> {
  let connection: Deno.Conn | null = null
  let done = false
  const close = () => { try { connection?.close() } catch { /* already closed */ } }
  let onAbort: () => void = () => {}
  const stopped = new Promise<never>((_, reject) => {
    onAbort = () => { close(); reject(Object.assign(new Error('timeout'), { code: 'HTTP_TIMEOUT' })) }
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  })
  const run = async () => {
    if (signal.aborted) fault('HTTP_TIMEOUT')
    // Connect to the checked literal IP. startTls's hostname controls SNI/certificate
    // verification on this existing connection and cannot trigger another DNS lookup.
    const tcp = await Deno.connect({ hostname: ip, port: url.protocol === 'https:' ? 443 : 80 })
    connection = tcp
    if (done || signal.aborted) { close(); fault('HTTP_TIMEOUT') }
    if (url.protocol === 'https:') connection = await Deno.startTls(tcp, { hostname: url.hostname, alpnProtocols: ['http/1.1'] })
    if (done || signal.aborted) { close(); fault('HTTP_TIMEOUT') }
    const request = new TextEncoder().encode(`GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.hostname}\r\nUser-Agent: SpanaviCompanyInfoBot/1.0\r\nAccept: text/html\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`)
    let written = 0
    while (written < request.length) {
      const count = await connection.write(request.subarray(written))
      if (!count) fault('HTTP_WRITE')
      written += count
    }
    const wire = new Uint8Array(WIRE_LIMIT + 1)
    let length = 0
    while (true) {
      const count = await connection.read(wire.subarray(length))
      if (count === null) break
      length += count
      if (length > WIRE_LIMIT) fault('HTTP_BODY_LIMIT')
    }
    return parseHttpPage(wire.subarray(0, length))
  }
  try { return await Promise.race([run(), stopped]) }
  finally { done = true; close(); signal.removeEventListener('abort', onAbort) }
}
