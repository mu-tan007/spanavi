import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './hooks/useAuth'
import './index.css'

// --- 診断: ページリロード原因の特定 ---
;(() => {
  const now = Date.now()
  const prev = sessionStorage.getItem('_sp_load')
  const count = parseInt(sessionStorage.getItem('_sp_cnt') || '0', 10) + 1
  sessionStorage.setItem('_sp_load', String(now))
  sessionStorage.setItem('_sp_cnt', String(count))

  const nav = performance.getEntriesByType('navigation')[0]
  const navType = nav ? nav.type : 'unknown'
  const wasDiscarded = document.wasDiscarded ? 'YES' : 'no'
  const gap = prev ? Math.round((now - Number(prev)) / 1000) : '-'

  const el = document.createElement('div')
  el.id = '_sp_diag'
  el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#1a1a2e;color:#0f0;font:11px monospace;padding:4px 8px;opacity:0.9'
  el.textContent = `[diag] loads=${count} nav=${navType} discarded=${wasDiscarded} gap=${gap}s`
  document.body.appendChild(el)
})()
// --- /診断 ---

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
