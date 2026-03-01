import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

const C = {
  navy: '#1a2332',
  navyDeep: '#0f1923',
  navyLight: '#243044',
  gold: '#c8a45a',
  white: '#ffffff',
  border: '#d0d5dd',
  borderLight: '#e8ecf0',
  textLight: '#8896a6',
}

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'メールアドレスまたはパスワードが正しくありません'
        : err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(160deg, ${C.navyDeep} 0%, ${C.navy} 35%, #2a5d8f 60%, ${C.navyLight} 100%)`,
      fontFamily: "'Noto Sans JP', sans-serif", position: 'relative', overflow: 'hidden',
    }}>
      {/* Decorative circles */}
      <div style={{ position: 'absolute', top: -80, right: -80, width: 300, height: 300, borderRadius: '50%', background: C.gold + '12' }}></div>
      <div style={{ position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: '50%', background: C.gold + '08' }}></div>
      <div style={{ position: 'absolute', top: '30%', left: '10%', width: 120, height: 120, borderRadius: '50%', background: C.white + '05' }}></div>

      <div style={{
        background: C.white, borderRadius: 20, padding: '40px 40px 32px', width: 380,
        boxShadow: '0 16px 64px rgba(0,0,0,0.35)', position: 'relative', zIndex: 1,
        borderTop: '4px solid ' + C.gold,
      }}>
        {/* Shield Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <svg width="72" height="82" viewBox="0 0 52 60" style={{ marginBottom: 16 }}>
            <defs>
              <linearGradient id="spShieldBg" x1="0" y1="0" x2="0.3" y2="1">
                <stop offset="0%" stopColor="#1a3a5c"/>
                <stop offset="100%" stopColor="#22496e"/>
              </linearGradient>
              <clipPath id="shieldClipL"><path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z"/></clipPath>
            </defs>
            <path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z" fill="url(#spShieldBg)"/>
            <g clipPath="url(#shieldClipL)" stroke="white" fill="none">
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
          <div style={{
            fontSize: 38, fontWeight: 800, letterSpacing: 2, color: C.navy,
          }}>Spa<span style={{ background: 'linear-gradient(180deg, #c6a358, #a8883a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>navi</span></div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.navy, marginBottom: 6, letterSpacing: 1 }}>メールアドレス</div>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email@example.com"
            required
            autoComplete="email"
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 8,
              border: '2px solid ' + C.border, fontSize: 13,
              fontFamily: "'Noto Sans JP'", outline: 'none',
              transition: 'border-color 0.2s', marginBottom: 16,
            }}
            onFocus={e => e.target.style.borderColor = C.gold}
            onBlur={e => e.target.style.borderColor = C.border}
          />

          <div style={{ fontSize: 11, fontWeight: 600, color: C.navy, marginBottom: 6, letterSpacing: 1 }}>パスワード</div>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 8,
              border: '2px solid ' + C.border, fontSize: 13,
              fontFamily: "'Noto Sans JP'", outline: 'none',
              transition: 'border-color 0.2s', marginBottom: 8,
            }}
            onFocus={e => e.target.style.borderColor = C.gold}
            onBlur={e => e.target.style.borderColor = C.border}
          />

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginTop: 8, marginBottom: 8,
              background: '#fff0f0', border: '1px solid #ffcccc',
              fontSize: 12, color: '#c0392b',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px', marginTop: 12,
              borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              background: `linear-gradient(135deg, ${C.gold}, #a8883a)`,
              color: C.white, fontSize: 14, fontWeight: 700,
              fontFamily: "'Noto Sans JP'", letterSpacing: 1,
              opacity: loading ? 0.6 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 9, color: C.textLight, letterSpacing: 1 }}>
          © 2026 M&A Sourcing Partners Co., Ltd.
        </div>
      </div>
    </div>
  )
}
