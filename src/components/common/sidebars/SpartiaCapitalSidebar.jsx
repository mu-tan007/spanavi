import React from 'react';
import SidebarShell, { ActiveItem, SectionHeader } from './SidebarShell';
import { capitalNavigate, useCapitalPathname } from '../../views/capital/lib/capitalNav';
import { useAccessControl } from '../../../hooks/useAccessControl';

// Caesar NAV から Database を除外したもの。Spanavi は MASP タブに Database があるため重複を避ける。
const NAV_SECTIONS = [
  { label: 'OVERVIEW', items: [
    { path: '/dashboard', label: 'Dashboard' },
  ]},
  { label: 'EXECUTION', items: [
    { path: '/deals', label: 'Deals', basePath: '/deals' },
    { path: '/needs', label: 'Needs' },
    { path: '/partners', label: 'Partners' },
  ]},
  { label: 'WORKSPACE', items: [
    { path: '/documents', label: 'Documents' },
  ]},
  { label: 'MEMBERS', items: [
    { path: '/members', label: 'Members' },
  ]},
];

export default function SpartiaCapitalSidebar({
  currentTab,
  branding,
  currentUser,
  currentMemberAvatar,
  onUserClick,
  onLogout,
}) {
  const pathname = useCapitalPathname();
  const { canViewPage } = useAccessControl();

  const sections = NAV_SECTIONS
    .map(s => ({ ...s, items: s.items.filter(it => canViewPage('spartia_capital', it.path)) }))
    .filter(s => s.items.length > 0);

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
          {section.items.map(item => {
            const base = item.basePath || item.path;
            const active = pathname === item.path || pathname.startsWith(base + '/');
            return (
              <ActiveItem
                key={item.path}
                label={item.label}
                active={active}
                onClick={() => capitalNavigate(item.path)}
              />
            );
          })}
        </React.Fragment>
      ))}
    </SidebarShell>
  );
}
