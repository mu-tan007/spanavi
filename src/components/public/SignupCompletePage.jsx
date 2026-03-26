import { Link } from 'react-router-dom'

const C = {
  navy: '#0D2247',
  white: '#ffffff',
  textMuted: '#6B7280',
  textDark: '#111827',
  gray200: '#E5E7EB',
}

export default function SignupCompletePage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f0e8',
      fontFamily: "'Noto Sans JP', sans-serif",
      padding: '20px',
    }}>
      <div style={{
        background: C.white,
        borderRadius: 12,
        boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
        padding: '48px 36px',
        width: '100%',
        maxWidth: 460,
        textAlign: 'center',
      }}>
        <svg width="72" height="82" viewBox="0 0 52 60" style={{ marginBottom: 16 }}>
          <defs>
            <linearGradient id="spShieldComplete" x1="0" y1="0" x2="0.3" y2="1">
              <stop offset="0%" stopColor="#0176D3"/>
              <stop offset="100%" stopColor="#032D60"/>
            </linearGradient>
            <clipPath id="shieldClipComplete"><path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z"/></clipPath>
          </defs>
          <path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z" fill="url(#spShieldComplete)"/>
          <g clipPath="url(#shieldClipComplete)" stroke="white" fill="none">
            <g opacity="0.45" strokeWidth="1.2">
              <line x1="26" y1="30" x2="26" y2="-5"/><line x1="26" y1="30" x2="55" y2="30"/>
              <line x1="26" y1="30" x2="26" y2="65"/><line x1="26" y1="30" x2="-3" y2="30"/>
              <line x1="26" y1="30" x2="47" y2="5"/><line x1="26" y1="30" x2="47" y2="55"/>
              <line x1="26" y1="30" x2="5" y2="55"/><line x1="26" y1="30" x2="5" y2="5"/>
            </g>
          </g>
        </svg>

        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.navy, margin: '0 0 16px' }}>
          お申し込みありがとうございます
        </h1>

        <p style={{ fontSize: 14, color: C.textDark, lineHeight: 1.8, marginBottom: 32 }}>
          招待メールをお送りしました。<br />
          メールのリンクからパスワードを設定してログインしてください。
        </p>

        <Link
          to="/"
          style={{
            display: 'inline-block',
            padding: '12px 32px',
            borderRadius: 6,
            background: C.navy,
            color: C.white,
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "'Noto Sans JP', sans-serif",
            textDecoration: 'none',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => e.target.style.background = '#1a3366'}
          onMouseLeave={(e) => e.target.style.background = C.navy}
        >
          ログインページへ
        </Link>
      </div>
    </div>
  )
}
