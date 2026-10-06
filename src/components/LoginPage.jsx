import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { ShieldMark } from './common/ShieldMark'
import { useIsMobile } from '../hooks/useIsMobile'
import './LoginPage.css'

// 社内ログイン。メールアドレス＋パスワードだけ（氏名から選ぶログインは 2026-10-07 に廃止）。
// 盾は SpanaviLogo をそのまま使い、透かしもロゴと同じ座標で描く。

const OUTFIT_URL = 'https://fonts.googleapis.com/css2?family=Outfit:wght@800&display=swap'
const SHIELD_PATH = 'M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z'
// SpanaviLogo と同じ放射線（中心 26,30・太線8本＋細線8本）
const RAYS_BOLD = [[26, -5], [55, 30], [26, 65], [-3, 30], [47, 5], [47, 55], [5, 55], [5, 5]]
const RAYS_THIN = [[37, -2], [53, 16], [53, 44], [37, 62], [15, 62], [-1, 44], [-1, 16], [15, -2]]

function Watermark() {
  return (
    <svg className="lg-watermark" viewBox="0 0 52 60" aria-hidden="true">
      <defs><clipPath id="lgWmClip"><path d={SHIELD_PATH} /></clipPath></defs>
      <path d={SHIELD_PATH} fill="none" stroke="#032D60" strokeWidth="0.6" />
      <g clipPath="url(#lgWmClip)" stroke="#032D60" fill="none">
        <g strokeWidth="0.6">{RAYS_BOLD.map(([x, y]) => <line key={`b${x},${y}`} x1="26" y1="30" x2={x} y2={y} />)}</g>
        <g strokeWidth="0.4" opacity="0.7">{RAYS_THIN.map(([x, y]) => <line key={`t${x},${y}`} x1="26" y1="30" x2={x} y2={y} />)}</g>
      </g>
    </svg>
  )
}

function HeroLines({ isMobile }) {
  const v = isMobile ? 5 : 9
  const h = isMobile ? 2 : 4
  return (
    <div className="lg-lines" aria-hidden="true">
      {Array.from({ length: v }, (_, i) => (
        <i key={`v${i}`} className="v" style={{ left: `${8 + i * (88 / v)}%`, animationDelay: `${-i * 1.3}s`, animationDuration: `${8 + (i % 3) * 2}s` }} />
      ))}
      {Array.from({ length: h }, (_, i) => (
        <i key={`h${i}`} className="h" style={{ top: `${18 + i * 20}%`, animationDelay: `${-i * 3}s` }} />
      ))}
    </div>
  )
}

export default function LoginPage() {
  const { signIn, session } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  // view: 'login' | 'forgot' | 'sent'
  const [view, setView] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [caps, setCaps] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [error, setError] = useState('')
  const [badField, setBadField] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)
  const doneRef = useRef(false)

  // ログイン済みならアプリへ（ログイン直後は盾の動きを見せてから移る）
  useEffect(() => {
    if (session && !doneRef.current) navigate('/dashboard', { replace: true })
  }, [session, navigate])

  const fail = (msg, field) => {
    setError(msg)
    setBadField(field || '')
    setShakeKey(k => k + 1)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (loading || done) return
    if (!email.trim()) return fail('メールアドレスを入れてください', 'email')
    if (!password) return fail('パスワードを入れてください', 'password')
    setError(''); setBadField('')
    setLoading(true)
    doneRef.current = true
    try {
      await signIn(email.trim(), password)
      setDone(true)
      setTimeout(() => navigate('/dashboard', { replace: true }), 650)
    } catch {
      doneRef.current = false
      fail('メールアドレスかパスワードが違います', 'password')
    } finally {
      setLoading(false)
    }
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    if (loading) return
    if (!/.+@.+\..+/.test(resetEmail.trim())) return fail('メールアドレスを正しく入れてください', 'reset')
    setError(''); setBadField('')
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail.trim())
      if (err) throw err
      setView('sent')
    } catch (err) {
      fail(err.message || '送れませんでした。時間をおいてお試しください', 'reset')
    } finally {
      setLoading(false)
    }
  }

  const go = (to) => {
    setError(''); setBadField('')
    if (to === 'forgot' && !resetEmail) setResetEmail(email)
    setView(to)
  }

  const order = ['login', 'forgot', 'sent']
  const pos = (v) => (v === view ? 'is-on' : order.indexOf(v) < order.indexOf(view) ? 'is-left' : 'is-right')
  const onCaps = (e) => setCaps(!!(e.getModifierState && e.getModifierState('CapsLock')))

  const btnInner = (label) => (loading
    ? <span className="lg-dots"><i /><i /><i /></span>
    : label)

  return (
    <div className={`lg${done ? ' is-done' : ''}`}>
      <link href={OUTFIT_URL} rel="stylesheet" />
      <div className="lg-hero">
        <HeroLines isMobile={isMobile} />
        <div className="lg-emblem">
          <ShieldMark size={isMobile ? 72 : 150} calm uid="login" />
          <div className="lg-word"><span className="a">Spa</span><span className="b">navi</span></div>
        </div>
      </div>

      <div className="lg-panel">
        <Watermark />
        <div className="lg-sheet">
          <div className="lg-wrap">

            {/* ログイン */}
            <form className={`lg-view ${pos('login')}`} onSubmit={handleLogin} aria-hidden={view !== 'login'} noValidate>
              <div key={`s${shakeKey}`} className={shakeKey && view === 'login' ? 'lg-shake' : ''}>
                <h1 className="lg-title">ログイン</h1>
                <p className="lg-sub">メールアドレスとパスワードを入れてください</p>
                <div className="lg-field">
                  <label className="lg-label" htmlFor="lg-email">メールアドレス</label>
                  <input id="lg-email" className={`lg-input${badField === 'email' ? ' is-bad' : ''}`} type="email" autoComplete="username"
                    placeholder="name@example.com" value={email} autoFocus={!isMobile}
                    onChange={e => { setEmail(e.target.value); if (badField === 'email') setBadField('') }} tabIndex={view === 'login' ? 0 : -1} />
                </div>
                <div className="lg-field">
                  <label className="lg-label" htmlFor="lg-pw"><span>パスワード</span>
                    <button type="button" className="lg-link" onClick={() => go('forgot')} tabIndex={view === 'login' ? 0 : -1}>お忘れの方</button></label>
                  <div className="lg-pw">
                    <input id="lg-pw" className={`lg-input${badField === 'password' ? ' is-bad' : ''}`} type={showPw ? 'text' : 'password'}
                      autoComplete="current-password" placeholder="••••••••" value={password}
                      onChange={e => { setPassword(e.target.value); if (badField === 'password') setBadField('') }}
                      onKeyUp={onCaps} onKeyDown={onCaps} tabIndex={view === 'login' ? 0 : -1} />
                    <button type="button" className="lg-eye" onClick={() => setShowPw(s => !s)} tabIndex={view === 'login' ? 0 : -1}>{showPw ? '隠す' : '表示'}</button>
                  </div>
                  {caps && <div className="lg-caps">Caps Lock がオンになっています</div>}
                </div>
                <button type="submit" className={`lg-btn${done ? ' is-done' : ''}`} disabled={loading || done} tabIndex={view === 'login' ? 0 : -1}>
                  {done ? 'ようこそ' : btnInner('ログイン')}
                </button>
                <div className="lg-err" role="alert">{view === 'login' ? error : ''}</div>
              </div>
            </form>

            {/* パスワードの再設定 */}
            <form className={`lg-view ${pos('forgot')}`} onSubmit={handleForgot} aria-hidden={view !== 'forgot'} noValidate>
              <h1 className="lg-title">パスワードの再設定</h1>
              <p className="lg-sub">登録しているメールアドレスに、再設定のリンクをお送りします</p>
              <div className="lg-field">
                <label className="lg-label" htmlFor="lg-reset">メールアドレス</label>
                <input id="lg-reset" className={`lg-input${badField === 'reset' ? ' is-bad' : ''}`} type="email" placeholder="name@example.com"
                  value={resetEmail} onChange={e => { setResetEmail(e.target.value); if (badField === 'reset') setBadField('') }} tabIndex={view === 'forgot' ? 0 : -1} />
              </div>
              <button type="submit" className="lg-btn" disabled={loading} tabIndex={view === 'forgot' ? 0 : -1}>{btnInner('再設定メールを送る')}</button>
              <div className="lg-err" role="alert">{view === 'forgot' ? error : ''}</div>
              <div className="lg-alt"><button type="button" className="lg-link" onClick={() => go('login')} tabIndex={view === 'forgot' ? 0 : -1}>← ログインに戻る</button></div>
            </form>

            {/* 送信済み */}
            <div className={`lg-view ${pos('sent')}`} aria-hidden={view !== 'sent'}>
              <div className="lg-sent">
                <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="32" /><path d="M20 33l8 8 16-17" /></svg>
                <h1 className="lg-title">メールを送りました</h1>
                <p className="lg-sub">{resetEmail} に再設定のリンクをお送りしました。届かないときは迷惑メールもご確認ください。</p>
                <div className="lg-alt"><button type="button" className="lg-btn lg-btn-sub" onClick={() => go('login')} tabIndex={view === 'sent' ? 0 : -1}>ログインに戻る</button></div>
              </div>
            </div>

          </div>
        </div>
        <div className="lg-foot">© {new Date().getFullYear()} Spanavi</div>
      </div>
    </div>
  )
}
