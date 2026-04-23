import React from 'react';
import SidebarShell, { ActiveItem, DisabledItem, SectionHeader } from './SidebarShell';

const MASP_VIEW_IDS = new Set(['database', 'all_members', 'admin_settings']);

export default function MASPSidebar({
  currentTab,
  setCurrentTab,
  branding,
  currentUser,
  currentMemberAvatar,
  onUserClick,
  onLogout,
  isAdmin = false,
}) {
  const sections = [
    {
      label: '全社',
      items: [
        { id: 'database', label: 'Database', enabled: true },
        { id: 'all_members', label: 'Members', enabled: true },
        { id: 'global_dashboard', label: '全社ダッシュボード', enabled: false },
        { id: 'global_analytics', label: '全社Analytics', enabled: false },
      ],
    },
    // admin だけ「設定」セクションを表示
    ...(isAdmin ? [{
      label: '設定',
      items: [
        { id: 'admin_settings', label: 'Admin Settings', enabled: true },
      ],
    }] : []),
  ];

  return (
    <SidebarShell
      branding={branding}
      currentUser={currentUser}
      currentMemberAvatar={currentMemberAvatar}
      onUserClick={onUserClick}
      userHighlighted={currentTab === 'mypage'}
      onLogout={onLogout}
    >
      {sections.map(section => (
        <React.Fragment key={section.label}>
          <SectionHeader label={section.label} />
          {section.items.map(it => it.enabled ? (
            <ActiveItem
              key={it.id}
              label={it.label}
              active={currentTab === it.id && MASP_VIEW_IDS.has(currentTab)}
              onClick={() => setCurrentTab(it.id)}
            />
          ) : (
            <DisabledItem key={it.id} label={it.label} />
          ))}
        </React.Fragment>
      ))}
    </SidebarShell>
  );
}
