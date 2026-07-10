import React from 'react';
import { Settings } from 'lucide-react';
import SidebarShell, { ActiveItem, DisabledItem, SectionHeader } from '../../common/sidebars/SidebarShell';
import { useAccessControl } from '../../../hooks/useAccessControl';

// スパキャリ運営ダッシュボード 8メニュー
// 仕様書: tasks/spacareer-spec.md §3.2 B. 運営ダッシュボード
const ACTIVE_IDS = new Set([
  'customers',
  'recruiting',
  'sessions',
  'trainer_schedule',
  'session_records',
  'homework',
  'social_style',
  'ai_courses',
  'templates',
  'analytics',
]);

export default function SpacareerAdminSidebar({
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

  const rawSections = [
    { label: 'CUSTOMERS', items: [
      { id: 'customers', label: '顧客一覧' },
    ]},
    { label: 'RECRUITING', items: [
      { id: 'recruiting', label: '採用管理' },
    ]},
    { label: 'OPERATIONS', items: [
      { id: 'sessions', label: 'セッション管理' },
      { id: 'trainer_schedule', label: 'トレーナー別予定' },
      { id: 'homework', label: '事後課題管理' },
    ]},
    { label: 'DIAGNOSIS', items: [
      { id: 'social_style', label: 'ソーシャルスタイル診断' },
    ]},
    { label: 'CONTENT', items: [
      { id: 'ai_courses', label: 'AI講座管理' },
      { id: 'templates', label: 'テンプレート管理' },
    ]},
    { label: 'ANALYTICS', items: [
      { id: 'session_records', label: 'セッション記録' },
      { id: 'analytics', label: '分析レポート' },
    ]},
    // 「設定」は全社管理 → 対象事業=スパキャリ へ移行（admin限定）。
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
      pinnedFooter={isAdmin ? (
        // 営業代行サイドバーの固定「設定」項目と完全に同一のマークアップ（歯車アイコン＋パディング）
        <button onClick={() => setCurrentTab && setCurrentTab('admin_settings')} style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '11px 20px',
          background: currentTab === 'admin_settings' ? 'rgba(255,255,255,0.12)' : 'transparent',
          border: 'none', borderLeft: '3px solid transparent',
          color: currentTab === 'admin_settings' ? '#FFFFFF' : 'rgba(255,255,255,0.75)',
          fontSize: 13, fontWeight: currentTab === 'admin_settings' ? 600 : 400,
          fontFamily: "'Noto Sans JP', sans-serif", cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box',
        }}
        onMouseEnter={e => { if (currentTab !== 'admin_settings') e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
        onMouseLeave={e => { if (currentTab !== 'admin_settings') e.currentTarget.style.background = 'transparent'; }}
        ><Settings size={14} />設定</button>
      ) : null}
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
