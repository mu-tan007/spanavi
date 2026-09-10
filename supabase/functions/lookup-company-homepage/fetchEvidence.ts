import { lookup } from 'node:dns/promises'
import { pinnedHttp } from './pinnedHttp.ts'
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
    const page = await pinnedHttp(url, ip, timeout)
    if ([301, 302, 303, 307, 308].includes(page.status) && page.headers.location) {
      let next: URL | null
      try { next = publicUrl(new URL(page.headers.location, url).href) } catch { next = null }
      if (!next || next.hostname.replace(/^www\./, '') !== host || (url.protocol === 'https:' && next.protocol !== 'https:')) return fail('unsafe_redirect')
      if (hop >= 2) return fail('redirect_limit')
      return await fetchEvidenceResult(next.href, field, { timeout, host, hop: hop + 1 })
    }
    if (page.status !== 200) return fail(`http_${page.status}`)
    if (!/text\/html|application\/xhtml/i.test(page.headers['content-type'] || '')) return fail('non_html')
    const html = new TextDecoder().decode(page.body)
    const text = visibleText(field === 'title' ? (html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') : html)
    return { text, status: text ? 'ok' : `empty_${field}` }
  } catch (error) { return fail(timeout.aborted ? `timeout_${phase}` : `${phase}_${errorCode(error)}`) }
}

export async function fetchEvidence(rawUrl: unknown, field: 'text' | 'title' = 'text'): Promise<string> {
  return (await fetchEvidenceResult(rawUrl, field)).text
}

