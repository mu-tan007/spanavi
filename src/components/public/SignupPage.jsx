import { useState } from 'react'

const C = {
  navy: '#0D2247',
  blue: '#1E40AF',
  gray200: '#E5E7EB',
  white: '#ffffff',
  textMuted: '#6B7280',
  textDark: '#111827',
  labelColor: '#374151',
  errorRed: '#DC2626',
  navyHover: '#1a3366',
}

function ShieldLogo() {
  return (
    <svg width="72" height="82" viewBox="0 0 52 60" style={{ marginBottom: 16 }}>
      <defs>
        <linearGradient id="spShieldSignup" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#0176D3"/>
          <stop offset="100%" stopColor="#032D60"/>
        </linearGradient>
        <clipPath id="shieldClipSignup"><path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z"/></clipPath>
      </defs>
      <path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z" fill="url(#spShieldSignup)"/>
      <g clipPath="url(#shieldClipSignup)" stroke="white" fill="none">
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
  )
}

export default function SignupPage() {
  const [orgName, setOrgName] = useState('')
  const [email, setEmail] = useState('')
  const [seats, setSeats] = useState(5)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const monthlyPerSeat = 7700
  const setupFee = 110000

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!orgName.trim()) { setError('組織名を入力してください'); return }
    if (!email.trim()) { setError('メールアドレスを入力してください'); return }
    if (seats < 1) { setError('ユーザー数は1以上にしてください'); return }

    setLoading(true)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-create-checkout`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            org_name: orgName.trim(),
            admin_email: email.trim(),
            quantity: seats,
          }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '申し込みに失敗しました')
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error('Checkout URLが取得できませんでした')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

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
        padding: '40px 36px',
        width: '100%',
        maxWidth: 460,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <ShieldLogo />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.navy, margin: 0 }}>
            Spanavi お申し込み
          </h1>
        </div>

        {/* 料金説明 */}
        <div style={{
          background: '#f8f9fb',
          borderRadius: 8,
          padding: '16px 20px',
          marginBottom: 24,
          border: `1px solid ${C.gray200}`,
        }}>
          <p style={{ fontSize: 13, color: C.textDark, fontWeight: 600, margin: '0 0 8px' }}>
            ご利用料金
          </p>
          <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.8 }}>
            <div>初期費用：<strong style={{ color: C.textDark }}>110,000円</strong>（税込）</div>
            <div>月額利用料：<strong style={{ color: C.textDark }}>7,700円</strong> / ユーザー（税込）</div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* 組織名 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.labelColor, display: 'block', marginBottom: 4 }}>
              組織名（会社名）<span style={{ color: C.errorRed, marginLeft: 2 }}>*</span>
            </label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="例：株式会社スパナビ"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 6,
                border: `1px solid ${C.gray200}`,
                fontSize: 14,
                fontFamily: "'Noto Sans JP', sans-serif",
                boxSizing: 'border-box',
                outline: 'none',
                color: C.textDark,
                background: C.white,
              }}
            />
          </div>

          {/* メールアドレス */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.labelColor, display: 'block', marginBottom: 4 }}>
              管理者メールアドレス<span style={{ color: C.errorRed, marginLeft: 2 }}>*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 6,
                border: `1px solid ${C.gray200}`,
                fontSize: 14,
                fontFamily: "'Noto Sans JP', sans-serif",
                boxSizing: 'border-box',
                outline: 'none',
                color: C.textDark,
                background: C.white,
              }}
            />
          </div>

          {/* ユーザー数 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.labelColor, display: 'block', marginBottom: 4 }}>
              初期ユーザー数
            </label>
            <input
              type="number"
              min={1}
              value={seats}
              onChange={(e) => setSeats(Math.max(1, parseInt(e.target.value) || 1))}
              style={{
                width: 100,
                padding: '10px 12px',
                borderRadius: 6,
                border: `1px solid ${C.gray200}`,
                fontSize: 14,
                fontFamily: "'Noto Sans JP', sans-serif",
                boxSizing: 'border-box',
                outline: 'none',
                textAlign: 'center',
              }}
            />
            <span style={{ fontSize: 13, color: C.textMuted, marginLeft: 8 }}>
              月額：{(monthlyPerSeat * seats).toLocaleString()}円（税込）
            </span>
          </div>

          {/* エラー */}
          {error && (
            <div style={{
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 6,
              padding: '10px 14px',
              marginBottom: 16,
              fontSize: 13,
              color: C.errorRed,
            }}>
              {error}
            </div>
          )}

          {/* 送信ボタン */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 6,
              border: 'none',
              background: loading ? '#9CA3AF' : C.navy,
              color: C.white,
              fontSize: 15,
              fontWeight: 600,
              fontFamily: "'Noto Sans JP', sans-serif",
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => { if (!loading) e.target.style.background = C.navyHover }}
            onMouseLeave={(e) => { if (!loading) e.target.style.background = C.navy }}
          >
            {loading ? '処理中...' : '申し込む'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <a
            href="/"
            style={{ fontSize: 13, color: C.textMuted, textDecoration: 'none' }}
            onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
            onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
          >
            ログインページへ戻る
          </a>
        </div>
      </div>
    </div>
  )
}
