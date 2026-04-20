import React from 'react';
import SidebarShell, { DisabledItem, SectionHeader } from './SidebarShell';

export default function SpartiaCareerSidebar({
  branding,
  currentUser,
  currentMemberAvatar,
  onUserClick,
  onLogout,
}) {
  const sections = [
    { label: 'APPLICATIONS', items: [
      { id: 'applications', label: '応募管理' },
      { id: 'cw_integration', label: 'CW連携' },
    ]},
    { label: 'PIPELINE', items: [
      { id: 'deals_career', label: 'Deals' },
      { id: 'meeting_schedule', label: '面談スケジュール' },
    ]},
    { label: 'ENROLLMENT', items: [
      { id: 'customers', label: '受講生' },
      { id: 'curriculum', label: 'カリキュラム' },
      { id: 'payments', label: '支払い管理' },
    ]},
    { label: 'ANALYTICS', items: [
      { id: 'kpi_career', label: 'KPI' },
      { id: 'team_compare', label: 'チーム比較' },
    ]},
    { label: 'SETTINGS', items: [
      { id: 'plans', label: 'プラン管理' },
      { id: 'stages', label: 'ステージ設定' },
    ]},
  ];

  return (
    <SidebarShell
      branding={branding}
      currentUser={currentUser}
      currentMemberAvatar={currentMemberAvatar}
      onUserClick={onUserClick}
      onLogout={onLogout}
    >
      {sections.map(section => (
        <React.Fragment key={section.label}>
          <SectionHeader label={section.label} />
          {section.items.map(it => (
            <DisabledItem key={it.id} label={it.label} />
          ))}
        </React.Fragment>
      ))}
    </SidebarShell>
  );
}
