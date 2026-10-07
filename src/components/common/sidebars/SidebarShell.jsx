import React from 'react';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import '../AppShell.css';

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
  pinnedFooter,
  children,
}) {
  // 注: branding props 由来の動的色 (primary/accent/highlight) は維持する
  const primary = branding?.primaryColor || '#032D60';
  const accent = branding?.accentColor || '#0176D3';
  const highlight = branding?.highlightColor || '#C8A84B';
  const orgName = branding?.orgName || 'Spanavi';

  return (
    <div className="sp-sb" style={{ '--sb-primary': primary, display: 'flex' }}>
      <div className="sp-sb__logo">
        {branding?.logoUrl ? (
          <img src={branding.logoUrl} alt={orgName} style={{ width: 28, height: 32, objectFit: 'contain' }} />
        ) : (
          // Sourcing のサイドバーと完全一致 (2層の装飾ライン + accent→primary グラデーション)
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
              <g opacity="0.30" strokeWidth="0.8">
                <line x1="26" y1="30" x2="37" y2="-2"/><line x1="26" y1="30" x2="53" y2="16"/>
                <line x1="26" y1="30" x2="53" y2="44"/><line x1="26" y1="30" x2="37" y2="62"/>
                <line x1="26" y1="30" x2="15" y2="62"/><line x1="26" y1="30" x2="-1" y2="44"/>
                <line x1="26" y1="30" x2="-1" y2="16"/><line x1="26" y1="30" x2="15" y2="-2"/>
              </g>
            </g>
          </svg>
        )}
        <div style={{
          fontFamily: font.family.display, fontSize: font.size.xl,
          fontWeight: font.weight.black, letterSpacing: 2, lineHeight: 1,
        }}>
          {/* 分割位置を Sourcing サイドバーと揃える (Math.floor) */}
          <span style={{ color: accent }}>{orgName.slice(0, Math.floor(orgName.length / 2))}</span>
          <span style={{ color: highlight }}>{orgName.slice(Math.floor(orgName.length / 2))}</span>
        </div>
      </div>

      {currentUser && (
        <div onClick={onUserClick} className={'sp-sb__user' + (userHighlighted ? ' is-on' : '')}>
          <div className="sp-sb__avatar">
            {currentMemberAvatar
              ? <img src={currentMemberAvatar} alt={currentUser} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (currentUser || '?')[0]}
          </div>
          <span className="sp-sb__name">{currentUser}</span>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: space[2] }}>
        {children}
      </div>

      {/* スクロールと独立してログアウト直上に完全固定する枠（設定など） */}
      {pinnedFooter && (
        <div className="sp-sb__pin">
          {pinnedFooter}
        </div>
      )}

      {onLogout && (
        <div className="sp-sb__foot">
          <button onClick={onLogout} className="sp-sb__logout">ログアウト</button>
        </div>
      )}
    </div>
  );
}

// 無効化メニュー行 (準備中)
export function DisabledItem({ label, badge = '準備中' }) {
  return (
    <div style={{
      width: '100%', padding: `${space[2]}px ${space[5]}px ${space[2]}px 28px`,
      background: 'transparent', borderLeft: '3px solid transparent',
      color: alpha(color.white, 0.45), fontSize: font.size.base, fontWeight: font.weight.normal,
      fontFamily: font.family.sans, cursor: 'not-allowed',
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
    <button type="button" onClick={onClick} className={'sp-sb__item' + (active ? ' is-on' : '')}>
      {label}
    </button>
  );
}

export function SectionHeader({ label, Icon }) {
  return (
    <div className="sp-sb__sec">
      {Icon && <Icon size={12} />}
      {label}
    </div>
  );
}
