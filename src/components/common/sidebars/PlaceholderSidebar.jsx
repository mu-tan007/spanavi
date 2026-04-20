import React from 'react';
import SidebarShell from './SidebarShell';

export default function PlaceholderSidebar({
  engagement,
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
      onLogout={onLogout}
    >
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{
          fontSize: 14, fontWeight: 500, color: '#FFFFFF',
          fontFamily: "'Outfit','Noto Sans JP',sans-serif", marginBottom: 10,
          letterSpacing: '0.04em',
        }}>
          {engagement?.name || ''}
        </div>
        <div style={{
          fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7,
        }}>
          この事業は<br />準備中です
        </div>
      </div>
    </SidebarShell>
  );
}
