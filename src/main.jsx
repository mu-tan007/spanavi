import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './hooks/useAuth'
import { AccessControlProvider } from './hooks/useAccessControl'
import ErrorBoundary from './components/ErrorBoundary'
import { handleChunkLoadError } from './utils/chunkReload'
import './index.css'

// === dynamic import 失敗の自動リロード ===
// 新しい版がデプロイされた後、古いタブが消えた chunk を取りに行って 404 になる
// 典型ケースを検知し、ユーザーにリロードを促す（判定・リロードは utils/chunkReload に集約）。
window.addEventListener('error', (e) => {
  handleChunkLoadError(e?.error?.message || e?.message)
})
window.addEventListener('unhandledrejection', (e) => {
  handleChunkLoadError(e?.reason?.message || e?.reason)
})
// Vite が dynamic import の preload 失敗時に発火するイベント（最も確実な検知経路）
window.addEventListener('vite:preloadError', (e) => {
  handleChunkLoadError(e?.payload?.message || 'Failed to fetch dynamically imported module')
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
