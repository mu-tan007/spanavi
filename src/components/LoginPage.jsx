import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

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

function ShieldLogo() {
  return (
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
  )
}

function InputField({ label, type = 'text', value, onChange, placeholder, required, autoComplete }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.navy, marginBottom: 5, letterSpacing: 1 }}>
        {label}{required && <span style={{ color: '#e74c3c', marginLeft: 2 }}>*</span>}
      </div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8,
          border: `2px solid ${focused ? C.gold : C.border}`, fontSize: 13,
          fontFamily: "'Noto Sans JP'", outline: 'none',
          transition: 'border-color 0.2s', boxSizing: 'border-box',
          background: C.white,
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  )
}

function SelectField({ label, value, onChange, options, required }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.navy, marginBottom: 5, letterSpacing: 1 }}>
        {label}{required && <span style={{ color: '#e74c3c', marginLeft: 2 }}>*</span>}
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8,
          border: `2px solid ${focused ? C.gold : C.border}`, fontSize: 13,
          fontFamily: "'Noto Sans JP'", outline: 'none',
          transition: 'border-color 0.2s', boxSizing: 'border-box',
          background: C.white, cursor: 'pointer', color: C.navy,
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <option value="" style={{ color: C.navy }}>選択してください</option>
        {options.map(o => <option key={o} value={o} style={{ color: C.navy }}>{o}</option>)}
      </select>
    </div>
  )
}

function AutocompleteField({ label, value, onChange, candidates }) {
  const [focused, setFocused] = useState(false)
  const [showList, setShowList] = useState(false)
  const wrapperRef = useRef(null)

  const filtered = value.length > 0
    ? candidates.filter(c => c.includes(value) && c !== value)
    : []

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowList(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div style={{ marginBottom: 14, position: 'relative' }} ref={wrapperRef}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.navy, marginBottom: 5, letterSpacing: 1 }}>
        {label}
      </div>
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setShowList(true) }}
        placeholder="名前を入力..."
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
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: 160, overflowY: 'auto',
        }}>
          <div
            onMouseDown={() => { onChange(''); setShowList(false) }}
            style={{ padding: '8px 12px', fontSize: 13, color: C.textLight, cursor: 'pointer', borderBottom: '1px solid ' + C.borderLight }}
          >
            （なし）
          </div>
          {filtered.map(name => (
            <div
              key={name}
              onMouseDown={() => { onChange(name); setShowList(false) }}
              style={{ padding: '8px 12px', fontSize: 13, color: C.navy, cursor: 'pointer', borderBottom: '1px solid ' + C.borderLight }}
              onMouseEnter={e => e.currentTarget.style.background = '#f5f0e8'}
              onMouseLeave={e => e.currentTarget.style.background = C.white}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function LoginPage() {
  const { signIn } = useAuth()
  const [mode, setMode] = useState('login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [signupEmail, setSignupEmail] = useState('')
  const [name, setName] = useState('')
  const [university, setUniversity] = useState('')
  const [grade, setGrade] = useState('')
  const [team, setTeam] = useState('')
  const [startDate, setStartDate] = useState('')
  const [operationStartDate, setOperationStartDate] = useState('')
  const [referrerName, setReferrerName] = useState('')

  const [resetEmail, setResetEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [teams, setTeams] = useState([])
  const [memberNames, setMemberNames] = useState([])

  useEffect(() => {
    const fetchMasterData = async () => {
      const { data: teamsData } = await supabase.from('teams').select('name').order('name')
      if (teamsData) setTeams(teamsData.map(t => t.name))

      const { data: membersData } = await supabase
        .from('members').select('name').eq('is_active', true).order('sort_order')
      if (membersData) setMemberNames(membersData.map(m => m.name).filter(Boolean))
    }
    fetchMasterData()
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'メールアドレスまたはパスワードが正しくありません' : err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    setError('')
    if (!team) { setError('チームを選択してください'); return }
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.signUp({
        email: signupEmail, password: 'masp2026',
        options: { data: { name, university, grade: grade ? parseInt(grade) : null, team, start_date: startDate || null, operation_start_date: operationStartDate || null, referrer_name: referrerName || null } }
      })
      if (err) throw err
      setMode('success')
    } catch (err) {
      setError(err.message === 'User already registered' ? 'このメールアドレスは既に登録されています' : err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail)
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
    transition: 'border-color 0.2s', marginBottom: 14,
    boxSizing: 'border-box',
  }

  const btnStyle = {
    width: '100%', padding: '12px', borderRadius: 8, border: 'none',
    cursor: loading ? 'not-allowed' : 'pointer',
    background: `linear-gradient(135deg, ${C.gold}, #a8883a)`,
    color: C.white, fontSize: 14, fontWeight: 700, fontFamily: "'Noto Sans JP'",
    letterSpacing: 1, opacity: loading ? 0.6 : 1,
  }

  const errBlock = error && (
    <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 8, background: '#fff0f0', border: '1px solid #ffcccc', fontSize: 12, color: '#c0392b' }}>{error}</div>
  )

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(160deg, ${C.navyDeep} 0%, ${C.navy} 35%, #2a5d8f 60%, ${C.navyLight} 100%)`,
      fontFamily: "'Noto Sans JP', sans-serif", position: 'relative', overflow: 'hidden', padding: '20px',
    }}>
      <div style={{ position: 'fixed', top: -80, right: -80, width: 300, height: 300, borderRadius: '50%', background: C.gold + '12' }}></div>
      <div style={{ position: 'fixed', bottom: -60, left: -60, width: 200, height: 200, borderRadius: '50%', background: C.gold + '08' }}></div>

      <div style={{
        background: C.white, borderRadius: 20,
        padding: mode === 'signup' ? '32px 36px 28px' : '40px 40px 32px',
        width: mode === 'signup' ? 500 : 380, maxWidth: '100%',
        boxShadow: '0 16px 64px rgba(0,0,0,0.35)', position: 'relative', zIndex: 1,
        borderTop: '4px solid ' + C.gold,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <ShieldLogo />
          <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: 2, color: C.navy }}>
            Spa<span style={{ background: 'linear-gradient(180deg, #c6a358, #a8883a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>navi</span>
          </div>
        </div>

        {(mode === 'login' || mode === 'signup') && (
          <div style={{ display: 'flex', marginBottom: 24, borderRadius: 10, overflow: 'hidden', border: '2px solid ' + C.borderLight }}>
            {['login', 'signup'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError('') }} style={{
                flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
                background: mode === m ? `linear-gradient(135deg, ${C.gold}, #a8883a)` : C.white,
                color: mode === m ? C.white : C.textLight,
                fontSize: 13, fontWeight: 700, fontFamily: "'Noto Sans JP'", letterSpacing: 1,
              }}>
                {m === 'login' ? 'ログイン' : '新規登録'}
              </button>
            ))}
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.navy, marginBottom: 6, letterSpacing: 1 }}>メールアドレス</div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" required autoComplete="email" style={inputStyle}
              onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
            <div style={{ fontSize: 11, fontWeight: 600, color: C.navy, marginBottom: 6, letterSpacing: 1 }}>パスワード</div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password"
              style={{ ...inputStyle, marginBottom: 4 }}
              onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
            <div style={{ textAlign: 'right', marginBottom: 12 }}>
              <span onClick={() => { setMode('forgot'); setError('') }} style={{ fontSize: 11, color: C.gold, cursor: 'pointer', textDecoration: 'underline' }}>
                パスワードを忘れた方はこちら
              </span>
            </div>
            {errBlock}
            <button type="submit" disabled={loading} style={btnStyle}>{loading ? 'ログイン中...' : 'ログイン'}</button>
          </form>
        )}

        {mode === 'signup' && (
          <form onSubmit={handleSignup}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <div>
                <InputField label="氏名" value={name} onChange={setName} placeholder="篠宮 拓武" required />
                <InputField label="大学名" value={university} onChange={setUniversity} placeholder="早稲田大学" required />
                <SelectField label="学年" value={grade} onChange={setGrade} options={['1', '2', '3', '4', '5', '6']} required />
                <InputField label="メールアドレス" type="email" value={signupEmail} onChange={setSignupEmail} placeholder="email@example.com" required autoComplete="email" />
              </div>
              <div>
                <InputField label="入社日" type="date" value={startDate} onChange={setStartDate} />
                <InputField label="稼働開始日" type="date" value={operationStartDate} onChange={setOperationStartDate} />
                <SelectField label="チーム" value={team} onChange={setTeam} options={teams} required />
                <AutocompleteField label="紹介者" value={referrerName} onChange={setReferrerName} candidates={memberNames} />
              </div>
            </div>
            {errBlock}
            <button type="submit" disabled={loading} style={btnStyle}>{loading ? '登録中...' : '登録する'}</button>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword}>
            <div style={{ fontSize: 13, color: C.textLight, marginBottom: 20, lineHeight: 1.8 }}>
              登録済みのメールアドレスを入力してください。<br />パスワード再設定のリンクをお送りします。
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.navy, marginBottom: 6, letterSpacing: 1 }}>メールアドレス</div>
            <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="email@example.com" required style={inputStyle}
              onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
            {errBlock}
            <button type="submit" disabled={loading} style={btnStyle}>{loading ? '送信中...' : '再設定メールを送る'}</button>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <span onClick={() => { setMode('login'); setError('') }} style={{ fontSize: 12, color: C.gold, cursor: 'pointer', textDecoration: 'underline' }}>
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
              {resetEmail} に<br />パスワード再設定のリンクを送りました。<br />メールをご確認ください。
            </div>
            <span onClick={() => { setMode('login'); setError('') }} style={{ fontSize: 12, color: C.gold, cursor: 'pointer', textDecoration: 'underline' }}>
              ログインに戻る
            </span>
          </div>
        )}

        {mode === 'success' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 12 }}>登録完了！</div>
            <div style={{ fontSize: 13, color: C.textLight, lineHeight: 1.8, marginBottom: 24 }}>
              確認メールを送信しました。<br />メール内のリンクをクリックして<br />アカウントを有効化してください。
            </div>
            <button onClick={() => setMode('login')} style={{ padding: '10px 32px', borderRadius: 8, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${C.gold}, #a8883a)`, color: C.white, fontSize: 13, fontWeight: 700, fontFamily: "'Noto Sans JP'" }}>
              ログイン画面へ
            </button>
          </div>
        )}

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 9, color: C.textLight, letterSpacing: 1 }}>
          © 2026 M&A Sourcing Partners Co., Ltd.
        </div>
      </div>
    </div>
  )
}
