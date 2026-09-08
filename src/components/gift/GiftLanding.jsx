import { useParams } from 'react-router-dom'

// ギフト同梱DM（Renga Partners様）のお手紙QRから開く中継ページ。
// 送付先ごとに異なるトークンを付けたURL（/g/:token）を手紙へ印刷する。
// 認証なしで開ける公開ページ。App.jsx の Routes 先頭側に置くこと。

const BRICK = '#A35C46'
const CREAM = '#F6F2ED'
const INK = '#1A1A1A'

const LINKS = [
  {
    key: 'calendar',
    label: '日程調整',
    desc: 'ご都合のよい日時をお選びいただけます',
    href: 'https://calendar.app.google/Fa8MMo7KgZMcQa5Q8',
  },
  {
    key: 'deck',
    label: '会社紹介資料',
    desc: '私どもの考え方と進め方をまとめております',
    href: '/renga/company-profile.pdf',
  },
  {
    key: 'website',
    label: 'ホームページ',
    desc: 'Renga Partners の会社情報',
    href: 'https://rengapartners.com/',
  },
]

export default function GiftLanding() {
  const { token } = useParams()

  return (
    <div style={{
      minHeight: '100vh', background: CREAM, color: INK,
      fontFamily: "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif",
      display: 'flex', justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 520, padding: '48px 24px 56px' }}>
        <img
          src="/renga/renga-logo.png"
          alt="RENGA PARTNERS"
          style={{ width: 168, display: 'block', marginBottom: 40 }}
        />

        <p style={{ fontSize: 12, letterSpacing: '.24em', color: BRICK, margin: '0 0 14px' }}>
          INFORMATION
        </p>
        <h1 style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.7, margin: '0 0 16px' }}>
          お手紙をお受け取りいただき<br />ありがとうございます
        </h1>
        <p style={{ fontSize: 14, lineHeight: 2.0, color: '#4A4A4A', margin: '0 0 36px' }}>
          いますぐご譲渡をお考えでなくとも構いません。
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
                textDecoration: 'none', color: INK, border: '1px solid #E4DCD3',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{l.label}</div>
                  <div style={{ fontSize: 12, color: '#6A6A6A', lineHeight: 1.7 }}>{l.desc}</div>
                </div>
                <span style={{ color: BRICK, fontSize: 18, flexShrink: 0 }}>→</span>
              </div>
            </a>
          ))}
        </div>

        <div style={{ marginTop: 44, paddingTop: 20, borderTop: '1px solid #E4DCD3' }}>
          <p style={{ fontSize: 11, letterSpacing: '.24em', color: BRICK, margin: '0 0 10px' }}>
            CONTACT
          </p>
          <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 6px' }}>Renga Partners株式会社</p>
          <p style={{ fontSize: 12, color: '#5A5A5A', lineHeight: 1.9, margin: 0 }}>
            〒150-0033　東京都渋谷区猿楽町17-10 代官山アートビレッジ2C<br />
            代表取締役　南場 大輔<br />
            <a href="mailto:namba@rengapartners.com" style={{ color: '#5A5A5A' }}>
              namba@rengapartners.com
            </a>
          </p>
        </div>

        {/* 送付先の識別子。読み取りの記録を入れるまでは表示のみに使わず保持だけしておく */}
        <span style={{ display: 'none' }} data-token={token || ''} />
      </div>
    </div>
  )
}
