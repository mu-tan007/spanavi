import React, { useState } from 'react';
import { color, space, font } from '../../../constants/design';
import { useAuth } from '../../../hooks/useAuth';
import SpacareerClientSidebar from './SpacareerClientSidebar';

// クライアントポータルの5画面（Phase 3 並列実装で中身を埋める）
import ClientMyPageView from './views/ClientMyPageView';
import ClientHomeworkView from './views/ClientHomeworkView';
import ClientFeedbackView from './views/ClientFeedbackView';
import ClientCoursesView from './views/ClientCoursesView';
import ClientHistoryView from './views/ClientHistoryView';

// 受講生（rank='student'）向けのスパキャリ・クライアントポータル本体。
// 仕様書: tasks/spacareer-spec.md §6
//
// 受講生は事業切替UIを通らず、ログイン直後に強制でここへルーティングされる。
// SpanaviApp（運営ダッシュボード）とは独立した世界観で動く。
export default function SpacareerClientApp() {
  const { profile, signOut } = useAuth();
  const [currentTab, setCurrentTab] = useState('mypage');

  const handleLogout = async () => {
    try { await signOut(); } catch (e) { console.error('Logout error:', e); }
    window.location.href = '/login';
  };

  const currentUser = {
    name: profile?.name || '受講生',
    email: profile?.email,
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: color.snow, fontFamily: font.family.sans }}>
      <SpacareerClientSidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        branding={null}
        currentUser={currentUser}
        currentMemberAvatar={null}
        onUserClick={() => setCurrentTab('mypage')}
        onLogout={handleLogout}
      />
      <main style={{ flex: 1, marginLeft: 220, padding: space[6] }}>
        {currentTab === 'mypage' && <ClientMyPageView />}
        {currentTab === 'homework' && <ClientHomeworkView />}
        {currentTab === 'feedback' && <ClientFeedbackView />}
        {currentTab === 'courses' && <ClientCoursesView />}
        {currentTab === 'history' && <ClientHistoryView />}
      </main>
    </div>
  );
}
