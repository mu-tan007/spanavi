import { describe, expect, it } from 'vitest'
import { companyLinkFromHtml, hasIdentifier, publicIpv4, publicUrl, verifyHomepage as checkHomepage, verifyHomepagePages, visibleText } from './verifyHomepage.ts'

const tokyo = { company_name: '株式会社白石工務店', address: '東京都昭島市東町４-１４-８', phone: '0425446525', representative: '白石　悟' }
const valid = { url: 'https://shiraishi.example.co.jp/', confidence: 'high', evidence_url: 'https://shiraishi.example.co.jp/company/', ...tokyo }
const verifyHomepage = (input: Parameters<typeof checkHomepage>[0], candidate: Parameters<typeof checkHomepage>[1], page: string, title = tokyo.company_name) => checkHomepage(input, candidate, page, title)
const body = (c: typeof valid) => `会社概要 会社名 ${c.company_name} 所在地 ${c.address} TEL ${c.phone} 代表者 ${c.representative}`

describe('official homepage identity verification', () => {
  it('uses fetched root evidence after a missing profile page, with every check intact', () => {
    expect(verifyHomepagePages(tokyo, valid, '', body(valid), tokyo.company_name).verified).toBe(true)
  })
  it('uses actual root evidence if the model omits the evidence URL', () => {
    expect(verifyHomepagePages(tokyo, { ...valid, evidence_url: '' }, '', body(valid), tokyo.company_name).verified).toBe(true)
  })
  it('does not assemble identity fragments across different pages', () => {
    expect(verifyHomepagePages(tokyo, valid, `${tokyo.company_name} ${tokyo.address}`, `${tokyo.company_name} ${tokyo.phone} ${tokyo.representative}`, tokyo.company_name).verified).toBe(false)
  })
  it('does not weaken ownership, identifier conflicts, or evidence-domain checks on fallback', () => {
    for (const change of [{ representative: '別人' }, { address: '愛媛県新居浜市黒島一丁目3番29号' }, { evidence_url: 'https://directory.co.jp/' }]) {
      expect(verifyHomepagePages(tokyo, { ...valid, ...change }, '', body(valid), tokyo.company_name).verified).toBe(false)
    }
    expect(verifyHomepagePages(tokyo, valid, '', body(valid), '第三者企業一覧').verified).toBe(false)
  })
  it('rejects the incident: Tokyo company versus the same-name Ehime company', () => {
    const wrong = { ...valid, company_name: '株式会社 白石工務店', url: 'https://siraisi-koumuten.jp/', evidence_url: 'https://siraisi-koumuten.jp/company/', address: '愛媛県新居浜市黒島一丁目3番29号', phone: '0897-46-2275', representative: '白石 誠一' }
    expect(verifyHomepage(tokyo, wrong, body(wrong))).toMatchObject({ url: null, verified: false })
  })
  it('accepts independently supported company + full address + phone', () => {
    expect(verifyHomepage(tokyo, valid, body(valid))).toMatchObject({ verified: true, confidence: 'high', url: valid.url })
  })
  it('accepts company + phone when address is unavailable', () => {
    expect(verifyHomepage({ company_name: tokyo.company_name, phone: tokyo.phone }, { ...valid, address: '', representative: '' }, body(valid)).verified).toBe(true)
  })
  it('accepts width, space and street separator normalization', () => {
    expect(verifyHomepage({ ...tokyo, address: '東京都昭島市東町4丁目14番8号', phone: '042-544-6525' }, valid, body(valid)).verified).toBe(true)
  })
  it('rejects a matching name or prefecture without a distinct identifier', () => {
    for (const input of [{ company_name: tokyo.company_name }, { company_name: tokyo.company_name, address: '東京都' }, { company_name: tokyo.company_name, representative: tokyo.representative }]) {
      expect(hasIdentifier(input)).toBe(false)
      expect(verifyHomepage(input, valid, body(valid)).url).toBeNull()
    }
  })
  it.each(['low', 'medium', undefined])('independently verifies facts regardless of AI confidence %s', confidence => {
    expect(verifyHomepage(tokyo, { ...valid, confidence }, body(valid))).toMatchObject({ verified: true, confidence: 'high' })
    expect(verifyHomepage(tokyo, { ...valid, confidence }, '会社名だけ 株式会社白石工務店').verified).toBe(false)
  })
  it.each(['address', 'phone', 'representative', 'company_name'] as const)('rejects explicit %s conflict even with another matching identifier', key => {
    const changed = { ...valid, [key]: key === 'phone' ? '089-978-0409' : '別会社の情報' }
    expect(verifyHomepage(tokyo, changed, body(changed)).verified).toBe(false)
  })
  it('rejects fabricated matching model fields absent from actual page', () => {
    expect(verifyHomepage(tokyo, valid, '株式会社白石工務店 愛媛県松山市 TEL 089-978-0409').verified).toBe(false)
  })
  it('rejects empty evidence and a third-party evidence domain', () => {
    expect(verifyHomepage(tokyo, valid, '').verified).toBe(false)
    expect(verifyHomepage(tokyo, { ...valid, evidence_url: 'https://directory.co.jp/company/' }, body(valid)).verified).toBe(false)
  })
  it('rejects directory and vendor partner listings despite matching facts', () => {
    for (const title of ['企業検索ディレクトリ', '株式会社別の会社']) {
      expect(verifyHomepage(tokyo, { ...valid, url: 'https://directory.co.jp/listing/', evidence_url: 'https://directory.co.jp/listing/' }, body(valid), title).verified).toBe(false)
    }
  })
  it('rejects a same-name substring in a different company title', () => {
    expect(verifyHomepage(tokyo, valid, body(valid), '株式会社白石工務店サービス').verified).toBe(false)
  })
  it('rejects missing homepage title', () => {
    expect(checkHomepage(tokyo, valid, body(valid)).verified).toBe(false)
  })
  it.each(['address', 'phone', 'representative'] as const)('AI omission of %s still requires the actual input fact on the page', key => {
    expect(verifyHomepage(tokyo, { ...valid, [key]: '' }, body(valid)).verified).toBe(true)
    expect(verifyHomepage(tokyo, { ...valid, [key]: '' }, body({ ...valid, [key]: '異なる情報' })).verified).toBe(false)
  })
  it('requires all supplied input facts even if the AI returns only a candidate URL', () => {
    const candidate = { url: valid.url, evidence_url: valid.evidence_url }
    expect(verifyHomepage(tokyo, candidate, body(valid)).verified).toBe(true)
    expect(verifyHomepage(tokyo, candidate, body({ ...valid, representative: '別人' })).verified).toBe(false)
  })
  it('normalizes phone punctuation and address-unit numerals without changing identity', () => {
    const input = { ...tokyo, address: '東京都昭島市東町4-14-8', phone: '0425446525' }
    const actual = { ...valid, address: '東京都昭島市東町四丁目十四番八号', phone: '042-544-6525' }
    expect(verifyHomepage(input, { url: valid.url, evidence_url: valid.evidence_url }, body(actual)).verified).toBe(true)
  })
  it('does not accept a phone prefix, concatenate numbers across labels, or accept a street-number prefix', () => {
    for (const actual of [{ ...valid, phone: '04254465250' }, { ...valid, phone: '0425 別項目 446525' }, { ...valid, address: '東京都昭島市東町4-14-80' }, { ...valid, address: '東京都昭島市東町4-14-8-1' }, { ...valid, representative: '白石 悟朗' }]) {
      expect(verifyHomepage(tokyo, { url: valid.url, evidence_url: valid.evidence_url }, body(actual)).verified).toBe(false)
    }
  })
  it('identifies the missing field without disclosing its raw value', () => {
    expect(verifyHomepage(tokyo, valid, body({ ...valid, phone: '099-999-9999' })).reason).toBe('電話番号を公式サイト本文で確認できません')
  })
  it('accepts legal company name in an official homepage title with tagline', () => {
    expect(verifyHomepage(tokyo, valid, body(valid), '株式会社 白石工務店 | 会社案内').verified).toBe(true)
  })
  it('does not obtain fabricated facts from scripts or comments', () => {
    const html = `<script>${body(valid)}</script><!-- ${body(valid)} --><p>別企業</p>`
    expect(verifyHomepage(tokyo, valid, visibleText(html)).verified).toBe(false)
  })
  it('does not obtain facts from explicitly hidden elements and their children', () => {
    for (const attribute of ['hidden', 'style="display: none"', 'aria-hidden="true"']) {
      const html = `<div ${attribute}><p>${body(valid)}</p></div><p>別企業</p>`
      expect(verifyHomepage(tokyo, valid, visibleText(html)).verified).toBe(false)
    }
  })
})
describe('evidence network boundaries', () => {
  it('discovers only actual same-host company links', () => {
    const html = '<a href="https://directory.co.jp/company/">会社概要</a><a href="/news/">お知らせ</a><a href="/real-profile/"><span>会社概要</span></a>'
    expect(companyLinkFromHtml(html, 'https://company.co.jp/')).toBe('https://company.co.jp/real-profile/')
  })
  it('never invents a company path or accepts unrelated/external/unsafe links', () => {
    for (const html of ['<p>会社概要</p>', '<a href="/company/">ニュース</a>', '<a href="https://other.co.jp/about/">会社概要</a>', '<a href="javascript:alert(1)">会社概要</a>', '<a href="http://127.0.0.1/">会社概要</a>', '<a href="http://company.co.jp/company/">会社概要</a>']) {
      expect(companyLinkFromHtml(html, 'https://company.co.jp/')).toBeUndefined()
    }
  })
  it('selects at most one linked profile and ignores script/comment pseudo-links', () => {
    expect(companyLinkFromHtml('<script>"<a href="/fake/">会社概要</a>"</script><!-- <a href="/fake/">会社概要</a> --><a href="/first/">Company</a><a href="/second/">About us</a>', 'https://company.co.jp/')).toBe('https://company.co.jp/first/')
  })
  it.each(['file:///etc/passwd', 'https://127.0.0.1/', 'http://[::1]/', 'https://localhost/', 'https://x.internal/', 'https://user:pass@company.jp/', 'https://company.jp:8443/', 'javascript:alert(1)', 'https://instagram.com/company'])('rejects %s', url => expect(publicUrl(url)).toBeNull())
  it.each(['127.0.0.1', '10.1.2.3', '169.254.169.254', '172.16.0.1', '192.168.0.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '198.18.0.1', '192.0.2.1', '203.0.113.1'])('rejects nonpublic DNS %s', ip => expect(publicIpv4(ip)).toBe(false))
  it('allows ordinary public company host and IP', () => { expect(publicUrl('https://company.co.jp/company/')).not.toBeNull(); expect(publicIpv4('93.184.216.34')).toBe(true) })
})
