import React from 'react';
import { Settings } from 'lucide-react';
import SidebarShell, { ActiveItem, SectionHeader } from './SidebarShell';

// 「全社」タブ（管理者のみ）のメニュー。ページを足すときは CORPORATE_TABS にも入れる。
export const CORPORATE_SECTIONS = [
  { label: 'MARKETING', items: [
    { id: 'site_analytics', label: 'サイト分析' },
  ]},
];
export const CORPORATE_TABS = CORPORATE_SECTIONS.flatMap(s => s.items.map(it => it.id));

export default function CorporateSidebar({
  currentTab,
  setCurrentTab,
  branding,
  currentUser,
  currentMemberAvatar,
  onUserClick,
  onLogout,
}) {
  return (
    <SidebarShell
      branding={branding}
      currentUser={currentUser}
      currentMemberAvatar={currentMemberAvatar}
      onUserClick={onUserClick}
      userHighlighted={currentTab === 'mypage'}
      onLogout={onLogout}
      pinnedFooter={(
        // スパキャリ・営業代行サイドバーの固定「設定」と同じマークアップ
        <button onClick={() => setCurrentTab('admin_settings')} style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '11px 20px',
          background: currentTab === 'admin_settings' ? 'rgba(255,255,255,0.12)' : 'transparent',
          border: 'none', borderLeft: '3px solid transparent',
          color: currentTab === 'admin_settings' ? '#FFFFFF' : 'rgba(255,255,255,0.75)',
          fontSize: 13, fontWeight: currentTab === 'admin_settings' ? 600 : 400,
          fontFamily: "'Noto Sans JP', sans-serif", cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box',
        }}
        onMouseEnter={e => { if (currentTab !== 'admin_settings') e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
        onMouseLeave={e => { if (currentTab !== 'admin_settings') e.currentTarget.style.background = 'transparent'; }}
        ><Settings size={14} />設定</button>
      )}
    >
      {CORPORATE_SECTIONS.map(section => (
        <React.Fragment key={section.label}>
          <SectionHeader label={section.label} />
          {section.items.map(it => (
            <ActiveItem
              key={it.id}
              label={it.label}
              active={currentTab === it.id}
              onClick={() => setCurrentTab(it.id)}
            />
          ))}
        </React.Fragment>
      ))}
    </SidebarShell>
  );
}
