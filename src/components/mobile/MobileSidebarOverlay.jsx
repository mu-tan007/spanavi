import { C } from '../../constants/colors';
import { useBranding } from '../../hooks/useBranding';

export default function MobileSidebarOverlay({ navGroups = [], currentTab, setCurrentTab, onClose, userName }) {
  let branding = {};
  try { branding = useBranding() || {}; } catch { branding = {}; }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 300, display: 'flex',
    }}>
      {/* 背景オーバーレイ */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
        }}
      />
      {/* サイドメニュー */}
      <div style={{
        position: 'relative', width: 280, maxWidth: '80vw', height: '100%',
        background: branding.primaryColor || C.navyDeep || '#011226',
        overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        animation: 'slideInLeft 0.2s ease',
      }}>
        {/* ヘッダー */}
        <div style={{
          padding: '20px 16px 12px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', fontFamily: "'Noto Sans JP'" }}>
              {branding.orgName || 'Spanavi'}
            </div>
            {userName && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>{userName}</div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 6, border: 'none',
              background: 'rgba(255,255,255,0.1)', color: '#fff',
              fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* ナビゲーション */}
        <div style={{ padding: '8px 0' }}>
          {(navGroups || []).map((group, gi) => (
            <div key={gi} style={{ marginBottom: 8 }}>
              {group.label && (
                <div style={{
                  padding: '8px 16px 4px', fontSize: 9, fontWeight: 700,
                  color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, textTransform: 'uppercase',
                }}>{group.label}</div>
              )}
              {(group.items || []).map(item => {
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setCurrentTab(item.id); onClose(); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '12px 16px', border: 'none', cursor: 'pointer',
                      background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                      color: isActive ? '#fff' : 'rgba(255,255,255,0.7)',
                      fontSize: 13, fontWeight: isActive ? 700 : 500,
                      fontFamily: "'Noto Sans JP'",
                      borderLeft: isActive ? '3px solid ' + (branding.accentColor || '#C8A84B') : '3px solid transparent',
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* アニメーション */}
      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
