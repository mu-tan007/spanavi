import { useAuth } from './hooks/useAuth'
import { useSpanaviData } from './hooks/useSpanaviData'
import LoginPage from './components/LoginPage'
import ResetPasswordPage from './components/ResetPasswordPage'
import SpanaviApp from './components/SpanaviApp'
import ClientLoginPage from './components/client/ClientLoginPage'
import ClientPortalApp from './components/client/ClientPortalApp'
import SpacareerClientApp from './components/spacareer/client/SpacareerClientApp'
import SpacareerLoginPage from './components/spacareer/client/SpacareerLoginPage'
import DesignPreview from './components/views/DesignPreview'
import { useState, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import {
  readClientAdminBackup,
  readSpacareerAdminBackup,
  clearClientAdminBackup,
  clearSpacareerAdminBackup,
} from './lib/adminBackup'

function MainApp() {
  const { session, profile, loading, signOut, isAdmin, isStudent, recoveryMode, clearRecoveryMode, orgId } = useAuth()
  const { data: supabaseData, loading: dataLoading, error: dataError, refetch: onDataRefetch } = useSpanaviData(orgId)
  const location = useLocation()

  // プロフィール取得タイムアウト（10秒待ってもorgIdが取れない場合はエラー表示）
  const [profileTimeout, setProfileTimeout] = useState(false)
  const profileTimeoutRef = useRef(null)
  useEffect(() => {
    if (!loading && session && !orgId) {
      profileTimeoutRef.current = setTimeout(() => setProfileTimeout(true), 10000)
    } else {
      clearTimeout(profileTimeoutRef.current)
      setProfileTimeout(false)
    }
    return () => clearTimeout(profileTimeoutRef.current)
  }, [loading, session, orgId])

  // 代理ログイン戻し忘れの自動復元:
  //   代理ログイン（営業代行クライアント / スパキャリ受講生 共通）は magic link を
  //   新タブで開く実装のため、Supabase クライアントが localStorage の auth トークンを
  //   新セッションで上書きする。元タブを後で操作すると、本来の管理者が
  //   「クライアント」「受講生」として認識され、強制リダイレクトで /client や
  //   /spacareer に飛ばされる事故が起きる（小山さんが /dashboard を開くと
  //   スパキャリ受講生画面に飛ぶ現象の原因）。
  //   ここで「現セッションが student/client かつ管理者バックアップが残っている」
  //   = 戻し忘れ ケースを検知し、退避してあった管理者セッションを自動復元する。
  const inClientArea = location.pathname.startsWith('/client')
  const inSpacareerArea = location.pathname.startsWith('/spacareer')
  const isClientRole = session?.user?.user_metadata?.role === 'client'
  const needRestoreSpacareer = !loading && !!session && isStudent && !inSpacareerArea
    && !!readSpacareerAdminBackup()
  const needRestoreClient = !loading && !!session && isClientRole && !inClientArea
    && !!readClientAdminBackup()
  const needAutoRestore = needRestoreSpacareer || needRestoreClient

  useEffect(() => {
    if (!needAutoRestore) return
    let cancelled = false
    ;(async () => {
      try {
        const backup = needRestoreSpacareer
          ? readSpacareerAdminBackup()
          : readClientAdminBackup()
        if (!backup) return
        // ループ防止: setSession 前に backup を消す（失敗時も再発火させない）
        if (needRestoreSpacareer) clearSpacareerAdminBackup()
        else clearClientAdminBackup()
        const { error } = await supabase.auth.setSession({
          access_token: backup.access_token,
          refresh_token: backup.refresh_token,
        })
        if (cancelled) return
        if (error) {
          console.warn('[App] Auto-restore admin session failed:', error)
          return
        }
        // セッション差し替え後はフルリロードして再ブートストラップ
        window.location.href = '/dashboard'
      } catch (e) {
        console.error('[App] Auto-restore error:', e)
      }
    })()
    return () => { cancelled = true }
  }, [needAutoRestore, needRestoreSpacareer])

  // パスワードリカバリーモード（profile取得より優先：新規招待ユーザーはusers/membersがRLSで引けずprofileがnullのままになるため、
  // この判定を下に置くと「アカウント情報取得失敗」画面にリダイレクトされてパスワード再設定に辿り着けない）
  if (recoveryMode && session) {
    return <ResetPasswordPage onComplete={clearRecoveryMode} />
  }

  // 代理ログイン戻し忘れの自動復元中（useEffect 側で setSession → /dashboard へリロード）
  if (needAutoRestore) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg,#1456C7 0%,#1E3A8A 30%,#0D2247 60%,#081636 100%)',
        fontFamily: "'Noto Sans JP', sans-serif",
      }}>
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, letterSpacing: 2 }}>
          社内アカウントに復帰中…
        </p>
      </div>
    )
  }

  // クライアント・ロールは members プロフィールを持たない → 先に /client へ逃がす
  // (これを profile チェックより前に置かないと「アカウント情報取得失敗」画面に吸われてしまう)
  if (!loading && session && session.user?.user_metadata?.role === 'client') {
    return <Navigate to="/client" replace />
  }

  // スパキャリ受講生（members.rank='student'）はクライアントポータルへ強制ルーティング
  // 仕様書: tasks/spacareer-spec.md §3.1 - 事業切替UIを通さない
  // ※既に /spacareer 配下にいる場合は Navigate しない（Routes に流して SpacareerClientApp を描画させる）
  if (!loading && session && isStudent && !location.pathname.startsWith('/spacareer')) {
    return <Navigate to="/spacareer" replace />
  }

  // セッションはあるがプロフィール取得に失敗した場合 → ログイン画面に戻す
  if ((!loading && session && !profile) || profileTimeout) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg,#1456C7 0%,#1E3A8A 30%,#0D2247 60%,#081636 100%)', fontFamily: "'Noto Sans JP', sans-serif",
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#c0392b', fontSize: 14, marginBottom: 16 }}>アカウント情報の取得に失敗しました。再ログインしてください。</p>
          <button onClick={async () => { try { await signOut() } catch {} window.location.reload(); }} style={{ padding: '8px 20px', borderRadius: 6, background: '#0176D3', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: "'Noto Sans JP', sans-serif" }}>
            ログイン画面に戻る
          </button>
        </div>
      </div>
    )
  }

  // ローディング中（auth完了 + orgId確定 + データ取得完了 まで待つ）
  // profileキャッシュはあるがsession未確定の場合もローディング表示（ログイン画面フラッシュ防止）
  if (loading || (session && !orgId) || dataLoading || (!session && profile)) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg,#1456C7 0%,#1E3A8A 30%,#0D2247 60%,#081636 100%)', fontFamily: "'Noto Sans JP', sans-serif",
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
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, letterSpacing: 2, animation: 'fadeInText 1.5s ease-out' }}>読み込み中...</p>
        </div>
      </div>
    )
  }

  // 未ログイン → ログインページへリダイレクト
  if (!session) {
    return <Navigate to="/login" replace />
  }

  // Supabase fetch 失敗
  if (dataError && !supabaseData) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#1456C7 0%,#1E3A8A 30%,#0D2247 60%,#081636 100%)', fontFamily: "'Noto Sans JP', sans-serif" }}>
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
  // signOut() が auth トークンを消す。他の localStorage は次回ログインで再利用するので残す。
  const handleLogout = async () => {
    try {
      await signOut()
    } catch (e) {
      console.error('Logout error:', e)
    }
    window.location.reload()
  }

  return (
    <SpanaviApp
      userName={profile?.name || session.user.user_metadata?.name || '不明'}
      userId={session.user.id}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      supabaseData={supabaseData}
      onDataRefetch={onDataRefetch}
      orgId={orgId}
    />
  )
}

export default function App() {
  // パスワードリカバリーは全ルートに優先
  // (Supabase recovery メールは Site URL "/" に着地するため、ルート要素より先に recoveryMode を捕捉する必要がある)
  const { recoveryMode, session, clearRecoveryMode } = useAuth()
  if (recoveryMode && session) {
    return <ResetPasswordPage onComplete={() => {
      clearRecoveryMode()
      window.location.href = '/login'
    }} />
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/design-preview" element={<DesignPreview />} />
      <Route path="/client/login" element={<ClientLoginPage />} />
      <Route path="/client/*" element={<ClientPortalApp />} />
      <Route path="/spacareer/login" element={<SpacareerLoginPage />} />
      <Route path="/spacareer/*" element={<SpacareerClientApp />} />
      <Route path="/*" element={<MainApp />} />
    </Routes>
  )
}
