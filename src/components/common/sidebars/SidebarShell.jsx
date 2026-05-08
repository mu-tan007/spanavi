import React from 'react';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Input, Select, Card, Badge } from '../../ui';

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
  // 注: branding props 由来の動的色 (primary/accent/highlight) は維持する
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
        padding: `${space[4]}px ${space[5]}px`, cursor: 'default',
        borderBottom: `1px solid ${alpha(color.white, 0.1)}`,
        display: 'flex', alignItems: 'center', gap: space[2.5],
      }}>
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
        <div
          onClick={onUserClick}
          style={{
            padding: `${space[2.5]}px ${space[5]}px`,
            borderBottom: `1px solid ${alpha(color.white, 0.1)}`,
            display: 'flex', alignItems: 'center', gap: space[2],
            cursor: onUserClick ? 'pointer' : 'default',
            background: userHighlighted ? alpha(color.white, 0.12) : 'transparent',
            borderLeft: '3px solid transparent', boxSizing: 'border-box',
          }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: color.navyLight,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: font.size.sm, fontWeight: font.weight.bold,
            color: color.white, flexShrink: 0, overflow: 'hidden',
          }}>
            {currentMemberAvatar
              ? <img src={currentMemberAvatar} alt={currentUser} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (currentUser || '?')[0]}
          </div>
          <span style={{
            fontSize: font.size.base,
            color: userHighlighted ? color.white : alpha(color.white, 0.75),
            fontWeight: userHighlighted ? font.weight.semibold : font.weight.normal,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{currentUser}</span>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: space[2] }}>
        {children}
      </div>

      {onLogout && (
        <div style={{
          position: 'sticky', bottom: 0,
          background: '#021d47',
          padding: `${space[3]}px ${space[5]}px`,
        }}>
          <button
            onClick={onLogout}
            style={{
              width: '100%', padding: space[2], borderRadius: radius.lg,
              border: `1px solid ${alpha(color.white, 0.2)}`, background: 'transparent',
              color: color.white, fontSize: font.size.sm, fontWeight: font.weight.semibold,
              fontFamily: font.family.sans, cursor: 'pointer',
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
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block', width: '100%',
        padding: `${space[2]}px ${space[5]}px ${space[2]}px 28px`,
        background: active ? alpha(color.white, 0.12) : 'transparent',
        border: 'none', borderLeft: '3px solid transparent',
        color: active ? color.white : alpha(color.white, 0.75),
        fontSize: font.size.base, fontWeight: active ? font.weight.semibold : font.weight.normal,
        fontFamily: font.family.sans,
        cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = alpha(color.white, 0.07); }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}

export function SectionHeader({ label, Icon }) {
  return (
    <div style={{
      padding: `${space[4]}px ${space[5]}px ${space[1.5]}px`,
      fontSize: 9, fontWeight: font.weight.bold,
      color: alpha(color.white, 0.45), letterSpacing: '0.12em',
      textTransform: 'uppercase',
      display: 'flex', alignItems: 'center', gap: space[1.5],
    }}>
      {Icon && <Icon size={12} />}
      {label}
    </div>
  );
}
