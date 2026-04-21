// Edge Function 呼び出しの共通ラッパー (raw fetch 版)
// - 呼び出し前にセッション有効性確認 + 必要なら refresh
// - 401 の場合は refresh して 1回だけリトライ
// - サーバーの error フィールドを確実に露出
import { supabase } from './supabase'

// capital は Caesar の独立 Supabase を向く (Spanavi 本体の env と混同しない)
const SUPABASE_URL = import.meta.env.VITE_CAPITAL_SUPABASE_URL
  || 'https://qhrcvzhshqoteepqewir.supabase.co'
const SUPABASE_ANON = import.meta.env.VITE_CAPITAL_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFocmN2emhzaHFvdGVlcHFld2lyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwNDY2NzQsImV4cCI6MjA5MTYyMjY3NH0.E0v3VnlggOJ3jbOLO_uNLH7jLl8cRfPspdk9aAxg_6o'

export class SessionExpiredError extends Error {
  constructor(msg) { super(msg); this.name = 'SessionExpiredError' }
}

async function getValidAccessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  if (session.expires_at && session.expires_at * 1000 < Date.now() + 5 * 60_000) {
    const { data, error } = await supabase.auth.refreshSession()
    if (!error && data?.session) return data.session.access_token
  }
  return session.access_token
}

async function callOnce(name, body, accessToken) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON,
      'Authorization': `Bearer ${accessToken || SUPABASE_ANON}`,
    },
    body: JSON.stringify(body || {}),
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { /* plain text response */ }
  return { status: res.status, ok: res.ok, data, text }
}

export async function invokeFn(name, body) {
  let token = await getValidAccessToken()
  let res = await callOnce(name, body, token)

  if (res.status === 401) {
    console.warn(`[invokeFn] ${name} 401 — refreshing session & retrying`)
    const { data: refreshed, error: refErr } = await supabase.auth.refreshSession()
    if (refErr || !refreshed?.session) {
      await hardSessionReset()
      throw new SessionExpiredError('セッションが切れています。再度ログインしてください。')
    }
    token = refreshed.session.access_token
    res = await callOnce(name, body, token)
    if (res.status === 401) {
      await hardSessionReset()
      throw new SessionExpiredError('セッションが無効です。再度ログインしてください。')
    }
  }

  if (!res.ok) {
    const serverMsg = res.data?.error || res.data?.message || res.text || `HTTP ${res.status}`
    const err = new Error(serverMsg)
    err.status = res.status
    err.debug = res.data?.debug
    throw err
  }

  if (res.data && res.data.success === false) {
    const err = new Error(res.data.error || 'サーバー応答不正')
    err.debug = res.data.debug
    throw err
  }

  return res.data
}

export async function hardSessionReset() {
  try { await supabase.auth.signOut() } catch { /* ignore */ }
  try {
    Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-') || k === 'supabase.auth.token') localStorage.removeItem(k) })
    Object.keys(sessionStorage).forEach(k => { if (k.startsWith('sb-')) sessionStorage.removeItem(k) })
  } catch { /* ignore */ }
}
