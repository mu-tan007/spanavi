import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';
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
        background: branding.primaryColor || color.navyDeep || '#011226',
        overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        animation: 'slideInLeft 0.2s ease',
      }}>
        {/* ヘッダー */}
        <div style={{
          padding: `${space[5]}px ${space[4]}px ${space[3]}px`,
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${alpha(color.white, 0.1)}`,
        }}>
          <div>
            <div style={{
              fontSize: 18, fontWeight: font.weight.black,
              color: color.white, fontFamily: font.family.sans,
            }}>
              {branding.orgName || 'Spanavi'}
            </div>
            {userName && (
              <div style={{
                fontSize: font.size.xs, color: alpha(color.white, 0.6), marginTop: space[1],
              }}>{userName}</div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: radius.lg, border: 'none',
              background: alpha(color.white, 0.1), color: color.white,
              fontSize: font.size.lg, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* ナビゲーション */}
        <div style={{ padding: `${space[2]}px 0` }}>
          {(navGroups || []).map((group, gi) => (
            <div key={gi} style={{ marginBottom: space[2] }}>
              {group.label && (
                <div style={{
                  padding: `${space[2]}px ${space[4]}px ${space[1]}px`,
                  fontSize: 9, fontWeight: font.weight.bold,
                  color: alpha(color.white, 0.4), letterSpacing: 1.5, textTransform: 'uppercase',
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
                      padding: `${space[3]}px ${space[4]}px`, border: 'none', cursor: 'pointer',
                      background: isActive ? alpha(color.white, 0.12) : 'transparent',
                      color: isActive ? color.white : alpha(color.white, 0.7),
                      fontSize: font.size.base,
                      fontWeight: isActive ? font.weight.bold : font.weight.medium,
                      fontFamily: font.family.sans,
                      borderLeft: isActive
                        ? `3px solid ${branding.accentColor || color.gold}`
                        : '3px solid transparent',
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
