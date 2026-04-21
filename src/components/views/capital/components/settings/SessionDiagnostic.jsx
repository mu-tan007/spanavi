import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { hardSessionReset } from '../../lib/invokeFn'

// セッション状態診断パネル
export default function SessionDiagnostic() {
  const [session, setSession] = useState(null)
  const [claims, setClaims] = useState(null)
  const [userCheck, setUserCheck] = useState(null)
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setLoading(true)
    const { data: { session: s } } = await supabase.auth.getSession()
    setSession(s)
    if (s?.access_token) {
      try {
        const parts = s.access_token.split('.')
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
        setClaims(payload)
      } catch { setClaims(null) }
    }
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      setUserCheck({ ok: !!user && !error, email: user?.email, errorMsg: error?.message })
    } catch (e) {
      setUserCheck({ ok: false, errorMsg: e.message })
    }
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  async function forceRefresh() {
    setLoading(true)
    const { data, error } = await supabase.auth.refreshSession()
    if (error) alert('refresh失敗: ' + error.message)
    await refresh()
  }

  async function fullReset() {
    if (!confirm('Supabase認証情報を全てクリアして/loginに移動します。よろしいですか？')) return
    await hardSessionReset()
    window.location.href = '/login'
  }

  const expiresAt = claims?.exp ? new Date(claims.exp * 1000) : null
  const expiresIn = expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / 60000) : null

  return (
    <div style={{ fontSize: 12, color: '#FFFFFF', lineHeight: 1.9 }}>
      {loading ? <div style={{ color: '#A0A0A0' }}>確認中…</div> : (
        <>
          <Row label="セッション">{session ? '✓ あり' : '✗ なし'}</Row>
          {session && (
            <>
              <Row label="JWT User ID">{claims?.sub || '—'}</Row>
              <Row label="Email">{session?.user?.email || '—'}</Row>
              <Row label="JWT role">{claims?.role || '—'}</Row>
              <Row label="JWT プロジェクト">{claims?.ref || '—'}</Row>
              <Row label="有効期限">
                {expiresAt ? expiresAt.toLocaleString('ja-JP') : '—'}
                {expiresIn != null && (
                  <span style={{ color: expiresIn < 5 ? '#EA001E' : expiresIn < 30 ? '#C8A84B' : '#2E844A', marginLeft: 8, fontSize: 11 }}>
                    (残り {expiresIn}分)
                  </span>
                )}
              </Row>
              <Row label="auth.getUser() 検証">
                {userCheck?.ok ? '✓ 有効' : `✗ 無効 ${userCheck?.errorMsg || ''}`}
              </Row>
            </>
          )}
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button onClick={refresh} style={btn()}>再診断</button>
            <button onClick={forceRefresh} style={btn()}>強制リフレッシュ</button>
            <button onClick={fullReset} style={btn('#EA001E')}>完全リセット (再ログイン)</button>
          </div>
        </>
      )}
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', padding: '6px 0', borderBottom: '0.5px solid #f0f2f5' }}>
      <div style={{ width: 180, color: '#706E6B', fontSize: 11 }}>{label}</div>
      <div style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }}>{children}</div>
    </div>
  )
}

function btn(bg) {
  return {
    height: 32, padding: '0 14px',
    background: bg || '#032D60', color: '#fff',
    border: 'none', borderRadius: 5, fontSize: 12, cursor: 'pointer',
  }
}
