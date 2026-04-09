import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

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
        <linearGradient id="spShieldBg" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#0176D3"/>
          <stop offset="100%" stopColor="#032D60"/>
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
  )
}

// 名前オートコンプリート（メンバーオブジェクトを返す）
function MemberNameSelect({ members, selected, onSelect }) {
  const [query, setQuery]     = useState(selected?.name ?? '')
  const [focused, setFocused] = useState(false)
  const [showList, setShowList] = useState(false)
  const wrapperRef = useRef(null)

  useEffect(() => { setQuery(selected?.name ?? '') }, [selected])

  const filtered = members.filter(m =>
    query.length === 0 || m.name.includes(query)
  )

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowList(false)
        // 確定されていない入力はリセット
        if (!members.find(m => m.name === query)) setQuery(selected?.name ?? '')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [query, selected, members])

  const handleSelect = (m) => {
    setQuery(m.name)
    setShowList(false)
    onSelect(m)
  }

  return (
    <div style={{ marginBottom: 14, position: 'relative' }} ref={wrapperRef}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.labelColor, marginBottom: 4 }}>
        氏名<span style={{ color: C.errorRed, marginLeft: 2 }}>*</span>
      </div>
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setShowList(true); onSelect(null) }}
        placeholder="名前を入力して選択..."
        autoComplete="off"
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 4,
          border: `1px solid ${focused ? C.navy : C.gray200}`,
          boxShadow: focused ? '0 0 0 2px rgba(13,34,71,0.1)' : 'none',
          fontSize: 14, color: C.textDark,
          fontFamily: "'Noto Sans JP'", outline: 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s', boxSizing: 'border-box',
          background: C.white,
        }}
        onFocus={() => { setFocused(true); setShowList(true) }}
        onBlur={() => setFocused(false)}
      />
      {showList && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: C.white, border: '1px solid ' + C.gray200, borderRadius: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.10)', maxHeight: 220, overflowY: 'auto',
        }}>
          {filtered.map(m => (
            <div
              key={m.name}
              onMouseDown={() => handleSelect(m)}
              style={{
                padding: '10px 14px', fontSize: 14, color: C.textDark,
                cursor: 'pointer', borderBottom: '1px solid ' + C.gray200,
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#F3F4F6'}
              onMouseLeave={e => e.currentTarget.style.background = C.white}
            >
              {m.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// user IDからSupabase auth用メールアドレスを自動生成
const ORG_DOMAIN = 'a0000000-0000-0000-0000-000000000001.spanavi.internal'
const generateEmail = (id) =>
  `user_${id}@${ORG_DOMAIN}`

export default function LoginPage() {
  const { signIn, session } = useAuth()
  const navigate = useNavigate()
  // mode: 'admin' | 'login' | 'forgot' | 'forgotSent' | 'forgotEmail' | 'forgotEmailSent'
  // デフォルトをメールアドレスログイン（admin）に変更
  const [mode, setMode] = useState('admin')

  // ログイン済みならアプリへリダイレクト
  useEffect(() => {
    if (session) navigate('/dashboard', { replace: true })
  }, [session, navigate])

  // 通常ログイン用メンバー一覧（adminを除外）
  const [members, setMembers] = useState([])
  const [selected, setSelected] = useState(null)
  const [password, setPassword] = useState('')

  // 管理者ログイン用
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

  // パスワードリセット用
  const [resetSelected, setResetSelected] = useState(null)
  const [resetEmail, setResetEmail] = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase
      .from('members')
      .select('id, name, rank')
      .eq('is_active', true)
      .neq('rank', 'admin')
      .order('sort_order')
      .then(({ data }) => {
        if (data) setMembers(data.filter(m => m.name))
      })
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')

    if (!selected) { setError('氏名を選択してください'); return }

    const email = generateEmail(selected.id)
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (loginErr) {
      if (loginErr.message === 'Invalid login credentials') {
        try {
          const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { name: selected.name } }
          })
          if (signUpErr) {
            if (
              signUpErr.message === 'User already registered' ||
              signUpErr.message.includes('Database error') ||
              signUpErr.message.includes('already registered') ||
              signUpErr.message.includes('duplicate')
            ) {
              setError('パスワードが正しくありません')
            } else {
              setError(signUpErr.message)
            }
            setLoading(false)
            return
          }
          // signUpでセッションが返らなかった場合のみsignInを再試行
          if (!signUpData?.session) {
            await signIn(email, password)
          }
          // セッションがある場合はonAuthStateChangeが自動でハンドルする
        } catch {
          setError('パスワードが正しくありません')
        }
      } else {
        setError(loginErr.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleAdminLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(adminEmail, adminPassword)
    } catch (err) {
      setError('メールアドレスまたはパスワードが正しくありません')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setError('')
    if (!resetSelected) { setError('氏名を選択してください'); return }
    setLoading(true)
    try {
      const email = generateEmail(resetSelected.id)
      const { error: err } = await supabase.auth.resetPasswordForEmail(email)
      if (err) throw err
      setMode('forgotSent')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleForgotEmail = async (e) => {
    e.preventDefault()
    setError('')
    if (!resetEmail) { setError('メールアドレスを入力してください'); return }
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail)
      if (err) throw err
      setMode('forgotEmailSent')
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
    transition: 'border-color 0.2s, box-shadow 0.2s', marginBottom: 0,
    boxSizing: 'border-box', background: C.white,
  }

  const btnStyle = {
    width: '100%', padding: '10px 16px', borderRadius: 4, border: 'none',
    cursor: loading ? 'not-allowed' : 'pointer',
    background: C.navy,
    color: C.white, fontSize: 14, fontWeight: 600, fontFamily: "'Noto Sans JP'",
    opacity: loading ? 0.6 : 1,
  }

  const errBlock = error && (
    <div style={{ marginBottom: 12, fontSize: 12, color: C.errorRed }}>
      {error}
    </div>
  )

  const labelStyle = { fontSize: 12, fontWeight: 600, color: C.labelColor, marginBottom: 4 }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: C.navy,
      fontFamily: "'Noto Sans JP', sans-serif", padding: '20px',
    }}>
      <div style={{
        background: C.white,
        border: '1px solid ' + C.gray200,
        borderRadius: 4,
        padding: '40px',
        width: '100%',
        maxWidth: 400,
        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
        position: 'relative',
      }}>
        {/* ロゴ */}
        <div style={{ textAlign: 'center', marginBottom: 28, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <ShieldLogo />
          <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: 2, color: '#0176D3' }}>
            Spa<span style={{ background: 'linear-gradient(180deg, #c6a358, #a8883a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>navi</span>
          </div>
        </div>

        {/* ── ログインフォーム ── */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} autoComplete="off">
            {/* 名前選択 */}
            <MemberNameSelect
              members={members}
              selected={selected}
              onSelect={(m) => { setSelected(m); setPassword(''); setError('') }}
            />

            {/* パスワード */}
            <div style={{ marginBottom: 4 }}>
              <div style={labelStyle}>
                パスワード<span style={{ color: C.errorRed, marginLeft: 2 }}>*</span>
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="off"
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = C.navy; e.target.style.boxShadow = '0 0 0 2px rgba(13,34,71,0.1)' }}
                onBlur={e => { e.target.style.borderColor = C.gray200; e.target.style.boxShadow = 'none' }}
              />
            </div>

            <div style={{ textAlign: 'right', marginBottom: 16, marginTop: 6 }}>
              <span
                onClick={() => { setMode('forgot'); setError('') }}
                style={{ fontSize: 12, color: C.blue, cursor: 'pointer', textDecoration: 'none' }}
              >
                パスワードを忘れた方はこちら
              </span>
            </div>

            {errBlock}
            <button
              type="submit"
              disabled={loading}
              style={btnStyle}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = C.navyHover }}
              onMouseLeave={e => { e.currentTarget.style.background = C.navy }}
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <span
                onClick={() => { setMode('admin'); setError('') }}
                style={{ fontSize: 12, color: C.blue, cursor: 'pointer', textDecoration: 'none' }}
              >
                ← メールアドレスでログイン
              </span>
            </div>
          </form>
        )}

        {/* ── 管理者ログイン ── */}
        {mode === 'admin' && (
          <form onSubmit={handleAdminLogin} autoComplete="off">
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20, textAlign: 'center' }}>
              メールアドレスとパスワードでサインイン
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>
                メールアドレス<span style={{ color: C.errorRed, marginLeft: 2 }}>*</span>
              </div>
              <input
                type="email"
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                placeholder="email@example.com"
                required
                autoComplete="off"
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = C.navy; e.target.style.boxShadow = '0 0 0 2px rgba(13,34,71,0.1)' }}
                onBlur={e => { e.target.style.borderColor = C.gray200; e.target.style.boxShadow = 'none' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={labelStyle}>
                パスワード<span style={{ color: C.errorRed, marginLeft: 2 }}>*</span>
              </div>
              <input
                type="password"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="off"
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = C.navy; e.target.style.boxShadow = '0 0 0 2px rgba(13,34,71,0.1)' }}
                onBlur={e => { e.target.style.borderColor = C.gray200; e.target.style.boxShadow = 'none' }}
              />
            </div>

            <div style={{ textAlign: 'right', marginBottom: 16, marginTop: -10 }}>
              <span
                onClick={() => { setMode('forgotEmail'); setError(''); setResetEmail('') }}
                style={{ fontSize: 12, color: C.blue, cursor: 'pointer', textDecoration: 'none' }}
              >
                パスワードを忘れた方はこちら
              </span>
            </div>

            {errBlock}
            <button
              type="submit"
              disabled={loading}
              style={btnStyle}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = C.navyHover }}
              onMouseLeave={e => { e.currentTarget.style.background = C.navy }}
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
            {/* 名前選択ログインは ?staff=1 パラメータ付きでのみ表示 */}
            {new URLSearchParams(window.location.search).has('staff') && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <span
                  onClick={() => { setMode('login'); setError(''); setAdminEmail(''); setAdminPassword('') }}
                  style={{ fontSize: 12, color: C.textMuted, cursor: 'pointer', textDecoration: 'none' }}
                >
                  名前でログイン
                </span>
              </div>
            )}
          </form>
        )}

        {/* ── パスワードリセット ── */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword}>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20, lineHeight: 1.8 }}>
              氏名を選択してください。<br />パスワード再設定のリンクをお送りします。
            </div>
            <MemberNameSelect
              members={members}
              selected={resetSelected}
              onSelect={(m) => { setResetSelected(m); setError('') }}
            />
            {errBlock}
            <button
              type="submit"
              disabled={loading}
              style={btnStyle}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = C.navyHover }}
              onMouseLeave={e => { e.currentTarget.style.background = C.navy }}
            >
              {loading ? '送信中...' : '再設定メールを送る'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <span
                onClick={() => { setMode('login'); setError('') }}
                style={{ fontSize: 12, color: C.blue, cursor: 'pointer', textDecoration: 'none' }}
              >
                ログインに戻る
              </span>
            </div>
          </form>
        )}

        {mode === 'forgotSent' && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 12 }}>メールを送信しました</div>
            <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.8, marginBottom: 24 }}>
              {resetSelected?.name} 宛に<br />パスワード再設定のリンクを送りました。<br />メールをご確認ください。
            </div>
            <span
              onClick={() => { setMode('login'); setError('') }}
              style={{ fontSize: 12, color: C.blue, cursor: 'pointer', textDecoration: 'none' }}
            >
              ログインに戻る
            </span>
          </div>
        )}

        {/* ── メールアドレスでパスワードリセット ── */}
        {mode === 'forgotEmail' && (
          <form onSubmit={handleForgotEmail}>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 4, textAlign: 'center' }}>
              パスワード再設定
            </div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20, textAlign: 'center', lineHeight: 1.8 }}>
              登録済みのメールアドレスを入力してください。<br />パスワード再設定のリンクをお送りします。
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={labelStyle}>
                メールアドレス<span style={{ color: C.errorRed, marginLeft: 2 }}>*</span>
              </div>
              <input
                type="email"
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                placeholder="email@example.com"
                required
                autoComplete="off"
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = C.navy; e.target.style.boxShadow = '0 0 0 2px rgba(13,34,71,0.1)' }}
                onBlur={e => { e.target.style.borderColor = C.gray200; e.target.style.boxShadow = 'none' }}
              />
            </div>
            {errBlock}
            <button
              type="submit"
              disabled={loading}
              style={btnStyle}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = C.navyHover }}
              onMouseLeave={e => { e.currentTarget.style.background = C.navy }}
            >
              {loading ? '送信中...' : '再設定メールを送る'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <span
                onClick={() => { setMode('admin'); setError('') }}
                style={{ fontSize: 12, color: C.blue, cursor: 'pointer', textDecoration: 'none' }}
              >
                ← ログインに戻る
              </span>
            </div>
          </form>
        )}

        {mode === 'forgotEmailSent' && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 12 }}>メールを送信しました</div>
            <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.8, marginBottom: 24 }}>
              {resetEmail} 宛に<br />パスワード再設定のリンクを送りました。<br />メールをご確認ください。
            </div>
            <span
              onClick={() => { setMode('admin'); setError('') }}
              style={{ fontSize: 12, color: C.blue, cursor: 'pointer', textDecoration: 'none' }}
            >
              ログインに戻る
            </span>
          </div>
        )}

        <div style={{ marginTop: 20, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <a href="/signup" style={{ fontSize: 12, color: C.blue, textDecoration: 'none' }}>
            アカウントをお持ちでない方はこちら
          </a>
          <a href="/" style={{ fontSize: 11, color: C.textMuted, textDecoration: 'none' }}>
            ← トップページに戻る
          </a>
          <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 1, marginTop: 4 }}>
            © {new Date().getFullYear()} Spanavi
          </div>
        </div>
      </div>
    </div>
  )
}
