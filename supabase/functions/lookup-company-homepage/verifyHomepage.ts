export type Identity = { company_name: string; address?: string; phone?: string; representative?: string; prefecture?: string }
export type Candidate = { url?: unknown; confidence?: unknown; evidence_url?: unknown; company_name?: unknown; address?: unknown; phone?: unknown; representative?: unknown }
const text = (v: unknown) => typeof v === 'string' ? v.normalize('NFKC').trim() : ''
const compact = (v: unknown) => text(v).replace(/[\s\u3000]/g, '').toLowerCase()
const company = (v: unknown) => compact(v).replace(/\(株\)/g, '株式会社').replace(/\(有\)/g, '有限会社')
const address = (v: unknown) => compact(v).replace(/〒?\d{3}-?\d{4}/g, '').replace(/[‐‑–—−ー]/g, '-').replace(/(丁目|番地|番|号)/g, '-').replace(/-+$/g, '')
const phone = (v: unknown) => text(v).replace(/\D/g, '').replace(/^81(?=\d{9,10}$)/, '0')
export const hasIdentifier = (i: Identity) => strongAddress(i.address) || /^0\d{9,10}$/.test(phone(i.phone))
function strongAddress(value: unknown) { const a = address(value); return /[市区町村]/.test(a) && /\d/.test(a) && a.length >= 8 }
export function publicUrl(value: unknown): URL | null {
  try {
    const u = new URL(text(value))
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port || u.hash) return null
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(u.hostname)) return null
    if (/(^|\.)(localhost|local|internal|test|invalid|example)$/.test(u.hostname)) return null
    if (/(^|\.)(facebook\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com|youtube\.com|indeed\.com|google\.com|google\.co\.jp|wikipedia\.org)$/.test(u.hostname)) return null
    return u
  } catch { return null }
}
export function publicIpv4(ip: string): boolean {
  const n = ip.split('.').map(Number)
  if (n.length !== 4 || n.some(v => !Number.isInteger(v) || v < 0 || v > 255)) return false
  const [a, b, c] = n
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113))
}
export function visibleText(html: string): string {
  const cleaned = html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
  const stack: { tag: string; hidden: boolean }[] = []
  const parts: string[] = []
  for (const token of cleaned.matchAll(/<\/?([a-z][a-z0-9:-]*)\b[^>]*>|([^<]+)/gi)) {
    if (token[2]) { if (!stack.some(s => s.hidden)) parts.push(token[2]); continue }
    const tag = token[1].toLowerCase()
    if (token[0].startsWith('</')) {
      const index = stack.map(s => s.tag).lastIndexOf(tag)
      if (index >= 0) stack.splice(index)
    } else if (!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag) && !token[0].endsWith('/>')) {
      stack.push({ tag, hidden: /\shidden(?:\s|=|>)|aria-hidden\s*=\s*["']?true|display\s*:\s*none|visibility\s*:\s*hidden/i.test(token[0]) })
    }
  }
  return parts.join(' ').replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => { const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n); return code <= 0x10ffff ? String.fromCodePoint(code) : '' }).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}
const rejected = (reason: string) => ({ url: null, confidence: 'low' as const, verified: false, reason })
export function verifyHomepage(input: Identity, candidate: Candidate, pageText: string, originTitle = '') {
  const url = publicUrl(candidate.url), evidence = publicUrl(candidate.evidence_url)
  if (!hasIdentifier(input)) return rejected('会社を識別できる住所または電話番号がありません')
  if (!url || !evidence || url.hostname.replace(/^www\./, '') !== evidence.hostname.replace(/^www\./, '')) return rejected('公式サイトと同じドメインの根拠が確認できません')
  if (candidate.confidence !== 'high') return rejected('同名企業を確実に識別できませんでした')
  // Check the origin homepage title, not a directory/listing's target-specific page title.
  const title = compact(originTitle), legalName = compact(input.company_name)
  const titleIndex = title.indexOf(legalName)
  const afterName = title.slice(titleIndex + legalName.length)
  if (titleIndex < 0 || (afterName && !/^[|｜/／・:：\-–—～~「『（(【]/.test(afterName))) return rejected('サイト運営企業をトップページで確認できません')
  if (/企業検索|企業一覧|法人検索|法人一覧|求人検索|電話帳|企業情報データベース/.test(title)) return rejected('第三者の企業掲載サイトのため採用できません')
  if (!company(input.company_name) || company(input.company_name) !== company(candidate.company_name)) return rejected('会社名が一致しません')
  const body = compact(pageText)
  // Facts must occur on the independently retrieved page, not merely in model JSON.
  for (const key of ['company_name', 'address', 'phone', 'representative'] as const) {
    const fact = compact(candidate[key])
    if (compact(input[key]) && !fact) return rejected('入力された企業情報を公式サイト本文で確認できません')
    if (fact && !body.includes(fact)) return rejected('検索結果の根拠を公式サイト本文で確認できません')
  }
  const ia = address(input.address), ca = address(candidate.address)
  const ip = phone(input.phone), cp = phone(candidate.phone)
  const ir = compact(input.representative), cr = compact(candidate.representative)
  // Deliberately exact: branch offices, relocations and partial matches need human review.
  if (ia && ca && ia !== ca) return rejected('住所が一致しません')
  if (ip && cp && ip !== cp) return rejected('電話番号が一致しません')
  if (ir && cr && ir !== cr) return rejected('代表者が一致しません')
  const addressMatch = strongAddress(input.address) && ia === ca
  const phoneMatch = /^0\d{9,10}$/.test(ip) && ip === cp
  if (!addressMatch && !phoneMatch) return rejected('住所または電話番号の一致を確認できません')
  return { url: url.href, confidence: 'high' as const, verified: true, reason: `公式サイト本文で会社名と${addressMatch ? '住所' : '電話番号'}の一致を確認` }
}
