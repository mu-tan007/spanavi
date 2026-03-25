import { useAuth } from '../hooks/useAuth'
import { LOGO_SRC } from '../lib/logo'
import { useBranding } from '../hooks/useBranding'

const NAV_ITEMS = [
  { key: 'call', icon: '', label: '架電リスト' },
  { key: 'clients', icon: '', label: 'クライアント' },
  { key: 'appo', icon: '', label: 'アポ管理' },
]

export default function Layout({ currentView, setCurrentView, children }) {
  const { profile, signOut, isAdmin, isManager } = useAuth()
  const branding = useBranding()

  const visibleNav = NAV_ITEMS

  return (
    <div className="h-screen flex flex-col" style={{ background: '#F3F2F2' }}>
      {/* Header */}
      <header className="flex items-center justify-between h-12 px-4 flex-shrink-0" style={{ background: branding.primaryColor, borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
        <div className="flex items-center gap-3">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.orgName} className="w-7 h-7 object-contain" />
          ) : (
            <img src={LOGO_SRC} alt={branding.orgName} className="w-7 h-7 object-contain" />
          )}
          <h1 className="text-base font-bold text-white tracking-tight">
            {branding.orgName}
          </h1>
        </div>

        <nav className="flex items-center gap-1">
          {visibleNav.map(item => (
            <button
              key={item.key}
              onClick={() => setCurrentView(item.key)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={currentView === item.key
                ? { background: branding.highlightColor + '26', color: branding.highlightColor, border: `1px solid ${branding.highlightColor}4D` }
                : { color: 'rgba(255,255,255,0.7)', border: '1px solid transparent' }
              }
            >
              <span className="mr-1.5">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs font-medium text-white">{profile?.name}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{branding.orgName}</div>
          </div>
          <button
            onClick={signOut}
            className="px-2.5 py-1 rounded-md text-xs transition-colors"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  )
}
