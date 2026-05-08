import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { LoginShell, SHELL_C, inputStyle, labelStyle, makeBtnStyle } from './common/LoginShell'

// 名前オートコンプリート（メンバーオブジェクトを返す）— 社内ログイン専用
function MemberNameSelect({ members, selected, onSelect }) {
  const [query, setQuery]     = useState(selected?.name ?? '')
  const [, setFocused] = useState(false)
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
      <div style={labelStyle}>
        氏名<span style={{ color: SHELL_C.errorRed, marginLeft: 2 }}>*</span>
      </div>
      <input
        className="sp-login-input"
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setShowList(true); onSelect(null) }}
        placeholder="名前を入力して選択..."
        autoComplete="off"
        style={inputStyle}
        onFocus={() => { setFocused(true); setShowList(true) }}
        onBlur={() => setFocused(false)}
      />
      {showList && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: '#FFFFFF', border: '1px solid rgba(255,255,255,0.30)', borderRadius: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.20)', maxHeight: 220, overflowY: 'auto',
        }}>
          {filtered.map(m => (
            <div
              key={m.name}
              onMouseDown={() => handleSelect(m)}
              style={{
                padding: '10px 14px', fontSize: 14, color: '#111827',
                cursor: 'pointer', borderBottom: '1px solid #E5E7EB',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#F3F4F6'}
              onMouseLeave={e => e.currentTarget.style.background = '#FFFFFF'}
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
const generateEmail = (id) => `user_${id}@${ORG_DOMAIN}`

export default function LoginPage() {
  const { signIn, session } = useAuth()
  const navigate = useNavigate()
  // mode: 'admin' | 'login' | 'forgot' | 'forgotSent' | 'forgotEmail' | 'forgotEmailSent'
  // デフォルトはメールアドレスログイン（admin）
  const [mode, setMode] = useState('admin')

  // ログイン済みならアプリへリダイレクト
  useEffect(() => {
    if (session) navigate('/dashboard', { replace: true })
  }, [session, navigate])

  const [members, setMembers] = useState([])
  const [selected, setSelected] = useState(null)
  const [password, setPassword] = useState('')

  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

  const [resetSelected, setResetSelected] = useState(null)
  const [resetEmail, setResetEmail] = useState('')
  const [error, setError] = useState('')
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
          if (!signUpData?.session) {
            await signIn(email, password)
          }
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
    } catch {
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

  const btnStyle = makeBtnStyle(loading)

  const errBlock = error && (
    <div style={{ marginBottom: 12, fontSize: 12, color: SHELL_C.errorRed }}>
      {error}
    </div>
  )

  const modeSubtitle = {
    admin: 'メールアドレスとパスワードでサインイン',
    login: '氏名とパスワードでサインイン',
    forgot: '',
    forgotSent: '',
    forgotEmail: '',
    forgotEmailSent: '',
  }[mode]

  return (
    <LoginShell subtitle={modeSubtitle}>
      {mode === 'login' && (
        <form onSubmit={handleLogin} autoComplete="off">
          <MemberNameSelect
            members={members}
            selected={selected}
            onSelect={(m) => { setSelected(m); setPassword(''); setError('') }}
          />
          <div style={{ marginBottom: 4 }}>
            <div style={labelStyle}>
              パスワード<span style={{ color: SHELL_C.errorRed, marginLeft: 2 }}>*</span>
            </div>
            <input
              className="sp-login-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="off"
              style={inputStyle}
            />
          </div>
          <div style={{ textAlign: 'right', marginBottom: 16, marginTop: 6 }}>
            <span
              onClick={() => { setMode('forgot'); setError('') }}
              style={{ fontSize: 12, color: SHELL_C.linkOnDark, cursor: 'pointer' }}
            >
              パスワードを忘れた方はこちら
            </span>
          </div>
          {errBlock}
          <button type="submit" className="sp-login-btn" disabled={loading} style={btnStyle}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = SHELL_C.navyHover }}
            onMouseLeave={e => { e.currentTarget.style.background = SHELL_C.navy }}
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <span
              onClick={() => { setMode('admin'); setError('') }}
              style={{ fontSize: 12, color: SHELL_C.linkOnDark, cursor: 'pointer' }}
            >
              ← メールアドレスでログイン
            </span>
          </div>
        </form>
      )}

      {mode === 'admin' && (
        <form onSubmit={handleAdminLogin} autoComplete="off">
          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>
              メールアドレス<span style={{ color: SHELL_C.errorRed, marginLeft: 2 }}>*</span>
            </div>
            <input
              className="sp-login-input"
              type="email"
              value={adminEmail}
              onChange={e => setAdminEmail(e.target.value)}
              placeholder="email@example.com"
              required
              autoComplete="off"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>
              パスワード<span style={{ color: SHELL_C.errorRed, marginLeft: 2 }}>*</span>
            </div>
            <input
              className="sp-login-input"
              type="password"
              value={adminPassword}
              onChange={e => setAdminPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="off"
              style={inputStyle}
            />
          </div>
          <div style={{ textAlign: 'right', marginBottom: 16, marginTop: -10 }}>
            <span
              onClick={() => { setMode('forgotEmail'); setError(''); setResetEmail('') }}
              style={{ fontSize: 12, color: SHELL_C.linkOnDark, cursor: 'pointer' }}
            >
              パスワードを忘れた方はこちら
            </span>
          </div>
          {errBlock}
          <button type="submit" className="sp-login-btn" disabled={loading} style={btnStyle}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = SHELL_C.navyHover }}
            onMouseLeave={e => { e.currentTarget.style.background = SHELL_C.navy }}
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
          {new URLSearchParams(window.location.search).has('staff') && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <span
                onClick={() => { setMode('login'); setError(''); setAdminEmail(''); setAdminPassword('') }}
                style={{ fontSize: 12, color: SHELL_C.textMutedOnDark, cursor: 'pointer' }}
              >
                名前でログイン
              </span>
            </div>
          )}
        </form>
      )}

      {mode === 'forgot' && (
        <form onSubmit={handleForgotPassword}>
          <div style={{ fontSize: 13, color: SHELL_C.textMutedOnDark, marginBottom: 20, lineHeight: 1.8 }}>
            氏名を選択してください。<br />パスワード再設定のリンクをお送りします。
          </div>
          <MemberNameSelect
            members={members}
            selected={resetSelected}
            onSelect={(m) => { setResetSelected(m); setError('') }}
          />
          {errBlock}
          <button type="submit" className="sp-login-btn" disabled={loading} style={btnStyle}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = SHELL_C.navyHover }}
            onMouseLeave={e => { e.currentTarget.style.background = SHELL_C.navy }}
          >
            {loading ? '送信中...' : '再設定メールを送る'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <span
              onClick={() => { setMode('login'); setError('') }}
              style={{ fontSize: 12, color: SHELL_C.linkOnDark, cursor: 'pointer' }}
            >
              ログインに戻る
            </span>
          </div>
        </form>
      )}

      {mode === 'forgotSent' && (
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: SHELL_C.textOnDark, marginBottom: 12 }}>メールを送信しました</div>
          <div style={{ fontSize: 13, color: SHELL_C.textMutedOnDark, lineHeight: 1.8, marginBottom: 24 }}>
            {resetSelected?.name} 宛に<br />パスワード再設定のリンクを送りました。<br />メールをご確認ください。
          </div>
          <span
            onClick={() => { setMode('login'); setError('') }}
            style={{ fontSize: 12, color: SHELL_C.linkOnDark, cursor: 'pointer' }}
          >
            ログインに戻る
          </span>
        </div>
      )}

      {mode === 'forgotEmail' && (
        <form onSubmit={handleForgotEmail}>
          <div style={{ fontSize: 20, fontWeight: 700, color: SHELL_C.textOnDark, marginBottom: 4, textAlign: 'center' }}>
            パスワード再設定
          </div>
          <div style={{ fontSize: 13, color: SHELL_C.textMutedOnDark, marginBottom: 20, textAlign: 'center', lineHeight: 1.8 }}>
            登録済みのメールアドレスを入力してください。<br />パスワード再設定のリンクをお送りします。
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>
              メールアドレス<span style={{ color: SHELL_C.errorRed, marginLeft: 2 }}>*</span>
            </div>
            <input
              className="sp-login-input"
              type="email"
              value={resetEmail}
              onChange={e => setResetEmail(e.target.value)}
              placeholder="email@example.com"
              required
              autoComplete="off"
              style={inputStyle}
            />
          </div>
          {errBlock}
          <button type="submit" className="sp-login-btn" disabled={loading} style={btnStyle}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = SHELL_C.navyHover }}
            onMouseLeave={e => { e.currentTarget.style.background = SHELL_C.navy }}
          >
            {loading ? '送信中...' : '再設定メールを送る'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <span
              onClick={() => { setMode('admin'); setError('') }}
              style={{ fontSize: 12, color: SHELL_C.linkOnDark, cursor: 'pointer' }}
            >
              ← ログインに戻る
            </span>
          </div>
        </form>
      )}

      {mode === 'forgotEmailSent' && (
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: SHELL_C.textOnDark, marginBottom: 12 }}>メールを送信しました</div>
          <div style={{ fontSize: 13, color: SHELL_C.textMutedOnDark, lineHeight: 1.8, marginBottom: 24 }}>
            {resetEmail} 宛に<br />パスワード再設定のリンクを送りました。<br />メールをご確認ください。
          </div>
          <span
            onClick={() => { setMode('admin'); setError('') }}
            style={{ fontSize: 12, color: SHELL_C.linkOnDark, cursor: 'pointer' }}
          >
            ログインに戻る
          </span>
        </div>
      )}
    </LoginShell>
  )
}
