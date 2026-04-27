import { useState } from 'react'
import { supabase, isInviteFlow } from '../lib/supabase'

const C = {
  navy: '#0D2247',
  gray200: '#E5E7EB',
  white: '#ffffff',
  textMuted: '#6B7280',
  textDark: '#111827',
  labelColor: '#374151',
  errorRed: '#DC2626',
  navyHover: '#1a3366',
  green: '#16a34a',
}

export default function ResetPasswordPage({ onComplete }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('パスワードは6文字以上で設定してください')
      return
    }
    if (password !== confirmPassword) {
      setError('パスワードが一致しません')
      return
    }

    setLoading(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) throw err
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 4,
    border: '1px solid ' + C.gray200, fontSize: 14, color: C.textDark,
    fontFamily: "'Noto Sans JP'", outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box', background: C.white,
  }

  const labelStyle = { fontSize: 12, fontWeight: 600, color: C.labelColor, marginBottom: 4 }

  const btnStyle = {
    width: '100%', padding: '10px 16px', borderRadius: 4, border: 'none',
    cursor: loading ? 'not-allowed' : 'pointer',
    background: C.navy, color: C.white, fontSize: 14, fontWeight: 600,
    fontFamily: "'Noto Sans JP'", opacity: loading ? 0.6 : 1,
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: C.navy, fontFamily: "'Noto Sans JP', sans-serif", padding: '20px',
    }}>
      <div style={{
        background: C.white, border: '1px solid ' + C.gray200, borderRadius: 4,
        padding: '40px', width: '100%', maxWidth: 400,
        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
      }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 12 }}>
              パスワードを更新しました
            </div>
            <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.8, marginBottom: 24 }}>
              新しいパスワードでログインできます。
            </div>
            <button
              onClick={onComplete}
              style={{ ...btnStyle, cursor: 'pointer', opacity: 1 }}
              onMouseEnter={e => e.currentTarget.style.background = C.navyHover}
              onMouseLeave={e => e.currentTarget.style.background = C.navy}
            >
              ログインへ進む
            </button>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 4 }}>
                {isInviteFlow ? 'パスワード初期設定' : 'パスワード再設定'}
              </div>
              <div style={{ fontSize: 13, color: C.textMuted }}>
                {isInviteFlow
                  ? 'Spanavi へようこそ。ログイン用のパスワードを設定してください'
                  : '新しいパスワードを入力してください'}
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 14 }}>
                <div style={labelStyle}>
                  新しいパスワード<span style={{ color: C.errorRed, marginLeft: 2 }}>*</span>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="6文字以上"
                  required
                  style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = C.navy; e.target.style.boxShadow = '0 0 0 2px rgba(13,34,71,0.1)' }}
                  onBlur={e => { e.target.style.borderColor = C.gray200; e.target.style.boxShadow = 'none' }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={labelStyle}>
                  パスワード確認<span style={{ color: C.errorRed, marginLeft: 2 }}>*</span>
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="もう一度入力"
                  required
                  style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = C.navy; e.target.style.boxShadow = '0 0 0 2px rgba(13,34,71,0.1)' }}
                  onBlur={e => { e.target.style.borderColor = C.gray200; e.target.style.boxShadow = 'none' }}
                />
              </div>

              {error && (
                <div style={{ marginBottom: 12, fontSize: 12, color: C.errorRed }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={btnStyle}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.background = C.navyHover }}
                onMouseLeave={e => e.currentTarget.style.background = C.navy}
              >
                {loading ? '更新中...' : 'パスワードを更新'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
