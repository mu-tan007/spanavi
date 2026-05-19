import React from 'react';
import { Building2, Settings } from 'lucide-react';
import SidebarShell, { ActiveItem, DisabledItem, SectionHeader } from './SidebarShell';
import { useAccessControl } from '../../../hooks/useAccessControl';

const MASP_VIEW_IDS = new Set(['database', 'firms', 'all_members', 'admin_settings']);

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
    { id: 'database', label: '企業DB', enabled: true },
    { id: 'firms', label: 'M&A支援機関', enabled: true },
    { id: 'all_members', label: 'メンバー', enabled: true },
  ].filter(it => canViewPage('masp', it.id));

  const sections = [
    ...(companyItems.length > 0 ? [{ label: '全社データ', icon: Building2, items: companyItems }] : []),
    // admin だけ「設定」セクションを表示（admin_settings は権限テーブル対象外、admin判定のみ）
    ...(isAdmin ? [{
      label: '設定',
      icon: Settings,
      items: [
        { id: 'admin_settings', label: '全社管理', enabled: true },
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
