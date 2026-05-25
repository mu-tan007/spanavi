import React from 'react';
import SidebarShell, { ActiveItem, SectionHeader } from '../../common/sidebars/SidebarShell';

// スパキャリ クライアントポータル メニュー
// 仕様書: tasks/spacareer-spec.md §3.2 A / §6.2A
//
// キックオフヒアリング(70問)が未完了の受講生にはメニュー先頭に「キックオフヒアリング」を表示。
// 提出完了したら自動的に非表示になる。
const BASE_MENU = [
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
  showKickoffHearing = false,
}) {
  const menu = showKickoffHearing
    ? [{ id: 'kickoff_hearing', label: 'キックオフヒアリング', sub: '第1回前の事前ヒアリング' }, ...BASE_MENU]
    : BASE_MENU;

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
      {menu.map(item => (
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
