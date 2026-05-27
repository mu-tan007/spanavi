import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { color, space, font } from '../../../constants/design';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import SpacareerClientSidebar from './SpacareerClientSidebar';

// クライアントポータルの各画面
import ClientMyPageView from './views/ClientMyPageView';
import ClientHomeworkView from './views/ClientHomeworkView';
import ClientFeedbackView from './views/ClientFeedbackView';
import ClientCoursesView from './views/ClientCoursesView';
import ClientHistoryView from './views/ClientHistoryView';
import ClientKickoffHearingView from './views/ClientKickoffHearingView';

// 受講生（rank='student'）向けのスパキャリ・クライアントポータル本体。
// 仕様書: tasks/spacareer-spec.md §6 / §6.2A
//
// キックオフヒアリング(70問)が未完了の受講生は、初回ログイン直後にその画面を強制表示する。
// 提出完了したら通常の5メニューに切り替わる（サイドバーから消える）。
export default function SpacareerClientApp() {
  const { session, profile, loading, signOut, isStudent } = useAuth();
  const [currentTab, setCurrentTab] = useState('mypage');
  const [hearingActive, setHearingActive] = useState(false); // キックオフヒアリングを表示するか
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: member } = await supabase
          .from('members').select('id').eq('user_id', profile.id).maybeSingle();
        if (!member) { if (!cancelled) setBootstrapped(true); return; }
        const { data: cust } = await supabase
          .from('spacareer_customers').select('id').eq('member_id', member.id).maybeSingle();
        if (!cust) { if (!cancelled) setBootstrapped(true); return; }
        const { data: sess } = await supabase
          .from('spacareer_kickoff_hearing_sessions')
          .select('status')
          .eq('customer_id', cust.id)
          .maybeSingle();
        if (cancelled) return;
        const stillActive = sess && !['completed'].includes(sess.status);
        setHearingActive(!!stillActive);
        // 提出前ならデフォルトでヒアリング画面に飛ばす
        if (stillActive && ['unnotified','unstarted','in_progress'].includes(sess.status)) {
          setCurrentTab('kickoff_hearing');
        }
      } catch (e) {
        console.error('[SpacareerClientApp] bootstrap error:', e);
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  const handleLogout = async () => {
    try { await signOut(); } catch (e) { console.error('Logout error:', e); }
    window.location.href = '/spacareer/login';
  };

  // SidebarShell は currentUser を文字列（表示名）として描画するため、
  // オブジェクトを渡すと React error #31 になる。
  const currentUser = profile?.name || '受講生';

  // 認証ゲート: ログインしていなければスパキャリ専用ログインへ
  if (!loading && !session) {
    return <Navigate to="/spacareer/login" replace />;
  }
  // ログイン済みだが受講生ロールでなければ運営ログインへ追い出す
  if (!loading && session && profile && !isStudent) {
    return <Navigate to="/login" replace />;
  }

  // bootstrap 完了前は最低限のレイアウトのみ表示（ちらつき防止）
  if (!bootstrapped) {
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
          showKickoffHearing={false}
        />
        <main style={{ flex: 1, marginLeft: 220, padding: space[6], color: color.textLight, fontSize: font.size.sm }}>
          読み込み中...
        </main>
      </div>
    );
  }

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
        showKickoffHearing={hearingActive}
      />
      <main style={{ flex: 1, marginLeft: 220, padding: space[6] }}>
        {currentTab === 'kickoff_hearing' && <ClientKickoffHearingView />}
        {currentTab === 'mypage' && <ClientMyPageView />}
        {currentTab === 'homework' && <ClientHomeworkView />}
        {currentTab === 'feedback' && <ClientFeedbackView />}
        {currentTab === 'courses' && <ClientCoursesView />}
        {currentTab === 'history' && <ClientHistoryView />}
      </main>
    </div>
  );
}
