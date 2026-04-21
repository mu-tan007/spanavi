// Google Calendar API - Authorization Code Flow
// refresh_token はサーバー側 (Supabase gcal_tokens) に保存され、
// クライアントは /api/gcal/token で短命な access_token を毎回取得する。
import { supabase } from './supabase'

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()
const API_KEY = (import.meta.env.VITE_GOOGLE_API_KEY || '').trim()
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ')

// scope 判定ユーティリティ
export const REQUIRED_GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
]
export const REQUIRED_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
]

let gapiLoaded = false
let accessToken = null
let expiresAt = 0
let refreshPromise = null  // single-flight

function getRedirectUri() {
  return `${window.location.origin}/calendar`
}

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  const jwt = data?.session?.access_token
  if (!jwt) throw new Error('Not logged in to Supabase')
  return `Bearer ${jwt}`
}

export function loadGapi() {
  return new Promise((resolve, reject) => {
    if (gapiLoaded) return resolve()
    const s = document.createElement('script')
    s.src = 'https://apis.google.com/js/api.js'
    s.onload = () => {
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
          })
          gapiLoaded = true
          resolve()
        } catch (e) { reject(e) }
      })
    }
    s.onerror = reject
    document.head.appendChild(s)
  })
}

function applyToken(tok, exp) {
  accessToken = tok
  expiresAt = exp
  if (window.gapi?.client) window.gapi.client.setToken({ access_token: tok })
}

function clearToken() {
  accessToken = null
  expiresAt = 0
  if (window.gapi?.client) window.gapi.client.setToken(null)
}

// Google から ?code= で戻ってきたときに exchange する
export async function captureCodeFromUrl() {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  if (!code) return false
  // URL からパラメータを先に消去（二重 exchange 防止）
  url.searchParams.delete('code')
  url.searchParams.delete('scope')
  url.searchParams.delete('authuser')
  url.searchParams.delete('prompt')
  url.searchParams.delete('state')
  window.history.replaceState({}, '', url.pathname + (url.search || ''))

  try {
    const r = await fetch('/api/gcal/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
      body: JSON.stringify({ code, redirect_uri: getRedirectUri() }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      console.error('[gcal] exchange failed:', j)
      return false
    }
    applyToken(j.access_token, j.expires_at)
    return true
  } catch (e) {
    console.error('[gcal] exchange error:', e)
    return false
  }
}

// 保存済み refresh_token から access_token を取得（接続確認も兼ねる）
export async function fetchAccessToken() {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const r = await fetch('/api/gcal/token', {
        method: 'POST',
        headers: { Authorization: await authHeader() },
      })
      if (r.status === 404) {
        clearToken()
        return false
      }
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        console.warn('[gcal] token refresh failed:', j)
        clearToken()
        return false
      }
      applyToken(j.access_token, j.expires_at)
      return true
    } catch (e) {
      console.error('[gcal] token fetch error:', e)
      return false
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

async function ensureFreshToken() {
  if (accessToken && expiresAt - Date.now() > 120_000) return true
  return fetchAccessToken()
}

// 接続開始: Google の同意画面へ遷移
export function signIn() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
  })
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export function hasToken() {
  return !!accessToken && expiresAt > Date.now()
}

export async function signOut() {
  clearToken()
  try {
    await fetch('/api/gcal/disconnect', {
      method: 'POST',
      headers: { Authorization: await authHeader() },
    })
  } catch { /* best-effort */ }
}

async function callGapi(invoke) {
  const ok = await ensureFreshToken()
  if (!ok) throw new Error('not connected')
  if (!gapiLoaded) await loadGapi()
  window.gapi.client.setToken({ access_token: accessToken })
  try {
    return await invoke()
  } catch (e) {
    const status = e?.status || e?.result?.error?.code
    if (status === 401) {
      clearToken()
      const refreshed = await fetchAccessToken()
      if (!refreshed) throw e
      window.gapi.client.setToken({ access_token: accessToken })
      return await invoke()
    }
    throw e
  }
}

export async function listEvents(timeMin, timeMax) {
  try {
    const resp = await callGapi(() => window.gapi.client.calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    }))
    return resp.result.items || []
  } catch (e) {
    console.error('[gcal] listEvents error:', e)
    return []
  }
}

export async function createEvent({ summary, description, start, end, attendees }) {
  const event = {
    summary, description,
    start: { dateTime: start, timeZone: 'Asia/Tokyo' },
    end: { dateTime: end || new Date(new Date(start).getTime() + 3600000).toISOString(), timeZone: 'Asia/Tokyo' },
  }
  if (attendees) event.attendees = attendees.map(e => ({ email: e }))
  const resp = await callGapi(() => window.gapi.client.calendar.events.insert({
    calendarId: 'primary', resource: event,
  }))
  return resp.result
}

export function isConfigured() {
  return !!CLIENT_ID && !!API_KEY
}
