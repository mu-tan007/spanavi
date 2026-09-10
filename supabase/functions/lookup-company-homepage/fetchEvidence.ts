import { lookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { publicIpv4, publicUrl, visibleText } from './verifyHomepage.ts'

// Pin the validated DNS address to the socket lookup to prevent DNS rebinding.
// Canonical same-host redirects only; no cookies, credentials, IP literals or private networks.
export async function fetchEvidenceResult(rawUrl: unknown, field: 'text' | 'title' = 'text', context?: { timeout: AbortSignal; host: string; hop: number }): Promise<{ text: string; status: string }> {
  const fail = (status: string) => ({ text: '', status })
  const errorCode = (error: any) => /^[A-Z_0-9]{1,40}$/.test(String(error?.code)) ? error.code : 'error'
  const url = publicUrl(rawUrl)
  if (!url) return fail('invalid_url')
  const timeout = context?.timeout || AbortSignal.timeout(8000)
  const host = context?.host || url.hostname.replace(/^www\./, '')
  const hop = context?.hop || 0
  let phase = 'dns'
  try {
    const records = await Promise.race([
      lookup(url.hostname, { family: 4, all: true }),
      new Promise<never>((_, reject) => {
        if (timeout.aborted) reject(new Error('timeout'))
        else timeout.addEventListener('abort', () => reject(new Error('timeout')), { once: true })
      }),
    ])
    if (!records.length || records.some(r => !publicIpv4(r.address))) return fail('nonpublic_dns')
    const ip = records[0].address
    phase = 'http'
    return await new Promise<{ text: string; status: string }>((resolve) => {
      const request = url.protocol === 'https:' ? httpsRequest : httpRequest
      const req = request(url, {
        signal: timeout, agent: false,
        lookup: (_host: string, options: { all?: boolean }, callback: any) => options?.all ? callback(null, [{ address: ip, family: 4 }]) : callback(null, ip, 4),
        headers: { 'User-Agent': 'SpanaviCompanyInfoBot/1.0', Accept: 'text/html', 'Accept-Encoding': 'identity' },
      }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
          res.destroy()
          let next: URL | null
          try { next = publicUrl(new URL(res.headers.location, url).href) } catch { next = null }
          if (!next || next.hostname.replace(/^www\./, '') !== host || (url.protocol === 'https:' && next.protocol !== 'https:')) { resolve(fail('unsafe_redirect')); return }
          if (hop >= 2) { resolve(fail('redirect_limit')); return }
          fetchEvidenceResult(next.href, field, { timeout, host, hop: hop + 1 }).then(resolve)
          return
        }
        if (res.statusCode !== 200) { res.destroy(); resolve(fail(`http_${res.statusCode}`)); return }
        if (!/text\/html|application\/xhtml/i.test(String(res.headers['content-type'] || ''))) { res.destroy(); resolve(fail('non_html')); return }
        let bytes = 0
        const chunks: Uint8Array[] = []
        res.on('data', (chunk: Uint8Array) => {
          bytes += chunk.length
          if (bytes > 262144) { res.destroy(); resolve(fail('body_limit')); return }
          chunks.push(chunk)
        })
        res.on('end', () => {
          const all = new Uint8Array(bytes)
          let offset = 0
          for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length }
          const html = new TextDecoder().decode(all)
          const text = visibleText(field === 'title' ? (html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') : html)
          resolve({ text, status: text ? 'ok' : `empty_${field}` })
        })
        res.on('error', error => resolve(fail(`body_${errorCode(error)}`)))
      })
      req.on('error', error => resolve(fail(timeout.aborted ? 'timeout_http' : `transport_${errorCode(error)}`)))
      req.end()
    })
  } catch (error) { return fail(timeout.aborted ? `timeout_${phase}` : `${phase}_${errorCode(error)}`) }
}

export async function fetchEvidence(rawUrl: unknown, field: 'text' | 'title' = 'text'): Promise<string> {
  return (await fetchEvidenceResult(rawUrl, field)).text
}
