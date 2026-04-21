// セッション JWT 検証のヘルパー
// Invalid JWT / 期限切れを検知したら自動で sign-out → /login へ
import { supabase } from './supabase'

export async function ensureValidSession() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error || !session) {
      await forceLogin('セッションが見つかりません')
      return null
    }
    // 期限チェック (残り60秒以下なら refresh)
    if (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
      const { data, error: rErr } = await supabase.auth.refreshSession()
      if (rErr || !data?.session) {
        await forceLogin('セッションが期限切れ')
        return null
      }
      return data.session
    }
    return session
  } catch (e) {
    console.error('[authGuard]', e)
    return null
  }
}

export async function forceLogin(reason) {
  console.warn('[authGuard] force login:', reason)
  try { await supabase.auth.signOut() } catch { /* ignore */ }
  try { localStorage.removeItem('supabase.auth.token') } catch { /* ignore */ }
  if (window.location.pathname !== '/login') {
    window.location.href = '/login?reason=' + encodeURIComponent(reason || 'session_invalid')
  }
}

// Edge Function エラーから "Invalid JWT" を検出
export function isJwtError(err) {
  const msg = (err?.message || '').toLowerCase()
  const ctx = err?.context
  if (msg.includes('invalid jwt') || msg.includes('jwt expired') || msg.includes('missing authorization')) return true
  if (ctx?.status === 401) return true
  return false
}
