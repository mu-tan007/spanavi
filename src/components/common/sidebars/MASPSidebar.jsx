import React from 'react';
import { Building2, Settings } from 'lucide-react';
import SidebarShell, { ActiveItem, DisabledItem, SectionHeader } from './SidebarShell';
import { useAccessControl } from '../../../hooks/useAccessControl';

const MASP_VIEW_IDS = new Set(['database', 'agency_registry', 'all_members', 'admin_settings']);

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
  const { canViewPage } = useAccessControl();

  const companyItems = [
    { id: 'database', label: 'Database', enabled: true },
    { id: 'agency_registry', label: 'Agency Registry', enabled: true },
    { id: 'all_members', label: 'Members', enabled: true },
  ].filter(it => canViewPage('masp', it.id));

  const sections = [
    ...(companyItems.length > 0 ? [{ label: 'COMPANY', icon: Building2, items: companyItems }] : []),
    // admin だけ「SETTINGS」セクションを表示（admin_settings は権限テーブル対象外、admin判定のみ）
    ...(isAdmin ? [{
      label: 'SETTINGS',
      icon: Settings,
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
          <SectionHeader label={section.label} Icon={section.icon} />
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
