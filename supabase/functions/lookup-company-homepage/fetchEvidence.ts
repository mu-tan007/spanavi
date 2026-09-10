import { lookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { publicIpv4, publicUrl, visibleText } from './verifyHomepage.ts'

// Pin the validated DNS address to the socket lookup to prevent DNS rebinding.
// No redirects, cookies, credentials, IP literals, private networks or unbounded bodies.
export async function fetchEvidence(rawUrl: unknown, field: 'text' | 'title' = 'text'): Promise<string> {
  const url = publicUrl(rawUrl)
  if (!url) return ''
  const timeout = AbortSignal.timeout(8000)
  try {
    const records = await Promise.race([
      lookup(url.hostname, { family: 4, all: true }),
      new Promise<never>((_, reject) => timeout.addEventListener('abort', () => reject(new Error('timeout')), { once: true })),
    ])
    if (!records.length || records.some(r => !publicIpv4(r.address))) return ''
    const ip = records[0].address
    return await new Promise<string>((resolve) => {
      const request = url.protocol === 'https:' ? httpsRequest : httpRequest
      const req = request(url, {
        signal: timeout, agent: false,
        lookup: (_host: string, options: { all?: boolean }, callback: any) => options?.all ? callback(null, [{ address: ip, family: 4 }]) : callback(null, ip, 4),
        headers: { 'User-Agent': 'SpanaviCompanyInfoBot/1.0', Accept: 'text/html', 'Accept-Encoding': 'identity' },
      }, res => {
        if (res.statusCode !== 200 || !/text\/html|application\/xhtml/i.test(String(res.headers['content-type'] || ''))) { res.destroy(); resolve(''); return }
        let bytes = 0
        const chunks: Uint8Array[] = []
        res.on('data', (chunk: Uint8Array) => {
          bytes += chunk.length
          if (bytes > 262144) { res.destroy(); resolve(''); return }
          chunks.push(chunk)
        })
        res.on('end', () => {
          const all = new Uint8Array(bytes)
          let offset = 0
          for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length }
          const html = new TextDecoder().decode(all)
          resolve(visibleText(field === 'title' ? (html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') : html))
        })
        res.on('error', () => resolve(''))
      })
      req.on('error', () => resolve(''))
      req.end()
    })
  } catch { return '' }
}
