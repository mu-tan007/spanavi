import { Link } from 'react-router-dom'

const C = {
  navy: '#0D2247',
  white: '#ffffff',
  textMuted: '#6B7280',
  textDark: '#111827',
}

export default function SignupCanceledPage() {
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
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.textDark, margin: '0 0 16px' }}>
          お申し込みがキャンセルされました
        </h1>

        <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.8, marginBottom: 32 }}>
          決済が完了しませんでした。<br />
          もう一度お試しいただけます。
        </p>

        <Link
          to="/signup"
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
          もう一度お申し込み
        </Link>
      </div>
    </div>
  )
}
