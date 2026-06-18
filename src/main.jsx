import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './hooks/useAuth'
import { AccessControlProvider } from './hooks/useAccessControl'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// === dynamic import 失敗の自動リロード ===
// 新しい版がデプロイされた後、古いタブが消えた chunk を取りに行って 404 になる
// 典型ケースを検知し、ユーザーにリロードを促す。
// 短時間に複数回ループしないよう、リロードフラグを sessionStorage に保持。
const isChunkLoadError = (msg = '') =>
  /Failed to fetch dynamically imported module/i.test(msg) ||
  /Importing a module script failed/i.test(msg) ||
  /Loading chunk \d+ failed/i.test(msg) ||
  /ChunkLoadError/i.test(msg)

const promptReloadIfChunkError = (rawMsg) => {
  const msg = String(rawMsg || '')
  if (!isChunkLoadError(msg)) return false
  // 直近30秒以内に同種のリロードを実施済みなら再ループ防止
  const last = Number(sessionStorage.getItem('spanavi_chunk_reload_at') || '0')
  if (Date.now() - last < 30000) return false
  sessionStorage.setItem('spanavi_chunk_reload_at', String(Date.now()))
  const ok = window.confirm(
    'Spanavi が新しいバージョンに更新されました。\nページを再読み込みして最新版を適用しますか？'
  )
  if (ok) window.location.reload()
  return true
}

window.addEventListener('error', (e) => {
  promptReloadIfChunkError(e?.error?.message || e?.message)
})
window.addEventListener('unhandledrejection', (e) => {
  promptReloadIfChunkError(e?.reason?.message || e?.reason)
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AccessControlProvider>
            <App />
          </AccessControlProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
