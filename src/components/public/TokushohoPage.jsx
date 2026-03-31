import { useNavigate } from 'react-router-dom'

const C = {
  navy: '#0D2247',
  navyLight: '#132D5E',
  blue: '#0176D3',
  blueDark: '#032D60',
  white: '#ffffff',
  textMuted: '#94A3B8',
  textLight: '#CBD5E1',
  gold: '#c8a45a',
  bg: '#f5f0e8',
}

const BRAND = {
  primary: '#032D60',
  accent: '#0176D3',
  highlight: '#C8A84B',
}

function SpanaviLogo({ shieldSize = 28, fontSize = 20 }) {
  const shieldH = Math.round(shieldSize * 60 / 52)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={shieldSize} height={shieldH} viewBox="0 0 52 60">
        <defs>
          <linearGradient id="spShieldTk" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0%" stopColor={BRAND.accent}/>
            <stop offset="100%" stopColor={BRAND.primary}/>
          </linearGradient>
          <clipPath id="shieldClipTk"><path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z"/></clipPath>
        </defs>
        <path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z" fill="url(#spShieldTk)"/>
        <g clipPath="url(#shieldClipTk)" stroke="white" fill="none">
          <g opacity="0.45" strokeWidth="1.2">
            <line x1="26" y1="30" x2="26" y2="-5"/><line x1="26" y1="30" x2="55" y2="30"/>
            <line x1="26" y1="30" x2="26" y2="65"/><line x1="26" y1="30" x2="-3" y2="30"/>
            <line x1="26" y1="30" x2="47" y2="5"/><line x1="26" y1="30" x2="47" y2="55"/>
            <line x1="26" y1="30" x2="5" y2="55"/><line x1="26" y1="30" x2="5" y2="5"/>
          </g>
          <g opacity="0.30" strokeWidth="0.8">
            <line x1="26" y1="30" x2="37" y2="-2"/><line x1="26" y1="30" x2="53" y2="16"/>
            <line x1="26" y1="30" x2="53" y2="44"/><line x1="26" y1="30" x2="37" y2="62"/>
            <line x1="26" y1="30" x2="15" y2="62"/><line x1="26" y1="30" x2="-1" y2="44"/>
            <line x1="26" y1="30" x2="-1" y2="16"/><line x1="26" y1="30" x2="15" y2="-2"/>
          </g>
        </g>
      </svg>
      <div style={{ fontFamily: "'Outfit', sans-serif", fontSize, fontWeight: 800, letterSpacing: 2, lineHeight: 1 }}>
        <span style={{ color: BRAND.accent }}>Spa</span><span style={{ color: BRAND.highlight }}>navi</span>
      </div>
    </div>
  )
}

const items = [
  { label: '販売事業者', value: '株式会社M&Aソーシングパートナーズ' },
  { label: '代表者', value: '【要記入：代表者氏名】' },
  { label: '所在地', value: '【要記入：住所】' },
  { label: '電話番号', value: '【要記入：電話番号】' },
  { label: 'メールアドレス', value: '【要記入：メールアドレス】' },
  { label: 'ウェブサイト', value: 'https://spanavi.jp' },
  {
    label: '販売価格',
    value: '初期費用：110,000円（税込）\n月額利用料：7,700円/ユーザー（税込）',
  },
  {
    label: '販売価格以外の必要料金',
    value: 'インターネット接続に必要な通信料等はお客様のご負担となります。',
  },
  {
    label: '支払方法',
    value: 'クレジットカード決済（Visa / Mastercard / American Express / JCB）',
  },
  {
    label: '支払時期',
    value: '初期費用：お申し込み時にお支払い\n月額利用料：毎月自動課金（契約日を起算日とした1ヶ月ごと）',
  },
  {
    label: '役務の提供時期',
    value: 'お申し込み手続き完了後、直ちにご利用いただけます。',
  },
  {
    label: '返品・キャンセルについて',
    value: 'サービスの性質上、お申し込み後の返金はいたしかねます。\n月額利用料は、解約手続き完了後の翌請求サイクルより課金を停止します。\n解約はStripeカスタマーポータルよりいつでもお手続きいただけます。',
  },
  {
    label: '動作環境',
    value: 'Google Chrome 最新版（推奨）、Microsoft Edge 最新版、Safari 最新版\n※ スマートフォン・タブレットでもご利用いただけます。',
  },
]

export default function TokushohoPage() {
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      fontFamily: "'Noto Sans JP', sans-serif", color: '#1e293b',
    }}>
      {/* ── Header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: C.navy, borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
          <SpanaviLogo shieldSize={22} fontSize={15} />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => navigate('/login')} style={{
            background: 'transparent', color: C.textLight, border: `1px solid ${C.textMuted}`,
            borderRadius: 6, padding: '7px 18px', fontSize: 13, cursor: 'pointer',
            fontFamily: "'Noto Sans JP', sans-serif",
          }}>ログイン</button>
          <button onClick={() => navigate('/signup')} style={{
            background: C.blue, color: C.white, border: 'none',
            borderRadius: 6, padding: '7px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            fontFamily: "'Noto Sans JP', sans-serif",
          }}>無料で始める</button>
        </div>
      </header>

      {/* ── Content ── */}
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 32, textAlign: 'center' }}>
          特定商取引法に基づく表記
        </h1>

        <div style={{
          background: C.white, borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          {items.map((item, i) => (
            <div key={item.label} style={{
              display: 'flex', borderBottom: i < items.length - 1 ? '1px solid #e5e7eb' : 'none',
            }}>
              <div style={{
                width: 200, minWidth: 200, padding: '16px 20px',
                background: '#f8f9fa', fontWeight: 600, fontSize: 13,
                borderRight: '1px solid #e5e7eb', lineHeight: 1.7,
              }}>
                {item.label}
              </div>
              <div style={{
                flex: 1, padding: '16px 20px', fontSize: 13, lineHeight: 1.7,
                whiteSpace: 'pre-line',
              }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <button onClick={() => navigate('/')} style={{
            background: 'transparent', color: C.blue, border: `1px solid ${C.blue}`,
            borderRadius: 6, padding: '10px 28px', fontSize: 13, cursor: 'pointer',
            fontFamily: "'Noto Sans JP', sans-serif",
          }}>
            トップページへ戻る
          </button>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer style={{
        background: C.navy, borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '32px 32px', textAlign: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <SpanaviLogo shieldSize={20} fontSize={14} />
        </div>
        <p style={{ fontSize: 11, color: C.textMuted }}>
          © {new Date().getFullYear()} Spanavi. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
