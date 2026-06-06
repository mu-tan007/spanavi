import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { color, space, font, radius } from '../../../constants/design';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import SpacareerClientSidebar from './SpacareerClientSidebar';

// スパキャリ専用の代理ログインセッション退避キー。
// 営業代行ポータルの `spanavi_admin_session_backup` とは別物。
// 両ポータルで代理ログイン中に session を取り違える事故を物理的に防ぐ。
const ADMIN_BACKUP_KEY_SPACAREER = 'spanavi_admin_session_backup_spacareer';
const ADMIN_BACKUP_TTL_MS = 12 * 60 * 60 * 1000; // 12時間

function readAdminBackupSpacareer() {
  try {
    const raw = localStorage.getItem(ADMIN_BACKUP_KEY_SPACAREER);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.refresh_token || !data?.access_token) return null;
    if (data.saved_at && Date.now() - data.saved_at > ADMIN_BACKUP_TTL_MS) {
      localStorage.removeItem(ADMIN_BACKUP_KEY_SPACAREER);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

// クライアントポータルの各画面
import ClientMyPageView from './views/ClientMyPageView';
import ClientHomeworkView from './views/ClientHomeworkView';
import ClientFeedbackView from './views/ClientFeedbackView';
import ClientCoursesView from './views/ClientCoursesView';
import ClientHistoryView from './views/ClientHistoryView';
import ClientKickoffHearingView from './views/ClientKickoffHearingView';
import ClientSocialStyleView from './views/ClientSocialStyleView';

// 受講生（rank='student'）向けのスパキャリ・クライアントポータル本体。
// 仕様書: tasks/spacareer-spec.md §6 / §6.2A
//
// キックオフヒアリング(70問)が未完了の受講生は、初回ログイン直後にその画面を強制表示する。
// 提出完了したら通常の5メニューに切り替わる（サイドバーから消える）。
export default function SpacareerClientApp() {
  const { session, profile, loading, signOut, isStudent } = useAuth();
  const [currentTab, setCurrentTab] = useState('mypage');
  const [hearingActive, setHearingActive] = useState(false); // キックオフヒアリングを表示するか
  const [socialStyleActive, setSocialStyleActive] = useState(false); // ソーシャルスタイル診断を表示するか
  const [customerId, setCustomerId] = useState(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [adminBackup, setAdminBackup] = useState(() => readAdminBackupSpacareer());
  const [restoring, setRestoring] = useState(false);

  // localStorage の代理ログインバックアップ状態を定期的に再読込
  useEffect(() => {
    const id = setInterval(() => setAdminBackup(readAdminBackupSpacareer()), 5000);
    return () => clearInterval(id);
  }, []);

  // 「社内アカウントに戻る」: 退避した管理者セッションを復元してダッシュボードへ
  const handleReturnToAdmin = async () => {
    const backup = readAdminBackupSpacareer();
    if (!backup) {
      alert('社内アカウントの情報が保存されていません。');
      return;
    }
    setRestoring(true);
    try {
      await supabase.auth.signOut();
      const { error } = await supabase.auth.setSession({
        access_token: backup.access_token,
        refresh_token: backup.refresh_token,
      });
      if (error) {
        console.error('Failed to restore admin session:', error);
        alert('社内アカウントへの復帰に失敗しました。再ログインしてください。');
        localStorage.removeItem(ADMIN_BACKUP_KEY_SPACAREER);
        window.location.href = '/login';
        return;
      }
      localStorage.removeItem(ADMIN_BACKUP_KEY_SPACAREER);
      window.location.href = '/';
    } catch (e) {
      console.error(e);
      setRestoring(false);
    }
  };

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: member } = await supabase
          .from('members').select('id').eq('user_id', profile.id).maybeSingle();
        if (!member) { if (!cancelled) setBootstrapped(true); return; }
        const { data: cust } = await supabase
          .from('spacareer_customers')
          .select('id, social_style_completed_at')
          .eq('member_id', member.id)
          .maybeSingle();
        if (!cust) { if (!cancelled) setBootstrapped(true); return; }
        if (!cancelled) setCustomerId(cust.id);

        // ソーシャルスタイル診断の状態
        const socialStyleDone = !!cust.social_style_completed_at;
        if (!cancelled) setSocialStyleActive(!socialStyleDone);

        // キックオフヒアリングの状態
        const { data: sess } = await supabase
          .from('spacareer_kickoff_hearing_sessions')
          .select('status')
          .eq('customer_id', cust.id)
          .maybeSingle();
        if (cancelled) return;
        const hearingStillActive = sess && !['completed'].includes(sess.status);
        setHearingActive(!!hearingStillActive);

        // 強制リダイレクト優先順位:
        //   1. ソーシャルスタイル診断 未完了
        //   2. キックオフヒアリング 未完了
        if (!socialStyleDone) {
          setCurrentTab('social_style');
        } else if (hearingStillActive && ['unnotified','unstarted','in_progress'].includes(sess.status)) {
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

  // ソーシャルスタイル診断 未完了の間は他タブを選んでも強制的に診断画面に戻す
  // （キックオフヒアリングと同じ強制度）
  const guardedSetCurrentTab = (tabId) => {
    if (socialStyleActive && tabId !== 'social_style') {
      return; // 強制的に診断画面のまま
    }
    if (hearingActive && !socialStyleActive && tabId !== 'kickoff_hearing') {
      // 診断完了済 & ヒアリング未完了 → ヒアリングのみ許可
      return;
    }
    setCurrentTab(tabId);
  };

  // 診断完了コールバック（ClientSocialStyleView から呼ばれる）
  const handleSocialStyleCompleted = () => {
    setSocialStyleActive(false);
    if (hearingActive) {
      setCurrentTab('kickoff_hearing');
    } else {
      setCurrentTab('mypage');
    }
  };

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
          showSocialStyle={false}
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
        setCurrentTab={guardedSetCurrentTab}
        branding={null}
        currentUser={currentUser}
        currentMemberAvatar={null}
        onUserClick={() => guardedSetCurrentTab('mypage')}
        onLogout={handleLogout}
        showKickoffHearing={hearingActive}
        showSocialStyle={socialStyleActive}
      />
      <main style={{ flex: 1, marginLeft: 220, padding: 0 }}>
        {/* 代理ログイン中バナー（通常ログインでは表示されない） */}
        {adminBackup && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 20,
            background: `linear-gradient(90deg, ${color.navyLight} 0%, ${color.navyDark} 100%)`,
            color: color.white,
            padding: `${space[2]}px ${space[6]}px`,
            fontSize: font.size.sm,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: space[3], flexWrap: 'wrap',
          }}>
            <span style={{ letterSpacing: font.letterSpacing.wide }}>
              管理者として「{adminBackup.impersonating_customer_name || currentUser}」を代理表示中
            </span>
            <button
              onClick={handleReturnToAdmin}
              disabled={restoring}
              style={{
                padding: `5px ${space[3] + 2}px`,
                fontSize: font.size.xs,
                fontWeight: font.weight.semibold,
                background: color.white,
                color: color.navyDark,
                border: 'none',
                borderRadius: radius.sm,
                cursor: restoring ? 'not-allowed' : 'pointer',
                letterSpacing: font.letterSpacing.wide,
                opacity: restoring ? 0.6 : 1,
              }}
            >{restoring ? '復帰中...' : '← 社内アカウントに戻る'}</button>
          </div>
        )}
        <div style={{ padding: space[6] }}>
          {currentTab === 'social_style' && (
            <ClientSocialStyleView
              customerId={customerId}
              onCompleted={handleSocialStyleCompleted}
            />
          )}
          {currentTab === 'kickoff_hearing' && <ClientKickoffHearingView />}
          {currentTab === 'mypage' && <ClientMyPageView />}
          {currentTab === 'homework' && <ClientHomeworkView />}
          {currentTab === 'feedback' && <ClientFeedbackView />}
          {currentTab === 'courses' && <ClientCoursesView />}
          {currentTab === 'history' && <ClientHistoryView />}
        </div>
      </main>
    </div>
  );
}
