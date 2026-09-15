// ギフト同梱DMのお手紙サンプル（当社名義）のQRから開く中継ページ。
// 個社向けの GiftLanding とは別物で、送付先トークンを持たない固定の1枚。
// 認証なしで開ける公開ページ。App.jsx の Routes で /g/:token より先に置くこと。

const NAVY = '#1B3A8C'
const GOLD = '#C8A84B'
const PAPER = '#F7F6F3'
const INK = '#1A1A1A'

const LINKS = [
  {
    key: 'calendar',
    label: '日程調整',
    desc: 'ご都合のよい日時をお選びいただけます',
    href: 'https://timerex.net/s/shinomiya_632b_9279/0eeb4bbb',
  },
  {
    key: 'deck',
    label: 'サービス紹介資料',
    desc: '売り手ソーシング代行の進め方をまとめております',
    href: '/spartia/seller-sourcing.pdf',
  },
  {
    key: 'website',
    label: 'ホームページ',
    desc: 'Spartia株式会社の会社情報',
    href: 'https://ma-sp.co/',
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
          src="/spartia/spartia-wordmark-navy.png"
          alt="SPARTIA"
          style={{ width: 168, display: 'block', marginBottom: 40 }}
        />

        <p style={{ fontSize: 12, letterSpacing: '.24em', color: GOLD, margin: '0 0 14px' }}>
          INFORMATION
        </p>
        <h1 style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.7, margin: '0 0 16px' }}>
          お手紙をお受け取りいただき<br />ありがとうございます
        </h1>
        <p style={{ fontSize: 14, lineHeight: 2.0, color: '#4A4A4A', margin: '0 0 36px' }}>
          いますぐのご検討でなくとも構いません。
          まずは情報交換として、貴社の歩みとこれからのお考えを聞かせていただけましたら幸甚に存じます。
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
                textDecoration: 'none', color: INK, border: '1px solid #E3E2DE',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{l.label}</div>
                  <div style={{ fontSize: 12, color: '#6A6A6A', lineHeight: 1.7 }}>{l.desc}</div>
                </div>
                <span style={{ color: NAVY, fontSize: 18, flexShrink: 0 }}>→</span>
              </div>
            </a>
          ))}
        </div>

        <div style={{ marginTop: 44, paddingTop: 20, borderTop: '1px solid #E3E2DE' }}>
          <p style={{ fontSize: 11, letterSpacing: '.24em', color: GOLD, margin: '0 0 10px' }}>
            CONTACT
          </p>
          <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 6px' }}>Spartia株式会社</p>
          <p style={{ fontSize: 12, color: '#5A5A5A', lineHeight: 1.9, margin: 0 }}>
            〒106-0031　東京都港区西麻布4-12-13 グランフィールド麻布霞町2階<br />
            代表取締役　篠宮 拓武<br />
            <a href="mailto:shinomiya@ma-sp.co" style={{ color: '#5A5A5A' }}>
              shinomiya@ma-sp.co
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
