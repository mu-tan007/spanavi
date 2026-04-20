import React from 'react';
import SidebarShell, { ActiveItem, DisabledItem, SectionHeader } from './SidebarShell';

const MASP_VIEW_IDS = new Set(['database']);

export default function MASPSidebar({
  currentTab,
  setCurrentTab,
  branding,
  currentUser,
  currentMemberAvatar,
  onUserClick,
  onLogout,
}) {
  const sections = [
    {
      label: '全社',
      items: [
        { id: 'database', label: 'Database', enabled: true },
        { id: 'global_dashboard', label: '全社ダッシュボード', enabled: false },
        { id: 'all_members', label: 'Members', enabled: false },
        { id: 'global_analytics', label: '全社Analytics', enabled: false },
      ],
    },
    {
      label: '設定',
      items: [
        { id: 'branding', label: 'Branding', enabled: false },
        { id: 'billing', label: 'Billing', enabled: false },
        { id: 'integrations', label: 'Integrations', enabled: false },
      ],
    },
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
