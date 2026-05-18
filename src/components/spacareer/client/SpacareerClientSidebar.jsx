import React from 'react';
import SidebarShell, { ActiveItem, SectionHeader } from '../../common/sidebars/SidebarShell';

// スパキャリ クライアントポータル 5メニュー
// 仕様書: tasks/spacareer-spec.md §3.2 A. クライアントポータル
const MENU = [
  { id: 'mypage', label: '基本情報', sub: 'マイページ' },
  { id: 'homework', label: '事前課題', sub: 'セッション前の課題' },
  { id: 'feedback', label: 'セッション感想', sub: 'セッション後の振り返り' },
  { id: 'courses', label: 'AI講座', sub: '学習コンテンツ' },
  { id: 'history', label: 'セッション履歴', sub: 'Zoom URL・議事録' },
];

export default function SpacareerClientSidebar({
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
    >
      <SectionHeader label="MENU" />
      {MENU.map(item => (
        <ActiveItem
          key={item.id}
          label={item.label}
          active={currentTab === item.id}
          onClick={() => setCurrentTab && setCurrentTab(item.id)}
        />
      ))}
    </SidebarShell>
  );
}
