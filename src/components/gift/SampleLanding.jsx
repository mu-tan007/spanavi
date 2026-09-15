// お手紙サンプル（株式会社HCフィナンシャル・アドバイザー様へお見せする用）のQRから開く中継ページ。
// 個社向けの GiftLanding とは別物で、送付先トークンを持たない固定の1枚。
// 認証なしで開ける公開ページ。App.jsx の Routes で /g/:token より先に置くこと。

const GREEN = '#AACD06'
const PAPER = '#F7F8F4'
const INK = '#1A1A1A'

const LINKS = [
  {
    key: 'calendar',
    label: '日程調整',
    desc: 'ご都合のよい日時をお選びいただけます',
    href: 'https://timerex.net/s/shinomiya_632b_9279/0eeb4bbb',
  },
  {
    key: 'website',
    label: 'ホームページ',
    desc: '株式会社HCフィナンシャル・アドバイザーの会社情報',
    href: 'https://hcfa-jp.com/',
  },
]

export default function SampleLanding() {
  return (
    <div style={{
      minHeight: '100vh', background: PAPER, color: INK,
      fontFamily: "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif",
      display: 'flex', justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 520, padding: '48px 24px 56px' }}>
        <img
          src="/hcfa/hcfa-logo.png"
          alt="HC Financial Advisor, inc."
          style={{ width: 240, display: 'block', marginBottom: 40 }}
        />

        <p style={{ fontSize: 12, letterSpacing: '.24em', color: '#8AA800', margin: '0 0 14px' }}>
          INFORMATION
        </p>
        <h1 style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.7, margin: '0 0 16px' }}>
          お手紙をお受け取りいただき<br />ありがとうございます
        </h1>
        <p style={{ fontSize: 14, lineHeight: 2.0, color: '#4A4A4A', margin: '0 0 36px' }}>
          いますぐご譲渡やご提携をお考えでなくとも構いません。
          まずは一度、お目にかかってお話を伺う機会をいただけましたら幸甚に存じます。
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {LINKS.map((l) => (
            <a
              key={l.key}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block', background: '#fff', borderRadius: 10, padding: '18px 20px',
                textDecoration: 'none', color: INK, border: '1px solid #E2E5DA',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{l.label}</div>
                  <div style={{ fontSize: 12, color: '#6A6A6A', lineHeight: 1.7 }}>{l.desc}</div>
                </div>
                <span style={{ color: GREEN, fontSize: 18, flexShrink: 0 }}>→</span>
              </div>
            </a>
          ))}
        </div>

        <div style={{ marginTop: 44, paddingTop: 20, borderTop: '1px solid #E2E5DA' }}>
          <p style={{ fontSize: 11, letterSpacing: '.24em', color: '#8AA800', margin: '0 0 10px' }}>
            CONTACT
          </p>
          <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 6px' }}>
            株式会社HCフィナンシャル・アドバイザー
          </p>
          <p style={{ fontSize: 12, color: '#5A5A5A', lineHeight: 1.9, margin: 0 }}>
            〒150-6031　東京都渋谷区恵比寿4-20-3 恵比寿ガーデンプレイスタワー31階<br />
            石垣 大樹<br />
            <a href="mailto:d.ishigaki@hcfa-jp.com" style={{ color: '#5A5A5A' }}>
              d.ishigaki@hcfa-jp.com
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
