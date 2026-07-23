import React from 'react';
import { dora } from './theme';
import {
  IconProjects, IconCalls, IconAppointments, IconCompanies,
  IconAnalytics, IconReports, IconMembers, IconSettings, IconLogout,
} from './icons';

// dorayaki.AI クライアントポータル 専用サイドバー(独自ブランド・ダーク基調)
// メニュー: Projects / Calls / Appointments(新規) / Companies / Analytics / Reports / Members

export const DORA_MENU = [
  { key: 'projects', label: 'Projects', Icon: IconProjects },
  { key: 'calls', label: 'Calls', Icon: IconCalls, badge: 3 },
  { key: 'appointments', label: 'Appointments', Icon: IconAppointments },
  { key: 'companies', label: 'Companies', Icon: IconCompanies },
  { key: 'analytics', label: 'Analytics', Icon: IconAnalytics },
  { key: 'reports', label: 'Reports', Icon: IconReports },
  { key: 'members', label: 'Members', Icon: IconMembers },
];

const WIDTH = 236;

export default function DorayakiClientSidebar({ current, onSelect, user }) {
  return (
    <aside style={{
      width: WIDTH, minWidth: WIDTH, height: '100vh', position: 'sticky', top: 0,
      background: dora.gradient.sidebar, color: dora.color.onDark,
      display: 'flex', flexDirection: 'column',
      fontFamily: dora.font.body,
    }}>
      {/* ロゴ(透過版・大きめ) */}
      <div style={{ padding: `${dora.space.xl}px ${dora.space.lg}px ${dora.space.lg}px` }}>
        <img src="/dorayaki/logo-lockup-trans.png" alt="dorayaki.AI"
          style={{ height: 42, width: 'auto', display: 'block' }} />
      </div>

      {/* ユーザー */}
      <div style={{
        margin: `0 ${dora.space.md}px ${dora.space.lg}px`,
        padding: dora.space.md, borderRadius: dora.radius.md,
        background: 'rgba(255,255,255,0.05)', border: `1px solid ${dora.color.navyLine}`,
        display: 'flex', alignItems: 'center', gap: dora.space.md,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: dora.radius.pill, flexShrink: 0,
          background: dora.gradient.brandBar, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, fontFamily: dora.font.display,
        }}>{(user?.name || '篠')[0]}</div>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user?.name || '篠宮 拓武'}
          </div>
          <div style={{ fontSize: 10.5, color: dora.color.onDarkDim, letterSpacing: 0.4 }}>CLIENT</div>
        </div>
      </div>

      {/* メニュー */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: `0 ${dora.space.md}px`, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {DORA_MENU.map(({ key, label, Icon, badge }) => {
          const active = current === key;
          return (
            <button key={key} onClick={() => onSelect(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: dora.space.md, width: '100%',
                padding: `10px ${dora.space.md}px`, borderRadius: dora.radius.md,
                border: 'none', cursor: 'pointer', textAlign: 'left',
                fontFamily: dora.font.display, fontSize: 14, fontWeight: active ? 600 : 500,
                letterSpacing: 0.2, transition: 'background .15s, color .15s',
                background: active ? '#fff' : 'transparent',
                color: active ? dora.color.royal : dora.color.onDarkSoft,
                position: 'relative',
              }}
              onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#fff'; } }}
              onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = dora.color.onDarkSoft; } }}
            >
              <Icon size={18} />
              <span style={{ flex: 1 }}>{label}</span>
              {badge != null && (
                <span style={{
                  minWidth: 18, height: 18, padding: '0 5px', borderRadius: dora.radius.pill,
                  background: active ? dora.color.royal : dora.color.brown, color: '#fff',
                  fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: dora.font.num,
                }}>{badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* フッター */}
      <div style={{ padding: dora.space.md, borderTop: `1px solid ${dora.color.navyLine}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {[{ label: 'Settings', Icon: IconSettings }, { label: 'Log out', Icon: IconLogout }].map(({ label, Icon }) => (
          <button key={label}
            style={{
              display: 'flex', alignItems: 'center', gap: dora.space.md, width: '100%',
              padding: `9px ${dora.space.md}px`, borderRadius: dora.radius.md, border: 'none',
              background: 'transparent', color: dora.color.onDarkSoft, cursor: 'pointer',
              fontFamily: dora.font.display, fontSize: 13.5, fontWeight: 500, textAlign: 'left',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = dora.color.onDarkSoft; }}
          >
            <Icon size={17} /><span>{label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
