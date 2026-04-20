import React from 'react';

// 既存 Seller Sourcing サイドバーのビジュアル (ロゴ・ユーザー・ログアウト) を
// 他 engagement 用サイドバーで再利用するための薄い殻。
// コンテンツ部分だけ children で差し替える。
export default function SidebarShell({
  branding,
  currentUser,
  currentMemberAvatar,
  onUserClick,
  userHighlighted,
  onLogout,
  children,
}) {
  const primary = branding?.primaryColor || '#032D60';
  const accent = branding?.accentColor || '#0176D3';
  const highlight = branding?.highlightColor || '#C8A84B';
  const orgName = branding?.orgName || 'Spanavi';

  return (
    <div style={{
      width: 220, position: 'fixed', left: 0, top: 0, height: '100vh',
      background: primary, overflowY: 'auto', zIndex: 200,
      boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '16px 20px', cursor: 'default',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {branding?.logoUrl ? (
          <img src={branding.logoUrl} alt={orgName} style={{ width: 28, height: 32, objectFit: 'contain' }} />
        ) : (
          <svg width="28" height="32" viewBox="0 0 52 60" aria-hidden="true">
            <defs>
              <linearGradient id="spShieldAlt" x1="0" y1="0" x2="0.3" y2="1">
                <stop offset="0%" stopColor={accent}/>
                <stop offset="100%" stopColor={primary}/>
              </linearGradient>
              <clipPath id="shieldClipAlt"><path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z"/></clipPath>
            </defs>
            <path d="M26 3 L5 12 L5 34 Q5 52 26 58 Q47 52 47 34 L47 12 Z" fill="url(#spShieldAlt)"/>
            <g clipPath="url(#shieldClipAlt)" stroke="white" fill="none">
              <g opacity="0.45" strokeWidth="1.2">
                <line x1="26" y1="30" x2="26" y2="-5"/><line x1="26" y1="30" x2="55" y2="30"/>
                <line x1="26" y1="30" x2="26" y2="65"/><line x1="26" y1="30" x2="-3" y2="30"/>
                <line x1="26" y1="30" x2="47" y2="5"/><line x1="26" y1="30" x2="47" y2="55"/>
                <line x1="26" y1="30" x2="5" y2="55"/><line x1="26" y1="30" x2="5" y2="5"/>
              </g>
            </g>
          </svg>
        )}
        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: 2, lineHeight: 1 }}>
          <span style={{ color: accent }}>{orgName.slice(0, Math.ceil(orgName.length / 2))}</span>
          <span style={{ color: highlight }}>{orgName.slice(Math.ceil(orgName.length / 2))}</span>
        </div>
      </div>

      {currentUser && (
        <div
          onClick={onUserClick}
          style={{
            padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', gap: 8,
            cursor: onUserClick ? 'pointer' : 'default',
            background: userHighlighted ? 'rgba(255,255,255,0.12)' : 'transparent',
            borderLeft: '3px solid transparent', boxSizing: 'border-box',
          }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: '#0176D3',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden',
          }}>
            {currentMemberAvatar
              ? <img src={currentMemberAvatar} alt={currentUser} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (currentUser || '?')[0]}
          </div>
          <span style={{
            fontSize: 13, color: userHighlighted ? '#FFFFFF' : 'rgba(255,255,255,0.75)',
            fontWeight: userHighlighted ? 600 : 400,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{currentUser}</span>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
        {children}
      </div>

      {onLogout && (
        <div style={{ position: 'sticky', bottom: 0, background: '#021d47', padding: '12px 20px' }}>
          <button
            onClick={onLogout}
            style={{
              width: '100%', padding: '8px', borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.2)', background: 'transparent',
              color: '#fff', fontSize: 12, fontWeight: 600,
              fontFamily: "'Noto Sans JP', sans-serif", cursor: 'pointer',
            }}
          >ログアウト</button>
        </div>
      )}
    </div>
  );
}

// 無効化メニュー行 (準備中)
export function DisabledItem({ label, badge = '準備中' }) {
  return (
    <div style={{
      display: 'block', width: '100%', padding: '8px 20px 8px 28px',
      background: 'transparent', borderLeft: '3px solid transparent',
      color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: 400,
      fontFamily: "'Noto Sans JP', sans-serif", cursor: 'not-allowed',
      textAlign: 'left', boxSizing: 'border-box',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span>{label}</span>
      {badge && <span style={{ fontSize: 9, opacity: 0.7 }}>{badge}</span>}
    </div>
  );
}

// アクティブ化可能なメニュー行
export function ActiveItem({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block', width: '100%', padding: '8px 20px 8px 28px',
        background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
        border: 'none', borderLeft: '3px solid transparent',
        color: active ? '#FFFFFF' : 'rgba(255,255,255,0.75)',
        fontSize: 13, fontWeight: active ? 600 : 400,
        fontFamily: "'Noto Sans JP', sans-serif",
        cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}

export function SectionHeader({ label }) {
  return (
    <div style={{
      padding: '16px 20px 6px', fontSize: 9, fontWeight: 700,
      color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em',
      textTransform: 'uppercase',
    }}>{label}</div>
  );
}
