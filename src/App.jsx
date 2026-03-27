import { useAuth } from './hooks/useAuth'
import { useSpanaviData } from './hooks/useSpanaviData'
import LoginPage from './components/LoginPage'
import ResetPasswordPage from './components/ResetPasswordPage'
import SpanaviApp from './components/SpanaviApp'
import SignupPage from './components/public/SignupPage'
import SignupCompletePage from './components/public/SignupCompletePage'
import SignupCanceledPage from './components/public/SignupCanceledPage'
import SubscriptionGuard from './components/common/SubscriptionGuard'
import { useEffect, useRef } from 'react'
import { Routes, Route } from 'react-router-dom'

function MainApp() {
  const { session, profile, loading, signOut, isAdmin, recoveryMode, clearRecoveryMode, orgId } = useAuth()
  const { data: supabaseData, loading: dataLoading, error: dataError, refetch: onDataRefetch } = useSpanaviData(orgId)

  // ローディング中（auth完了 + orgId確定 + データ取得完了 まで待つ）
  if (loading || (session && !orgId) || dataLoading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f5f0e8', fontFamily: "'Noto Sans JP', sans-serif",
      }}>
        <div style={{ textAlign: 'center' }}>
          <style>{`
            @keyframes rayPulse1 { 0%, 100% { opacity: 0.15; } 50% { opacity: 0.55; } }
            @keyframes rayPulse2 { 0%, 100% { opacity: 0.10; } 50% { opacity: 0.40; } }
            @keyframes shieldGlow { 0%, 100% { filter: drop-shadow(0 0 6px rgba(200,164,90,0.2)); } 50% { filter: drop-shadow(0 0 18px rgba(200,164,90,0.5)); } }
            @keyframes fadeInText { 0%, 40% { opacity: 0; } 100% { opacity: 1; } }
          `}</style>
          <svg width="72" height="82" viewBox="0 0 52 60" style={{ marginBottom: 20, animation: 'shieldGlow 2s ease-in-out infinite' }}>
            <defs>
              <linearGradient id="spShieldLoad" x1="0" y1="0" x2="0.3" y2="1">
                <stop offset="0%" stopColor="#0176D3"/>
                <stop offset="100%" stopColor="#032D60"/>
              </linearGradient>
              <clipPath id="shieldClipLoad"><path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z"/></clipPath>
            </defs>
            <path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z" fill="url(#spShieldLoad)"/>
            <g clipPath="url(#shieldClipLoad)" stroke="white" fill="none">
              <g strokeWidth="1.2" style={{ animation: 'rayPulse1 2s ease-in-out infinite' }}>
                <line x1="26" y1="30" x2="26" y2="-5"/><line x1="26" y1="30" x2="55" y2="30"/>
                <line x1="26" y1="30" x2="26" y2="65"/><line x1="26" y1="30" x2="-3" y2="30"/>
                <line x1="26" y1="30" x2="47" y2="5"/><line x1="26" y1="30" x2="47" y2="55"/>
                <line x1="26" y1="30" x2="5" y2="55"/><line x1="26" y1="30" x2="5" y2="5"/>
              </g>
              <g strokeWidth="0.8" style={{ animation: 'rayPulse2 2s ease-in-out infinite 0.3s' }}>
                <line x1="26" y1="30" x2="37" y2="-2"/><line x1="26" y1="30" x2="53" y2="16"/>
                <line x1="26" y1="30" x2="53" y2="44"/><line x1="26" y1="30" x2="37" y2="62"/>
                <line x1="26" y1="30" x2="15" y2="62"/><line x1="26" y1="30" x2="-1" y2="44"/>
                <line x1="26" y1="30" x2="-1" y2="16"/><line x1="26" y1="30" x2="15" y2="-2"/>
              </g>
            </g>
          </svg>
          <p style={{ color: '#8896a6', fontSize: 12, letterSpacing: 2, animation: 'fadeInText 1.5s ease-out' }}>読み込み中...</p>
        </div>
      </div>
    )
  }

  // パスワードリカバリーモード
  if (recoveryMode && session) {
    return <ResetPasswordPage onComplete={clearRecoveryMode} />
  }

  // 未ログイン
  if (!session) {
    return <LoginPage />
  }

  // Supabase fetch 失敗
  if (dataError && !supabaseData) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f0e8', fontFamily: "'Noto Sans JP', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#c0392b', fontSize: 14, marginBottom: 16 }}>データの読み込みに失敗しました。リロードしてください。</p>
          <button onClick={() => window.location.reload()} style={{ padding: '8px 20px', borderRadius: 6, background: '#0176D3', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: "'Noto Sans JP', sans-serif" }}>
            リロード
          </button>
        </div>
      </div>
    )
  }

  // ログイン済み → 元のSpanaviをそのまま表示
  const handleLogout = async () => {
    try {
      await signOut()
    } catch (e) {
      console.error('Logout error:', e)
    }
    localStorage.clear()
    window.location.reload()
  }

  return (
    <SubscriptionGuard>
      <SpanaviApp
        userName={profile?.name || session.user.user_metadata?.name || '不明'}
        userId={session.user.id}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        supabaseData={supabaseData}
        onDataRefetch={onDataRefetch}
        orgId={orgId}
      />
    </SubscriptionGuard>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/signup/complete" element={<SignupCompletePage />} />
      <Route path="/signup/canceled" element={<SignupCanceledPage />} />
      <Route path="/*" element={<MainApp />} />
    </Routes>
  )
}
