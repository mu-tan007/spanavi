import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './hooks/useAuth'
import { AccessControlProvider } from './hooks/useAccessControl'
import './index.css'


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AccessControlProvider>
          <App />
        </AccessControlProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
