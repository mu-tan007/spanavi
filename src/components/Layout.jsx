import { useAuth } from '../hooks/useAuth'
import { LOGO_SRC } from '../lib/logo'

const NAV_ITEMS = [
  { key: 'call', icon: '📞', label: '架電リスト' },
  { key: 'clients', icon: '🏢', label: 'クライアント' },
  { key: 'appo', icon: '📋', label: 'アポ管理' },
  { key: 'admin', icon: '⚙️', label: '管理' },
]

export default function Layout({ currentView, setCurrentView, children }) {
  const { profile, signOut, isAdmin, isManager } = useAuth()

  const visibleNav = NAV_ITEMS.filter(item => {
    if (item.key === 'admin') return isAdmin || isManager
    return true
  })

  return (
    <div className="h-screen flex flex-col bg-[#111927]">
      {/* Header */}
      <header className="flex items-center justify-between h-12 px-4 bg-[#1a2332] border-b border-[#2a3a4a] flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src={LOGO_SRC} alt="Spanavi" className="w-7 h-7 object-contain" />
          <h1 className="text-base font-bold text-white tracking-tight">
            Spa<span className="text-[#c8a45a]">navi</span>
          </h1>
        </div>

        <nav className="flex items-center gap-1">
          {visibleNav.map(item => (
            <button
              key={item.key}
              onClick={() => setCurrentView(item.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                currentView === item.key
                  ? 'bg-[#c8a45a]/15 text-[#c8a45a] border border-[#c8a45a]/30'
                  : 'text-[#a0a8b4] hover:text-white hover:bg-[#243044]'
              }`}
            >
              <span className="mr-1.5">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs font-medium text-white">{profile?.name}</div>
            <div className="text-[10px] text-[#6a7380]">{profile?.organizations?.name}</div>
          </div>
          <button
            onClick={signOut}
            className="px-2.5 py-1 rounded-md text-xs text-[#6a7380] hover:text-[#c0392b] hover:bg-[#c0392b]/10 transition-colors"
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
