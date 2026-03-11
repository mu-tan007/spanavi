import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

const C = {
  navy: '#032D60',
  navyDeep: '#021B40',
  navyLight: '#0176D3',
  gold: '#C8A84B',
  white: '#ffffff',
  border: '#E5E5E5',
  borderLight: '#F0F0F0',
  textLight: '#706E6B',
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
      <div style={{ fontSize: 11, fontWeight: 600, color: C.navy, marginBottom: 5, letterSpacing: 1 }}>
        氏名<span style={{ color: '#e74c3c', marginLeft: 2 }}>*</span>
      </div>
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setShowList(true); onSelect(null) }}
        placeholder="名前を入力して選択..."
        autoComplete="off"
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8,
          border: `2px solid ${focused ? C.gold : C.border}`, fontSize: 13,
          fontFamily: "'Noto Sans JP'", outline: 'none',
          transition: 'border-color 0.2s', boxSizing: 'border-box',
          background: C.white,
        }}
        onFocus={() => { setFocused(true); setShowList(true) }}
        onBlur={() => setFocused(false)}
      />
      {showList && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: C.white, border: '2px solid ' + C.gold, borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)', maxHeight: 220, overflowY: 'auto',
        }}>
          {filtered.map(m => (
            <div
              key={m.name}
              onMouseDown={() => handleSelect(m)}
              style={{
                padding: '10px 12px', fontSize: 13, color: C.navy,
                cursor: 'pointer', borderBottom: '1px solid ' + C.borderLight,
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f5f0e8'}
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

// 名前からSupabase auth用メールアドレスを自動生成
const generateEmail = (name) =>
  `${name.replace(/\s/g, '')}.spanavi@masp-internal.com`

export default function LoginPage() {
  const { signIn } = useAuth()
  // mode: 'login' | 'forgot' | 'forgotSent'
  const [mode, setMode] = useState('login')

  // ログイン用メンバー一覧 { name, rank }
  const [members, setMembers] = useState([])
  const [selected, setSelected] = useState(null)
  const [password, setPassword] = useState('')

  // パスワードリセット用（名前選択で自動生成）
  const [resetSelected, setResetSelected] = useState(null)
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase
      .from('members')
      .select('name, rank')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (data) setMembers(data.filter(m => m.name))
      })
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')

    if (!selected) { setError('氏名を選択してください'); return }

    const email = generateEmail(selected.name)
    setLoading(true)
    try {
      // まず通常ログインを試みる
      await signIn(email, password)
    } catch (loginErr) {
      if (loginErr.message === 'Invalid login credentials') {
        // アカウント未作成の可能性 → 初回サインアップを試みる
        try {
          const { error: signUpErr } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { name: selected.name }
            }
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
          // サインアップ成功 → そのままサインイン
          await signIn(email, password)
        } catch (signUpError) {
          setError('パスワードが正しくありません')
        }
      } else {
        setError(loginErr.message)
      }
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
      const email = generateEmail(resetSelected.name)
      const { error: err } = await supabase.auth.resetPasswordForEmail(email)
      if (err) throw err
      setMode('forgotSent')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '2px solid ' + C.border, fontSize: 13,
    fontFamily: "'Noto Sans JP'", outline: 'none',
    transition: 'border-color 0.2s', marginBottom: 0,
    boxSizing: 'border-box', background: C.white,
  }

  const btnStyle = {
    width: '100%', padding: '12px', borderRadius: 8, border: 'none',
    cursor: loading ? 'not-allowed' : 'pointer',
    background: `linear-gradient(135deg, ${C.gold}, #a8883a)`,
    color: C.white, fontSize: 14, fontWeight: 700, fontFamily: "'Noto Sans JP'",
    letterSpacing: 1, opacity: loading ? 0.6 : 1,
  }

  const errBlock = error && (
    <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: '#fff0f0', border: '1px solid #ffcccc', fontSize: 12, color: '#c0392b' }}>
      {error}
    </div>
  )

  const labelStyle = { fontSize: 11, fontWeight: 600, color: C.navy, marginBottom: 5, letterSpacing: 1 }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(160deg, ${C.navyDeep} 0%, ${C.navy} 35%, #0553A1 60%, ${C.navyLight} 100%)`,
      fontFamily: "'Noto Sans JP', sans-serif", position: 'relative', overflow: 'hidden', padding: '20px',
    }}>
      <div style={{ position: 'fixed', top: -80, right: -80, width: 300, height: 300, borderRadius: '50%', background: C.gold + '12' }} />
      <div style={{ position: 'fixed', bottom: -60, left: -60, width: 200, height: 200, borderRadius: '50%', background: C.gold + '08' }} />

      <div style={{
        background: C.white, borderRadius: 20,
        padding: '40px 40px 32px',
        width: 380, maxWidth: '100%',
        boxShadow: '0 16px 64px rgba(0,0,0,0.35)', position: 'relative', zIndex: 1,
        borderTop: '4px solid ' + C.gold,
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
                パスワード<span style={{ color: '#e74c3c', marginLeft: 2 }}>*</span>
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="off"
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = C.gold}
                onBlur={e => e.target.style.borderColor = C.border}
              />
            </div>

            <div style={{ textAlign: 'right', marginBottom: 16, marginTop: 6 }}>
              <span
                onClick={() => { setMode('forgot'); setError('') }}
                style={{ fontSize: 11, color: C.gold, cursor: 'pointer', textDecoration: 'underline' }}
              >
                パスワードを忘れた方はこちら
              </span>
            </div>

            {errBlock}
            <button type="submit" disabled={loading} style={btnStyle}>
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        )}

        {/* ── パスワードリセット ── */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword}>
            <div style={{ fontSize: 13, color: C.textLight, marginBottom: 20, lineHeight: 1.8 }}>
              氏名を選択してください。<br />パスワード再設定のリンクをお送りします。
            </div>
            <MemberNameSelect
              members={members}
              selected={resetSelected}
              onSelect={(m) => { setResetSelected(m); setError('') }}
            />
            {errBlock}
            <button type="submit" disabled={loading} style={btnStyle}>
              {loading ? '送信中...' : '再設定メールを送る'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <span
                onClick={() => { setMode('login'); setError('') }}
                style={{ fontSize: 12, color: C.gold, cursor: 'pointer', textDecoration: 'underline' }}
              >
                ログインに戻る
              </span>
            </div>
          </form>
        )}

        {mode === 'forgotSent' && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.navy, marginBottom: 12 }}>メールを送信しました</div>
            <div style={{ fontSize: 13, color: C.textLight, lineHeight: 1.8, marginBottom: 24 }}>
              {resetSelected?.name} 宛に<br />パスワード再設定のリンクを送りました。<br />メールをご確認ください。
            </div>
            <span
              onClick={() => { setMode('login'); setError('') }}
              style={{ fontSize: 12, color: C.gold, cursor: 'pointer', textDecoration: 'underline' }}
            >
              ログインに戻る
            </span>
          </div>
        )}

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 9, color: C.textLight, letterSpacing: 1 }}>
          © 2026 M&A Sourcing Partners Co., Ltd.
        </div>
      </div>
    </div>
  )
}
