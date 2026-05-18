import React from 'react';
import SidebarShell, { ActiveItem, DisabledItem, SectionHeader } from '../../common/sidebars/SidebarShell';
import { useAccessControl } from '../../../hooks/useAccessControl';

// スパキャリ運営ダッシュボード 8メニュー
// 仕様書: tasks/spacareer-spec.md §3.2 B. 運営ダッシュボード
const ACTIVE_IDS = new Set([
  'customers',
  'sessions',
  'homework',
  'social_style',
  'ai_courses',
  'templates',
  'analytics',
  'settings',
]);

export default function SpacareerAdminSidebar({
  currentTab,
  setCurrentTab,
  branding,
  currentUser,
  currentMemberAvatar,
  onUserClick,
  onLogout,
}) {
  const { canViewPage } = useAccessControl();

  const rawSections = [
    { label: 'CUSTOMERS', items: [
      { id: 'customers', label: '顧客一覧' },
    ]},
    { label: 'OPERATIONS', items: [
      { id: 'sessions', label: 'セッション管理' },
      { id: 'homework', label: '事前課題管理' },
    ]},
    { label: 'DIAGNOSIS', items: [
      { id: 'social_style', label: 'ソーシャルスタイル診断' },
    ]},
    { label: 'CONTENT', items: [
      { id: 'ai_courses', label: 'AI講座管理' },
      { id: 'templates', label: 'テンプレート管理' },
    ]},
    { label: 'ANALYTICS', items: [
      { id: 'analytics', label: '分析レポート' },
    ]},
    { label: 'SETTINGS', items: [
      { id: 'settings', label: '設定' },
    ]},
  ];

  const sections = rawSections
    .map(s => ({
      ...s,
      items: s.items.filter(it => !ACTIVE_IDS.has(it.id) || canViewPage('spartia_career', it.id)),
    }))
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
          {section.items.map(it => ACTIVE_IDS.has(it.id) ? (
            <ActiveItem
              key={it.id}
              label={it.label}
              active={currentTab === it.id}
              onClick={() => setCurrentTab && setCurrentTab(it.id)}
            />
          ) : (
            <DisabledItem key={it.id} label={it.label} />
          ))}
        </React.Fragment>
      ))}
    </SidebarShell>
  );
}
