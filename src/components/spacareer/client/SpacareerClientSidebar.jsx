import React from 'react';
import SidebarShell, { ActiveItem, SectionHeader } from '../../common/sidebars/SidebarShell';

// スパキャリ クライアントポータル メニュー
// 仕様書: tasks/spacareer-social-style-onboarding.md / tasks/spacareer-spec.md §3.2 A / §6.2A
//
// 表示優先順位（未完了の項目をメニュー先頭に強制表示）:
//   1. ソーシャルスタイル診断（30問）— ログイン直後の最初の関門
//   2. キックオフヒアリング（70問）— 第1回前
//   3. ベースメニュー（基本情報・事前課題・セッション感想・AI講座・履歴）
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
  showSocialStyle = false,
}) {
  const prefix = [];
  if (showSocialStyle) {
    prefix.push({ id: 'social_style', label: 'ソーシャルスタイル診断', sub: '受講開始前の30問診断' });
  }
  if (showKickoffHearing) {
    prefix.push({ id: 'kickoff_hearing', label: 'キックオフヒアリング', sub: '第1回前の事前ヒアリング' });
  }
  const menu = [...prefix, ...BASE_MENU];

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
