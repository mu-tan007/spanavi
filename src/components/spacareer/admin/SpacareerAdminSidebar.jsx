import React from 'react';
import { Settings } from 'lucide-react';
import SidebarShell, { ActiveItem, DisabledItem, SectionHeader } from '../../common/sidebars/SidebarShell';
import { useAccessControl } from '../../../hooks/useAccessControl';
import { SPACAREER_ACTIVE_IDS as ACTIVE_IDS, visibleSpacareerSections } from './spacareerNav';

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

  const sections = visibleSpacareerSections(canViewPage);

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
